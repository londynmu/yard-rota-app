/**
 * Parse agency contact email fields that may contain multiple addresses
 * separated by commas, semicolons, newlines, or spaces, including
 * display-name form: `Name Surname <email@example.com>`.
 */
export function parseAgencyEmails(emailField: unknown): string[] {
  if (emailField == null) return [];
  const raw = String(emailField).trim();
  if (!raw) return [];

  const found: string[] = [];
  const angleRe = /([^,<;\n]*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = angleRe.exec(raw)) !== null) {
    const email = match[2].trim();
    if (email) found.push(email);
  }

  const remainder = raw.replace(angleRe, " ");
  for (const part of remainder.split(/[,;\s\n]+/)) {
    const token = part.trim();
    if (token && token.includes("@") && !token.includes("<")) {
      found.push(token);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const email of found) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(email);
  }
  return unique;
}

/** Parse `email@x` or `Name <email@x>` into { email, name? }. */
export function parseEmailFromAddress(from: string): { email: string; name?: string } {
  const trimmed = String(from || "").trim();
  const angle = trimmed.match(/^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  if (angle) {
    const name = angle[1].trim().replace(/^["']|["']$/g, "");
    const email = angle[2].trim();
    return name ? { email, name } : { email };
  }
  return { email: trimmed };
}
