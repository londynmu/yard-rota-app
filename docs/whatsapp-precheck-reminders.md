# WhatsApp PreCheck reminders (ops)

Automated nudges when a shunter is on an open shift without a `pre_shift` PreCheck.

## Owner checklist (Twilio / Meta)

1. Apply migrations **only after owner approval** (PR A phone/opt-in, then PR B ledger/RPC).
2. In Supabase project `jkjvtvwedjiupxoibpld` → Edge Function secrets:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+44…`)
   - `TWILIO_WHATSAPP_CONTENT_SID` (approved Meta/Twilio Content Template)
   - `APP_BASE_URL` (production site origin, no trailing slash)
   - Optional: `CRON_SECRET`, `TWILIO_STATUS_CALLBACK_URL` (exact public URL Twilio calls)
3. Approve Content Template (EN utility), variables:
   - `{{1}}` first name
   - `{{2}}` shift window (`07:00-17:00`)
   - `{{3}}` link (`{APP_BASE_URL}/precheck`)
   Suggested body: *Hi {{1}}, your shift {{2}} has no pre-shift tug check yet. Please complete it: {{3}}*
4. Deploy Edge Functions:
   - `send-precheck-whatsapp-reminders`
   - `twilio-whatsapp-status` (`verify_jwt = false`; validates `X-Twilio-Signature`)
5. In Twilio console, set status callback to:
   `https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/twilio-whatsapp-status`
6. Soft launch: use **Admin → Notifications → Send WhatsApp now** (force) first.
7. Enable cron by uncommenting the job block in
   `supabase/migrations/20261106130000_precheck_reminder_sends.sql`
   (or schedule manually) once secrets + template work. Default: every 10 minutes;
   targeting waits **30 minutes** after shift start; at most one **successful**
   cron send per user+rota. Failed Twilio attempts retry after **15 minutes**,
   up to **5** attempts (same ledger row / idempotency key).

## App behaviour

- Shunters set phone + WhatsApp opt-in on **Profile → My details**.
- Admins can edit the same fields on **Users**.
- Without phone **or** opt-in, cron/force send skip that person.
- Clipboard **Copy** on the missing-PreCheck list remains as backup.
