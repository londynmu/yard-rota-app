// Twilio status callback for PreCheck WhatsApp sends.
// Validates X-Twilio-Signature, updates precheck_reminder_sends by MessageSid.
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
  const { error } = await supabase
    .from("precheck_reminder_sends")
    .update({
      status,
      error_code: errorCode,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_message_sid", messageSid);

  if (error) {
    console.error("[twilio-status] update failed", error);
    return new Response("Update failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
