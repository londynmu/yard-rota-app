// Cron / admin: FCM missing pre-check nudge (WhatsApp path unchanged).
// Gate: requireAdminOrCron. Secret: FIREBASE_SERVICE_ACCOUNT (full JSON).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";
import {
  loadFirebaseServiceAccount,
  sendFcmMessage,
} from "../_shared/fcm.ts";
import { recordPushInboxRow } from "../_shared/pushInbox.ts";

const MAX_SENDS_PER_RUN = 50;

type TargetRow = {
  user_id: string;
  rota_id: string;
  first_name: string;
  start_time: string;
  idempotency_key: string;
  fcm_token: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const gate = await requireAdminOrCron(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error }), {
      status: gate.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sa = loadFirebaseServiceAccount();
  if (!sa) {
    return new Response(
      JSON.stringify({
        error: "FIREBASE_SERVICE_ACCOUNT secret is missing or invalid",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase env missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data, error } = await admin.rpc("get_due_precheck_push_targets");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targets = ((data || []) as TargetRow[]).slice(0, MAX_SENDS_PER_RUN);
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  for (const row of targets) {
    const title = "Yard Rota";
    const body = "Please complete your pre-shift check.";

    try {
      const result = await sendFcmMessage({
        sa,
        token: row.fcm_token,
        title,
        body,
        data: {
          type: "precheck_reminder",
          rota_id: row.rota_id,
        },
      });

      if (result.ok) {
        sent += 1;
        await recordPushInboxRow(admin, {
          type: "precheck_reminder",
          recipientId: row.user_id,
          title,
          message: body,
          metadata: {
            idempotency_key: row.idempotency_key,
            rota_id: row.rota_id,
          },
        });
        await admin.from("precheck_push_sends").upsert(
          {
            user_id: row.user_id,
            rota_id: row.rota_id,
            status: "sent",
            idempotency_key: row.idempotency_key,
          },
          { onConflict: "idempotency_key" },
        );
        continue;
      }

      failed += 1;
      if (result.unregistered) {
        await admin.from("device_tokens").delete().eq("token", row.fcm_token);
        pruned += 1;
      }
      await admin.from("precheck_push_sends").upsert(
        {
          user_id: row.user_id,
          rota_id: row.rota_id,
          status: "failed",
          idempotency_key: row.idempotency_key,
          error_message: result.error.slice(0, 500),
        },
        { onConflict: "idempotency_key" },
      );
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await admin.from("precheck_push_sends").upsert(
        {
          user_id: row.user_id,
          rota_id: row.rota_id,
          status: "failed",
          idempotency_key: row.idempotency_key,
          error_message: message.slice(0, 500),
        },
        { onConflict: "idempotency_key" },
      );
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mode: gate.mode,
      candidates: targets.length,
      sent,
      failed,
      pruned,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
