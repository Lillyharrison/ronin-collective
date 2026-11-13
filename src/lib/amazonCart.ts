/** Amazon "Add to Cart" link helpers. No affiliate tag, no credentials; nothing about Amazon is stored. */
export const ASIN_RE = /^[A-Z0-9]{10}$/;
export const MAX_PER_LINK = 40;
const PATH_RE = /\/(?:dp|gp\/product|ASIN|product)\/([A-Za-z0-9]{10})(?=[/?#]|$)/i;

export const isValidAsin = (s: string | null | undefined) => !!s && ASIN_RE.test(s);

/** Amazon site host (e.g. "www.amazon.co.uk") for an Amazon product URL; null for non-Amazon/short links. */
export function amazonSite(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase().replace(/^(www|smile|m)\./, "");
    if (!/^amazon\.[a-z.]{2,6}$/.test(host)) return null;
    return `www.${host}`;
  } catch { return null; }
}

/** Parse an ASIN and site from an Amazon product link. Short links (amzn.to etc.) give null. */
export function parseAmazonUrl(url: string | null | undefined): { asin: string; site: string } | null {
  const site = amazonSite(url);
  if (!site || !url) return null;
  const path = new URL(url.trim()).pathname;
  const m = path.match(PATH_RE);
  return m ? { asin: m[1].toUpperCase(), site } : null;
}

/** Stored asin first, else parsed from the link. Site comes from the link's domain, default amazon.com. */
export function resolveAmazon(item: { asin?: string | null; website_url?: string | null }): { asin: string; site: string } | null {
  const parsed = parseAmazonUrl(item.website_url);
  if (isValidAsin(item.asin)) return { asin: item.asin as string, site: parsed?.site ?? amazonSite(item.website_url) ?? "www.amazon.com" };
  return parsed;
}

/** First positive whole number in the text, else the default quantity's, else 1. */
export function cartQuantity(qty: string | null | undefined, fallback?: string | null): number {
  for (const s of [qty, fallback]) {
    const m = String(s ?? "").match(/\d+/);
    const n = m ? parseInt(m[0], 10) : 0;
    if (n > 0) return Math.min(n, 999);
  }
  return 1;
}

export interface CartLine { name: string; asin: string; site: string; quantity: number }
export interface CartLink { site: string; url: string; part: number; parts: number; count: number }

/** One link per Amazon site, split into parts of at most 40 items. */
export function buildCartLinks(lines: CartLine[]): CartLink[] {
  const bySite = new Map<string, CartLine[]>();
  for (const l of lines) bySite.set(l.site, [...(bySite.get(l.site) ?? []), l]);
  const out: CartLink[] = [];
  for (const [site, list] of bySite) {
    const parts = Math.ceil(list.length / MAX_PER_LINK);
    for (let p = 0; p < parts; p++) {
      const chunk = list.slice(p * MAX_PER_LINK, (p + 1) * MAX_PER_LINK);
      const qs = chunk.map((l, i) => `ASIN.${i + 1}=${encodeURIComponent(l.asin)}&Quantity.${i + 1}=${encodeURIComponent(String(l.quantity))}`).join("&");
      out.push({ site, url: `https://${site}/gp/aws/cart/add.html?${qs}`, part: p + 1, parts, count: chunk.length });
    }
  }
  return out;
}

export interface ListLine { library_item_id?: string | null; name: string; quantity?: string | null; photo_url?: string | null }
export interface LibInfo { asin?: string | null; website_url?: string | null; default_quantity?: string | null }

/** Split a house's list into Amazon lines and items without a code (with their own link, if any). */
export function splitForAmazon(lines: ListLine[], lib: Map<string, LibInfo>) {
  const amazon: CartLine[] = [];
  const other: { name: string; quantity: string | null; url: string | null; photo?: string | null }[] = [];
  for (const l of lines) {
    const info = l.library_item_id ? lib.get(l.library_item_id) : undefined;
    const az = info ? resolveAmazon(info) : null;
    if (az) amazon.push({ name: l.name, asin: az.asin, site: az.site, quantity: cartQuantity(l.quantity, info?.default_quantity) });
    else other.push({ name: l.name, quantity: l.quantity ?? info?.default_quantity ?? null, url: info?.website_url ?? null, ...(l.photo_url ? { photo: l.photo_url } : {}) });
  }
  return { amazon, other };
}
