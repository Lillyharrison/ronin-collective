import { createContext, useContext, useState, ReactNode } from "react";
import { Language, translations, TranslationKey } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

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
