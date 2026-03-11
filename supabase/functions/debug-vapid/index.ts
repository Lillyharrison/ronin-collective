/**
 * debug-vapid - temporary diagnostic function
 */
import { corsHeaders } from "../_shared/cors.ts";

function cleanSecret(s: string): string {
  return s.trim().replace(/^["']/, "").replace(/["',;]+$/, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rawPub  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "NOT_SET";
  const rawPriv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "NOT_SET";
  const rawSubj = Deno.env.get("VAPID_SUBJECT") ?? "NOT_SET";

  const cleanPub  = cleanSecret(rawPub);
  const cleanPriv = cleanSecret(rawPriv);
  const cleanSubj = cleanSecret(rawSubj);

  function bytesToB64u(buf: Uint8Array): string {
    return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  let pubDecodeResult = "";
  let pubBytes = 0;
  try {
    const b64 = cleanPub.replace(/-/g, "+").replace(/_/g, "/");
    const mod4 = b64.length % 4;
    const padded = b64 + (mod4 === 2 ? "==" : mod4 === 3 ? "=" : "");
    const decoded = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    pubBytes = decoded.length;
    pubDecodeResult = `✓ Decoded to ${pubBytes} bytes. First byte: 0x${decoded[0].toString(16).toUpperCase()} (should be 0x04 for uncompressed point)`;
  } catch (e) {
    pubDecodeResult = `✗ FAILED: ${e}`;
  }

  return new Response(JSON.stringify({
    raw: { pub: rawPub, pub_len: rawPub.length, priv_len: rawPriv.length },
    clean: { pub: cleanPub, priv_len: cleanPriv.length, subject: cleanSubj },
    decode_test: pubDecodeResult,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
