/**
 * generate-vapid-keys
 * Generates fresh VAPID keypair and returns the clean base64url values.
 * Also reads current stored values and shows what needs fixing.
 */
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Generate a fresh VAPID keypair
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  function bytesToB64u(buf: Uint8Array): string {
    return btoa(String.fromCharCode(...buf))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const newPublicKey  = bytesToB64u(publicKeyRaw);         // 65 bytes uncompressed
  const newPrivateKey = privateKeyJwk.d!;                   // already base64url

  // Also show what's currently stored (with any pollution)
  const storedPub  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const storedPriv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

  return new Response(JSON.stringify({
    NEW_CLEAN_KEYS: {
      VAPID_PUBLIC_KEY:  newPublicKey,
      VAPID_PRIVATE_KEY: newPrivateKey,
      note: "Save these as your VAPID secrets — these are the raw base64url values with no quotes or spaces",
    },
    CURRENTLY_STORED: {
      pub_raw:  storedPub,
      priv_raw: storedPriv,
      pub_length:  storedPub.length,
      priv_length: storedPriv.length,
      problem: storedPub.includes('"') ? "⚠️ Keys are stored with JSON quote marks — needs fixing!" : "✓ Looks clean",
    },
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
