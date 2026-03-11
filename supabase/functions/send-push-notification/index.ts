/**
 * send-push-notification
 *
 * Uses jsr:@negrel/webpush — a battle-tested Deno-native library that correctly
 * implements RFC 8291 (aes128gcm) and RFC 8292 (VAPID) for ALL push services
 * including Apple's web.push.apple.com (APNs).
 *
 * Called by: DB trigger on messages INSERT, or directly from client code.
 */
import { ApplicationServer, importVapidKeys } from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;   // raw base64url uncompressed P-256 point
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;  // raw base64url P-256 private scalar
const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@roninestates.com";

// ─── Convert raw base64url VAPID keys → JWK format expected by importVapidKeys

function b64uToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
}

function bytesToB64u(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildVapidJwk() {
  // Public key is 65-byte uncompressed point: 0x04 || x(32) || y(32)
  const pubBytes = b64uToBytes(VAPID_PUBLIC_KEY);
  const x = bytesToB64u(pubBytes.slice(1, 33));
  const y = bytesToB64u(pubBytes.slice(33, 65));

  return {
    publicKey: { kty: "EC", crv: "P-256", x, y },
    privateKey: { kty: "EC", crv: "P-256", x, y, d: VAPID_PRIVATE_KEY },
  };
}

// ─── Lazy-initialise the ApplicationServer once per cold-start ─────────────────

let _appServer: ApplicationServer | null = null;

async function getAppServer(): Promise<ApplicationServer> {
  if (_appServer) return _appServer;

  const jwk = buildVapidJwk();
  const vapidKeys = await importVapidKeys(jwk as any);

  _appServer = await ApplicationServer.new({
    contactInformation: VAPID_SUBJECT,
    vapidKeys,
  });

  return _appServer;
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

    console.log(`Sending push to ${subs.length} subscription(s) for users:`, recipientUserIds);

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
          console.log(`✓ Push delivered to ${s.endpoint.slice(0, 50)}…`);
        } catch (err: any) {
          const status = err?.response?.status ?? err?.status ?? "?";
          const errBody = typeof err?.response?.text === "function"
            ? await err.response.text().catch(() => "")
            : String(err);
          console.error(`✗ Push failed [${status}] ${s.endpoint.slice(0, 50)}… — ${errBody}`);

          // 410 Gone or 404 = subscription no longer valid
          if (status === 410 || status === 404) {
            expiredEndpoints.push(s.endpoint);
          }
        }
      })
    );

    if (expiredEndpoints.length) {
      await db.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
      console.log(`Cleaned ${expiredEndpoints.length} expired subscription(s)`);
    }

    console.log(`Push result: ${sent}/${subs.length} delivered`);

    return new Response(JSON.stringify({ ok: true, sent, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
