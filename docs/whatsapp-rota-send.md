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

**Meta rules that bite us:** Content Variables cannot contain newlines; empty variables are rejected; variables should not sit adjacent with only a space; **the last characters of the body must be fixed text** (not a `{{var}}`). Bullet prefix (`• {{4}}`) keeps vars non-adjacent. Trailing fixed line after `{{11}}` keeps the message Meta-safe.

### A) Week summary — `yard_rota_week_shunter_v3` (current)

Body (copy 1:1, Enter = new line in the template — **not** inside a variable):

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

| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | first name | `John` |
| `{{2}}` | week range | `08–14 Nov` |
| `{{3}}` | location(s) | `DIRFT` |
| `{{4}}` | working day line (left-packed) | `8/11 sat 17:00-17:00` |
| `{{5}}` | next working day / `—` | `11/11 tue 05:45-18:00` |
| `{{6}}` | … | `12/11 wed 05:45-18:00` |
| `{{7}}` | … | `13/11 thu 05:45-18:00` |
| `{{8}}` | unused slot | `—` |
| `{{9}}` | unused slot | `—` |
| `{{10}}` | unused slot | `—` |
| `{{11}}` | sent by | `Michal Warda` |

Code maps via `buildShunterWeekDayVariables` → ContentVariables `"4"`…`"10"`:

- Line value: `d/m ddd HH:MM-HH:MM` (weekday lowercase EN; 24h times).
- Only days with shifts are left-packed into slots 4…10.
- Unused slots are always the em dash `—` (never blank, never `off`).
- Bullet `•` lives in the **template body**, not in the variable value.

Secret: `TWILIO_WHATSAPP_CONTENT_SID_ROTA_SHUNTER` = **v3** Content SID (`HX…`).  
Production week sends need this SID updated after Meta approves v3 (owner pastes it). Do not reuse the v2 SID with the v3 payload — messages will mismatch the approved template.

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

v2 fixed Sat→Fri labels in the body and put am/pm times (or `off`) in each var. Replaced by v3 so lines show short date + 24h and skip empty days (unused → `—`).

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
2. Create / submit **v3** week template with the Meta-safe body above; wait for **Approved**.
3. Set `TWILIO_WHATSAPP_CONTENT_SID_ROTA_SHUNTER` to the new v3 SID (owner).
4. Deploy `send-rota-whatsapp`.
5. Admin → Rota Planner → WhatsApp icon → search/select 1–2 ready people → **Send to N selected**.
6. On the phone: bullet lines with `d/m ddd HH:MM-HH:MM`; unused slots show `• —`; trailing fixed line after “Sent by …”.
7. Re-open the modal: those people show **Sent** (checkbox disabled). Optional: **Notify one shift** for a single assignment (ping template unchanged).
8. Confirm status updates in Twilio and `rota_whatsapp_sends`.
