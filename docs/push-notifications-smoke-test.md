# Push notifications — smoke test (Android)

Run after:

1. Michal adds Edge secret `FIREBASE_SERVICE_ACCOUNT` (full JSON).
2. Owner approves and applies migrations:
   - `20261123120000_device_tokens_break_push.sql`
   - `20261123121000_precheck_push_sends.sql`
3. Edge Functions deployed: `send-break-push-reminders`, `send-precheck-push-reminders`, `send-rota-assignment-push` (each bundles `_shared/pushInbox.ts`).

## Device

1. Install release (or debug with matching Firebase Android app package).
2. Sign in, allow notifications, enable **Push notifications** in Profile.
3. Confirm a row in `device_tokens` for your user.

## Manual Edge invoke (before enabling cron)

```bash
curl -sS -X POST \
  'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-break-push-reminders' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Insert a test `scheduled_breaks` row whose London wall start is ~10 minutes ahead, invoke again, expect:

1. One T-10 FCM on the device.
2. A `break_push_sends` row (`kind = t10`, `status = sent`).
3. A matching `notifications` inbox row: `type = 'break_reminder'`, `recipient_id` = that user, `title` / `message` same as the push, `is_read = false`, metadata includes `idempotency_key`.

Repeat near start for `kind = start` (same inbox checks).

For rota assignment digest:

```bash
curl -sS -X POST \
  'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-rota-assignment-push' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Expect one FCM digest, `rota_assignment_push_sends` rows, and **one** `notifications` row (`type = 'rota_assignment_digest'`) per user.

For pre-check nudge: invoke `send-precheck-push-reminders` the same way; expect `notifications.type = 'precheck_reminder'`.

**Idempotency:** a second invoke with no new due targets should return `candidates: 0` and must **not** insert extra `notifications` rows.

## Cron

Uncomment / activate the `break-push-reminders` and `precheck-push-reminders` jobs in the migrations **only after** a successful manual invoke. Keep `active := false` until then.
