// Daily-bucket helpers for the Dashboard's trend charts - every chart
// there is either a "throughput" count (how many of X happened on
// each day, from a timestamp already stamped once per record - see
// completedAt/sentAt/decidedAt/paidAt/operationalAccessGrantedAt
// across the schema) or a "pending window" count (how many records
// were open - started but not yet resolved - as of each day, derived
// from two such timestamps). Both are reconstructable from data
// already in the database; no daily-snapshot table needed.

export interface DateBucket {
  /** ISO yyyy-mm-dd, local to the bucketing day - the group key. */
  key: string;
  /** Short display label, e.g. "Aug 18". */
  label: string;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One bucket per calendar day from `since` through today (inclusive),
// so every chart shares the exact same X axis regardless of which
// metric has data on which day.
export function dailyBuckets(since: Date): DateBucket[] {
  const buckets: DateBucket[] = [];
  const cursor = new Date(since.getFullYear(), since.getMonth(), since.getDate());
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (cursor <= end) {
    buckets.push({
      key: toDateKey(cursor),
      label: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

// Throughput: count of items whose `dateField` timestamp falls on
// each bucket day - e.g. tasks completed that day, quotes sent that
// day, clients created that day. Index-aligned with `buckets`.
export function countByDay<T>(
  items: T[],
  buckets: DateBucket[],
  getDate: (item: T) => string | null,
): number[] {
  const counts: Record<string, number> = Object.fromEntries(buckets.map((b) => [b.key, 0]));
  for (const item of items) {
    const iso = getDate(item);
    if (!iso) continue;
    const key = toDateKey(new Date(iso));
    if (key in counts) counts[key]++;
  }
  return buckets.map((b) => counts[b.key]);
}

// Pending window: count of items that were "open" (started but not
// yet resolved) as of each bucket day - e.g. quotes sent but not yet
// decided, invoices sent but not yet paid. An item counts on day D if
// it started on or before D and either never resolved or resolved
// after D. Index-aligned with `buckets`.
export function countOpenByDay<T>(
  items: T[],
  buckets: DateBucket[],
  getStart: (item: T) => string | null,
  getEnd: (item: T) => string | null,
): number[] {
  return buckets.map((b) => {
    const dayEnd = new Date(`${b.key}T23:59:59.999`);
    return items.filter((item) => {
      const startIso = getStart(item);
      if (!startIso) return false;
      const start = new Date(startIso);
      if (start > dayEnd) return false;
      const endIso = getEnd(item);
      if (!endIso) return true;
      return new Date(endIso) > dayEnd;
    }).length;
  });
}

// Merges two same-buckets series into one dataset for a 2-line chart,
// e.g. Quotes Sent + Quotes Pending.
export function mergeSeries(
  buckets: DateBucket[],
  seriesA: number[],
  keyA: string,
  seriesB: number[],
  keyB: string,
): Record<string, string | number>[] {
  return buckets.map((b, i) => ({ label: b.label, [keyA]: seriesA[i], [keyB]: seriesB[i] }));
}

// Single-series shape for TrendChart's `data` prop.
export function toSingleSeries(buckets: DateBucket[], series: number[], key: string): Record<string, string | number>[] {
  return buckets.map((b, i) => ({ label: b.label, [key]: series[i] }));
}
