// Cron / admin force: send WhatsApp PreCheck reminders via Twilio Content Template.
// Gate: requireAdminOrCron. Secrets: TWILIO_*, APP_BASE_URL (never commit).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";
import {
  cronIdempotencyKey,
  forceIdempotencyKey,
  isValidPhoneE164,
} from "../_shared/phoneE164.ts";
import {
  buildPrecheckContentVariables,
  loadTwilioMessagingConfig,
  sendWhatsAppContentMessage,
} from "../_shared/twilioWhatsApp.ts";

const MAX_SENDS_PER_RUN = 30;

type TargetRow = {
  user_id: string;
  rota_id: string;
  first_name: string;
  last_name: string;
  start_time: string;
  end_time: string;
  phone_e164: string | null;
  whatsapp_opt_in: boolean;
  already_sent?: boolean;
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

  let body: {
    check_ready?: boolean;
    force_user_id?: string;
    force_rota_id?: string;
  } = {};
  try {
    if (req.method !== "GET" && req.headers.get("content-type")?.includes("json")) {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  const twilio = loadTwilioMessagingConfig();

  if (body.check_ready || req.method === "GET") {
    return new Response(
      JSON.stringify({
        ready: twilio.ready,
        missing: twilio.ready ? [] : twilio.missing,
        mode: gate.mode,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!twilio.ready) {
    return new Response(
      JSON.stringify({
        error: "WhatsApp messaging is not configured",
        missing: twilio.missing,
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const forceUserId = body.force_user_id || null;
  const forceRotaId = body.force_rota_id || null;
  const isForce = Boolean(forceUserId && forceRotaId);

  if ((forceUserId && !forceRotaId) || (!forceUserId && forceRotaId)) {
    return new Response(
      JSON.stringify({
        error: "force_user_id and force_rota_id are both required for force send",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (isForce && gate.mode !== "admin") {
    return new Response(
      JSON.stringify({ error: "Force send requires an admin session" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { data: targets, error: targetsError } = await supabase.rpc(
    "get_missing_precheck_reminder_targets",
  );

  if (targetsError) {
    console.error("[precheck-wa] targets RPC error", targetsError);
    return new Response(
      JSON.stringify({ error: targetsError.message || "Failed to load targets" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let candidates = (targets || []) as TargetRow[];

  if (isForce) {
    candidates = candidates.filter(
      (t) => t.user_id === forceUserId && t.rota_id === forceRotaId,
    );
    // Force may still send after already_sent; if target not in open missing list, look up profile + rota.
    if (candidates.length === 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_e164, whatsapp_opt_in")
        .eq("id", forceUserId)
        .maybeSingle();
      const { data: rota } = await supabase
        .from("scheduled_rota")
        .select("id, user_id, start_time, end_time")
        .eq("id", forceRotaId)
        .maybeSingle();
      if (!profile || !rota || rota.user_id !== forceUserId) {
        return new Response(
          JSON.stringify({ error: "Force target not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      candidates = [
        {
          user_id: profile.id,
          rota_id: rota.id,
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          start_time: String(rota.start_time || "").slice(0, 5),
          end_time: String(rota.end_time || "").slice(0, 5),
          phone_e164: profile.phone_e164,
          whatsapp_opt_in: Boolean(profile.whatsapp_opt_in),
          already_sent: false,
        },
      ];
    }
  } else {
    candidates = candidates.filter((t) => !t.already_sent);
  }

  candidates = candidates.filter(
    (t) => t.whatsapp_opt_in && isValidPhoneE164(t.phone_e164 || ""),
  );

  if (candidates.length > MAX_SENDS_PER_RUN) {
    candidates = candidates.slice(0, MAX_SENDS_PER_RUN);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const target of candidates) {
    const phone = target.phone_e164 as string;
    const idempotencyKey = isForce
      ? forceIdempotencyKey(target.user_id, target.rota_id)
      : cronIdempotencyKey(target.user_id, target.rota_id);

    const { data: ledgerRow, error: insertError } = await supabase
      .from("precheck_reminder_sends")
      .insert({
        user_id: target.user_id,
        rota_id: target.rota_id,
        phone_e164: phone,
        channel: "whatsapp",
        status: "queued",
        provider: "twilio",
        idempotency_key: idempotencyKey,
        trigger: isForce ? "admin_force" : "cron",
        sent_by: isForce ? gate.userId || null : null,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      // Unique violation = already sent for this cron key
      results.push({
        user_id: target.user_id,
        rota_id: target.rota_id,
        skipped: true,
        reason: insertError.code === "23505" ? "already_sent" : insertError.message,
      });
      continue;
    }

    const contentVariables = buildPrecheckContentVariables({
      firstName: target.first_name,
      startTime: target.start_time,
      endTime: target.end_time,
      appBaseUrl: twilio.config.appBaseUrl,
    });

    const send = await sendWhatsAppContentMessage({
      config: twilio.config,
      toE164: phone,
      contentVariables,
    });

    if (!send.ok) {
      await supabase
        .from("precheck_reminder_sends")
        .update({
          status: "failed",
          error_code: send.errorCode || null,
          error_message: send.errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ledgerRow?.id);
      results.push({
        user_id: target.user_id,
        rota_id: target.rota_id,
        ok: false,
        error: send.errorMessage,
      });
      continue;
    }

    const mappedStatus = ["queued", "accepted", "sending"].includes(send.status)
      ? "sent"
      : send.status;

    await supabase
      .from("precheck_reminder_sends")
      .update({
        status: mappedStatus,
        provider_message_sid: send.sid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ledgerRow?.id);

    results.push({
      user_id: target.user_id,
      rota_id: target.rota_id,
      ok: true,
      sid: send.sid,
      status: mappedStatus,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mode: gate.mode,
      force: isForce,
      attempted: results.length,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
