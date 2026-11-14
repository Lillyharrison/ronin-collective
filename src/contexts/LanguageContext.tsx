import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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

  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let alive = true;
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* unavailable */ }
    const qp = new URL(window.location.href).searchParams.get("lang");
    if (stored === "es" || stored === "en" || qp === "es" || qp === "en") return;
    supabase.from("profiles").select("language_pref").eq("id", user.id).maybeSingle().then(({data}) => {
      let choice: string | null = null;
      try { choice = localStorage.getItem(STORAGE_KEY); } catch { /* unavailable */ }
      if (alive && !choice && (data?.language_pref === "en" || data?.language_pref === "es")) setLanguageState(data.language_pref);
    }, () => {});
    return () => { alive = false; };
  }, [user?.id]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* unavailable */ }
    if (user) void supabase.from("profiles").update({language_pref: lang}).eq("id", user.id).then(() => {}, () => {});
  };

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
