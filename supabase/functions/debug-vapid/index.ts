/**
 * debug-vapid - temporary diagnostic function
 */
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const pub = Deno.env.get("VAPID_PUBLIC_KEY") ?? "NOT_SET";
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "NOT_SET";
  const subj = Deno.env.get("VAPID_SUBJECT") ?? "NOT_SET";

  // Check each character
  const pubValid = /^[A-Za-z0-9+/=\-_]+$/.test(pub);
  const privValid = /^[A-Za-z0-9+/=\-_]+$/.test(priv);

  // Try to decode
  let pubDecodeError = "";
  let pubLength = 0;
  try {
    const b64 = pub.trim().replace(/-/g, "+").replace(/_/g, "/");
    const mod4 = b64.length % 4;
    const padded = b64 + (mod4 === 2 ? "==" : mod4 === 3 ? "=" : "");
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    pubLength = bytes.length;
  } catch (e) {
    pubDecodeError = String(e);
  }

  return new Response(JSON.stringify({
    pub_length: pub.length,
    pub_first10: pub.slice(0, 10),
    pub_last10: pub.slice(-10),
    pub_valid_chars: pubValid,
    pub_decode_error: pubDecodeError,
    pub_decoded_bytes: pubLength,
    priv_length: priv.length,
    priv_valid_chars: privValid,
    subject: subj,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
