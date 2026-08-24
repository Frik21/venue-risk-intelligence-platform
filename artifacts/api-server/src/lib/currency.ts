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

// Country name (normalized) -> ISO 4217 currency code. Broad coverage
// (not just currencies the rate source below actually supports) plus
// the common aliases most likely to actually get typed into a freeform
// field (official name, short name, colloquial name).
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  "united states": "USD", "united states of america": "USD", usa: "USD", us: "USD", america: "USD",
  "united kingdom": "GBP", uk: "GBP", britain: "GBP", "great britain": "GBP", england: "GBP", scotland: "GBP", wales: "GBP", "northern ireland": "GBP",
  "south africa": "ZAR",
  canada: "CAD",
  australia: "AUD",
  "new zealand": "NZD",
  germany: "EUR", france: "EUR", spain: "EUR", italy: "EUR", netherlands: "EUR", "the netherlands": "EUR",
  belgium: "EUR", austria: "EUR", ireland: "EUR", portugal: "EUR", greece: "EUR", finland: "EUR",
  luxembourg: "EUR", slovenia: "EUR", slovakia: "EUR", estonia: "EUR", latvia: "EUR", lithuania: "EUR",
  cyprus: "EUR", malta: "EUR", croatia: "EUR",
  switzerland: "CHF",
  japan: "JPY",
  china: "CNY", "people's republic of china": "CNY",
  "hong kong": "HKD",
  singapore: "SGD",
  india: "INR",
  brazil: "BRL",
  mexico: "MXN",
  "south korea": "KRW", "republic of korea": "KRW", korea: "KRW",
  norway: "NOK",
  sweden: "SEK",
  denmark: "DKK",
  poland: "PLN",
  "czech republic": "CZK", czechia: "CZK",
  hungary: "HUF",
  romania: "RON",
  bulgaria: "BGN",
  iceland: "ISK",
  turkey: "TRY", turkiye: "TRY",
  israel: "ILS",
  indonesia: "IDR",
  malaysia: "MYR",
  philippines: "PHP",
  thailand: "THB",
  "united arab emirates": "AED", uae: "AED",
  "saudi arabia": "SAR",
  nigeria: "NGN",
  kenya: "KES",
  egypt: "EGP",
  ghana: "GHS",
  zimbabwe: "USD",
  namibia: "NAD",
  botswana: "BWP",
  argentina: "ARS",
  chile: "CLP",
  colombia: "COP",
  peru: "PEN",
  russia: "RUB", "russian federation": "RUB",
  ukraine: "UAH",
  pakistan: "PKR",
  bangladesh: "BDT",
  vietnam: "VND",
  taiwan: "TWD",
};

// The rate source below (Frankfurter, ECB reference rates) only covers
// major currencies - free, no API key, updated daily on ECB business
// days. Anything outside this set falls back to USD display rather
// than showing a currency label with no real rate behind it.
const SUPPORTED_BY_RATE_SOURCE = new Set([
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
  "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR",
  "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
]);

function currencyForCountry(country: string): string | null {
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

async function getExchangeRate(code: string): Promise<number> {
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
