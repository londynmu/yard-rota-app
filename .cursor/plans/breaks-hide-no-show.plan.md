---
name: breaks-hide-no-show
overview: "Spójne traktowanie nieobecności (No show/Sick/Late): prawdziwe liczby na My Rota i wszędzie na przerwach, bez usuwania z DB."
todos: []
isProject: false
---

# Plan: Nieobecności (No show / Sick / Late) – spójne liczby i wyświetlanie (doprecyzowany)

## 1. Cel

1. **Przerwy**: Osoby oznaczone jako No show / Sick / Late w danym dniu **nie wyświetlają się** na listach przerw (planowanie z góry zostaje w DB; filtrowanie przy wyświetlaniu).
2. **My Rota**: Badge (Day / Afternoon / Night) pokazuje **liczbę obecnych** (bez wpisu w attendance). Liczby zgadzają się z listami przerw i Calendar.
3. **Widoczność**: Na My Rota lista osób w dniu nadal pokazuje **wszystkich zaplanowanych**, z badge No show/Sick/Late przy nieobecnych; do **liczb** (badge, nagłówek zmiany) wliczani są tylko obecni.

---

## 2. Definicje


| Termin                   | Znaczenie                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Zaplanowany**          | Jest wpis w `scheduled_rota` (i ewent. w `scheduled_breaks`).                                                                 |
| **Obecny**               | Zaplanowany **oraz** brak wpisu w `attendance` dla tego slotu roty (`scheduled_rota_id`).                                     |
| **Nieobecny (na dzień)** | Ma wpis w `attendance` dla dowolnego swojego `scheduled_rota` w tym dniu (dla przerw: w efektywnej dacie / dniach jak niżej). |


Zasada: wszędzie, gdzie pokazywana jest **liczba osób** (badge, podsumowanie), liczymy **obecnych**. Listy przerw pokazują tylko **obecnych**. Lista zaplanowanych na zmianę (My Rota) pokazuje wszystkich zaplanowanych, z oznaczeniem nieobecności.

---

## 3. Opcja: usuwanie osoby z roty w DB?

- **Wariant A (rekomendowany)**: **Nie** usuwać z `scheduled_rota` ani `scheduled_breaks`. Źródło prawdy = `attendance`. Liczby i listy = filtrowanie/liczenie po „obecny”. Clear = tylko usunięcie z attendance.
- **Wariant B**: Przy No show usuwać wiersz z `scheduled_rota` (i opcjonalnie z `scheduled_breaks`). Przy Clear – przywracanie slotu (wymaga przechowania oryginału). W planie **nie** wdrażamy wariantu B.

---

## 4. Miejsca do zmiany (konkretne pliki i fragmenty)

### 4.1 Wspólny helper (nowy plik)

- **Plik**: `src/utils/attendanceHelpers.js`
- **Funkcja**: `getAbsentUserIdsForDates(supabase, dateStrings)`
  - **Argument**: `dateStrings` – tablica dat w formacie `'YYYY-MM-DD'` (np. `['2025-03-03', '2025-03-02']` dla today + yesterday).
  - **Logika**:  
    1. Zapytanie: `scheduled_rota.select('id, user_id').in('date', dateStrings)`.
    2. Zbierz `scheduled_rota_id` z wyniku.
    3. Zapytanie: `attendance.select('scheduled_rota_id').in('scheduled_rota_id', rotaIds)`.
    4. Z mapy rota → user_id zbuduj zbiór `user_id`, którzy mają wpis w attendance.
  - **Zwracane**: `Promise<Set<string>>` (Set UUID-ów użytkowników nieobecnych w którymkolwiek z podanych dni).
- **Użycie**: BrakesManager, ShiftDashboard, MyBreakInfo, TodaysShiftInfo (NoShiftWithBreaksView).  
My Rota **nie** używa helpera – ma `attendanceBySlotId` po slotach.

---

### 4.2 My Rota (WeeklyRotaPage)

**Plik**: `src/pages/WeeklyRotaPage.jsx`

- **Badge w nagłówku dnia (Day / Afternoon / Night)**  
  - **Gdzie**: Komponent `DayCard`, wewnątrz IIFE przy `dayData.length > 0` (obecnie ok. linie 607–616).  
  - **Obecnie**: `filteredDayData = dayData.filter(slot => slot.profiles)`, potem `shiftCounts` z `filteredDayData`.  
  - **Zmiana**:  
    - `presentSlots = dayData.filter(slot => slot.profiles && !attendanceBySlotId[slot.id])`.  
    - `shiftCounts.day / afternoon / night` liczyć z `presentSlots`.
  - **Uwaga**: `attendanceBySlotId` jest już przekazywane do `DayCard` (ok. 850).
- **Liczba przy nagłówku zmiany w DayDetails (np. „DAY SHIFT 3”)**  
  - **Gdzie**: `DayDetails`, nagłówek sekcji zmiany (obecnie `{slots.length}` w span, ok. linia 444).  
  - **Zmiana**: zamiast `slots.length` wyświetlać `slots.filter(s => !attendanceBySlotId[s.id]).length`.  
  - **Lista slotów**: bez zmian – nadal wszystkie sloty z `slots`, z badge No show/Sick/Late z `attendanceBySlotId[slot.id]`.

---

### 4.3 BrakesManager (Admin → Breaks)

**Plik**: `src/components/Admin/Brakes/BrakesManager.jsx`

- **Stan**: Dodać np. `absentUserIdsForDate` (`Set` lub `Set<string>`) – ustawiany w tym samym miejscu, gdzie obecnie budowany jest `absentUserIds` w `fetchBreakData` (ok. 552–568). Po wyliczeniu `absentUserIds` wykonać `setAbsentUserIdsForDate(absentUserIds)` (lub zapisać do tego samego state’u, jeśli zmienimy nazwę).
- **Funkcja `getAssignedStaffForSlot(slotId)`** (ok. 1092–1102):  
  - Obecnie: `scheduledBreaks.filter` po `slot_id` i (przy wybranej lokacji) po `staff?.location === selectedLocation`.  
  - **Zmiana**: dodatkowo wykluczyć przypisania, gdzie `absentUserIdsForDate.has(assignment.user_id)`.  
  - Kolejność: najpierw filtrowanie po slot/location, potem po absent.
- **Uwaga**: Nie zmieniać logiki „Available Staff” – nieobecni są tam już wykluczani (ok. 552–568, 410–416).

---

### 4.4 ShiftDashboard (główna strona – Today’s Breaks)

**Plik**: `src/components/User/ShiftDashboard.jsx`

- **Gdzie**: `fetchTeamSchedule` (efekt ładujący zmiany i przerwy). Po pobraniu `shiftsData` (today + yesterday) i przed zbudowaniem `allBreaks`:
  1. Zebrać `scheduled_rota_id` z `shiftsData` (już mamy `shiftsData` z polami potrzebnymi do mapowania).
  2. Wywołać `getAbsentUserIdsForDates(supabase, [effectiveForBreaks, yesterday])` (lub tylko `[effectiveForBreaks]` jeśli noc jest już uwzględniona w jednej dacie – zachować obecną logikę dat jak przy shiftach).
  3. Po zbudowaniu `breaksWithProfiles` (lub przed `setAllBreaks`) odfiltrować: `breaksWithProfiles.filter(b => !absentUserIds.has(b.user_id))`.
  4. Reszta (deduplikacja, sortowanie) bez zmian.
- **Efekt**: Calendar dostaje liczby z `onShiftCountsChange` – będą to liczby **obecnych** na przerwach, bo `allBreaks` jest już przefiltrowane.

---

### 4.5 MyBreakInfo

**Plik**: `src/components/User/MyBreakInfo.jsx`

- **Gdzie**: W `fetchBreakInfo`, po ustaleniu `today` (efektywna data) i po pobraniu `allBreaks`.
- **Kolejność**:  
  1. Wywołać `getAbsentUserIdsForDates(supabase, [today])` (oraz ewent. wczoraj, jeśli komponent uwzględnia noc przed 06:00 – sprawdzić zgodnie z obecną logiką dat).
  2. Przed budową `myBreaks` / `teamBreaks` / `breaksByShift`: `allBreaks.filter(b => !absentUserIds.has(b.user_id))`.
  3. Z przefiltrowanej listy budować `myBreaks`, `teamBreaks`, `breaksByShift` jak dotąd.

---

### 4.6 TodaysShiftInfo – NoShiftWithBreaksView

**Plik**: `src/components/User/TodaysShiftInfo.jsx`

- **Gdzie**: W `fetchBreakInfo` wewnątrz `NoShiftWithBreaksView`, po pobraniu `allBreaks` dla `today`.
- **Zmiana**:  
  1. Wywołać `getAbsentUserIdsForDates(supabase, [today])`.
  2. Przed grupowaniem: `allBreaks.filter(b => !absentUserIds.has(b.user_id))`.
  3. Z przefiltrowanej listy budować `breaksByShift` i `setBreakInfo({ breaksByShift })`.

---

## 5. Miejsca bez zmian (celowo)


| Miejsce                                                                       | Powód                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Export Rota** (`src/components/Admin/ExportRota.jsx`)                       | Eksport = **plan** (kto był zaplanowany). Nie łączy z attendance. Zostawiamy wszystkich z `scheduled_rota`. Opcjonalnie w przyszłości: kolumna „Attendance” (No show/Sick/Late) z joinu z `attendance`. |
| **AssignModal – weekly counts** (`src/components/Admin/Rota/AssignModal.jsx`) | Liczba zmian w tygodniu per pracownik = kontekst **planowania** (ile razy jest przypisany). Zostaje liczba z `scheduled_rota` bez odejmowania attendance.                                               |
| **RotaManager** (`src/components/Admin/Rota/RotaManager.jsx`)                 | Planowanie roty; nie wyświetla liczb „obecnych”. Bez zmian.                                                                                                                                             |
| **ProfilePage – attendanceRecords**                                           | Historia własnych wpisów attendance. Bez zmian.                                                                                                                                                         |
| **AttendancePage (Black list)**                                               | Raport z listą osób z attendance/violations. Bez zmian.                                                                                                                                                 |
| **PreCheckReminder** (`src/components/PreCheck/PreCheckReminder.jsx`)         | Sprawdza, czy użytkownik ma zmianę (scheduled_rota). Nie sprawdza attendance. Opcjonalnie w przyszłości: nie pokazywać reminderu, jeśli użytkownik ma wpis no-show dla tej zmiany (niski priorytet).    |
| **PreCheckPage**                                                              | Okno zmiany na podstawie `scheduled_rota` użytkownika. Bez zmiany logiki liczb.                                                                                                                         |
| **userHasShift** w WeeklyRotaPage                                             | `dayData.some(slot => slot.user_id === user?.id)` – „czy użytkownik ma slot tego dnia”. Nie zmieniamy (nawet przy no-show dzień dalej „ma shift” dla podświetlenia).                                    |


---

## 6. Spójność liczb – tabela


| Miejsce                                     | Co pokazuje                                       | Implementacja                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| My Rota – badge dnia (Day/Afternoon/Night)  | Liczba **obecnych** na tę zmianę                  | `DayCard`: `presentSlots = dayData.filter(profiles && !attendanceBySlotId[slot.id])`, `shiftCounts` z `presentSlots`.            |
| My Rota – nagłówek zmiany (np. DAY SHIFT 3) | Liczba **obecnych**                               | `DayDetails`: `slots.filter(s => !attendanceBySlotId[s.id]).length`.                                                             |
| Calendar – badge Day/Afternoon/Night        | Liczba **obecnych** na przerwach                  | ShiftDashboard: `allBreaks` przefiltrowane po `absentUserIds` → `onShiftCountsChange`.                                           |
| Wszystkie listy przerw                      | Tylko **obecni**                                  | BrakesManager / ShiftDashboard / MyBreakInfo / TodaysShiftInfo: filtrowanie po `absentUserIds` (helper lub lokalny odpowiednik). |
| Lista roty w dniu (My Rota – DayDetails)    | Wszyscy **zaplanowani** + badge No show/Sick/Late | Bez zmiany; pełna lista + `attendanceBySlotId`.                                                                                  |


---

## 7. Edge case’y i doprecyzowania

- **Clear**: Usunięcie wpisu z `attendance` → użytkownik przestaje być w `absentUserIds` / nie jest liczony jako nieobecny w `attendanceBySlotId` → od razu wraca do liczb i na listy przerw.
- **Dzień operacyjny 06:00–05:59**: Przy przerwach i shiftach daty (today, yesterday) pozostają jak w obecnej logice (np. przed 06:00 efektywna data wczoraj; noc z dwóch dni). Helper dostaje te same daty, co zapytania do shiftów/przerw.
- **Wiele slotów jednego dnia**: Na **przerwach** – jeśli użytkownik ma jakikolwiek wpis w attendance w tym dniu (dla wybranej zmiany w BrakesManager), traktujemy go jako nieobecnego na cały dzień i nie pokazujemy na przerwach. Na **My Rota** liczymy per slot: slot z wpisem w `attendanceBySlotId[slot.id]` nie wchodzi do liczby „obecnych”.
- **Wszystkie sloty danej zmiany w dniu to no-show**: Badge pokaże 0; lista nadal pokaże tych ludzi z badge No show – zgodne z celem.
- **BrakesManager – lokacja**: Filtrowanie po `absentUserIds` jest **dodatkiem** do istniejącego filtrowania po lokacji w `getAssignedStaffForSlot` (staff z wybranej lokacji). Obie filtry stosowane łącznie.
- **SessionStorage w BrakesManager**: Przy ładowaniu z session i tak wykonywany jest blok „Fetch available staff”, gdzie budowany jest `absentUserIds`. Ten sam zbiór zapisać w state i użyć w `getAssignedStaffForSlot`.

---

## 8. Kolejność wdrożenia

1. **Helper** – dodać `src/utils/attendanceHelpers.js` z `getAbsentUserIdsForDates`.
2. **My Rota** – w `WeeklyRotaPage.jsx`: w `DayCard` liczenie badge’y z `presentSlots`; w `DayDetails` liczba przy nagłówku zmiany = present count.
3. **BrakesManager** – state `absentUserIdsForDate`, ustawianie w `fetchBreakData`, filtrowanie w `getAssignedStaffForSlot`.
4. **ShiftDashboard** – wywołanie helpera w `fetchTeamSchedule`, filtrowanie `allBreaks` przed `setAllBreaks`.
5. **MyBreakInfo** – wywołanie helpera, filtrowanie przerw przed budową `myBreaks` / `teamBreaks` / `breaksByShift`.
6. **TodaysShiftInfo** – w NoShiftWithBreaksView: wywołanie helpera, filtrowanie przerw przed `breaksByShift`.

---

## 9. Podsumowanie

- **Nie** usuwać wpisów z `scheduled_rota` ani `scheduled_breaks` przy No show (wariant A).
- **Jedna definicja**: obecny = zaplanowany i brak wpisu w attendance (dla tego slotu / tego użytkownika w tym dniu).
- **My Rota**: badge i liczba przy zmiance = tylko obecni; lista osób = wszyscy zaplanowani z badge No show/Sick/Late.
- **Przerwy**: wszędzie filtrowanie po nieobecnych (helper + `absentUserIds`); liczby na Calendar = tylko obecni na przerwach.
- **Eksport / planowanie / Black list / PreCheck** – bez zmian lub z jasno opisanymi opcjami na przyszłość.

