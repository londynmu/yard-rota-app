// Admin (or cron): send weekly rota CSV emails to agencies via SendGrid.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";
import {
  parseAgencyEmails,
  parseEmailFromAddress,
} from "../_shared/parseAgencyEmails.ts";
import { sendViaSendGrid } from "../_shared/sendgrid.ts";

type AgencyPayload = {
  name?: string;
  email?: string;
};

type RequestBody = {
  agencies?: AgencyPayload[];
  /** Optional CC agencies applied to every To email (addresses already in To are skipped). */
  cc?: AgencyPayload[];
  weekStart?: string;
  weekEnd?: string;
  csvData?: string;
  /** Base64-encoded PDF (no data: URI prefix). Optional for back-compat. */
  pdfData?: string;
  message?: string;
  /** Optional override; defaults to Weekly Schedule subject. */
  subject?: string;
  /** @deprecated single-recipient shape — still accepted for back-compat */
  recipient?: string;
  agencyName?: string;
};

type AgencyResult = {
  agencyName: string;
  ok: boolean;
  recipients?: string[];
  cc?: string[];
  error?: string;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const weekStart = String(body.weekStart || "").trim();
    const weekEnd = String(body.weekEnd || "").trim();
    const csvData = typeof body.csvData === "string" ? body.csvData : "";
    const pdfDataRaw = typeof body.pdfData === "string" ? body.pdfData.trim() : "";
    // Accept raw base64 or a data:application/pdf;base64,... URI
    const pdfDataBase64 = pdfDataRaw.includes(",")
      ? pdfDataRaw.split(",").pop() || ""
      : pdfDataRaw;
    const message = String(body.message || "").trim();
    const subjectOverride = String(body.subject || "").trim();

    let agencies: AgencyPayload[] = Array.isArray(body.agencies)
      ? body.agencies
      : [];
    const ccAgencies: AgencyPayload[] = Array.isArray(body.cc) ? body.cc : [];

    // Back-compat: single recipient payload
    if (agencies.length === 0 && body.recipient) {
      agencies = [{
        name: body.agencyName || "Agency",
        email: body.recipient,
      }];
    }

    if (!weekStart || !weekEnd || agencies.length === 0 || !message) {
      return json(400, { error: "Missing required fields" });
    }

    const sendgridKey = Deno.env.get("SENDGRID_API_KEY") || "";
    const emailFromRaw = Deno.env.get("EMAIL_FROM") || "bookings@shunters.net";
    if (!sendgridKey) {
      console.error("SENDGRID_API_KEY missing");
      return json(500, { error: "Server email configuration missing" });
    }
    const fromParsed = parseEmailFromAddress(emailFromRaw);
    if (!fromParsed.email || !fromParsed.email.includes("@")) {
      return json(500, { error: "Invalid EMAIL_FROM configuration" });
    }
    // Always show a friendly inbox name; email stays bookings@… from EMAIL_FROM.
    const from = { email: fromParsed.email, name: "Rugby Shunters Rota" };

    // Allowlist: every individual address stored on agencies.email
    const allowed = new Set<string>();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: agencyRows } = await adminClient
        .from("agencies")
        .select("email");
      for (const row of agencyRows || []) {
        for (const addr of parseAgencyEmails(
          (row as { email?: string }).email,
        )) {
          allowed.add(addr.toLowerCase());
        }
      }
    }

    const csvFilename = csvData ? `rota_${weekStart}_${weekEnd}.csv` : undefined;
    const pdfFilename = pdfDataBase64 ? `rota_${weekStart}_${weekEnd}.pdf` : undefined;
    const subject = subjectOverride || `Weekly Schedule: ${weekStart} - ${weekEnd}`;
    const results: AgencyResult[] = [];

    for (const agency of agencies) {
      const agencyName = String(agency.name || "Agency").trim() || "Agency";
      const candidates = parseAgencyEmails(agency.email);
      if (candidates.length === 0) {
        results.push({
          agencyName,
          ok: false,
          error: "No email addresses on agency",
        });
        continue;
      }

      const recipients = candidates.filter((addr) => {
        if (allowed.size === 0) return true;
        return allowed.has(addr.toLowerCase());
      });

      if (recipients.length === 0) {
        results.push({
          agencyName,
          ok: false,
          error: "Recipient is not an agency contact email",
        });
        continue;
      }

      const toLower = new Set(recipients.map((addr) => addr.toLowerCase()));
      const ccCandidates: string[] = [];
      const ccSeen = new Set<string>();
      for (const ccAgency of ccAgencies) {
        for (const addr of parseAgencyEmails(ccAgency.email)) {
          const key = addr.toLowerCase();
          if (toLower.has(key) || ccSeen.has(key)) continue;
          ccSeen.add(key);
          ccCandidates.push(addr);
        }
      }

      const content =
        `Dear ${agencyName},\n\n${message}`;

      try {
        await sendViaSendGrid({
          apiKey: sendgridKey,
          from,
          to: recipients,
          cc: ccCandidates.length > 0 ? ccCandidates : undefined,
          subject,
          content,
          csvFilename,
          csvData: csvData || undefined,
          pdfFilename,
          pdfDataBase64: pdfDataBase64 || undefined,
        });
        console.log(
          "Email sent to",
          agencyName,
          recipients.join(", "),
          ccCandidates.length > 0 ? `cc=${ccCandidates.join(", ")}` : "",
        );
        results.push({
          agencyName,
          ok: true,
          recipients,
          cc: ccCandidates,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("SendGrid error for", agencyName, msg);
        results.push({
          agencyName,
          ok: false,
          error: msg,
          recipients,
          cc: ccCandidates,
        });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    return json(200, {
      success: failed === 0,
      sent,
      failed,
      results,
    });
  } catch (error: unknown) {
    console.error("General error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return json(500, { error: `Unexpected error: ${msg}` });
  }
});
