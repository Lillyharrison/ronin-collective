export const TEXT_SIZES = ["auto", "normal", "large", "xlarge"] as const;
export type TextSize = typeof TEXT_SIZES[number];
export const TEXT_SIZE_LABELS = {
  auto: { en: "Auto (match my phone)", es: "Automático (igual que mi teléfono)" },
  normal: { en: "Normal", es: "Normal" },
  large: { en: "Large", es: "Grande" },
  xlarge: { en: "Extra large", es: "Muy grande" },
};
export const normalizeTextSize = (value: unknown): TextSize => TEXT_SIZES.find(size => size === value) ?? "auto";
export function detectDeviceTextScale(): number {
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return 1;
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;font:-apple-system-body;";
  document.documentElement.appendChild(probe);
  try {
    const value = parseFloat(window.getComputedStyle(probe).fontSize) / 17;
    return Number.isFinite(value) ? Math.min(1.5, Math.max(1, value)) : 1;
  } finally { probe.remove(); }
}
export function textSizeScale(size: TextSize, detected = detectDeviceTextScale()) {
  return size === "auto" ? detected : { normal: 1, large: 1.2, xlarge: 1.4 }[size];
}
export const TEXT_SIZE_CACHE = "ronin:text-size:last";
export function cachedTextSize(userId?: string): TextSize {
  try { return normalizeTextSize(localStorage.getItem(userId ? `ronin:text-size:${userId}` : TEXT_SIZE_CACHE)); }
  catch { return "auto"; }
}
export function applyTextSize(size: TextSize, userId?: string) {
  const scale = textSizeScale(size);
  document.documentElement.style.setProperty("--text-scale", String(scale));
  document.documentElement.dataset.enlargedText = String(scale > 1);
  try {
    localStorage.setItem(TEXT_SIZE_CACHE, size);
    if (userId) localStorage.setItem(`ronin:text-size:${userId}`, size);
  } catch { /* Private browsing may disable storage; the preference still applies. */ }
}
export function applyEarlyTextSize() { applyTextSize(cachedTextSize()); }