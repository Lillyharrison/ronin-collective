/**
 * send-push-notification
 *
 * Fully native VAPID + RFC 8291 (aes128gcm) implementation.
 * No external libraries — uses only Deno built-in crypto.subtle.
 *
 * Key fix: Apple APNs requires JWT aud = "https://web.push.apple.com"
 * (the origin only). Most VAPID libraries incorrectly use the full
 * endpoint URL which causes BadJwtToken 403 rejections.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = (Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@roninestates.com")
  .trim().replace(/^["']/, "").replace(/["',;]+$/, "").trim();

// ─── Base64url helpers ───────────────────────────────────────────────────────

function b64ToBytes(input: string): Uint8Array {
  let b64 = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  const mod4 = b64.length % 4;
  if (mod4 === 2) b64 += "==";
  else if (mod4 === 3) b64 += "=";
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64u(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

// ─── VAPID JWT ───────────────────────────────────────────────────────────────
// Apple APNs requires aud = origin (https://web.push.apple.com), NOT the full URL.

async function buildVapidToken(endpoint: string): Promise<{ token: string; pubKeyB64u: string }> {
  const rawPub  = (Deno.env.get("VAPID_PUBLIC_KEY")  ?? "").trim().replace(/^["']/, "").replace(/["',;]+$/, "").trim();
  const rawPriv = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim().replace(/^["']/, "").replace(/["',;]+$/, "").trim();

  const pubBytes  = b64ToBytes(rawPub);
  const privBytes = b64ToBytes(rawPriv);

  // Uncompressed EC public key: 0x04 | x(32) | y(32)
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error(`Unexpected VAPID public key length: ${pubBytes.length}`);
  }

  const x = bytesToB64u(pubBytes.slice(1, 33));
  const y = bytesToB64u(pubBytes.slice(33, 65));
  const d = bytesToB64u(privBytes);

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // aud MUST be the origin only — this is what Apple validates
  const aud = new URL(endpoint).origin;

  const headerB64  = bytesToB64u(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = bytesToB64u(new TextEncoder().encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 43200, // 12 hours
    sub: VAPID_SUBJECT,
  })));

  const unsigned = `${headerB64}.${payloadB64}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      new TextEncoder().encode(unsigned)
    )
  );

  return {
    token:      `${unsigned}.${bytesToB64u(sig)}`,
    pubKeyB64u: bytesToB64u(pubBytes),
  };
}

// ─── RFC 8291 aes128gcm Encryption ──────────────────────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dh: string,
  auth: string
): Promise<Uint8Array> {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const recipientPub   = b64ToBytes(p256dh);
  const authSecret     = b64ToBytes(auth);

  // Ephemeral sender key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const senderPub = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey)
  ); // 65 bytes uncompressed

  // Import recipient public key
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    recipientPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeral.privateKey,
    256
  );

  // Random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Step 1 — IKM derivation (RFC 8291 §3.1)
  // IKM = HKDF(IKM=sharedSecret, salt=authSecret, info="WebPush: info\x00"+ua_pub+as_pub, 32)
  const sharedKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);
  const authInfo  = concat(
    new TextEncoder().encode("WebPush: info\x00"),
    recipientPub, // ua_public (65 bytes)
    senderPub     // as_public (65 bytes)
  );
  const ikmBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: authInfo },
    sharedKey,
    256
  );
  const ikm = new Uint8Array(ikmBits);

  // Step 2 — CEK = HKDF(IKM=ikm, salt=salt, info="Content-Encoding: aes128gcm\x00", 16)
  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cekBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF", hash: "SHA-256", salt,
      info: new TextEncoder().encode("Content-Encoding: aes128gcm\x00")
    },
    ikmKey,
    128
  );

  // Step 3 — NONCE = HKDF(IKM=ikm, salt=salt, info="Content-Encoding: nonce\x00", 12)
  const ikmKey2 = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const nonceBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF", hash: "SHA-256", salt,
      info: new TextEncoder().encode("Content-Encoding: nonce\x00")
    },
    ikmKey2,
    96
  );

  // AES-128-GCM encrypt (pad with \x02 record delimiter — no extra padding)
  const cek   = await crypto.subtle.importKey("raw", new Uint8Array(cekBits), "AES-GCM", false, ["encrypt"]);
  const nonce = new Uint8Array(nonceBits);
  const padded = concat(plaintextBytes, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cek, padded)
  );

  // RFC 8291 binary structure:
  // salt(16) | rs(4 BE = 4096) | keyid_len(1 = 65) | senderPub(65) | ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  return concat(salt, rs, new Uint8Array([65]), senderPub, ciphertext);
}

// ─── Send a single push ──────────────────────────────────────────────────────

async function sendPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const { token, pubKeyB64u } = await buildVapidToken(endpoint);
  const encrypted = await encryptPayload(payload, p256dh, auth);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization":     `vapid t=${token},k=${pubKeyB64u}`,
      "Content-Type":      "application/octet-stream",
      "Content-Encoding":  "aes128gcm",
      "TTL":               "86400",
      "Urgency":           "high",
    },
    body: encrypted,
  });

  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body };
}

// ─── Main handler ────────────────────────────────────────────────────────────

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", recipientUserIds);

    if (error) throw error;

    if (!subs?.length) {
      console.log("No subscriptions for recipients:", recipientUserIds);
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Sending to ${subs.length} subscription(s) for users:`, recipientUserIds);

    const payload = JSON.stringify({
      title,
      body,
      url: url ?? "/",
      icon:  "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });

    let sent = 0;
    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          const result = await sendPush(s.endpoint, s.p256dh, s.auth, payload);
          if (result.ok || result.status === 201) {
            sent++;
            console.log(`✓ Delivered → ${s.endpoint.slice(0, 60)}…`);
          } else {
            console.error(`✗ Failed [${result.status}] ${s.endpoint.slice(0, 60)}… — ${result.body}`);
            if (result.status === 410 || result.status === 404) {
              expiredEndpoints.push(s.endpoint);
            }
          }
        } catch (err) {
          console.error(`✗ Error → ${s.endpoint.slice(0, 60)}… — ${String(err)}`);
        }
      })
    );

    if (expiredEndpoints.length) {
      await db.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
      console.log(`Cleaned ${expiredEndpoints.length} expired subscription(s)`);
    }

    console.log(`Result: ${sent}/${subs.length} delivered`);

    return new Response(JSON.stringify({ ok: true, sent, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", String(e));
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
