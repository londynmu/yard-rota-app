/**
 * Persist a successful FCM push into public.notifications (in-app inbox).
 * Call only after FCM ok; failures here must not undo the send mark.
 */

export type PushInboxInput = {
  type: string;
  recipientId: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type PushInboxInsertRow = {
  type: string;
  recipient_id: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: false;
};

/** Pure payload builder — easy to unit-test without Deno/Supabase. */
export function buildPushInboxInsert(input: PushInboxInput): PushInboxInsertRow {
  return {
    type: input.type,
    recipient_id: input.recipientId,
    title: input.title,
    message: input.message,
    metadata: input.metadata ?? {},
    is_read: false,
  };
}

type InsertableClient = {
  from: (table: string) => {
    insert: (
      row: PushInboxInsertRow,
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export async function recordPushInboxRow(
  admin: InsertableClient,
  input: PushInboxInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = buildPushInboxInsert(input);
  const { error } = await admin.from("notifications").insert(row);
  if (error) {
    console.error("[pushInbox] insert failed", error.message, {
      type: input.type,
      recipientId: input.recipientId,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
