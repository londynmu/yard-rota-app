# Plan: Proponowanie shunterów na breaks według średniej z ostatnich 30 dni

## Cel

Sortować listę osób w modalu wyboru do przerwy tak, by na górze byli ci, którzy najczęściej mieli przerwy o zbliżonej godzinie (średnia z ostatnich 30 dni). Tylko logika, bez ikon ani etykiet.

## Okres

- **30 dni wstecz** – od `today - 30` do dziś włącznie.
- Dane z tabeli `scheduled_breaks`: `user_id`, `break_start_time`.

## Normalizacja nocy (00:00–05:59)

Godziny 00:00–05:59 traktujemy jako kontynuację wieczoru (np. 23:00 i 00:00 → średnia ok. 23:30). W przeciwnym razie 23:00 i 00:00 dawałyby ok. 11:30.

- Każda godzina 00:00–05:59: +1440 min (24h).
- Po średniej: jeśli wynik ≥1440, `result % 1440`.

## Gdzie zmiany

- [src/components/Admin/Brakes/BrakesManager.jsx](src/components/Admin/Brakes/BrakesManager.jsx)

## Kroki

### 1. Stan

Dodać stan:

```javascript
const [preferredBreakMinutesByUserId, setPreferredBreakMinutesByUserId] = useState({});
```

`{ [user_id]: minutes }` – średnia godzina przerwy w minutach od północy (0–1439).

### 2. Pobieranie historii (useEffect)

- **Zależności:** `[]` (raz przy montażu).
- **Zapytanie:**  
  `supabase.from('scheduled_breaks').select('user_id, break_start_time')`  
  `.gte('date', fromDate)` (gdzie `fromDate = today - 30 dni`)  
  `.not('user_id', 'is', null)`
- **Obliczenia w JS:**
  - Dla każdego rekordu: `break_start_time` → minuty od północy (HH*60 + MM).
  - Jeśli minuty &lt; 360 (00:00–05:59): minuty += 1440.
  - Grupowanie per `user_id` → średnia → zaokrąglenie.
  - Jeśli średnia ≥ 1440: `avg % 1440`.
- **Stan:** `setPreferredBreakMinutesByUserId(avgByUser)`.

### 3. Przekazanie do modala

Do `StaffSelectionModal` dodać prop:

```javascript
preferredBreakMinutesByUserId={preferredBreakMinutesByUserId}
```

### 4. Sortowanie w StaffSelectionModal

- **Input:** `eligibleStaff` (już przefiltrowana lista), `slot.start_time`, `preferredBreakMinutesByUserId`.
- **Slot:** `slot.start_time` (np. "22:00") → minuty od północy. Dla 00:00–05:59: +1440.
- **Sort:**  
  `[...eligibleStaff].sort((a, b) => Math.abs((pref[a.id] ?? 9999) - slotMin) - Math.abs((pref[b.id] ?? 9999) - slotMin))`
- **Render:** używać posortowanej listy zamiast `eligibleStaff` – bez zmian wizualnych, tylko kolejność.

### 5. Import

Dodać `subDays` z `date-fns` do budowy `fromDate` (jeśli jeszcze nie ma).

## Brak zmian

- Brak SQL (indeksy, funkcje) – całość w JS.
- Brak ikon, etykiet, tooltipów.
- Brak zmian w API ani w innych komponentach.
