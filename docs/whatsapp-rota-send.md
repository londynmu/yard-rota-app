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

**Meta rules that bite us:** Content Variables cannot contain newlines; empty variables are rejected; variables should not sit adjacent with only a space; **the last characters of the body must be fixed text** (not a `{{var}}`). Bullet prefix (`• {{3}}`) keeps vars non-adjacent. Trailing fixed line after `{{10}}` keeps the message Meta-safe.

### A) Week summary — `yard_rota_week_shunter_v4` (current)

Body (copy 1:1, Enter = new line in the template — **not** inside a variable):

```
Hi {{1}}, your rota for {{2}} is:
• {{3}}
• {{4}}
• {{5}}
• {{6}}
• {{7}}
• {{8}}
• {{9}}
Sent by {{10}}. Please open the app to review your shifts.
```

| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | first name | `Michal` |
| `{{2}}` | week range | `24-30 Oct` |
| `{{3}}` | Sat | `—` |
| `{{4}}` | Sun | `—` |
| `{{5}}` | Mon | `—` |
| `{{6}}` | Tue | `—` |
| `{{7}}` | Wed | `—` |
| `{{8}}` | Thu | `—` |
| `{{9}}` | Fri | `Fri 30th 17:00-05:15 (Rugby)` |
| `{{10}}` | sent by | `Michal Warda` |

Code maps via `buildShunterWeekDayVariables` → ContentVariables `"3"`…`"9"`:

- Fixed Sat→Fri slots (no left-pack). Friday stays in `{{9}}` even if it is the only working day.
- Line value: `Fri 30th 17:00-05:15 (Rugby)` — Title Case weekday, ordinal day, 24h times, location from the shift in parentheses.
- Multi-window same yard: `Fri 30th 05:45-18:00, 18:00-02:00 (Rugby)`.
- Different yards on one day: location per window.
- Unused slots are always the em dash `—` (never blank, never `off`).
- No location in the header — location lives only on day lines.
- Bullet `•` lives in the **template body**, not in the variable value.

Secret: `TWILIO_WHATSAPP_CONTENT_SID_ROTA_SHUNTER` = **v4** Content SID (`HX…`).  
Production week sends need this SID updated after Meta approves v4 (owner pastes it). Do not reuse a v3 SID with the v4 payload — messages will mismatch the approved template.

#### Legacy v3 (do not use for new sends)

```
Hi {{1}}, your rota for {{2}} at {{3}} is set:
• {{4}}
• {{5}}
• {{6}}
• {{7}}
• {{8}}
• {{9}}
• {{10}}
Sent by {{11}}. Please open the app to review your shifts.
```

v3 left-packed working days into `{{4}}`…`{{10}}` as `d/m ddd HH:MM-HH:MM` and put location in header `{{3}}`. Replaced by v4 so Friday stays in the Friday slot and location moves onto each day line.

#### Legacy v2 (do not use for new sends)

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

v2 fixed Sat→Fri labels in the body and put am/pm times (or `off`) in each var.

#### Legacy v1 (do not use for new sends)

```
Hi {{1}}, your rota for {{2}} is set: {{3}} at {{4}}. Open the app to check details. Sent by {{5}}.
```

v1 put the whole week into one `{{3}}` joined with ` · `.

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
2. Create / submit **v4** week template with the Meta-safe body above; wait for **Approved**.
3. Set `TWILIO_WHATSAPP_CONTENT_SID_ROTA_SHUNTER` to the new v4 SID (owner).
4. Deploy `send-rota-whatsapp`.
5. Admin → Rota Planner → WhatsApp icon → search/select 1–2 ready people → **Send to N selected**.
6. On the phone: fixed Sat→Fri bullet lines; Friday-only shows six `• —` then the Friday line; trailing fixed line after “Sent by …”.
7. Re-open the modal: those people show **Sent** (checkbox disabled). Optional: **Notify one shift** for a single assignment (ping template unchanged).
8. Confirm status updates in Twilio and `rota_whatsapp_sends`.
