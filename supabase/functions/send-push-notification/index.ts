/**
 * send-push-notification
 * 
 * Called by: database trigger (via net.http_post) on messages INSERT, 
 *            or directly from client code.
 * 
 * Sends Web Push notifications to all subscribed devices of the recipient(s).
 * Uses manual VAPID + encryption because Deno edge runtime doesn't support Node crypto.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@roninestates.com";

// ─── VAPID / Encryption helpers ──────────────────────────────────────────────

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
}

function bytesToBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signVapid(unsignedToken: string): Promise<string> {
  const privKeyBytes = base64urlToBytes(VAPID_PRIVATE_KEY);
  // Import as raw ECDSA P-256 private key
  const jwkPrivate: JsonWebKey = {
    kty: "EC", crv: "P-256",
    d: VAPID_PRIVATE_KEY,
    x: "", y: "", // will be derived
    key_ops: ["sign"]
  };

  // We need the full JWK — store private as JWK string in secret for correctness
  // For now use the d value directly by importing as EC private key
  let privKey: CryptoKey;
  try {
    privKey = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC", crv: "P-256",
        d: VAPID_PRIVATE_KEY,
        x: getXFromPublicKey(VAPID_PUBLIC_KEY),
        y: getYFromPublicKey(VAPID_PUBLIC_KEY),
        key_ops: ["sign"]
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch {
    // Fallback: import raw
    privKey = await crypto.subtle.importKey(
      "raw" as any,
      privKeyBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  }

  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privKey,
    enc.encode(unsignedToken)
  );
  return bytesToBase64url(new Uint8Array(sig));
}

function getXFromPublicKey(pubKeyBase64url: string): string {
  // Public key is 65-byte uncompressed point: 0x04 || x (32) || y (32)
  const raw = base64urlToBytes(pubKeyBase64url);
  return bytesToBase64url(raw.slice(1, 33));
}

function getYFromPublicKey(pubKeyBase64url: string): string {
  const raw = base64urlToBytes(pubKeyBase64url);
  return bytesToBase64url(raw.slice(33, 65));
}

async function buildVapidHeaders(endpoint: string): Promise<{ Authorization: string; Crypto_Key?: string }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT };

  const enc = new TextEncoder();
  const headerB64 = bytesToBase64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const sig = await signVapid(unsignedToken);
  const jwt = `${unsignedToken}.${sig}`;

  return {
    Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
  };
}

// ─── Message encryption (RFC 8291) ───────────────────────────────────────────

async function encryptPayload(subscription: {
  p256dh: string; auth: string
}, plaintext: string): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const enc = new TextEncoder();
  const recipientPublicKeyBytes = base64urlToBytes(subscription.p256dh);
  const authSecret = base64urlToBytes(subscription.auth);

  // Generate server ephemeral ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );

  // Import recipient's public key
  const recipientPublicKey = await crypto.subtle.importKey(
    "raw", recipientPublicKeyBytes, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientPublicKey }, serverKeyPair.privateKey, 256
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  // PRK (HKDF)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const hkdfKey = await crypto.subtle.importKey("raw", new Uint8Array(sharedBits), "HKDF", false, ["deriveBits"]);

  // Build info strings per RFC 8291
  function buildInfo(type: string, clientKey: Uint8Array, serverKey: Uint8Array) {
    const info = new Uint8Array(18 + type.length + 1 + 1 + 2 + clientKey.length + 2 + serverKey.length);
    const textEnc = new TextEncoder();
    let offset = 0;
    info.set(textEnc.encode("Content-Encoding: "), offset); offset += 18;
    info.set(textEnc.encode(type), offset); offset += type.length;
    info[offset++] = 0; // null terminator
    info[offset++] = 0; // context type
    info[offset++] = 0; info[offset++] = 65; // client key length (65 bytes uncompressed)
    info.set(clientKey, offset); offset += clientKey.length;
    info[offset++] = 0; info[offset++] = 65; // server key length
    info.set(serverKey, offset);
    return info;
  }

  // Derive content encryption key
  const cekInfo = buildInfo("aesgcm", recipientPublicKeyBytes, serverPublicKeyRaw);
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo }, hkdfKey, 128
  );

  // Derive nonce
  const nonceInfo = buildInfo("nonce", recipientPublicKeyBytes, serverPublicKeyRaw);
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo }, hkdfKey, 96
  );

  const cekKey = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);

  // Add padding (2 bytes of 0)
  const plaintextBytes = enc.encode(plaintext);
  const padded = new Uint8Array(2 + plaintextBytes.length);
  padded.set(plaintextBytes, 2);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBits }, cekKey, padded)
  );

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

// ─── Send one push ────────────────────────────────────────────────────────────

async function sendOnePush(sub: { endpoint: string; p256dh: string; auth: string }, payload: object) {
  const body = JSON.stringify(payload);
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(sub, body);
  const vapidHeaders = await buildVapidHeaders(sub.endpoint);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      ...vapidHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      "Encryption": `salt=${bytesToBase64url(salt)}`,
      "Crypto-Key": `dh=${bytesToBase64url(serverPublicKey)}`,
      "TTL": "86400",
    },
    body: ciphertext,
  });

  return res.status;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { recipientUserIds, title, body, url } = await req.json() as {
      recipientUserIds: string[];
      title: string;
      body: string;
      url?: string;
    };

    if (!recipientUserIds?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", recipientUserIds);

    if (!subs?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const payload = { title, body, url: url ?? "/", icon: "/favicon.ico", badge: "/favicon.ico" };
    const results = await Promise.allSettled(
      subs.map(s => sendOnePush(s, payload))
    );

    // Clean up expired subscriptions (410 Gone)
    const expiredEndpoints: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value === 410) {
        expiredEndpoints.push(subs[i].endpoint);
      }
    });
    if (expiredEndpoints.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
    }

    const sent = results.filter(r => r.status === "fulfilled" && (r.value === 200 || r.value === 201)).length;
    return new Response(JSON.stringify({ ok: true, sent, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
