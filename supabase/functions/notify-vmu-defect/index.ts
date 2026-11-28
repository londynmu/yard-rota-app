// Service role / cron: email VMU users (+ optional mailing list) about a new precheck_damages row.
// Uses shared SendGrid helper. From MUST be VMU_DEFECT_EMAIL_FROM (@shunters.net) — never EMAIL_FROM/bookings.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";
import {
  parseAgencyEmails,
  parseEmailFromAddress,
} from "../_shared/parseAgencyEmails.ts";
import { sendViaSendGrid } from "../_shared/sendgrid.ts";

const PRECHECK_IMAGES_BUCKET = "precheck-images";
/** Skip attaching photos larger than this (raw bytes) to stay under SendGrid limits. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type RequestBody = {
  damage_id?: string;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidVmuFromEmail(email: string): boolean {
  const raw = String(email || "").trim().toLowerCase();
  return raw.includes("@") && raw.endsWith("@shunters.net");
}

function extractPrecheckStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath || typeof urlOrPath !== "string") return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  if (!trimmed.includes("://") && !trimmed.startsWith("/")) {
    return trimmed.replace(/^\/*/, "");
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname || "";
    const markers = [
      `/storage/v1/object/public/${PRECHECK_IMAGES_BUCKET}/`,
      `/storage/v1/object/sign/${PRECHECK_IMAGES_BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = pathname.indexOf(marker);
      if (idx !== -1) {
        return decodeURIComponent(pathname.slice(idx + marker.length));
      }
    }
    const match = pathname.match(
      /\/storage\/v1\/object\/(?:public|sign)\/precheck-images\/(.+)$/,
    );
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    // not a URL
  }
  return null;
}

function mimeFromPath(path: string): { type: string; filename: string } {
  const base = path.split("/").pop() || "defect.jpg";
  const lower = base.toLowerCase();
  if (lower.endsWith(".png")) return { type: "image/png", filename: base };
  if (lower.endsWith(".webp")) return { type: "image/webp", filename: base };
  if (lower.endsWith(".gif")) return { type: "image/gif", filename: base };
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) {
    return { type: "image/heic", filename: base };
  }
  return { type: "image/jpeg", filename: base.endsWith(".jpg") || base.endsWith(".jpeg") ? base : "defect.jpg" };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildSubject(tugLabel: string, itemLabel: string): string {
  const tug = tugLabel.trim() || "Tug";
  const item = itemLabel.trim() || "Check item";
  return `New defect: ${tug} — ${item}`;
}

function buildBody(input: {
  tugLabel: string;
  itemLabel: string;
  description: string;
  reportedBy: string;
  locationName?: string | null;
  source?: string | null;
  vmuUrl: string;
  hasPhotoAttachment: boolean;
}): string {
  const lines = [
    "A new pre-check defect was reported.",
    "",
    `Tug: ${input.tugLabel.trim() || "Unknown tug"}`,
  ];
  const location = String(input.locationName || "").trim();
  if (location) lines.push(`Location: ${location}`);
  lines.push(`Check item: ${input.itemLabel.trim() || "Check item"}`);
  const source = String(input.source || "").trim();
  if (source) lines.push(`Source: ${source}`);
  lines.push(`Reported by: ${input.reportedBy.trim() || "Unknown"}`);
  lines.push(
    `What is wrong: ${input.description.trim() || "(no description)"}`,
  );
  lines.push(
    input.hasPhotoAttachment
      ? "Photo: attached to this email (first photo from the report)."
      : "Photo: none attached.",
  );
  lines.push("");
  lines.push(`Open VMU: ${input.vmuUrl}`);
  lines.push("");
  lines.push("---");
  lines.push("This is an automatic email from Yard Rota VMU alerts.");
  lines.push("This email is not monitored.");
  lines.push(
    "Do not reply — replies are not read and will not receive a response.",
  );
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const gate = await requireAdminOrCron(req);
    if (!gate.ok) {
      return json(gate.status, { error: gate.error });
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON in request body" });
    }

    const damageId = String(body.damage_id || "").trim();
    if (!damageId) {
      return json(400, { error: "damage_id is required" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Server configuration missing" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Atomic claim — prevents duplicate SendGrid sends on trigger/http retries.
    const { error: claimError } = await supabase
      .from("vmu_defect_alert_sends")
      .insert({
        damage_id: damageId,
        status: "queued",
      });

    if (claimError) {
      const code = (claimError as { code?: string }).code;
      if (code === "23505") {
        return json(200, { skipped: true, reason: "already_claimed", damage_id: damageId });
      }
      console.error("ledger claim failed", claimError);
      return json(500, { error: "Failed to claim alert send" });
    }

    const markLedger = async (
      status: "sent" | "failed" | "skipped",
      extra: { error_message?: string; recipients?: string[] } = {},
    ) => {
      await supabase
        .from("vmu_defect_alert_sends")
        .update({
          status,
          error_message: extra.error_message || null,
          recipients: extra.recipients || null,
          updated_at: new Date().toISOString(),
        })
        .eq("damage_id", damageId);
    };

    // Settings: enabled + optional mailing list (service role bypasses RLS).
    const { data: settingRows } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["vmu_defect_alerts_enabled", "vmu_defect_alert_emails"]);

    const settings = Object.fromEntries(
      (settingRows || []).map((r: { key: string; value: string }) => [r.key, r.value]),
    );
    const enabledRaw = String(settings.vmu_defect_alerts_enabled ?? "true")
      .toLowerCase()
      .trim();
    if (enabledRaw === "false" || enabledRaw === "0" || enabledRaw === "off") {
      await markLedger("skipped", { error_message: "alerts_disabled" });
      return json(200, { skipped: true, reason: "alerts_disabled", damage_id: damageId });
    }

    const { data: damage, error: damageError } = await supabase
      .from("precheck_damages")
      .select(`
        id,
        description,
        image_urls,
        source,
        repair_status,
        item_id,
        submission_id,
        precheck_items ( item_name ),
        precheck_submissions (
          user_id,
          tug_id,
          profiles:user_id ( first_name, last_name ),
          tugs (
            tug_number,
            display_name,
            locations ( name )
          )
        )
      `)
      .eq("id", damageId)
      .maybeSingle();

    if (damageError || !damage) {
      await markLedger("failed", {
        error_message: damageError?.message || "damage_not_found",
      });
      return json(404, { error: "Damage not found", damage_id: damageId });
    }

    const submission = damage.precheck_submissions as {
      user_id?: string;
      tug_id?: string;
      profiles?: { first_name?: string; last_name?: string } | null;
      tugs?: {
        tug_number?: string | number | null;
        display_name?: string | null;
        locations?: { name?: string } | null;
      } | null;
    } | null;

    const itemName = (damage.precheck_items as { item_name?: string } | null)
      ?.item_name || "";
    let itemLabel = itemName.replace(/_/g, " ") || "Check item";
    if (itemName) {
      const { data: checkItem } = await supabase
        .from("precheck_check_items")
        .select("label")
        .eq("item_key", itemName)
        .maybeSingle();
      if (checkItem?.label) itemLabel = checkItem.label;
    } else if (damage.source === "remarks") {
      itemLabel = "Remarks";
    } else if (damage.source === "during_shift") {
      itemLabel = "During shift";
    }

    const tug = submission?.tugs;
    const tugLabel = String(
      tug?.display_name ||
        (tug?.tug_number != null ? `Tug ${tug.tug_number}` : "") ||
        "Unknown tug",
    );
    const locationName = tug?.locations?.name || null;
    const profile = submission?.profiles;
    const reportedBy = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Unknown";

    // Recipients: role=vmu (approved/active) + optional mailing list.
    const { data: vmuEmails, error: vmuEmailError } = await supabase.rpc(
      "get_vmu_defect_alert_emails",
    );
    if (vmuEmailError) {
      console.error("get_vmu_defect_alert_emails", vmuEmailError);
      await markLedger("failed", { error_message: vmuEmailError.message });
      return json(500, { error: "Failed to resolve VMU recipients" });
    }

    const recipients: string[] = [];
    const seen = new Set<string>();
    for (const row of vmuEmails || []) {
      const email = String((row as { email?: string }).email || "").trim();
      const key = email.toLowerCase();
      if (!email || !email.includes("@") || seen.has(key)) continue;
      seen.add(key);
      recipients.push(email);
    }
    for (const addr of parseAgencyEmails(settings.vmu_defect_alert_emails)) {
      const key = addr.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push(addr);
    }

    if (recipients.length === 0) {
      await markLedger("skipped", { error_message: "no_recipients" });
      return json(200, { skipped: true, reason: "no_recipients", damage_id: damageId });
    }

    const sendgridKey = Deno.env.get("SENDGRID_API_KEY") || "";
    const fromRaw = Deno.env.get("VMU_DEFECT_EMAIL_FROM") || "";
    const fromName =
      Deno.env.get("VMU_DEFECT_EMAIL_FROM_NAME") || "VMU Alerts";
    if (!sendgridKey) {
      await markLedger("failed", { error_message: "SENDGRID_API_KEY missing" });
      return json(500, { error: "Server email configuration missing" });
    }
    const fromParsed = parseEmailFromAddress(fromRaw);
    if (!isValidVmuFromEmail(fromParsed.email)) {
      await markLedger("failed", {
        error_message: "Invalid VMU_DEFECT_EMAIL_FROM (require @shunters.net)",
      });
      return json(500, {
        error:
          "Invalid VMU_DEFECT_EMAIL_FROM — must be an @shunters.net address (not bookings)",
      });
    }

    const appBaseUrl = (Deno.env.get("APP_BASE_URL") ||
      Deno.env.get("VITE_SITE_URL") ||
      "https://shunters.net").replace(/\/$/, "");
    const vmuUrl = `${appBaseUrl}/vmu`;

    // First photo only (optional).
    let attachment: {
      content: string;
      filename: string;
      type: string;
      disposition: string;
    } | undefined;
    const imageUrls = Array.isArray(damage.image_urls) ? damage.image_urls : [];
    const firstImage = imageUrls.find((u: unknown) => typeof u === "string" && u.trim());
    if (firstImage) {
      const path = extractPrecheckStoragePath(String(firstImage));
      if (path) {
        try {
          const { data: blob, error: dlError } = await supabase.storage
            .from(PRECHECK_IMAGES_BUCKET)
            .download(path);
          if (!dlError && blob) {
            const buf = new Uint8Array(await blob.arrayBuffer());
            if (buf.byteLength > 0 && buf.byteLength <= MAX_PHOTO_BYTES) {
              const meta = mimeFromPath(path);
              attachment = {
                content: bytesToBase64(buf),
                filename: meta.filename,
                type: meta.type,
                disposition: "attachment",
              };
            } else if (buf.byteLength > MAX_PHOTO_BYTES) {
              console.warn("photo too large, sending without attachment", {
                damageId,
                bytes: buf.byteLength,
              });
            }
          } else if (dlError) {
            console.warn("photo download failed", dlError);
          }
        } catch (err) {
          console.warn("photo attach error", err);
        }
      }
    }

    const subject = buildSubject(tugLabel, itemLabel);
    const content = buildBody({
      tugLabel,
      itemLabel,
      description: String(damage.description || ""),
      reportedBy,
      locationName,
      source: damage.source || null,
      vmuUrl,
      hasPhotoAttachment: Boolean(attachment),
    });

    try {
      await sendViaSendGrid({
        apiKey: sendgridKey,
        from: { email: fromParsed.email, name: fromName },
        to: recipients,
        subject,
        content,
        attachments: attachment ? [attachment] : undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("SendGrid VMU defect alert failed", msg);
      await markLedger("failed", {
        error_message: msg,
        recipients,
      });
      return json(502, { error: msg, damage_id: damageId });
    }

    await markLedger("sent", { recipients });
    return json(200, {
      success: true,
      damage_id: damageId,
      sent: recipients.length,
      recipients,
      attached_photo: Boolean(attachment),
    });
  } catch (error: unknown) {
    console.error("notify-vmu-defect error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return json(500, { error: `Unexpected error: ${msg}` });
  }
});
