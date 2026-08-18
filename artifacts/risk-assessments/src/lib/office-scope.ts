import { useEffect, useState } from "react";

// The Manager's currently selected office (top of the sidebar in
// layout.tsx) - a global filter, not per-page state, per direct
// product direction ("companies will have different offices... select
// an office and all the data from the allocated office"). Persisted
// to localStorage so it survives a reload/navigation, and broadcast
// via a custom event (same cross-component pattern already used for
// PROFILE_USER_EVENT/ALERTS_COUNT_EVENT in dashboard.tsx) so every
// page that reads it re-renders the moment the switcher changes it,
// without prop-drilling through Layout.
const STORAGE_KEY = "venueguard-selected-office";
const OFFICE_CHANGE_EVENT = "venueguard-office-change";

export function getSelectedOfficeId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? Number(raw) : null;
}

export function setSelectedOfficeId(officeId: number | null) {
  if (officeId == null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, String(officeId));
  window.dispatchEvent(new CustomEvent<number | null>(OFFICE_CHANGE_EVENT, { detail: officeId }));
}

export function useSelectedOfficeId(): [number | null, (officeId: number | null) => void] {
  const [officeId, setOfficeIdState] = useState<number | null>(() => getSelectedOfficeId());

  useEffect(() => {
    const handler = (event: Event) => setOfficeIdState((event as CustomEvent<number | null>).detail);
    window.addEventListener(OFFICE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(OFFICE_CHANGE_EVENT, handler);
  }, []);

  return [officeId, setSelectedOfficeId];
}

// Shared filter helper - "All Offices" (selectedOfficeId === null)
// passes everything through; otherwise only rows whose officeId
// matches. Records with no office set (officeId: null) only show
// under "All Offices" - they're not implicitly any office's data.
export function filterByOffice<T extends { officeId: number | null }>(rows: T[], selectedOfficeId: number | null): T[] {
  if (selectedOfficeId == null) return rows;
  return rows.filter((row) => row.officeId === selectedOfficeId);
}
