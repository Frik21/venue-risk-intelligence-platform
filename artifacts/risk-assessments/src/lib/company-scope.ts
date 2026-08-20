import { useEffect, useState } from "react";

// The company currently selected in the Management sidebar's Company
// switcher - same global-filter pattern as office-scope.ts (see that
// file for the full reasoning). Meaningful once more than one company
// exists; today's single-tenant default still works fine with nothing
// selected ("All Companies").
const STORAGE_KEY = "venueguard-selected-company";
const COMPANY_CHANGE_EVENT = "venueguard-company-change";

export function getSelectedCompanyId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? Number(raw) : null;
}

export function setSelectedCompanyId(companyId: number | null) {
  if (companyId == null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, String(companyId));
  window.dispatchEvent(new CustomEvent<number | null>(COMPANY_CHANGE_EVENT, { detail: companyId }));
}

export function useSelectedCompanyId(): [number | null, (companyId: number | null) => void] {
  const [companyId, setCompanyIdState] = useState<number | null>(() => getSelectedCompanyId());

  useEffect(() => {
    const handler = (event: Event) => setCompanyIdState((event as CustomEvent<number | null>).detail);
    window.addEventListener(COMPANY_CHANGE_EVENT, handler);
    return () => window.removeEventListener(COMPANY_CHANGE_EVENT, handler);
  }, []);

  return [companyId, setSelectedCompanyId];
}

// Shared filter helper - "All Companies" (selectedCompanyId === null)
// passes everything through; otherwise only rows whose companyId
// matches.
export function filterByCompany<T extends { companyId: number | null }>(rows: T[], selectedCompanyId: number | null): T[] {
  if (selectedCompanyId == null) return rows;
  return rows.filter((row) => row.companyId === selectedCompanyId);
}
