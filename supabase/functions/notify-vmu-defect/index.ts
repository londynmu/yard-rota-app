// Service role / cron: twice-daily VMU defect digest emails (Europe/London).
// Body: { "slot": "morning" | "evening" }
// Reuses shared SendGrid. From MUST be VMU_DEFECT_EMAIL_FROM (@shunters.net) — never EMAIL_FROM/bookings.
// Empty window → skip (no email). No per-INSERT alerts.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";
import {
  parseAgencyEmails,
  parseEmailFromAddress,
} from "../_shared/parseAgencyEmails.ts";
import {
  resolveVmuSendGridApiKey,
  sendViaSendGrid,
} from "../_shared/sendgrid.ts";

type DigestSlot = "morning" | "evening";

type RequestBody = {
  slot?: string;
};

type DefectRow = {
  tugLabel: string;
  itemLabel: string;
  description: string;
  reportedBy: string;
  locationName: string | null;
  source: string | null;
  repairStatus: string | null;
  createdAt: string | null;
  hasPhoto: boolean;
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

function getLondonParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour);
  const min = Number(parts.minute);
  const s = Number(parts.second);
  const ymd = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { y, m, d, h, min, s, ymd };
}

function londonWallToUtc(ymd: string, hms = "00:00:00"): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm, ss] = hms.split(":").map((n) => Number(n) || 0);
  let utcMs = Date.UTC(y, m - 1, d, hh, mm, ss);
  for (let i = 0; i < 4; i++) {
    const parts = getLondonParts(new Date(utcMs));
    const asIf = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.min, parts.s);
    const wanted = Date.UTC(y, m - 1, d, hh, mm, ss);
    utcMs += wanted - asIf;
  }
  return new Date(utcMs);
}

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function getVmuDigestWindow(slot: DigestSlot, now = new Date()) {
  const { ymd } = getLondonParts(now);
  if (slot === "morning") {
    const yesterday = addCalendarDaysYmd(ymd, -1);
    return {
      slot,
      londonDate: ymd,
      windowStart: londonWallToUtc(yesterday, "21:00:00"),
      windowEnd: londonWallToUtc(ymd, "10:00:00"),
      idempotencyKey: `digest:morning:${ymd}`,
      label: "morning 10:00",
    };
  }
  return {
    slot,
    londonDate: ymd,
    windowStart: londonWallToUtc(ymd, "10:00:00"),
    windowEnd: londonWallToUtc(ymd, "21:00:00"),
    idempotencyKey: `digest:evening:${ymd}`,
    label: "evening 21:00",
  };
}

function digestStatusRank(repairStatus: string | null | undefined): number {
  const key = String(repairStatus || "open").toLowerCase();
  if (key === "open") return 0;
  if (key === "acknowledged") return 1;
  if (key === "in_progress" || key === "in-progress") return 2;
  if (key === "resolved" || key === "closed") return 9;
  return 5;
}

function formatLondon(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date instanceof Date ? date : new Date(date));
  } catch {
    return String(date);
  }
}

function buildDigestSubject(slot: DigestSlot, londonDate: string): string {
  const label = slot === "morning" ? "morning 10:00" : "evening 21:00";
  return `VMU defect digest — ${label} (${londonDate})`;
}

function buildDigestBody(
  defects: DefectRow[],
  meta: {
    slot: DigestSlot;
    windowStart: Date;
    windowEnd: Date;
    vmuUrl: string;
  },
): string {
  const list = [...defects].sort((a, b) => {
    const rank = digestStatusRank(a.repairStatus) - digestStatusRank(b.repairStatus);
    if (rank !== 0) return rank;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let withPhotos = 0;
  for (const d of list) {
    const source = String(d.source || "unknown");
    bySource[source] = (bySource[source] || 0) + 1;
    const status = String(d.repairStatus || "open");
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (d.hasPhoto) withPhotos += 1;
  }

  const label = meta.slot === "morning" ? "morning 10:00" : "evening 21:00";
  const lines = [
    `VMU defect digest (${label}, Europe/London).`,
    `Window: ${formatLondon(meta.windowStart)} → ${formatLondon(meta.windowEnd)}`,
    `Total new defects: ${list.length}`,
    "",
    "Counts by source:",
  ];
  for (const key of Object.keys(bySource).sort()) {
    lines.push(`- ${key}: ${bySource[key]}`);
  }
  lines.push("Counts by status (open / acknowledged listed first):");
  for (const key of Object.keys(byStatus).sort(
    (a, b) => digestStatusRank(a) - digestStatusRank(b),
  )) {
    lines.push(`- ${key}: ${byStatus[key]}`);
  }
  lines.push(`With photos: ${withPhotos}`);
  lines.push("");
  lines.push("Defects (open / acknowledged first):");

  list.forEach((d, index) => {
    const tug = d.tugLabel.trim() || "Unknown tug";
    const item = d.itemLabel.trim() || "Check item";
    const description = d.description.trim() || "(no description)";
    const reportedBy = d.reportedBy.trim() || "Unknown";
    const location = String(d.locationName || "").trim();
    const source = String(d.source || "unknown");
    const status = String(d.repairStatus || "open");
    const when = d.createdAt ? formatLondon(d.createdAt) : "unknown time";
    lines.push("");
    lines.push(`${index + 1}. ${tug}${location ? ` @ ${location}` : ""}`);
    lines.push(`   Item: ${item}`);
    lines.push(`   Status: ${status} | Source: ${source}`);
    lines.push(`   Reported by: ${reportedBy} at ${when}`);
    lines.push(`   What is wrong: ${description}`);
    if (d.hasPhoto) lines.push("   Photo: yes (view in VMU)");
  });

  lines.push("");
  lines.push(`Open VMU: ${meta.vmuUrl}`);
  lines.push("");
  lines.push("---");
  lines.push("This is an automatic email from Yard Rota VMU alerts.");
  lines.push("This email is not monitored.");
  lines.push(
    "Do not reply — replies are not read and will not receive a response.",
  );
  return lines.join("\n");
}

function itemLabelFromDamage(
  itemName: string,
  source: string | null,
  labelMap: Map<string, string>,
): string {
  if (itemName && labelMap.has(itemName)) return labelMap.get(itemName)!;
  if (itemName) return itemName.replace(/_/g, " ");
  if (source === "remarks") return "Remarks";
  if (source === "during_shift") return "During shift";
  return "Check item";
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

    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const slotRaw = String(body.slot || "").trim().toLowerCase();
    if (slotRaw !== "morning" && slotRaw !== "evening") {
      return json(400, {
        error: 'slot is required: "morning" or "evening"',
      });
    }
    const slot = slotRaw as DigestSlot;
    const window = getVmuDigestWindow(slot);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Server configuration missing" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { error: claimError } = await supabase
      .from("vmu_defect_digest_sends")
      .insert({
        idempotency_key: window.idempotencyKey,
        slot: window.slot,
        london_date: window.londonDate,
        window_start: window.windowStart.toISOString(),
        window_end: window.windowEnd.toISOString(),
        status: "queued",
        defect_count: 0,
      });

    if (claimError) {
      const code = (claimError as { code?: string }).code;
      if (code === "23505") {
        return json(200, {
          skipped: true,
          reason: "already_claimed",
          slot,
          idempotency_key: window.idempotencyKey,
        });
      }
      console.error("digest ledger claim failed", claimError);
      return json(500, { error: "Failed to claim digest send" });
    }

    const markLedger = async (
      status: "sent" | "failed" | "skipped",
      extra: {
        error_message?: string;
        recipients?: string[];
        defect_count?: number;
      } = {},
    ) => {
      await supabase
        .from("vmu_defect_digest_sends")
        .update({
          status,
          error_message: extra.error_message || null,
          recipients: extra.recipients || null,
          defect_count: extra.defect_count ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("idempotency_key", window.idempotencyKey);
    };

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
      return json(200, { skipped: true, reason: "alerts_disabled", slot });
    }

    const { data: damages, error: damagesError } = await supabase
      .from("precheck_damages")
      .select(`
        id,
        description,
        image_urls,
        source,
        repair_status,
        created_at,
        precheck_items ( item_name ),
        precheck_submissions (
          profiles:user_id ( first_name, last_name ),
          tugs (
            tug_number,
            display_name,
            locations ( name )
          )
        )
      `)
      .gte("created_at", window.windowStart.toISOString())
      .lt("created_at", window.windowEnd.toISOString())
      .order("created_at", { ascending: true });

    if (damagesError) {
      console.error("digest query failed", damagesError);
      await markLedger("failed", { error_message: damagesError.message });
      return json(500, { error: "Failed to load defects for digest" });
    }

    const rows = damages || [];
    if (rows.length === 0) {
      await markLedger("skipped", {
        error_message: "empty_window",
        defect_count: 0,
      });
      return json(200, {
        skipped: true,
        reason: "empty_window",
        slot,
        window_start: window.windowStart.toISOString(),
        window_end: window.windowEnd.toISOString(),
      });
    }

    const itemKeys = new Set<string>();
    for (const row of rows) {
      const name = (row.precheck_items as { item_name?: string } | null)?.item_name;
      if (name) itemKeys.add(name);
    }
    const labelMap = new Map<string, string>();
    if (itemKeys.size > 0) {
      const { data: checkItems } = await supabase
        .from("precheck_check_items")
        .select("item_key, label")
        .in("item_key", [...itemKeys]);
      for (const item of checkItems || []) {
        if (item.item_key && item.label) labelMap.set(item.item_key, item.label);
      }
    }

    const defectRows: DefectRow[] = rows.map((row) => {
      const submission = row.precheck_submissions as {
        profiles?: { first_name?: string; last_name?: string } | null;
        tugs?: {
          tug_number?: string | number | null;
          display_name?: string | null;
          locations?: { name?: string } | null;
        } | null;
      } | null;
      const tug = submission?.tugs;
      const tugLabel = String(
        tug?.display_name ||
          (tug?.tug_number != null ? `Tug ${tug.tug_number}` : "") ||
          "Unknown tug",
      );
      const profile = submission?.profiles;
      const reportedBy = [profile?.first_name, profile?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Unknown";
      const itemName = (row.precheck_items as { item_name?: string } | null)
        ?.item_name || "";
      const imageUrls = Array.isArray(row.image_urls) ? row.image_urls : [];
      return {
        tugLabel,
        itemLabel: itemLabelFromDamage(itemName, row.source || null, labelMap),
        description: String(row.description || ""),
        reportedBy,
        locationName: tug?.locations?.name || null,
        source: row.source || null,
        repairStatus: row.repair_status || null,
        createdAt: row.created_at || null,
        hasPhoto: imageUrls.some((u: unknown) => typeof u === "string" && u.trim()),
      };
    });

    const { data: vmuEmails, error: vmuEmailError } = await supabase.rpc(
      "get_vmu_defect_alert_emails",
    );
    if (vmuEmailError) {
      console.error("get_vmu_defect_alert_emails", vmuEmailError);
      await markLedger("failed", {
        error_message: vmuEmailError.message,
        defect_count: defectRows.length,
      });
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
      await markLedger("skipped", {
        error_message: "no_recipients",
        defect_count: defectRows.length,
      });
      return json(200, {
        skipped: true,
        reason: "no_recipients",
        slot,
        defect_count: defectRows.length,
      });
    }

    const sendgridKey = resolveVmuSendGridApiKey();
    const fromRaw = Deno.env.get("VMU_DEFECT_EMAIL_FROM") || "";
    const fromName = Deno.env.get("VMU_DEFECT_EMAIL_FROM_NAME") || "VMU Alerts";
    if (!sendgridKey) {
      await markLedger("failed", {
        error_message: "VMU_SENDGRID_API_KEY missing",
        defect_count: defectRows.length,
      });
      return json(500, {
        error:
          "Server email configuration missing (set VMU_SENDGRID_API_KEY)",
      });
    }
    const fromParsed = parseEmailFromAddress(fromRaw);
    if (!isValidVmuFromEmail(fromParsed.email)) {
      await markLedger("failed", {
        error_message: "Invalid VMU_DEFECT_EMAIL_FROM (require @shunters.net)",
        defect_count: defectRows.length,
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

    const subject = buildDigestSubject(slot, window.londonDate);
    const content = buildDigestBody(defectRows, {
      slot,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      vmuUrl,
    });

    try {
      await sendViaSendGrid({
        apiKey: sendgridKey,
        from: { email: fromParsed.email, name: fromName },
        to: recipients,
        subject,
        content,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("SendGrid VMU digest failed", msg);
      await markLedger("failed", {
        error_message: msg,
        recipients,
        defect_count: defectRows.length,
      });
      return json(502, { error: msg, slot });
    }

    await markLedger("sent", {
      recipients,
      defect_count: defectRows.length,
    });
    return json(200, {
      success: true,
      slot,
      london_date: window.londonDate,
      defect_count: defectRows.length,
      sent: recipients.length,
      recipients,
      window_start: window.windowStart.toISOString(),
      window_end: window.windowEnd.toISOString(),
    });
  } catch (error: unknown) {
    console.error("notify-vmu-defect error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return json(500, { error: `Unexpected error: ${msg}` });
  }
});
