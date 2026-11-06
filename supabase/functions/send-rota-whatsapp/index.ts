// Admin-only: send rota WhatsApp to shunters (week summary or assignment ping).
// Agencies stay on email — this function never targets agencies.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";
import {
  buildRotaPingContentVariables,
  buildRotaShunterContentVariables,
  loadTwilioMessagingConfig,
  sendWhatsAppContentMessage,
} from "../_shared/twilioWhatsApp.ts";
import {
  adminResendIdempotencyKey,
  assignmentPingIdempotencyKey,
  formatCreatorDisplayName,
  formatRotaWeekRangeShort,
  formatShunterLocations,
  formatShunterShiftSummary,
  isBlockingStatus,
  isValidPhoneE164,
  ROTA_WA_RESEND_COOLDOWN_MS,
  shunterWeekIdempotencyKey,
} from "../_shared/rotaWhatsApp.ts";

type MessageKind = "shunter_week" | "assignment_ping";

type Body = {
  action?: "preview" | "send" | "check_ready";
  kind?: MessageKind;
  week_start?: string;
  scheduled_rota_id?: string;
  user_ids?: string[];
  force_resend?: boolean;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_e164: string | null;
  whatsapp_opt_in: boolean | null;
  deleted_at?: string | null;
  is_active?: boolean | null;
};

type SlotRow = {
  id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
};

type LedgerRow = {
  user_id: string;
  status: string;
  updated_at: string;
  idempotency_key: string;
  message_kind: string;
};

type PreviewPerson = {
  user_id: string;
  first_name: string;
  last_name: string;
  status: "ready" | "skipped_no_phone" | "skipped_no_consent" | "already_sent";
  label: string;
  can_force_resend: boolean;
  shift_summary?: string;
  locations?: string;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addDaysIso(weekStartIso: string, days: number): string {
  const [y, m, d] = weekStartIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function classifyPerson(input: {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  optIn: boolean;
  alreadySent: boolean;
  lastSentAt: string | null;
  now: number;
}): PreviewPerson {
  const base = {
    user_id: input.userId,
    first_name: input.firstName,
    last_name: input.lastName,
    can_force_resend: false,
  };
  if (!isValidPhoneE164(String(input.phone || ""))) {
    return { ...base, status: "skipped_no_phone", label: "Skipped: no phone" };
  }
  if (!input.optIn) {
    return {
      ...base,
      status: "skipped_no_consent",
      label: "Skipped: no WhatsApp consent",
    };
  }
  if (input.alreadySent) {
    const lastAt = input.lastSentAt ? Date.parse(input.lastSentAt) : NaN;
    const cooled =
      !Number.isFinite(lastAt) ||
      input.now - lastAt >= ROTA_WA_RESEND_COOLDOWN_MS;
    return {
      ...base,
      status: "already_sent",
      label: "Already notified",
      can_force_resend: cooled,
    };
  }
  return { ...base, status: "ready", label: "Ready" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const gate = await requireAdminOrCron(req);
  if (!gate.ok) {
    return json(gate.status, { error: gate.error });
  }
  if (gate.mode !== "admin" || !gate.userId) {
    return json(403, { error: "Admin only" });
  }

  let body: Body = {};
  try {
    if (req.method !== "GET" && req.headers.get("content-type")?.includes("json")) {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  const action = body.action || (req.method === "GET" ? "check_ready" : "preview");
  const kind: MessageKind = body.kind === "assignment_ping"
    ? "assignment_ping"
    : "shunter_week";

  const contentKind = kind === "assignment_ping" ? "rota_ping" : "rota_shunter";
  const twilio = loadTwilioMessagingConfig(contentKind);

  if (action === "check_ready") {
    return json(200, {
      ready: twilio.ready,
      missing: twilio.ready ? [] : twilio.missing,
      kind,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: creatorProfile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("id", gate.userId)
    .maybeSingle();
  const creatorName = formatCreatorDisplayName(creatorProfile || {});
  const now = Date.now();

  // ---------- assignment_ping ----------
  if (kind === "assignment_ping") {
    const rotaId = String(body.scheduled_rota_id || "").trim();
    if (!rotaId) {
      return json(400, { error: "scheduled_rota_id is required" });
    }

    const { data: rota, error: rotaError } = await supabase
      .from("scheduled_rota")
      .select("id, user_id, date, start_time, end_time, location")
      .eq("id", rotaId)
      .maybeSingle();

    if (rotaError || !rota || !rota.user_id) {
      return json(404, { error: "Assignment not found" });
    }

    const weekStart = (() => {
      const raw = String(rota.date).slice(0, 10);
      const [y, m, d] = raw.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const day = dt.getDay();
      const diff = day === 6 ? 0 : day + 1;
      dt.setDate(dt.getDate() - diff);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    })();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone_e164, whatsapp_opt_in, deleted_at, is_active")
      .eq("id", rota.user_id)
      .maybeSingle();

    if (!profile || profile.deleted_at || profile.is_active === false) {
      return json(404, { error: "Shunter profile not found" });
    }

    const baseKey = assignmentPingIdempotencyKey(rotaId);
    const { data: ledgerRows } = await supabase
      .from("rota_whatsapp_sends")
      .select("user_id, status, updated_at, idempotency_key, message_kind")
      .eq("message_kind", "assignment_ping")
      .eq("scheduled_rota_id", rotaId)
      .order("created_at", { ascending: false });

    const blocking = (ledgerRows || []).find((row: LedgerRow) =>
      isBlockingStatus(row.status)
    );
    const person = classifyPerson({
      userId: profile.id,
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      phone: profile.phone_e164,
      optIn: Boolean(profile.whatsapp_opt_in),
      alreadySent: Boolean(blocking),
      lastSentAt: blocking?.updated_at || null,
      now,
    });
    const shiftSummary = formatShunterShiftSummary([rota]);
    const locations = formatShunterLocations([rota]);
    person.shift_summary = shiftSummary;
    person.locations = locations;

    if (action === "preview") {
      return json(200, {
        ok: true,
        kind,
        week_start: weekStart,
        creator_name: creatorName,
        people: [person],
        summary: {
          ready: person.status === "ready" ? 1 : 0,
          skipped: person.status.startsWith("skipped") ? 1 : 0,
          already_sent: person.status === "already_sent" ? 1 : 0,
        },
        messaging_ready: twilio.ready,
        missing: twilio.ready ? [] : twilio.missing,
      });
    }

    const forceResend = Boolean(body.force_resend);
    if (person.status === "already_sent") {
      if (!forceResend) {
        return json(200, {
          ok: true,
          kind,
          attempted: 0,
          results: [{ user_id: person.user_id, skipped: true, reason: "already_sent" }],
        });
      }
      if (!person.can_force_resend) {
        return json(429, {
          error: "Resend cooldown active. Wait 15 minutes before sending again.",
        });
      }
    }
    if (person.status.startsWith("skipped")) {
      return json(200, {
        ok: true,
        kind,
        attempted: 0,
        results: [{ user_id: person.user_id, skipped: true, reason: person.status }],
      });
    }
    if (!twilio.ready) {
      return json(503, {
        error: "WhatsApp messaging is not configured",
        missing: twilio.missing,
      });
    }

    const phone = profile.phone_e164 as string;
    const idempotencyKey = forceResend && person.status === "already_sent"
      ? adminResendIdempotencyKey(baseKey, now)
      : baseKey;
    const trigger = forceResend && person.status === "already_sent"
      ? "admin_resend"
      : "ui";

    const { data: ledgerRow, error: insertError } = await supabase
      .from("rota_whatsapp_sends")
      .insert({
        week_start: weekStart,
        message_kind: "assignment_ping",
        user_id: profile.id,
        scheduled_rota_id: rotaId,
        recipient_e164: phone,
        creator_user_id: gate.userId,
        creator_name: creatorName,
        status: "queued",
        provider: "twilio",
        idempotency_key: idempotencyKey,
        trigger,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      return json(200, {
        ok: true,
        kind,
        attempted: 0,
        results: [{
          user_id: profile.id,
          skipped: true,
          reason: insertError.code === "23505" ? "already_sent" : insertError.message,
        }],
      });
    }

    const send = await sendWhatsAppContentMessage({
      config: twilio.config,
      toE164: phone,
      contentVariables: buildRotaPingContentVariables({
        firstName: profile.first_name || "",
        shiftSummary,
        location: locations,
        creatorName,
      }),
    });

    if (!send.ok) {
      await supabase.from("rota_whatsapp_sends").update({
        status: "failed",
        error_code: send.errorCode || null,
        error_message: send.errorMessage,
        updated_at: new Date().toISOString(),
      }).eq("id", ledgerRow!.id);
      return json(200, {
        ok: true,
        kind,
        attempted: 1,
        results: [{ user_id: profile.id, ok: false, error: send.errorMessage }],
      });
    }

    const mappedStatus = ["queued", "accepted", "sending"].includes(send.status)
      ? "sent"
      : send.status;
    await supabase.from("rota_whatsapp_sends").update({
      status: mappedStatus,
      provider_message_sid: send.sid,
      updated_at: new Date().toISOString(),
    }).eq("id", ledgerRow!.id);

    return json(200, {
      ok: true,
      kind,
      attempted: 1,
      results: [{ user_id: profile.id, ok: true, sid: send.sid, status: mappedStatus }],
    });
  }

  // ---------- shunter_week ----------
  const weekStart = String(body.week_start || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return json(400, { error: "week_start (yyyy-MM-dd Saturday) is required" });
  }
  const weekEnd = addDaysIso(weekStart, 6);

  const { data: slots, error: slotsError } = await supabase
    .from("scheduled_rota")
    .select("id, user_id, date, start_time, end_time, location")
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .not("user_id", "is", null);

  if (slotsError) {
    return json(500, { error: slotsError.message || "Failed to load rota" });
  }

  const slotRows = (slots || []) as SlotRow[];
  const byUser = new Map<string, SlotRow[]>();
  for (const slot of slotRows) {
    if (!byUser.has(slot.user_id)) byUser.set(slot.user_id, []);
    byUser.get(slot.user_id)!.push(slot);
  }

  const userIds = [...byUser.keys()];
  if (userIds.length === 0) {
    return json(200, {
      ok: true,
      kind,
      week_start: weekStart,
      creator_name: creatorName,
      people: [],
      summary: { ready: 0, skipped: 0, already_sent: 0 },
      messaging_ready: twilio.ready,
      missing: twilio.ready ? [] : twilio.missing,
      empty: true,
      message: "Add people to the rota before sending",
    });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, phone_e164, whatsapp_opt_in, deleted_at, is_active")
    .in("id", userIds);

  if (profilesError) {
    return json(500, { error: profilesError.message || "Failed to load profiles" });
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const p of (profiles || []) as ProfileRow[]) {
    if (p.deleted_at || p.is_active === false) continue;
    profileMap.set(p.id, p);
  }

  const { data: ledgerRows } = await supabase
    .from("rota_whatsapp_sends")
    .select("user_id, status, updated_at, idempotency_key, message_kind")
    .eq("week_start", weekStart)
    .eq("message_kind", "shunter_week")
    .in("user_id", userIds)
    .order("created_at", { ascending: false });

  const latestBlocking = new Map<string, LedgerRow>();
  for (const row of (ledgerRows || []) as LedgerRow[]) {
    if (!isBlockingStatus(row.status)) continue;
    if (!latestBlocking.has(row.user_id)) {
      latestBlocking.set(row.user_id, row);
    }
  }

  const requestedIds = Array.isArray(body.user_ids)
    ? new Set(body.user_ids.map(String))
    : null;

  const people: PreviewPerson[] = [];
  for (const userId of userIds) {
    if (requestedIds && !requestedIds.has(userId)) continue;
    const profile = profileMap.get(userId);
    if (!profile) continue;
    const userSlots = byUser.get(userId) || [];
    const blocking = latestBlocking.get(userId) || null;
    const person = classifyPerson({
      userId,
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      phone: profile.phone_e164,
      optIn: Boolean(profile.whatsapp_opt_in),
      alreadySent: Boolean(blocking),
      lastSentAt: blocking?.updated_at || null,
      now,
    });
    person.shift_summary = formatShunterShiftSummary(userSlots);
    person.locations = formatShunterLocations(userSlots);
    people.push(person);
  }

  people.sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
  );

  const summary = {
    ready: people.filter((p) => p.status === "ready").length,
    skipped: people.filter((p) => p.status.startsWith("skipped")).length,
    already_sent: people.filter((p) => p.status === "already_sent").length,
  };

  if (action === "preview") {
    return json(200, {
      ok: true,
      kind,
      week_start: weekStart,
      week_range: formatRotaWeekRangeShort(weekStart),
      creator_name: creatorName,
      people,
      summary,
      messaging_ready: twilio.ready,
      missing: twilio.ready ? [] : twilio.missing,
    });
  }

  // send
  if (!twilio.ready) {
    return json(503, {
      error: "WhatsApp messaging is not configured",
      missing: twilio.missing,
    });
  }

  const forceResend = Boolean(body.force_resend);
  let toSend = people.filter((p) => p.status === "ready");
  if (forceResend) {
    const resendable = people.filter((p) =>
      p.status === "already_sent" && p.can_force_resend
    );
    const blocked = people.filter((p) =>
      p.status === "already_sent" && !p.can_force_resend
    );
    if (blocked.length && resendable.length === 0 && toSend.length === 0) {
      return json(429, {
        error: "Resend cooldown active. Wait 15 minutes before sending again.",
      });
    }
    toSend = [...toSend, ...resendable];
  }

  if (toSend.length === 0) {
    return json(200, {
      ok: true,
      kind,
      week_start: weekStart,
      attempted: 0,
      results: people.map((p) => ({
        user_id: p.user_id,
        skipped: true,
        reason: p.status,
      })),
      summary,
    });
  }

  const weekRange = formatRotaWeekRangeShort(weekStart);
  const results: Array<Record<string, unknown>> = [];

  for (const person of toSend) {
    const profile = profileMap.get(person.user_id)!;
    const userSlots = byUser.get(person.user_id) || [];
    const phone = profile.phone_e164 as string;
    const baseKey = shunterWeekIdempotencyKey(weekStart, person.user_id);
    const isResend = person.status === "already_sent";
    const idempotencyKey = isResend
      ? adminResendIdempotencyKey(baseKey, now)
      : baseKey;
    const trigger = isResend ? "admin_resend" : "ui";

    const { data: ledgerRow, error: insertError } = await supabase
      .from("rota_whatsapp_sends")
      .insert({
        week_start: weekStart,
        message_kind: "shunter_week",
        user_id: person.user_id,
        scheduled_rota_id: null,
        recipient_e164: phone,
        creator_user_id: gate.userId,
        creator_name: creatorName,
        status: "queued",
        provider: "twilio",
        idempotency_key: idempotencyKey,
        trigger,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      results.push({
        user_id: person.user_id,
        skipped: true,
        reason: insertError.code === "23505" ? "already_sent" : insertError.message,
      });
      continue;
    }

    const send = await sendWhatsAppContentMessage({
      config: twilio.config,
      toE164: phone,
      contentVariables: buildRotaShunterContentVariables({
        firstName: profile.first_name || "",
        weekRange,
        shiftSummary: formatShunterShiftSummary(userSlots),
        locations: formatShunterLocations(userSlots),
        creatorName,
      }),
    });

    if (!send.ok) {
      await supabase.from("rota_whatsapp_sends").update({
        status: "failed",
        error_code: send.errorCode || null,
        error_message: send.errorMessage,
        updated_at: new Date().toISOString(),
      }).eq("id", ledgerRow!.id);
      results.push({
        user_id: person.user_id,
        ok: false,
        error: send.errorMessage,
      });
      continue;
    }

    const mappedStatus = ["queued", "accepted", "sending"].includes(send.status)
      ? "sent"
      : send.status;
    await supabase.from("rota_whatsapp_sends").update({
      status: mappedStatus,
      provider_message_sid: send.sid,
      updated_at: new Date().toISOString(),
    }).eq("id", ledgerRow!.id);

    results.push({
      user_id: person.user_id,
      ok: true,
      sid: send.sid,
      status: mappedStatus,
    });
  }

  return json(200, {
    ok: true,
    kind,
    week_start: weekStart,
    creator_name: creatorName,
    attempted: results.length,
    results,
  });
});
