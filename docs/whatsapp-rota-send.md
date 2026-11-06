# WhatsApp rota send to shunters (ops)

Manual admin send after creating / editing a week in Rota Planner.
**Agencies stay on email** (`Export & Send`) — no WhatsApp to agencies.

## Code delivered in repo

- Migration: `supabase/migrations/20261106170000_rota_whatsapp_sends.sql` (apply only after owner approval)
- Edge Function: `send-rota-whatsapp` (admin JWT)
- Status webhook: `twilio-whatsapp-status` also updates `rota_whatsapp_sends` by MessageSid
- UI: Admin → Rota Planner → WhatsApp icon beside Export → modal checklist (**Send to N selected**). No always-on panel. Already-notified people are disabled (no resend button). Optional **Notify one shift** stays at the bottom of the modal.

## Meta / Twilio Content Templates

Create in Twilio Content Template Builder → WhatsApp → Utility → English.

**Meta rules that bite us:** Content Variables cannot contain newlines; empty variables are rejected; variables should not sit adjacent with only a space; **the last characters of the body must be fixed text** (not a `{{var}}`). Day labels (`Sat {{4}}`) keep vars non-adjacent. Trailing fixed line after `{{11}}` keeps the message Meta-safe.

### A) Week summary — `yard_rota_week_shunter_v2` (current)

Body (copy 1:1, Enter = new line in the template — **not** inside a variable):

```
Hi {{1}}, your rota for {{2}} at {{3}} is set:
Sat {{4}}
Sun {{5}}
Mon {{6}}
Tue {{7}}
Wed {{8}}
Thu {{9}}
Fri {{10}}
Open the app to check details. Sent by {{11}}.
Please review your shifts in the app.
```

| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | first name | `John` |
| `{{2}}` | week range | `08–14 Nov` |
| `{{3}}` | location(s) | `DIRFT` |
| `{{4}}` | Sat times or `off` | `5pm–5pm` |
| `{{5}}` | Sun | `off` |
| `{{6}}` | Mon | `5:45am–6pm` |
| `{{7}}` | Tue | `off` |
| `{{8}}` | Wed | `off` |
| `{{9}}` | Thu | `off` |
| `{{10}}` | Fri | `off` |
| `{{11}}` | sent by | `Michal Warda` |

Code maps Sat→Fri via `buildShunterWeekDayVariables` → ContentVariables `"4"`…`"10"`. Empty days are always `off` (never blank).

Secret: `TWILIO_WHATSAPP_CONTENT_SID_ROTA_SHUNTER` = **v2** Content SID (`HX…`).  
Production week sends need this SID updated after Meta approves v2 (owner pastes it). Do not reuse the old v1 SID with the 11-variable payload.

#### Legacy v1 (do not use for new sends)

```
Hi {{1}}, your rota for {{2}} is set: {{3}} at {{4}}. Open the app to check details. Sent by {{5}}.
```

v1 put the whole week into one `{{3}}` joined with ` · `. Replaced by v2 so each day is its own line in the approved body.

### B) Assignment ping — `yard_rota_assignment_ping_v1`

Body (unchanged):

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

Reuse existing Twilio account secrets. Add / update the Content SIDs above.

## Deploy (after merge + migration approved)

```bash
npx supabase functions deploy send-rota-whatsapp --project-ref jkjvtvwedjiupxoibpld
npx supabase functions deploy twilio-whatsapp-status --project-ref jkjvtvwedjiupxoibpld --no-verify-jwt
```

## Soft launch check

1. Apply migration (owner approval) if not already applied.
2. Create / submit **v2** week template with the Meta-safe body above; wait for **Approved**.
3. Set `TWILIO_WHATSAPP_CONTENT_SID_ROTA_SHUNTER` to the new v2 SID (owner).
4. Deploy `send-rota-whatsapp`.
5. Admin → Rota Planner → WhatsApp icon → search/select 1–2 ready people → **Send to N selected**.
6. On the phone: each day on its own line (`Sat 5pm–5pm`, `Sun off`, …); trailing fixed line after “Sent by …”.
7. Re-open the modal: those people show **Sent** (checkbox disabled). Optional: **Notify one shift** for a single assignment (ping template unchanged).
8. Confirm status updates in Twilio and `rota_whatsapp_sends`.
