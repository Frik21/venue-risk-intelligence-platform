// Currency conversion engine for Command Desk's subscriber-facing seat
// prices (routes/users.ts's /users/seats) - per direct product
// direction, a subscriber should see additional-seat prices in their
// own country's currency, not always in USD. The Master Console
// (routes/companies.ts, pages/owner/subscriptions.tsx) deliberately
// stays USD-only - that's the single canonical source of truth the
// Owner sets prices in; everything here only ever converts outward
// from it, never back.
//
// A company's currency is derived from its own offices (offices.country
// is freeform text a Manager types in, not a picker - see
// pages/admin/offices.tsx), not a dedicated company field. This mirrors
// the exact "normalize, then a small curated alias list" strategy
// already used by lib/travel-advisory.ts for the same reason (freeform
// country names never match a canonical list by plain string equality).

function normalizeCountryName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Country name (normalized) -> ISO 4217 currency code. Deliberately
// small - per direct product direction, only 5 currencies exist in
// this system at all: South Africa gets ZAR, Europe gets EUR, China
// gets CNY, England/the UK gets GBP, and literally everywhere else
// (including the US) gets USD. Anything not explicitly listed here
// falls through to resolveCurrency's own USD fallback below, so there
// is no need to enumerate the rest of the world - USD already is the
// "everywhere else" answer.
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  "south africa": "ZAR",
  "united kingdom": "GBP", uk: "GBP", britain: "GBP", "great britain": "GBP", england: "GBP", scotland: "GBP", wales: "GBP", "northern ireland": "GBP",
  china: "CNY", "people's republic of china": "CNY",
  germany: "EUR", france: "EUR", spain: "EUR", italy: "EUR", netherlands: "EUR", "the netherlands": "EUR",
  belgium: "EUR", austria: "EUR", ireland: "EUR", portugal: "EUR", greece: "EUR", finland: "EUR",
  luxembourg: "EUR", slovenia: "EUR", slovakia: "EUR", estonia: "EUR", latvia: "EUR", lithuania: "EUR",
  cyprus: "EUR", malta: "EUR", croatia: "EUR",
  "united states": "USD", "united states of america": "USD", usa: "USD", us: "USD", america: "USD",
};

// The complete set of currencies this system knows about - per direct
// product direction, exactly these 5. Also what the Master Console's
// working-currency selector offers.
export const SUPPORTED_CURRENCY_CODES = ["ZAR", "USD", "EUR", "GBP", "CNY"] as const;
const SUPPORTED_BY_RATE_SOURCE = new Set<string>(SUPPORTED_CURRENCY_CODES);

// Exported directly for the Master Console's "use my location" currency
// detection (routes/companies.ts's GET /companies/pricing/currency-for-
// country) - reuses the exact same map the subscriber-facing engine
// below resolves through, rather than a second copy that could drift.
export function currencyForCountry(country: string): string | null {
  return COUNTRY_TO_CURRENCY[normalizeCountryName(country)] ?? null;
}

interface CachedRate {
  rate: number;
  fetchedAt: number;
}

const RATE_CACHE = new Map<string, CachedRate>();
const RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // rates move daily at most - no need to refetch more often

// Frankfurter (https://www.frankfurter.app) - free, no signup/API key,
// published from the European Central Bank's own daily reference
// rates. Chosen over a paid provider (exchangerate-api.com, Fixer.io)
// per direct product direction - this platform has no real subscription
// revenue yet (see CLAUDE.md's Outstanding/Roadmap), so no new
// recurring cost until there's cashflow to justify it, same reasoning
// already applied to deferring Ask Intelligence.
async function fetchLiveRate(code: string): Promise<number | null> {
  try {
    const resp = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${code}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[code];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

// Exported directly for the Master Console's own "which currency am I
// working in" selector (routes/companies.ts's GET /companies/pricing/fx)
// - unlike resolveCurrency below, this isn't derived from any office,
// it's a straight rate lookup for a currency code the Owner picked.
export async function getExchangeRate(code: string): Promise<number> {
  if (code === "USD") return 1;
  if (!SUPPORTED_BY_RATE_SOURCE.has(code)) return 1;

  const cached = RATE_CACHE.get(code);
  if (cached && Date.now() - cached.fetchedAt < RATE_CACHE_TTL_MS) {
    return cached.rate;
  }

  const rate = await fetchLiveRate(code);
  if (rate == null) {
    // Live fetch failed - serve the last known good rate rather than
    // falling back to USD, if we have one; otherwise USD is the only
    // honest answer.
    return cached?.rate ?? 1;
  }

  RATE_CACHE.set(code, { rate, fetchedAt: Date.now() });
  return rate;
}

export interface CompanyCurrency {
  code: string;
  rate: number;
}

// USD/1 whenever there's no confident signal otherwise - no office yet
// (a fresh company, or a Solo Operator, which has no offices at all),
// an office whose country string doesn't match anything in the map, or
// a currency the rate source doesn't cover.
export async function resolveCurrency(officeCountry: string | null): Promise<CompanyCurrency> {
  const code = officeCountry ? currencyForCountry(officeCountry) : null;
  if (!code || !SUPPORTED_BY_RATE_SOURCE.has(code)) {
    return { code: "USD", rate: 1 };
  }
  const rate = await getExchangeRate(code);
  return { code, rate };
}
