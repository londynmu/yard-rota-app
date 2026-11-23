/**
 * Pure payload builder mirroring supabase/functions/_shared/pushInbox.ts.
 * Keeps Vitest coverage without Deno.
 */

/**
 * @param {{
 *   type: string,
 *   recipientId: string,
 *   title: string,
 *   message: string,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export function buildPushInboxInsert(input) {
  return {
    type: input.type,
    recipient_id: input.recipientId,
    title: input.title,
    message: input.message,
    metadata: input.metadata ?? {},
    is_read: false,
  };
}
