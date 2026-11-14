const PREFIX = 'ronin.translation.v2:';
const memory = new Map<string, string>();
export function translationKey(userId: string, source: string, target = 'es') {
  // Two independent 32-bit hashes; source stays out of storage key names.
  let a = 2166136261, b = 5381;
  for (let i = 0; i < source.length; i++) { a = Math.imul(a ^ source.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ source.charCodeAt(i); }
  return `${PREFIX}${userId}:${target}:${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}:${source.length}`;
}
export function readTranslation(userId: string, source: string) {
  const key = translationKey(userId, source);
  try { return memory.get(key) ?? localStorage.getItem(key) ?? undefined; } catch { return memory.get(key); }
}
export function saveTranslation(userId: string, source: string, result: unknown) {
  if (typeof result !== 'string' || !result.trim() || result === source) return;
  const key = translationKey(userId, source); memory.set(key, result);
  try { localStorage.setItem(key, result); } catch { /* storage full: keep memory cache */ }
}
export function clearTranslations() {
  memory.clear();
  try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* unavailable */ }
}
export function translationCandidates(texts: string[]) {
  return [...new Set(texts.filter(t => t.trim().length >= 3 && t.length <= 2000 && !/^[\d\s.,+\-/%]+$/.test(t) && !/^(?:https?:\/\/|www\.)\S+$/i.test(t)))];
}
export function translationChunks(texts: string[]) {
  const unique = translationCandidates(texts);
  return Array.from({length: Math.ceil(unique.length / 40)}, (_, i) => unique.slice(i * 40, i * 40 + 40));
}
export const shouldTranslate = (language: string, online: boolean, userId?: string | null) => language === 'es' && online && !!userId;
