import { useEffect, useRef, useState } from "react";
import { api } from "./api";

// Offline-first sync for Operators Note's field submissions - Following
// Roadmap, Tier 2 item 6 ("queue and sync later instead of losing data
// in a dead zone"). Covers Timesheet entries (existing) and Field
// Incident Reports (new alongside this). A submission is written to
// localStorage the moment it's made, then this module tries to send it
// - if that fails because of connectivity (not because the server
// rejected it), the item stays queued and gets retried automatically
// once the browser's back online, on a periodic sweep, or the next time
// something is enqueued. Same localStorage + CustomEvent pattern as
// lib/office-scope.ts, so components can subscribe without prop-drilling.
export type OfflineQueueKind = "timesheet" | "incident" | "after_action_report" | "equipment";
export type OfflineQueueStatus = "pending" | "syncing" | "failed";

export interface OfflineQueueItem {
  id: string;
  kind: OfflineQueueKind;
  payload: unknown;
  createdAt: string;
  status: OfflineQueueStatus;
  attempts: number;
  lastError?: string;
}

const STORAGE_KEY = "venueguard-offline-queue";
const QUEUE_CHANGE_EVENT = "venueguard-offline-queue-change";
// Fired only on a successful sync, carrying the kind that synced - lets
// a page reconcile its own optimistic local state (e.g. refetch the
// Timesheet list) without re-deriving that from the whole queue snapshot.
const QUEUE_SYNCED_EVENT = "venueguard-offline-queue-synced";

function readQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineQueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent<OfflineQueueItem[]>(QUEUE_CHANGE_EVENT, { detail: items }));
}

// What actually performs the deferred submission per kind - the payload
// shape here must match what each of these client methods expects.
const SUBMITTERS: Record<OfflineQueueKind, (payload: unknown) => Promise<unknown>> = {
  timesheet: (payload) => {
    const { userId, data } = payload as { userId: number; data: Parameters<typeof api.timesheet.upsert>[1] };
    return api.timesheet.upsert(userId, data);
  },
  incident: (payload) => api.fieldIncidentReports.create(payload as Parameters<typeof api.fieldIncidentReports.create>[0]),
  after_action_report: (payload) => api.afterActionReports.create(payload as Parameters<typeof api.afterActionReports.create>[0]),
  equipment: (payload) => api.taskEquipment.create(payload as Parameters<typeof api.taskEquipment.create>[0]),
};

export function enqueueOfflineSubmission(kind: OfflineQueueKind, payload: unknown): void {
  const items = readQueue();
  items.push({
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  });
  writeQueue(items);
  void flushOfflineQueue();
}

export function retryOfflineItem(id: string): void {
  const items = readQueue().map((i) => (i.id === id ? { ...i, status: "pending" as const, lastError: undefined } : i));
  writeQueue(items);
  void flushOfflineQueue();
}

export function discardOfflineItem(id: string): void {
  writeQueue(readQueue().filter((i) => i.id !== id));
}

let flushing = false;

// Attempts every "pending" item in order. A network failure (fetch
// itself throwing, e.g. offline or DNS/connection refused - always a
// TypeError in browsers, never the plain Error apiFetch throws for a
// real HTTP error response) leaves the item pending for the next sweep.
// A genuine server rejection (validation, 403 not-on-roster, etc.) marks
// it "failed" instead of retrying forever - the CPO can retry or
// discard it manually via the sync-status panel.
export async function flushOfflineQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (const item of readQueue()) {
      if (item.status !== "pending") continue;
      writeQueue(readQueue().map((i) => (i.id === item.id ? { ...i, status: "syncing" } : i)));
      try {
        await SUBMITTERS[item.kind](item.payload);
        writeQueue(readQueue().filter((i) => i.id !== item.id));
        window.dispatchEvent(new CustomEvent(QUEUE_SYNCED_EVENT, { detail: { kind: item.kind } }));
      } catch (err) {
        const isConnectivityIssue = err instanceof TypeError;
        writeQueue(
          readQueue().map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: isConnectivityIssue ? "pending" : "failed",
                  attempts: i.attempts + 1,
                  lastError: err instanceof Error ? err.message : String(err),
                }
              : i,
          ),
        );
        // Stop this sweep on the first connectivity failure - the rest
        // will fail the same way, no point burning requests on each.
        if (isConnectivityIssue) break;
      }
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushOfflineQueue());
  // Fallback sweep - "online" fires on a network interface coming back,
  // which isn't the same as "the internet actually works" (e.g. captive
  // wifi). 20s matches this app's other background-poll intervals.
  setInterval(() => void flushOfflineQueue(), 20000);
}

export function useOfflineQueue(): OfflineQueueItem[] {
  const [items, setItems] = useState<OfflineQueueItem[]>(() => readQueue());

  useEffect(() => {
    const handler = (event: Event) => setItems((event as CustomEvent<OfflineQueueItem[]>).detail);
    window.addEventListener(QUEUE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(QUEUE_CHANGE_EVENT, handler);
  }, []);

  return items;
}

// Subscribe to successful syncs of one kind - e.g. the Timesheet panel
// refetching its list once a queued entry actually lands server-side.
export function useOfflineQueueSynced(kind: OfflineQueueKind, onSynced: () => void): void {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    const handler = (event: Event) => {
      if ((event as CustomEvent<{ kind: OfflineQueueKind }>).detail.kind === kind) onSyncedRef.current();
    };
    window.addEventListener(QUEUE_SYNCED_EVENT, handler);
    return () => window.removeEventListener(QUEUE_SYNCED_EVENT, handler);
  }, [kind]);
}
