/**
 * send-push-notification
 *
 * Uses jsr:@negrel/webpush — battle-tested RFC 8291/8292 implementation
 * for all push services including Apple APNs.
 */
import { ApplicationServer, importVapidKeys } from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Strip surrounding JSON quotes/spaces/commas that may have been introduced
// when these secrets were originally saved from a JSON object.
function cleanSecret(s: string): string {
  return s.trim().replace(/^["']/, "").replace(/["',;]+$/, "").trim();
}

const VAPID_PUBLIC_KEY  = cleanSecret(Deno.env.get("VAPID_PUBLIC_KEY") ?? "");
const VAPID_PRIVATE_KEY = cleanSecret(Deno.env.get("VAPID_PRIVATE_KEY") ?? "");
const VAPID_SUBJECT     = cleanSecret(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@roninestates.com");

// ─── Safe base64url → standard base64 → bytes ─────────────────────────────────
// Handles both base64url and standard base64 input

function b64ToBytes(input: string): Uint8Array {
  // Normalise: base64url → standard base64
  let b64 = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  const mod4 = b64.length % 4;
  if (mod4 === 2) b64 += "==";
  else if (mod4 === 3) b64 += "=";
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64u(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── Build JWK from stored raw base64url VAPID keys ───────────────────────────

function buildVapidJwk() {
  let pubBytes: Uint8Array;
  let x: string;
  let y: string;

  try {
    pubBytes = b64ToBytes(VAPID_PUBLIC_KEY);
    // Public key should be 65-byte uncompressed EC point: 0x04 | x(32) | y(32)
    if (pubBytes.length === 65 && pubBytes[0] === 0x04) {
      x = bytesToB64u(pubBytes.slice(1, 33));
      y = bytesToB64u(pubBytes.slice(33, 65));
    } else if (pubBytes.length === 64) {
      // Some VAPID generators omit the 0x04 prefix
      x = bytesToB64u(pubBytes.slice(0, 32));
      y = bytesToB64u(pubBytes.slice(32, 64));
    } else {
      throw new Error(`Unexpected public key length: ${pubBytes.length}`);
    }
  } catch (e) {
    throw new Error(`Failed to parse VAPID_PUBLIC_KEY: ${e}`);
  }

  let d: string;
  try {
    // Private key: should be 32 bytes (P-256 scalar), stored as raw base64url
    const privBytes = b64ToBytes(VAPID_PRIVATE_KEY);
    d = bytesToB64u(privBytes);
  } catch (e) {
    throw new Error(`Failed to parse VAPID_PRIVATE_KEY: ${e}`);
  }

  return {
    publicKey:  { kty: "EC", crv: "P-256", x, y },
    privateKey: { kty: "EC", crv: "P-256", x, y, d },
  };
}

// ─── Lazy-init ApplicationServer once per cold-start ─────────────────────────

let _appServer: ApplicationServer | null = null;

async function getAppServer(): Promise<ApplicationServer> {
  if (_appServer) return _appServer;

  const jwk = buildVapidJwk();
  console.log("Built JWK — x length:", jwk.publicKey.x.length, "y length:", jwk.publicKey.y.length, "d length:", jwk.privateKey.d.length);

  const vapidKeys = await importVapidKeys(jwk as any);
  _appServer = await ApplicationServer.new({
    contactInformation: VAPID_SUBJECT,
    vapidKeys,
  });

  return _appServer;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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

    const appServer = await getAppServer();

    const payload = JSON.stringify({
      title,
      body,
      url: url ?? "/",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });

    let sent = 0;
    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          const subscriber = appServer.subscribe({
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          });
          await subscriber.pushTextMessage(payload, { urgency: "high", ttl: 86400 });
          sent++;
          console.log(`✓ Delivered → ${s.endpoint.slice(0, 60)}…`);
        } catch (err: any) {
          const status = err?.response?.status ?? err?.status ?? "?";
          let errText = "";
          try { errText = await err?.response?.text?.() ?? String(err); } catch { errText = String(err); }
          console.error(`✗ Failed [${status}] ${s.endpoint.slice(0, 60)}… — ${errText}`);
          if (status === 410 || status === 404) expiredEndpoints.push(s.endpoint);
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
