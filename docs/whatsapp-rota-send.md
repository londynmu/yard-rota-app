# WhatsApp rota send to shunters (ops)

Manual admin send after creating / editing a week in Rota Planner.
**Agencies stay on email** (`Export & Send`) — no WhatsApp to agencies.

## Code delivered in repo

- Migration: `supabase/migrations/20261106170000_rota_whatsapp_sends.sql` (apply only after owner approval)
- Edge Function: `send-rota-whatsapp` (admin JWT)
- Status webhook: `twilio-whatsapp-status` also updates `rota_whatsapp_sends` by MessageSid
- UI: Admin → Rota Planner → **Send rota on WhatsApp**

## Meta / Twilio Content Templates (new)

Create in Twilio Content Template Builder → WhatsApp → Utility → English.

### A) Week summary — `yard_rota_week_shunter_v1`

Body (copy 1:1):

```
Hi {{1}}, your rota for {{2}} is set: {{3}} at {{4}}. Open the app to check details. Sent by {{5}}.
```

| Var | Sample |
|---|---|
| `{{1}}` | `John` |
| `{{2}}` | `08–14 Nov` |
| `{{3}}` | `21 December, 5pm–5pm` |
| `{{4}}` | `DIRFT` |
| `{{5}}` | `Michal Warda` |

Secret: `TWILIO_WHATSAPP_CONTENT_SID_ROTA_SHUNTER` = Content SID (`HX…`)

### B) Assignment ping — `yard_rota_assignment_ping_v1`

Body:

```
Hi {{1}}, you've been added to the rota: {{2}} at {{3}}. Open the app to check details. Sent by {{4}}.
```

| Var | Sample |
|---|---|
| `{{1}}` | `John` |
| `{{2}}` | `21 December, 5pm–5pm` |
| `{{3}}` | `DIRFT` |
| `{{4}}` | `Michal Warda` |

Secret: `TWILIO_WHATSAPP_CONTENT_SID_ROTA_PING` = Content SID (`HX…`)

PreCheck keeps using existing `TWILIO_WHATSAPP_CONTENT_SID`.

## Secrets to add (same project)

Reuse existing Twilio account secrets. Add only the two new Content SIDs above.

## Deploy (after merge + migration approved)

```bash
npx supabase functions deploy send-rota-whatsapp --project-ref jkjvtvwedjiupxoibpld
npx supabase functions deploy twilio-whatsapp-status --project-ref jkjvtvwedjiupxoibpld --no-verify-jwt
```

## Soft launch check

1. Apply migration (owner approval).
2. Set the two Content SID secrets after Meta approves templates.
3. Deploy the two Edge Functions.
4. Admin → Rota Planner → preview list → **Send to shunters** for 1–2 test people with phone + opt-in.
5. Optional: **Notify this person** for a single assignment.
6. Confirm status updates in Twilio and `rota_whatsapp_sends`.
