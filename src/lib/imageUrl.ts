/**
 * imageUrl — returns a Supabase Storage transform URL for the given image.
 *
 * Uses the Supabase image transformation API to resize images server-side
 * so mobile clients never download a full-resolution 4 MB property photo
 * just to display a 200-px thumbnail.
 *
 * Falls back to the original URL for:
 *  - External URLs (http/https, not our storage bucket)
 *  - Blob / data URIs
 *  - null / undefined
 *
 * Usage:
 *   <img src={imageUrl(property.image_url, 400)} />
 *   <img src={imageUrl(avatar_url, 80)} />
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type ImageFormat = "origin" | "webp" | "avif";

export function imageUrl(
  src: string | null | undefined,
  width: number,
  height?: number,
  format: ImageFormat = "webp",
): string | undefined {
  if (!src) return undefined;
  // Already an external URL or data URI — serve as-is
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;

  // Only transform URLs that live in our Supabase storage
  if (!src.includes(SUPABASE_URL) && !src.startsWith("/")) return src;

  // Append transform params; the Supabase Storage transform endpoint accepts
  // width, height, resize (cover/contain/fill), and format query params.
  try {
    const url = new URL(src);
    // Don't double-transform
    if (url.searchParams.has("width")) return src;

    url.searchParams.set("width", String(width));
    if (height) url.searchParams.set("height", String(height));
    url.searchParams.set("resize", "cover");
    if (format !== "origin") url.searchParams.set("format", format);
    return url.toString();
  } catch {
    return src;
  }
}
