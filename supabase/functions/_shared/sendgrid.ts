/**
 * Shared SendGrid mail sender for Yard Rota edge functions.
 * From address is always supplied by the caller (rota vs VMU must not share fallbacks).
 *
 * API key: callers pass `apiKey` explicitly. For VMU, prefer resolving via
 * `resolveVmuSendGridApiKey()` (VMU_SENDGRID_API_KEY, then SENDGRID_API_KEY).
 * Rota must keep using SENDGRID_API_KEY only.
 */

/** VMU alerts: VMU_SENDGRID_API_KEY first, fallback SENDGRID_API_KEY. */
export function resolveVmuSendGridApiKey(): string {
  return (
    Deno.env.get("VMU_SENDGRID_API_KEY") ||
    Deno.env.get("SENDGRID_API_KEY") ||
    ""
  );
}

export type SendGridAttachment = {
  /** Raw base64 (no data: URI prefix). */
  content: string;
  filename: string;
  type: string;
  disposition?: string;
};

export type SendViaSendGridOpts = {
  apiKey: string;
  from: { email: string; name?: string };
  to: string[];
  cc?: string[];
  subject: string;
  /** Plain-text body (default content type text/plain). */
  content: string;
  contentType?: string;
  attachments?: SendGridAttachment[];
  /** Rota convenience: CSV text encoded as base64 attachment. */
  csvFilename?: string;
  csvData?: string;
  /** Rota convenience: already-base64 PDF. */
  pdfFilename?: string;
  pdfDataBase64?: string;
};

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function sendViaSendGrid(opts: SendViaSendGridOpts): Promise<void> {
  const attachments: SendGridAttachment[] = [...(opts.attachments || [])];

  if (opts.csvData && opts.csvFilename) {
    attachments.push({
      content: toBase64(opts.csvData),
      filename: opts.csvFilename,
      type: "text/csv",
      disposition: "attachment",
    });
  }

  if (opts.pdfDataBase64 && opts.pdfFilename) {
    attachments.push({
      content: opts.pdfDataBase64,
      filename: opts.pdfFilename,
      type: "application/pdf",
      disposition: "attachment",
    });
  }

  const personalization: {
    to: Array<{ email: string }>;
    cc?: Array<{ email: string }>;
  } = {
    to: opts.to.map((email) => ({ email })),
  };
  if (opts.cc && opts.cc.length > 0) {
    personalization.cc = opts.cc.map((email) => ({ email }));
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [personalization],
      from: opts.from.name
        ? { email: opts.from.email, name: opts.from.name }
        : { email: opts.from.email },
      subject: opts.subject,
      content: [{
        type: opts.contentType || "text/plain",
        value: opts.content,
      }],
      ...(attachments.length > 0
        ? {
          attachments: attachments.map((a) => ({
            content: a.content,
            filename: a.filename,
            type: a.type,
            disposition: a.disposition || "attachment",
          })),
        }
        : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `SendGrid ${res.status}: ${errText.slice(0, 400) || res.statusText}`,
    );
  }
}
