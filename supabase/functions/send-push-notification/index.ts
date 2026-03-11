/**
 * send-push-notification
 *
 * Sends Web Push notifications using the modern aes128gcm content encoding
 * (RFC 8291 §4) which is required by Apple (web.push.apple.com) and also
 * supported by Chrome/Firefox. The older "aesgcm" encoding is NOT accepted
 * by Apple's push service.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY        = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY   = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY  = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT      = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@roninestates.com";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function b64uToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
}

function bytesToB64u(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function numToUint32BE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

// HKDF-SHA-256 extract + expand (single-step)
async function hkdf(
  salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey, length * 8
  );
  return new Uint8Array(bits);
}

// ─── VAPID JWT ────────────────────────────────────────────────────────────────

function publicKeyX(pub: string): string {
  return bytesToB64u(b64uToBytes(pub).slice(1, 33));
}
function publicKeyY(pub: string): string {
  return bytesToB64u(b64uToBytes(pub).slice(33, 65));
}

async function buildVapidHeader(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);

  const enc = new TextEncoder();
  const headerB64  = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = bytesToB64u(enc.encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })));
  const unsigned   = `${headerB64}.${payloadB64}`;

  const privKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256",
      d: VAPID_PRIVATE_KEY,
      x: publicKeyX(VAPID_PUBLIC_KEY),
      y: publicKeyY(VAPID_PUBLIC_KEY),
      key_ops: ["sign"],
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privKey,
    enc.encode(unsigned)
  );

  return `vapid t=${unsigned}.${bytesToB64u(new Uint8Array(sig))}, k=${VAPID_PUBLIC_KEY}`;
}

// ─── aes128gcm payload encryption (RFC 8291) ─────────────────────────────────

async function encryptPayload(
  sub: { p256dh: string; auth: string },
  plaintext: string
): Promise<{ body: Uint8Array; salt: Uint8Array; serverPublicKeyRaw: Uint8Array }> {
  const enc = new TextEncoder();

  const recipientPubBytes = b64uToBytes(sub.p256dh);
  const authSecret        = b64uToBytes(sub.auth);

  // Server ephemeral ECDH keypair
  const serverKP = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKP.publicKey)
  );

  // Recipient public key
  const recipientPubKey = await crypto.subtle.importKey(
    "raw", recipientPubBytes, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  // ECDH shared secret
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: recipientPubKey }, serverKP.privateKey, 256)
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK via HKDF-SHA256 with auth secret as salt (RFC 8291 §3.3)
  const prk = await hkdf(
    authSecret,
    sharedBits,
    concat(
      enc.encode("WebPush: info\x00"),
      recipientPubBytes,
      serverPublicKeyRaw
    ),
    32
  );

  // CEK (16 bytes) and Nonce (12 bytes)
  const cekInfo   = enc.encode("Content-Encoding: aes128gcm\x00");
  const nonceInfo = enc.encode("Content-Encoding: nonce\x00");

  const cek   = await hkdf(salt, prk, cekInfo,   16);
  const nonce = await hkdf(salt, prk, nonceInfo,  12);

  const cekKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);

  // Pad + encrypt (RFC 8291 §4 — pad with 0x02 delimiter then zeros)
  const plaintextBytes = enc.encode(plaintext);
  // Add record size overhead: one byte delimiter (0x02) after plaintext
  const padded = concat(plaintextBytes, new Uint8Array([2])); // delimiter

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded)
  );

  // Build content-coding header (RFC 8188 §2.1):
  // salt (16) + rs (4, uint32be) + idlen (1) + keyid (serverPublicKeyRaw, 65)
  const rs = 4096;
  const header = concat(
    salt,
    numToUint32BE(rs),
    new Uint8Array([serverPublicKeyRaw.length]),
    serverPublicKeyRaw
  );

  return { body: concat(header, ciphertext), salt, serverPublicKeyRaw };
}

// ─── Send one push ─────────────────────────────────────────────────────────────

async function sendOnePush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object
): Promise<number> {
  const { body } = await encryptPayload(sub, JSON.stringify(payload));
  const authorization = await buildVapidHeader(sub.endpoint);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization:      authorization,
      "Content-Type":     "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL":              "86400",
    },
    body,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    console.error(`Push failed [${res.status}] ${sub.endpoint.slice(0, 60)}… — ${text}`);
  }
  // consume body to avoid Deno resource leak
  try { await res.text(); } catch { /* already consumed */ }
  return res.status;
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
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

    const { data: subs, error } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", recipientUserIds);

    if (error) throw error;

    if (!subs?.length) {
      console.log("No push subscriptions found for recipients:", recipientUserIds);
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Sending push to ${subs.length} subscription(s)…`);

    const pushPayload = {
      title,
      body,
      url: url ?? "/",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    };

    const results = await Promise.allSettled(subs.map(s => sendOnePush(s, pushPayload)));

    // Clean up expired / invalid subscriptions
    const expiredEndpoints: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && (r.value === 410 || r.value === 404)) {
        expiredEndpoints.push(subs[i].endpoint);
      }
    });
    if (expiredEndpoints.length) {
      await db.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
      console.log(`Cleaned up ${expiredEndpoints.length} expired subscription(s)`);
    }

    const sent = results.filter(
      r => r.status === "fulfilled" && (r.value === 200 || r.value === 201)
    ).length;

    console.log(`Push result: ${sent}/${subs.length} delivered`);

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
