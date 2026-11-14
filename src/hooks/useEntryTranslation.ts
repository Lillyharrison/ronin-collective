import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { readTranslation, saveTranslation, shouldTranslate, translationChunks } from '@/lib/translationCache';

const inflight = new Map<string, Promise<void>>();
// Shared hook consumers retain their API; only successful, changed strings are cached.
export function useEntryTranslation(language: string, texts: string[]): { translated: string[]; translating: boolean } {
  const { user } = useAuth();
  const userId = user?.id;
  const key = JSON.stringify(texts);
  const [revision, update] = useState(0);
  const [translating, setTranslating] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener('online', changed); window.addEventListener('offline', changed);
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);
  useEffect(() => {
    if (!shouldTranslate(language, online, userId) || !userId) { setTranslating(false); return; }
    const chunks = translationChunks(texts.filter(t => !readTranslation(userId, t)));
    if (!chunks.length) { setTranslating(false); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!navigator.onLine) return;
      setTranslating(true);
      try {
        for (const planned of chunks) {
          const chunk=planned.filter(source=>!readTranslation(userId,source));
          if (!chunk.length) continue;
          if (cancelled || !navigator.onLine) break;
          const requestKey = JSON.stringify([userId, chunk]);
          let promise = inflight.get(requestKey);
          if (!promise) {
            promise = (async () => {
              const {data: {session}} = await supabase.auth.getSession();
              if (session?.user.id !== userId) return;
              const { data, error } = await supabase.functions.invoke('translate-entries', { body: {texts: chunk} });
              if (error || !Array.isArray(data?.translations) || data.translations.length !== chunk.length) return;
              // Never repopulate the cache after sign-out or an account change.
              const {data: current} = await supabase.auth.getSession();
              if (current.session?.user.id !== userId) return;
              chunk.forEach((source, i) => saveTranslation(userId, source, data.translations[i]));
            })().finally(() => inflight.delete(requestKey));
            inflight.set(requestKey, promise);
          }
          await promise;
          if (!cancelled) update(v => v + 1);
        }
      } catch { /* offline/errors silently retain originals */ }
      finally { if (!cancelled) setTranslating(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [language, userId, key, online]);
  void revision;
  const translated = texts.map(t => language === 'es' && online && userId ? readTranslation(userId, t) ?? t : t);
  return {translated, translating};
}
export function useBatchTranslation<T extends { [K in F]: string | null | undefined }, F extends keyof T>(language: string, items: T[], fields: F[]) {
  const {translated, translating} = useEntryTranslation(language, items.flatMap(item => fields.map(f => item[f] ?? '')));
  const display = items.map((item, i) => {
    const patch: Record<string, string> = {};
    fields.forEach((f, j) => { if (item[f]) patch[String(f)] = translated[i * fields.length + j]; });
    return {...item, ...patch};
  });
  return {items: language === 'es' ? display : items, translating};
}
