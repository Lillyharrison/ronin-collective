import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Language, translations, TranslationKey } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = "ronin.language";

const detectInitialLanguage = (): Language => {
  if (typeof window === "undefined") return "en";
  // ?lang=es on the URL wins (used by public share links)
  try {
    const url = new URL(window.location.href);
    const qp = url.searchParams.get("lang");
    if (qp === "es" || qp === "en") return qp;
  } catch { /* ignore */ }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "es" || stored === "en") return stored;
  return "en";
};

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  // Persist whenever it changes
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, language); } catch { /* ignore */ }
  }, [language]);

  const setLanguage = (lang: Language) => setLanguageState(lang);

  const t = (key: TranslationKey): string => {
    return translations[language][key] ?? translations.en[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
