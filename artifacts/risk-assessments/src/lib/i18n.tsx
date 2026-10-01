import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Multi-language UI - Following Roadmap Tier 3, item 32 ("for
// companies running local staff who aren't English-first"). Scoped
// deliberately narrow, same "the honest, simple version" complexity
// budget as other large items this session scoped down rather than
// silently dropped: this is real, working i18n *infrastructure*
// (context, a translation function, persisted language choice), with
// a *starter* translation covering Operators Note's own always-visible
// chrome (TopBanner - Panic/Alerts/Profile/Report Incident/Report an
// Issue/Sign Out/the brand menu/search placeholder) - not a
// comprehensive translation of every string in every dialog across
// this entire app, which would be a much larger, separate undertaking.
// Extending coverage to more strings or more languages from here is
// exactly what this plumbing exists for - just add keys to
// TRANSLATIONS and call t("thatKey") where the English string used to
// be hardcoded.
//
// Hand-rolled rather than react-i18next (a new dependency) - matches
// this codebase's established preference for small, explicit helpers
// over framework abstractions (see lib/auth.ts's own hand-rolled
// sessions over express-session).
//
// Afrikaans picked as the second language (not an arbitrary choice) -
// per direct product direction documented elsewhere in this repo,
// VenueGuard is scoped to South Africa first before naturally
// spreading to other countries, and Afrikaans is a common second
// business language there alongside English.
export type Language = "en" | "af";

const LANGUAGE_STORAGE_KEY = "venueguard-language";

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  af: "Afrikaans",
};

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    panic: "Panic",
    panicSent: "Sent",
    alerts: "Alerts",
    profile: "Profile",
    reportIncident: "Report Incident",
    reportIssue: "Report an Issue",
    backToMasterConsole: "Back to Master Console",
    signOut: "Sign Out",
    searchPlaceholder: "Search for a place or address…",
    riskAssessments: "Risk Assessments",
    routePlanning: "Route Planning",
    downloadTask: "Download Task",
    layers: "Layers",
    language: "Language",
  },
  af: {
    panic: "Paniek",
    panicSent: "Gestuur",
    alerts: "Waarskuwings",
    profile: "Profiel",
    reportIncident: "Rapporteer Voorval",
    reportIssue: "Rapporteer 'n Probleem",
    backToMasterConsole: "Terug na Meesterkonsole",
    signOut: "Teken Uit",
    searchPlaceholder: "Soek vir 'n plek of adres…",
    riskAssessments: "Risikobeoordelings",
    routePlanning: "Roetebeplanning",
    downloadTask: "Laai Taak Af",
    layers: "Lae",
    language: "Taal",
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: keyof (typeof TRANSLATIONS)["en"]) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "af" ? "af" : "en";
  } catch {
    return "en"; // localStorage can throw (private browsing, blocked storage) - fall back rather than crash
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Same best-effort-only posture as the read above.
    }
  }, [language]);

  const t: LanguageContextValue["t"] = (key) => TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? String(key);

  return (
    <LanguageContext.Provider value={{ language, setLanguage: setLanguageState, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
