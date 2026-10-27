import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type GateResult =
  | { ok: true; mode: "admin" | "cron" | "service_role"; userId?: string }
  | { ok: false; status: number; error: string };

/**
 * Interactive callers need a user JWT whose profile.role is admin.
 * Cron / automation may use:
 * - Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 * - or header x-cron-secret: <CRON_SECRET> (when CRON_SECRET env is set)
 *
 * pg_cron for gmail-import must NOT use the public anon JWT (that only
 * satisfies verify_jwt and then fails here with 401). Prod schedule reads
 * SUPABASE_SERVICE_ROLE_KEY from Vault — see migration
 * 20261027142000_gmail_import_cron_service_role.sql.
 */
export async function requireAdminOrCron(req: Request): Promise<GateResult> {
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

  if (serviceKey && bearer && bearer === serviceKey) {
    return { ok: true, mode: "service_role" };
  }

  if (cronSecret && cronHeader && cronHeader === cronSecret) {
    return { ok: true, mode: "cron" };
  }

  if (!bearer || !supabaseUrl || !serviceKey) {
    return { ok: false, status: 401, error: "Missing or invalid authorization" };
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await adminClient.auth.getUser(
    bearer,
  );
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid user token" };
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    return { ok: false, status: 403, error: "Admin only" };
  }

  return { ok: true, mode: "admin", userId: userData.user.id };
}
