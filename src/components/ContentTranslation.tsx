import { createContext, useContext, useState, type ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntryTranslation } from '@/hooks/useEntryTranslation';
import { Button } from '@/components/ui/button';
export function useContentTranslation(texts: string[]) {
  const {language} = useLanguage();
  const {translated} = useEntryTranslation(language, texts);
  const [original, setOriginal] = useState(false);
  const mapping = new Map(texts.map((source, i) => [source, translated[i]]));
  return {
    text: (source: string | null | undefined) => !original && language === 'es' ? mapping.get(source ?? '') ?? source ?? '' : source ?? '',
    available: language === 'es' && translated.some((value, i) => value !== texts[i]),
    original, toggle: () => setOriginal(v => !v),
  };
}
type Translation = ReturnType<typeof useContentTranslation>;
const Context = createContext<Translation | null>(null);
export function ContentTranslationScope({texts, children}: {texts: string[]; children: ReactNode}) {
  const value = useContentTranslation(texts);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useContentText() {
  const value = useContext(Context);
  return value?.text ?? ((source: string | null | undefined) => source ?? '');
}
export function TranslationNotice({value}: {value?: Translation}) {
  const context = useContext(Context);
  const translation = value ?? context;
  if (!translation?.available) return null;
  return <Button variant="link" className="min-h-11 h-auto px-0 text-xs text-muted-foreground whitespace-normal text-left justify-start" onClick={translation.toggle} aria-pressed={translation.original}>Traducido automáticamente · {translation.original ? 'Ver traducción' : 'Ver original'}</Button>;
}
