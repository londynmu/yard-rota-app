/** Twilio WhatsApp Content Template helpers for Yard Rota Edge Functions. */

export type TwilioMessagingConfig = {
  accountSid: string;
  authToken: string;
  whatsappFrom: string;
  contentSid: string;
  appBaseUrl: string;
};

export function loadTwilioMessagingConfig():
  | { ready: true; config: TwilioMessagingConfig }
  | { ready: false; missing: string[] } {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const whatsappFrom = Deno.env.get("TWILIO_WHATSAPP_FROM") || "";
  const contentSid = Deno.env.get("TWILIO_WHATSAPP_CONTENT_SID") || "";
  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "").replace(/\/$/, "");

  const missing: string[] = [];
  if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!whatsappFrom) missing.push("TWILIO_WHATSAPP_FROM");
  if (!contentSid) missing.push("TWILIO_WHATSAPP_CONTENT_SID");
  if (!appBaseUrl) missing.push("APP_BASE_URL");

  if (missing.length) return { ready: false, missing };

  return {
    ready: true,
    config: { accountSid, authToken, whatsappFrom, contentSid, appBaseUrl },
  };
}

export function messagingReady(): boolean {
  return loadTwilioMessagingConfig().ready;
}

export function buildPrecheckContentVariables(input: {
  firstName: string;
  startTime: string;
  endTime: string;
  appBaseUrl: string;
}): Record<string, string> {
  const name = (input.firstName || "there").trim() || "there";
  const window = `${input.startTime || "??:??"}-${input.endTime || "??:??"}`;
  const link = `${input.appBaseUrl}/precheck`;
  // Content template vars {{1}} name, {{2}} shift window, {{3}} link
  return { "1": name, "2": window, "3": link };
}

export type TwilioSendResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; status: number; errorCode?: string; errorMessage: string };

export async function sendWhatsAppContentMessage(params: {
  config: TwilioMessagingConfig;
  toE164: string;
  contentVariables: Record<string, string>;
}): Promise<TwilioSendResult> {
  const { config, toE164, contentVariables } = params;
  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: `whatsapp:${toE164}`,
    From: config.whatsappFrom.startsWith("whatsapp:")
      ? config.whatsappFrom
      : `whatsapp:${config.whatsappFrom}`,
    ContentSid: config.contentSid,
    ContentVariables: JSON.stringify(contentVariables),
  });

  const auth = btoa(`${config.accountSid}:${config.authToken}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      errorCode: String(json?.code || res.status),
      errorMessage: String(json?.message || "Twilio send failed"),
    };
  }

  return {
    ok: true,
    sid: String(json.sid || ""),
    status: String(json.status || "queued"),
  };
}

/** Validate X-Twilio-Signature for status callbacks (form body). */
export async function validateTwilioSignature(params: {
  authToken: string;
  signature: string | null;
  url: string;
  form: URLSearchParams;
}): Promise<boolean> {
  const { authToken, signature, url, form } = params;
  if (!signature || !authToken) return false;

  const keys = [...form.keys()].sort();
  let data = url;
  for (const key of keys) {
    data += key + (form.get(key) ?? "");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  const bytes = new Uint8Array(mac);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const digest = btoa(binary);
  return digest === signature;
}
