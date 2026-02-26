---
name: Attendance list implementation
overview: "Lista obecności: admin na My Rota klika w pole z użytkownikiem, modal No show/Sick/Late/Clear; zapis tylko wyjątków w nowej tabeli; raporty w sekcji Admin Attendance. Plan doprecyzowany pod kątem bezpieczeństwa i braku regresji."
todos:
  - id: attendance-table
    content: Create attendance table (scheduled_rota_id, status), RLS, indexes
    status: pending
  - id: attendance-modal
    content: AttendanceStatusModal component (No show / Sick / Late / Clear)
    status: pending
  - id: my-rota-click
    content: My Rota – clickable user rows for admin, fetch attendance for week
    status: pending
  - id: admin-attendance-page
    content: Admin section Attendance – list by person, dates, counts
    status: pending
isProject: false
---

# Plan: Lista obecności (attendance) – wersja doprecyzowana

## Założenia (bez zmian)

- **Gdzie:** My Rota ([src/pages/WeeklyRotaPage.jsx](src/pages/WeeklyRotaPage.jsx)) – klik w wiersz z imieniem i nazwiskiem (tylko dla admina) → mały modal.
- **Modal:** No show / Sick / Late / **Clear** (Present). Clear = usuwamy wpis z bazy.
- **Domyślnie:** brak rekordu w `attendance` = obecny.
- **Raporty:** nowa sekcja Admin **Attendance** – osoby z co najmniej jednym wpisem, daty, liczba wystąpień.

---

## 1. Baza danych – dokładna migracja

### 1.1 Plik migracji

- **Lokalizacja:** `supabase/migrations/YYYYMMDD_create_attendance_table.sql` (np. `20260226_create_attendance_table.sql`).
- **Konwencja:** jak w [supabase/migrations/20260207_create_check_items.sql](supabase/migrations/20260207_create_check_items.sql) – CREATE TABLE, indeksy, RLS, polityki z `is_admin()`.

### 1.2 SQL (szczegóły)

```sql
-- Tabela: tylko wyjątki (nieobecność / spóźnienie)
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_rota_id uuid NOT NULL
    REFERENCES public.scheduled_rota(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('no_show', 'sick', 'late')),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scheduled_rota_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_scheduled_rota_id ON public.attendance(scheduled_rota_id);
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_at ON public.attendance(recorded_at);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Odczyt: wszyscy authenticated (żeby My Rota mogła pokazać etykietę przy slocie po zalogowaniu)
CREATE POLICY attendance_select_authenticated ON public.attendance
  FOR SELECT TO authenticated USING (true);

-- Zapis/update/delete: tylko admin
CREATE POLICY attendance_insert_admin ON public.attendance
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY attendance_update_admin ON public.attendance
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY attendance_delete_admin ON public.attendance
  FOR DELETE TO authenticated USING (is_admin());
```

**Uwaga:** `recorded_by` – w projekcie używane jest `is_admin()` z [migrations/02_fix_helper_functions.sql](migrations/02_fix_helper_functions.sql). Nie zmieniamy `scheduled_rota` ani innych tabel.

**Ryzyko:** Jeśli `scheduled_rota` nie ma kolumny `id` (tylko composite) – sprawdzić w bazie. W kodzie używane jest `slot.id` ([WeeklyRotaPage.jsx ok. 406](src/pages/WeeklyRotaPage.jsx)) – zakładamy, że `scheduled_rota.id` istnieje.

---

## 2. Komponent modala – bez wpływu na istniejące strony

### 2.1 Nowy plik

- **Ścieżka:** `src/components/Attendance/AttendanceStatusModal.jsx`.
- **Props:** `open` (bool), `onClose` (fn), `slot` (obiekt: id, date, shift_type, profiles, start_time, end_time), `currentStatus` (null | 'no_show' | 'sick' | 'late'), `onSave` (fn(status) – status może być null przy Clear), `saving` (bool, opcjonalnie).

### 2.2 Zachowanie

- Przyciski: **No show**, **Sick**, **Late**, **Clear**. Przy Clear wywołać `onSave(null)`.
- Styl: spójny z istniejącymi modalami na My Rota (np. Week/Location/Shift modal – tło `bg-black/70`, karta `bg-white rounded-xl border-2 border-gray-400`, przyciski jak w [linie 506–567](src/pages/WeeklyRotaPage.jsx)).
- Nie używać modala nigdzie indziej bez dopisania – zero zmian w innych komponentach poza przekazaniem propsów.

### 2.3 Język

- Etykiety po angielsku: "No show", "Sick", "Late", "Clear" / "Present", "Mark attendance", "Close".

---

## 3. My Rota (WeeklyRotaPage) – minimalne, bezpieczne zmiany

### 3.1 Co nie zmieniać

- **Nie** zmieniać: `getWeekStart`, logiki `dailyRotaData`, sortowania slotów, struktury `DayCard` (nagłówek, rozwijanie na mobile), `createPortal` dla Week/Location/Shift.
- **Nie** zmieniać `key={slot.id}` ani `key={dateStr}` / `key={startTime}`.
- **Nie** dodawać żadnego `onClick` na `<li>` gdy użytkownik **nie** jest adminem – unikamy zbędnego zachowania i błędów.

### 3.2 Nowy stan (tylko w WeeklyRotaPage)

- `attendanceBySlotId` – obiekt `{ [scheduled_rota_id]: { status } }` (lub Map).
- `attendanceModalSlot` – `null` | slot (obiekt). Gdy ustawiony, modal jest otwarty.
- `attendanceSaving` – bool (opcjonalnie, żeby zablokować podwójne zapisy).

### 3.3 Pobieranie attendance

- **Gdzie:** w tym samym `useEffect`, w którym jest `fetchFullRota` ([ok. 152–246](src/pages/WeeklyRotaPage.jsx)), **po** ustawieniu `dailyRotaData`.
- **Warunek:** wykonać fetch `attendance` **tylko jeśli** `isAdmin === true` (z `useNotifications()`).
- **Zapytanie:** `supabase.from('attendance').select('scheduled_rota_id, status').in('scheduled_rota_id', slotIds)` – gdzie `slotIds` to wszystkie `id` z `rotaData` (po deduplikacji tak jak teraz).
- **Stan:** ustawić `attendanceBySlotId` jako obiekt np. `{ [r.scheduled_rota_id]: { status: r.status } }`.

**Ryzyko:** Jeśli nie jest adminem, **nie** wywoływać tego zapytania (żeby nie polegać na RLS dla pustego wyniku i nie dodawać zbędnych requestów).

### 3.4 Przekazanie propsów do DayDetails

- **DayDetails** jest zdefiniowany **wewnątrz** WeeklyRotaPage (linie 277–441) i przyjmuje dziś tylko `dateStr` (PropTypes linie 444–446).
- **Zmiana:** Dodać do **DayDetails** opcjonalne propsy: `isAdmin`, `attendanceBySlotId`, `onSlotClick`. Dla zwykłego użytkownika przekazać `isAdmin={false}` i nie przekazywać `onSlotClick` (lub no-op).
- **DayCard** (linie 449–434) renderuje `<DayDetails dateStr={dateStr} />` w dwóch miejscach (mobile ok. 420, desktop ok. 424). Dodać do **DayCard** propsy: `isAdmin`, `attendanceBySlotId`, `onAttendanceSlotClick` i przekazać je do obu wywołań `<DayDetails ... />`.
- **Miejsce renderowania DayCard** (ok. 458–472): przy wywołaniu `<DayCard ... />` dodać `isAdmin={isAdmin}`, `attendanceBySlotId={attendanceBySlotId}`, `onAttendanceSlotClick={handleAttendanceSlotClick}`.

### 3.5 Kliknięcie w slot (tylko admin)

- W **DayDetails**, w pętli `timeSlots.map((slot) => { ... })` (ok. 401–430):
  - Dla `<li>`: jeśli `isAdmin` – dodać `onClick={(e) => { e.stopPropagation(); onSlotClick?.(slot); }}` oraz klasy `cursor-pointer` (i ewentualnie `hover:bg-gray-100` jeśli jeszcze nie ma). Zachować istniejące klasy (`isCurrentUser ? ... : 'hover:bg-gray-50'`).
  - Opcjonalnie: jeśli `attendanceBySlotId[slot.id]` istnieje, wyświetlić małą etykietę (np. badge) obok imienia: status "No show" / "Sick" / "Late" – bez zmiany layoutu bloku (np. jeden mały span).
- **handleAttendanceSlotClick(slot):** ustawić `setAttendanceModalSlot(slot)`. Modal odczyta `currentStatus` z `attendanceBySlotId[slot.id]?.status ?? null`.

### 3.6 Zapis z modala

- **onSave(status):**  
  - Jeśli `status === null` (Clear): `supabase.from('attendance').delete().eq('scheduled_rota_id', slot.id)` (gdzie `slot` to `attendanceModalSlot`).  
  - W przeciwnym razie: upsert – `supabase.from('attendance').upsert({ scheduled_rota_id: slot.id, status, recorded_by: user.id }, { onConflict: 'scheduled_rota_id' })`.  
  - Po sukcesie: zaktualizować lokalny stan `attendanceBySlotId` (dla tego `scheduled_rota_id` dodać/zmienić/usunąć wpis), zamknąć modal `setAttendanceModalSlot(null)`.
- Przy błędzie: nie zamykać modala; ewentualnie toast/komunikat (jeśli w projekcie jest).

### 3.7 Render modala

- Na końcu drzewa w WeeklyRotaPage (np. przed zamykającym `</div>` głównego return):  
`{attendanceModalSlot && <AttendanceStatusModal open={!!attendanceModalSlot} onClose={() => setAttendanceModalSlot(null)} slot={attendanceModalSlot} currentStatus={attendanceBySlotId[attendanceModalSlot.id]?.status ?? null} onSave={handleAttendanceSave} />}`.
- **handleAttendanceSave** realizuje logikę zapisu z p. 3.6 i aktualizację stanu.

### 3.8 Import i isAdmin

- Na górze pliku: `import { useNotifications } from '../lib/NotificationContext';` i w komponencie: `const { isAdmin } = useNotifications();`.
- Dla **DayDetails** w zależnościach useMemo nie ma potrzeby dodawać `isAdmin` do dependency array tam, gdzie używane są tylko `dateStr` i `dailyRotaData` – ale jeśli DayDetails będzie używał `isAdmin` lub `attendanceBySlotId` wewnątrz useMemo, te wartości muszą być na liście zależności (albo przekazać je jako props i użyć w renderze bez memo na tych wartościach).

---

## 4. Admin – sekcja Attendance

### 4.1 AdminPage.jsx – dokładne miejsca

- **validSections** (linie 28–31): dodać `'attendance'` do tablicy (np. po `'breaks'`).
- **titles** (linie 43–56): dodać `'attendance': 'Attendance'`.
- **menuItems** (linie 266–280): dodać jeden obiekt, np.  
`{ id: 'attendance', label: 'Attendance', icon: '📋', description: 'Attendance reports (no show, sick, late)' }`  
w wybranym miejscu (np. po "Breaks").
- **renderContent** (switch, linie 321–354): dodać `case 'attendance': return <AttendancePage />;` oraz na górze pliku `import AttendancePage from './AttendancePage';` (lub z `./components/Admin/AttendancePage.jsx` – zależnie od decyzji).

**Ryzyko:** Literówka w `'attendance'` (np. `'atendance'`) spowoduje biały ekran lub fallback do dashboard – upewnić się, że id jest identyczne w validSections, menuItems i case.

### 4.2 Nowy komponent AttendancePage

- **Ścieżka:** `src/pages/AttendancePage.jsx` (spójnie z innymi stronami admina).
- **Zawartość:**  
  - Pobranie: `supabase.from('attendance').select('scheduled_rota_id, status, recorded_at, scheduled_rota(user_id, date, profiles(first_name, last_name))')` (lub dwa osobne zapytania i join w pamięci – zależnie od RLS i struktury).  
  - Grupowanie po `user_id` (z scheduled_rota); dla każdego użytkownika: imię i nazwisko, lista dat + status, oraz liczniki: No show: X, Sick: Y, Late: Z.  
  - UI: tabela lub karty; sortowanie po nazwisku lub po łącznej liczbie incydentów. Opcjonalnie filtry: zakres dat, wybór statusu.
- **Brak danych:** komunikat "No attendance records" zamiast pustej tabeli.
- Nie modyfikować innych sekcji Admin – tylko nowy case i nowy plik.

---

## 5. Kolejność wdrożenia (żeby nic nie zepsuć)

1. **Migracja** – utworzenie tabeli i RLS. Zweryfikować w Supabase, że tabela się tworzy i polityki działają (np. zalogowany admin może INSERT, zwykły użytkownik nie).
2. **AttendanceStatusModal** – komponent w izolacji; można go przetestować z mockowymi propsami (np. w osobnej stronie lub tymczasowo na My Rota z przyciskiem "Test modal").
3. **WeeklyRotaPage** – dodać stan, fetch attendance (tylko gdy isAdmin), przekazanie propsów DayCard → DayDetails, onClick na `<li>` tylko gdy isAdmin, render modala i handleAttendanceSave. Po każdej zmianie sprawdzić: użytkownik nie-admin widzi ten sam widok co wcześniej (bez klikalności); admin widzi klikalne wiersze i modal.
4. **AdminPage** – dodać 'attendance' do validSections, titles, menuItems, case i import AttendancePage.
5. **AttendancePage** – zaimplementować zapytanie i widok raportu.

---

## 6. Podsumowanie – co może coś zepsuć i jak tego unikać


| Ryzyko                                    | Środki                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Regresja na My Rota dla nie-admina        | Nie dodawać onClick gdy `!isAdmin`; nie wywoływać fetch attendance gdy `!isAdmin`.                                                       |
| Błąd w Admin – biały ekran                | Identyczne `'attendance'` w validSections, menuItems, case; poprawny import AttendancePage.                                              |
| Rozjechany layout na My Rota              | Nie zmieniać struktury DOM w DayCard/DayDetails – tylko dodanie onClick i opcjonalnie jednego badge; klasy tylko uzupełnić.              |
| RLS blokuje admina                        | Użyć istniejącej funkcji `is_admin()`; polityki INSERT/UPDATE/DELETE tylko z `is_admin()`.                                               |
| Duplikaty slotów po stronie klienta       | Używać tych samych `slotIds` co do budowy `dailyRotaData` (po deduplikacji), żeby fetch attendance był spójny.                           |
| Modal nie zamyka się / nie odświeża stanu | Po udanym zapisie/delete zawsze aktualizować `attendanceBySlotId` i `setAttendanceModalSlot(null)`; obsłużyć błędy bez zamykania modala. |


---

## 7. Checklist przed wdrożeniem

- Migracja: tabela `attendance`, UNIQUE(scheduled_rota_id), FK ON DELETE CASCADE, RLS z is_admin().
- AttendanceStatusModal: props open, onClose, slot, currentStatus, onSave(null) dla Clear; styl jak inne modale na My Rota.
- WeeklyRotaPage: useNotifications().isAdmin; fetch attendance tylko gdy isAdmin; attendanceBySlotId; przekazanie isAdmin, attendanceBySlotId, onAttendanceSlotClick przez DayCard do DayDetails.
- DayDetails: onClick na -  tylko gdy isAdmin; optional chaining onSlotClick?.(slot); ewentualny badge przy attendanceBySlotId[slot.id].
- Zapis: delete dla Clear; upsert dla no_show/sick/late; aktualizacja attendanceBySlotId i zamknięcie modala po sukcesie.
- AdminPage: validSections, titles, menuItems, case 'attendance', import AttendancePage.
- AttendancePage: select z joinami, grupowanie po user_id, liczniki, tabela/karty, teksty po angielsku.

