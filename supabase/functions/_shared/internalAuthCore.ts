/** Pure credential checks shared by protected edge functions (no Deno/network imports, so it is unit-testable). */

/** Constant-time string comparison; false when either side is missing/empty. */
export function safeEqual(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!presented || !expected) return false;
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i % a.length] ?? 0) ^ (b[i % b.length] ?? 0);
  return diff === 0;
}

export function bearerOf(authorization: string | null | undefined): string | null {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  const t = authorization.slice(7).trim();
  return t || null;
}

/** True when the request carries the service-role key as Bearer. */
export function isServiceBearer(authorization: string | null | undefined, serviceKey: string | null | undefined): boolean {
  return safeEqual(bearerOf(authorization), serviceKey);
}

/** True when the x-internal-token header matches the stored internal token. */
export function isInternalToken(headerValue: string | null | undefined, storedToken: string | null | undefined): boolean {
  return safeEqual(headerValue, storedToken);
}
