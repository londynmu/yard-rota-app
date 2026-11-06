// Twilio status callback for WhatsApp sends (PreCheck + rota ledgers).
// Validates X-Twilio-Signature, updates matching ledger row by MessageSid.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { validateTwilioSignature } from "../_shared/twilioWhatsApp.ts";

const ALLOWED_STATUSES = new Set([
  "queued",
  "sent",
  "delivered",
  "failed",
  "undelivered",
  "read",
  "canceled",
  "accepted",
]);

const LEDGER_TABLES = ["precheck_reminder_sends", "rota_whatsapp_sends"] as const;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!authToken || !supabaseUrl || !serviceKey) {
    return new Response("Misconfigured", { status: 503 });
  }

  const rawBody = await req.text();
  const form = new URLSearchParams(rawBody);
  const signature = req.headers.get("X-Twilio-Signature");

  // Prefer the public function URL Twilio is configured with.
  const configuredUrl = Deno.env.get("TWILIO_STATUS_CALLBACK_URL") || "";
  const requestUrl = configuredUrl || req.url;

  const valid = await validateTwilioSignature({
    authToken,
    signature,
    url: requestUrl,
    form,
  });

  if (!valid) {
    console.error("[twilio-status] invalid signature");
    return new Response("Forbidden", { status: 403 });
  }

  const messageSid = form.get("MessageSid") || form.get("SmsSid") || "";
  const messageStatus = (form.get("MessageStatus") || form.get("SmsStatus") || "")
    .toLowerCase();
  const errorCode = form.get("ErrorCode") || null;
  const errorMessage = form.get("ErrorMessage") || null;

  if (!messageSid) {
    return new Response("Missing MessageSid", { status: 400 });
  }

  const status = ALLOWED_STATUSES.has(messageStatus)
    ? messageStatus
    : messageStatus === "sending"
    ? "sent"
    : "failed";

  const supabase = createClient(supabaseUrl, serviceKey);
  const patch = {
    status,
    error_code: errorCode,
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
  };

  let updated = false;
  for (const table of LEDGER_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .update(patch)
      .eq("provider_message_sid", messageSid)
      .select("id");

    if (error) {
      console.error(`[twilio-status] ${table} update failed`, error);
      return new Response("Update failed", { status: 500 });
    }
    if (data && data.length > 0) {
      updated = true;
      break;
    }
  }

  if (!updated) {
    // Unknown SID is not fatal — Twilio retries; acknowledge receipt.
    console.warn("[twilio-status] no ledger row for sid", messageSid);
  }

  return new Response("ok", { status: 200 });
});
