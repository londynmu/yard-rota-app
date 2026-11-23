// Cron / admin: FCM digest when shunters are added to rota slots.
// Gate: requireAdminOrCron. Secret: FIREBASE_SERVICE_ACCOUNT (full JSON).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";
import {
  loadFirebaseServiceAccount,
  sendFcmMessage,
} from "../_shared/fcm.ts";
import {
  formatRotaAssignmentDigestBody,
  groupRotaAssignmentPushTargets,
  ROTA_ASSIGNMENT_PUSH_TYPE,
  type AssignmentPushRow,
} from "../_shared/rotaAssignmentPush.ts";

const MAX_USERS_PER_RUN = 50;

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
  const { data, error } = await admin.rpc("get_due_rota_assignment_push_targets");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const groups = groupRotaAssignmentPushTargets(
    (data || []) as AssignmentPushRow[],
  ).slice(0, MAX_USERS_PER_RUN);

  let sent = 0;
  let failed = 0;
  let pruned = 0;
  let slotsMarked = 0;

  for (const group of groups) {
    const title = "Rota update";
    const body = formatRotaAssignmentDigestBody(group.count);

    try {
      const result = await sendFcmMessage({
        sa,
        token: group.fcm_token,
        title,
        body,
        data: {
          type: ROTA_ASSIGNMENT_PUSH_TYPE,
          count: String(group.count),
        },
      });

      if (result.ok) {
        sent += 1;
        for (let i = 0; i < group.scheduled_rota_ids.length; i += 1) {
          const scheduledRotaId = group.scheduled_rota_ids[i];
          const idempotencyKey = group.idempotency_keys[i];
          await admin.from("rota_assignment_push_sends").upsert(
            {
              user_id: group.user_id,
              scheduled_rota_id: scheduledRotaId,
              status: "sent",
              idempotency_key: idempotencyKey,
            },
            { onConflict: "idempotency_key" },
          );
          slotsMarked += 1;
        }
        continue;
      }

      failed += 1;
      if (result.unregistered) {
        await admin.from("device_tokens").delete().eq("token", group.fcm_token);
        pruned += 1;
      }
      for (let i = 0; i < group.scheduled_rota_ids.length; i += 1) {
        await admin.from("rota_assignment_push_sends").upsert(
          {
            user_id: group.user_id,
            scheduled_rota_id: group.scheduled_rota_ids[i],
            status: "failed",
            idempotency_key: group.idempotency_keys[i],
            error_message: result.error.slice(0, 500),
          },
          { onConflict: "idempotency_key" },
        );
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      for (let i = 0; i < group.scheduled_rota_ids.length; i += 1) {
        await admin.from("rota_assignment_push_sends").upsert(
          {
            user_id: group.user_id,
            scheduled_rota_id: group.scheduled_rota_ids[i],
            status: "failed",
            idempotency_key: group.idempotency_keys[i],
            error_message: message.slice(0, 500),
          },
          { onConflict: "idempotency_key" },
        );
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mode: gate.mode,
      candidates: groups.length,
      sent,
      failed,
      pruned,
      slots_marked: slotsMarked,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
