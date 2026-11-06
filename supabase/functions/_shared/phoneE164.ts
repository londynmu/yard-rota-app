/** E.164 helpers for Edge Functions (Deno). Mirror of src/utils/phoneE164.js */

const E164_RE = /^\+[1-9]\d{7,14}$/;

export function isValidPhoneE164(value: unknown): value is string {
  return typeof value === "string" && E164_RE.test(value);
}

export function normalizePhoneE164(
  input: unknown,
  options: { defaultCountry?: "GB" } = {},
): string | null {
  const defaultCountry = options.defaultCountry || "GB";
  if (input == null) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  let digits = raw.replace(/[\s\-().]/g, "");

  if (digits.startsWith("00")) {
    digits = `+${digits.slice(2)}`;
  }

  if (!digits.startsWith("+")) {
    if (defaultCountry === "GB") {
      if (digits.startsWith("0")) {
        digits = `+44${digits.slice(1)}`;
      } else if (/^\d{10,11}$/.test(digits)) {
        digits = `+44${digits}`;
      } else {
        throw new Error("Enter a valid UK mobile number (e.g. +447… or 07…)");
      }
    } else {
      throw new Error("Phone number must include a country code (e.g. +44…)");
    }
  }

  digits = `+${digits.slice(1).replace(/\D/g, "")}`;

  if (!isValidPhoneE164(digits)) {
    throw new Error(
      "Enter a valid phone number in international format (E.164)",
    );
  }

  return digits;
}

export function isWhatsAppMessagingReady(profile: {
  phone_e164?: string | null;
  whatsapp_opt_in?: boolean | null;
}): boolean {
  return Boolean(
    profile?.whatsapp_opt_in && isValidPhoneE164(profile?.phone_e164 || ""),
  );
}

export function cronIdempotencyKey(userId: string, rotaId: string): string {
  return `precheck-wa:${userId}:${rotaId}`;
}

export function forceIdempotencyKey(
  userId: string,
  rotaId: string,
  ts = Date.now(),
): string {
  return `precheck-wa:${userId}:${rotaId}/force-${ts}`;
}
