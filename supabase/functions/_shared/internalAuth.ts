import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalToken, isServiceBearer, bearerOf } from "./internalAuthCore.ts";

export { isInternalToken, isServiceBearer, bearerOf };

/** Reads private_config 'internal_function_token' with the service-role client. Null when missing. */
export async function loadInternalToken(): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  const db = createClient(url, key);
  const { data, error } = await db.from("private_config").select("value").eq("key", "internal_function_token").maybeSingle();
  if (error) { console.error("internal token lookup failed"); return null; }
  return (data?.value as string | undefined) ?? null;
}

/** Internal caller: x-internal-token match, optionally also the service-role Bearer. */
export async function isInternalCaller(req: Request, opts: { allowServiceKey: boolean }): Promise<boolean> {
  if (opts.allowServiceKey && isServiceBearer(req.headers.get("Authorization"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) return true;
  const presented = req.headers.get("x-internal-token");
  if (!presented) return false;
  return isInternalToken(presented, await loadInternalToken());
}

/** Signed-in user id from the caller JWT, or null. */
export async function signedInUserId(req: Request): Promise<string | null> {
  const token = bearerOf(req.headers.get("Authorization"));
  if (!token) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub as string;
}

export function unauthorized(cors: Record<string, string>, status = 401) {
  return new Response(JSON.stringify({ error: status === 403 ? "Forbidden" : "Unauthorized" }), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
