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
  _width?: number,
  _height?: number,
  _format?: ImageFormat,
): string | undefined {
  if (!src) return undefined;
  // Image transformations are not available on this project's storage plan.
  // Return the original URL as-is to avoid 400 errors.
  return src;
}

/** True if a media URL points to a video file (by extension). */
export function isVideoUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  return /\.(mp4|mov|webm|m4v|ogg|ogv|avi|mkv|3gp|quicktime)(\?|#|$)/i.test(src);
}
