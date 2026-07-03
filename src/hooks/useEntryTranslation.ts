/**
 * useEntryTranslation
 *
 * Translates an array of strings (e.g. maintenance titles/descriptions) to
 * Spanish via the translate-entries edge function. Results are cached in a
 * module-level Map so switching back and forth is instant.
 *
 * Usage:
 *   const { translated, translating } = useEntryTranslation(language, [issue.title, issue.description]);
 *   // translated[0] = Spanish title, translated[1] = Spanish description
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Module-level cache: key = joined text hash → translated array
const cache = new Map<string, string[]>();
// In-flight requests, so N components mounting with the same texts share one fetch
const inflight = new Map<string, Promise<string[]>>();

const TRANSLATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-entries`;

async function translateTexts(texts: string[]): Promise<string[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const auth = session?.access_token
    ? `Bearer ${session.access_token}`
    : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

  const resp = await fetch(TRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ texts }),
  });

  if (!resp.ok) return texts; // silent fallback to originals
  const data = await resp.json();
  const result: string[] = data.translations ?? texts;
  return texts.map((t, i) => result[i] ?? t);
}

function cacheKey(texts: string[]): string {
  return texts.join("|||");
}

/**
 * Translate a stable array of strings when language === "es".
 * Returns originals immediately (no flicker) then swaps to translations.
 */
export function useEntryTranslation(language: string, texts: string[]): {
  translated: string[];
  translating: boolean;
} {
  const key = cacheKey(texts);
  // Seed synchronously from cache so toggling back to "es" shows Spanish immediately
  const initial = language === "es" && cache.has(key) ? cache.get(key)! : texts;
  const [translated, setTranslated] = useState<string[]>(initial);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (language !== "es") {
      setTranslated(texts);
      return;
    }

    const nonEmpty = texts.filter(Boolean);
    if (nonEmpty.length === 0) {
      setTranslated(texts);
      return;
    }

    // Cache hit — always re-apply (state may have been reset by an earlier "en" pass)
    if (cache.has(key)) {
      setTranslated(cache.get(key)!);
      return;
    }

    let cancelled = false;
    setTranslating(true);

    // Dedup concurrent requests for the same text set
    let promise = inflight.get(key);
    if (!promise) {
      promise = translateTexts(texts).then((result) => {
        cache.set(key, result);
        inflight.delete(key);
        return result;
      }).catch((err) => {
        inflight.delete(key);
        throw err;
      });
      inflight.set(key, promise);
    }

    promise.then((result) => {
      if (cancelled) return;
      setTranslated(result);
      setTranslating(false);
    }).catch(() => {
      if (!cancelled) {
        setTranslated(texts);
        setTranslating(false);
      }
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, key]);

  return { translated, translating };
}

/**
 * Batch-translate a list of objects by extracting text fields.
 * Returns the same objects with translated fields merged in.
 *
 * @param language  current language code
 * @param items     array of objects
 * @param fields    keys of string fields to translate (e.g. ["title", "description"])
 */
export function useBatchTranslation<T extends { [K in F]: string | null | undefined }, F extends keyof T>(
  language: string,
  items: T[],
  fields: F[],
): { items: T[]; translating: boolean } {
  // Flatten all text values into one array for a single batch request
  // (hook must always be called — no conditional returns before this)
  const allTexts = items.flatMap(item =>
    fields.map(f => (item[f] as string | null | undefined) ?? "")
  );

  const { translated, translating } = useEntryTranslation(language, allTexts);

  // Re-assemble after the hook call (safe — no hooks after this point)
  if (language !== "es") return { items, translating: false };

  const translatedItems = items.map((item, i) => {
    const patch = {} as Partial<Pick<T, F>>;
    fields.forEach((f, j) => {
      const idx = i * fields.length + j;
      const orig = (item[f] as string | null | undefined) ?? "";
      if (orig) (patch as Record<string, unknown>)[f as string] = translated[idx] ?? orig;
    });
    return { ...item, ...patch };
  });

  return { items: translatedItems, translating };
}
