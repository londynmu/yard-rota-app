# Plan: Shunter fixed confirmations (X razy „Fixed?” zanim defect = resolved)

## Cel

- Każde kliknięcie „Fixed?” przez shuntera przy submicie = **jedna potwierdzenie** (fixed confirmation). **+1 dopisywane jest tylko przy SUBMICIE formularza**, nie przy samym kliku „Fixed?” (klik tylko dodaje id do stanu; INSERT do tabeli potwierdzeń dzieje się w handleSubmit).
- Defect w systemie ma być oznaczany jako **resolved** dopiero gdy liczba potwierdzeń **≥ X** (X konfigurowalne w ustawieniach). Wtedy defect **znika** z listy (getOpenDefectsForTug zwraca tylko non-resolved).
- **VMU (i admin)** mogą oznaczyć defect jako resolved **od razu** (VmuPage bez zmian; w PreCheck gdy VMU/admin klika „Fixed?” – RPC od razu resolve).
- **Shunter nie widzi żadnych zmian w UI** – ten sam formularz, te same przyciski „Fixed?” / „Fixed (on submit)”. Po prostu defect znika dopiero po X potwierdzeniach.

**Zakres:** tylko to, o co prosiłeś. Żadnych dodatkowych funkcji (np. liczniki w UI, widoki dla VMU, nowe logi).

---

## 1. Baza danych

### 1.1 Nowa tabela: `precheck_damage_fixed_confirmations`

- Jedna wpis = jeden shunter przy submicie precheck zaznaczył ten defect jako „Fixed?”.
- Kolumny: `id`, `damage_id` (FK → `precheck_damages`), `user_id` (FK → `profiles`), `submission_id` (FK → `precheck_submissions`, opcjonalnie), `created_at`.
- Indeks na `damage_id` (do zliczania w RPC).
- RLS: SELECT dla authenticated; INSERT tylko z RPC (SECURITY DEFINER).

### 1.2 Ustawienie w `settings`

- Klucz: `defect_resolve_confirmations_required`, wartość: liczba jako string (np. `"2"`). Domyślnie `"1"` = obecne zachowanie. W migracji: INSERT z ON CONFLICT, żeby klucz istniał.

### 1.3 Nowa funkcja RPC: `record_precheck_damage_fixed_confirmation`

- Sygnatura: `(damage_id uuid, submission_id uuid DEFAULT NULL)` – żeby klient wywoływał `{ damage_id, submission_id }` jak przy istniejącym RPC.
- Logika: (1) auth.uid() IS NULL → RETURN. (2) Jeśli is_vmu() LUB is_admin() → wywołać mark_precheck_damage_resolved(damage_id), RETURN. (3) Jeśli damage już ma repair_status = 'resolved' → RETURN (nie dodawać potwierdzenia). (4) INSERT do precheck_damage_fixed_confirmations. (5) Odczytać z settings defect_resolve_confirmations_required (domyślnie 1). (6) Zliczyć potwierdzenia dla tego damage_id. (7) Jeśli count >= ustawiona wartość → mark_precheck_damage_resolved(damage_id).
- SECURITY DEFINER. Nie zmieniamy treści mark_precheck_damage_resolved.

---

## 2. Brak zmian w UI formularza precheck

- **CheckItemRow**, **CheckItemRowMultiDefect**, **PreCheckForm** – **bez nowych pól ani etykiet** typu „Fixed (1/2)”.
- Shunter widzi dokładnie to samo co dziś: defect, przycisk „Fixed?”, po zaznaczeniu „Fixed (on submit)”. Defect znika z listy dopiero gdy w backendzie zostanie oznaczony jako resolved (po X potwierdzeniach).

---

## 3. Zmiany w PreCheckForm (tylko logika submit i payload)

- **Submit online:** najpierw `submitPrecheckPayload` (żeby mieć `submission.id`), potem dla każdego z `markedResolvedDamageIds` wywołać `record_precheck_damage_fixed_confirmation(damage_id, submission.id)`. Nie wywoływać już `mark_precheck_damage_resolved` z frontu.
- **Payload:** w `buildPayload()` dodać `markedResolvedDamageIds`, żeby kolejka offline miała te dane.
- **Żadnych** nowych fetchów liczb potwierdzeń ani przekazywania `fixedConfirmationCountByDamageId` / `defectResolveConfirmationsRequired` do wierszy.

---

## 4. Kolejka offline (precheckQueue.js)

- W `processPrecheckQueue` po udanym `submitPrecheckPayload` dla jobów typu precheck: jeśli `job.payload.markedResolvedDamageIds` jest niepustą tablicą, dla każdego `damageId` wywołać `record_precheck_damage_fixed_confirmation(damage_id, submission.id)`. Jeśli pola nie ma (stare joby w kolejce) – nic nie wywoływać.

---

## 5. Admin: ustawienie w CheckItemManager

- W sekcji „Form options” (Precheck items) dodać wiersz: **Defect resolve confirmations** – pole numeryczne (min 1), zapis do `settings.defect_resolve_confirmations_required`. Tylko admin widzi i zmienia to ustawienie.

---

## 6. Czego nie ruszamy

- CheckItemRow.jsx, CheckItemRowMultiDefect.jsx – zero zmian.
- precheckDefects.js, VmuPage.jsx – zero zmian.
- mark_precheck_damage_resolved – nie zmieniamy treści funkcji.
- defect_activity_log, precheck_items, precheck_check_items – brak zmian. Żadnych nowych widoków ani raportów.

---

## 7. Pliki do zmiany (podsumowanie)

- **Nowe:** `supabase/migrations/YYYYMMDD_precheck_damage_fixed_confirmations.sql` (tabela + ustawienie + RPC).
- **Modyfikowane:**
  - `src/components/PreCheck/PreCheckForm.jsx` – tylko submit: kolejność (najpierw submit payload, potem RPC), wywołanie `record_precheck_damage_fixed_confirmation` zamiast `mark_precheck_damage_resolved`; dodanie `markedResolvedDamageIds` do payloadu w `buildPayload()`.
  - `src/components/Admin/PreCheck/CheckItemManager.jsx` – nowe ustawienie „Defect resolve confirmations” w Form options.
  - `src/lib/precheckQueue.js` – w `processPrecheckQueue` po submit wywołać RPC dla `payload.markedResolvedDamageIds`.

- **Bez zmian:** CheckItemRow.jsx, CheckItemRowMultiDefect.jsx, precheckDefects.js, VmuPage.jsx.
