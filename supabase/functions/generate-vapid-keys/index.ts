// One-time utility: generates VAPID keys and returns them as JSON
// Run once, copy output to secrets VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY, then delete this function

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Generate EC key pair for VAPID (P-256 curve)
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // Convert to uncompressed point format (65 bytes) for the public key
  const pubKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const pubKeyBase64url = btoa(String.fromCharCode(...new Uint8Array(pubKeyRaw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const privKeyBase64url = privateKeyJwk.d!
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return new Response(JSON.stringify({
    VAPID_PUBLIC_KEY: pubKeyBase64url,
    VAPID_PRIVATE_KEY: privKeyBase64url,
    publicJWK: publicKeyJwk,
    privateJWK: privateKeyJwk,
    note: "Save VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as secrets, then delete this function"
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
