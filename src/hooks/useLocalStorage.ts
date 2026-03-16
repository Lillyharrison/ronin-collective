import { useState, useEffect } from "react";

/**
 * Persists a state value in localStorage so it survives page refreshes.
 * Falls back to `defaultValue` when localStorage is unavailable or the key
 * is absent / unreadable.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage full or in private mode — silently ignore
    }
  }, [key, state]);

  return [state, setState];
}
