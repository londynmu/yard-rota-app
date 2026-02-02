# Jak Naprawić Automatyczny Import Performance

## Problem

Chris Jenkins (CJ200) powinien mieć **76 ruchów** (38 + 38 z dwóch zmian) dla dnia 30-Jan-2026, ale system pokazuje tylko **38 ruchów**.

**Diagnoza**: Ręczny import przez Admin Panel działa poprawnie (daje 76), ale automatyczny cron daje tylko 38. To oznacza że cron używa błędnej logiki lub starej wersji kodu.

## Gdzie szukać istniejącego crona?

### 1. Supabase Dashboard → Edge Functions

1. Otwórz [Supabase Dashboard](https://app.supabase.com)
2. Wybierz swój projekt
3. Idź do **Edge Functions** (lewa sidebar)
4. Sprawdź czy jest funkcja o nazwie:
   - `import-performance`
   - `import-csv`
   - `daily-import`
   - Lub podobna

**Co szukać**: Sprawdź kod funkcji - czy wywołuje `aggregateShiftData` przed importem?

### 2. Database → pg_cron jobs

1. W Supabase Dashboard → **SQL Editor**
2. Wykonaj zapytanie:

```sql
-- Sprawdź wszystkie aktywne cron jobs
SELECT * FROM cron.job;

-- Sprawdź szczegóły konkretnego job
SELECT 
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job;
```

**Co szukać**: Job który uruchamia się o 06:30 i wywołuje coś związanego z performance/import.

### 3. Database → Webhooks / Triggers

1. Supabase Dashboard → **Database** → **Webhooks**
2. Sprawdź czy jest webhook który:
   - Uruchamia się codziennie o 06:30
   - Lub reaguje na nowe emaile/załączniki

### 4. Zewnętrzny scheduler

Sprawdź czy używasz:
- **GitHub Actions** (`.github/workflows/`)
- **Zapier** (sprawdź Zapier dashboard)
- **n8n** (sprawdź n8n workflows)
- **Cron job na serwerze** (jeśli masz VPS)

## Co zrobić gdy znajdziesz cron?

### Opcja A: Napraw istniejący kod

Jeśli znajdziesz edge function lub skrypt, upewnij się że:

1. ✅ Parsuje **cały plik CSV** (wszystkie sekcje, nie tylko pierwszą/ostatnią)
2. ✅ Wywołuje `dedupeIdenticalEntries()` - usuwa prawdziwe duplikaty z YMS
3. ✅ **Wywołuje `aggregateShiftData()`** - sumuje ruchy z wielu zmian
4. ✅ Dopiero potem wywołuje `importPerformanceData()` z zagregowanymi danymi

**Kluczowa kolejność**:
```
CSV → parseShunterCSV() → dedupeIdenticalEntries() → aggregateShiftData() → matchUsersWithCSV() → importPerformanceData()
```

### Opcja B: Zastąp nową edge function

Stworzyliśmy nową, poprawną edge function w `supabase/functions/import-performance-csv/`.

**Deploy**:

```bash
cd supabase/functions
supabase functions deploy import-performance-csv
```

**Skonfiguruj nowy cron** (w SQL Editor):

```sql
-- Wyłącz stary cron (jeśli znalazłeś)
SELECT cron.unschedule('stara-nazwa-job');

-- Utwórz nowy cron
SELECT cron.schedule(
  'import-performance-daily',
  '30 6 * * *', -- Każdego dnia o 06:30
  $$
  SELECT net.http_post(
    url := 'https://twoj-projekt.supabase.co/functions/v1/import-performance-csv',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'csvContent', (SELECT csv_content FROM email_attachments WHERE date = CURRENT_DATE - 1 LIMIT 1),
      'reportDate', (CURRENT_DATE - 1)::text
    )
  );
  $$
);
```

**Uwaga**: To wymaga integracji z Gmail API lub innym źródłem CSV. Jeśli nie masz tego, zobacz "Opcja C" poniżej.

### Opcja C: Tymczasowe rozwiązanie (ręczny import)

Dopóki nie naprawisz crona:

1. **Wyłącz** stary automatyczny cron (żeby nie psuł danych)
2. **Używaj ręcznego importu** przez Admin Panel → Performance
   - Ten działa poprawnie (daje 76 ruchów dla Chris)
3. Codziennie o 6:30+ admin musi:
   - Pobrać CSV z emaila
   - Wejść do Admin Panel → Performance
   - Przeciągnąć CSV
   - Kliknąć Import

To zajmuje 10 sekund dziennie, ale daje poprawne dane.

## Jak przetestować czy naprawa działa?

### Test 1: Import pliku testowego

```bash
# W konsoli przeglądarki (Admin Panel → Performance)
# Po imporcie Shunters (1).csv sprawdź logi:

// Powinno pokazać:
// ✅ CJ200: Aggregated 2 shifts → 76 total moves
```

### Test 2: Sprawdź bazę danych

W SQL Editor:

```sql
-- Sprawdź Chris Jenkins
SELECT 
  p.yard_system_id,
  p.first_name,
  p.last_name,
  sp.report_date,
  sp.number_of_moves,
  sp.avg_time_to_collect,
  sp.avg_time_to_travel
FROM shunter_performance sp
JOIN profiles p ON p.id = sp.user_id
WHERE p.yard_system_id = 'CJ200'
  AND sp.report_date = '2026-01-30'
ORDER BY sp.report_date DESC;
```

**Oczekiwany wynik**:
- `number_of_moves` = **76** (nie 38!)
- `avg_time_to_collect` ≈ 2:25
- `avg_time_to_travel` ≈ 2:39

### Test 3: Sprawdź logi edge function

Po automatycznym imporcie, sprawdź logi w:
Supabase Dashboard → Edge Functions → import-performance-csv → Logs

**Szukaj**:
```
✅ CJ200: Aggregated 2 shifts → 76 total moves
```

Jeśli widzisz tylko:
```
📝 CJ200: 38 moves
```
...to agregacja **nie działa** - kod jest niepoprawny.

## Pomoc debugowania

### Dodatkowe logowanie

Dodaliśmy szczegółowe logowanie do:
- `src/utils/csvImportHelper.js` (funkcje parsera)
- `src/components/Admin/PerformanceImport.jsx` (komponent UI)
- `supabase/functions/import-performance-csv/index.ts` (edge function)

Otwórz **Console** w przeglądarce podczas ręcznego importu - zobaczysz:
```
🔄 [aggregateShiftData] Processing 2 shift entries
  📝 New shunter: CJ200
  ➕ CJ200 shift 1: 38 moves → total: 0 + 38 = 38
  ➕ CJ200 shift 2: 38 moves → total: 38 + 38 = 76
  ✅ CJ200: Aggregated 2 shifts → 76 total moves
```

### Testy jednostkowe

Uruchom testy:

```bash
npm run test:run
```

Wszystkie testy powinny przejść, w tym kluczowy:
```
✓ Chris Jenkins case - 2 shifts with different times → 76 total moves
```

## Checklist naprawy

- [ ] Znalazłem istniejący cron/edge function/webhook
- [ ] Sprawdziłem kod - czy wywołuje `aggregateShiftData()`?
- [ ] Jeśli nie: zastąpiłem nową edge function z `supabase/functions/import-performance-csv/`
- [ ] Zdeployowałem nową edge function: `supabase functions deploy import-performance-csv`
- [ ] Skonfigurowałem nowy cron lub wyłączyłem stary
- [ ] Przetestowałem import pliku `Shunters (1).csv`
- [ ] Zweryfikowałem w bazie: Chris ma 76 ruchów ✅
- [ ] Monitoruję logi przez tydzień

## Potrzebujesz pomocy?

1. Sprawdź pliki:
   - Plan naprawy: `.cursor/plans/fix_performance_import_aggregation_*.plan.md`
   - Testy: `src/utils/csvImportHelper.test.js`
   - Edge function: `supabase/functions/import-performance-csv/`
   - README: `supabase/functions/import-performance-csv/README.md`

2. Uruchom testy jednostkowe: `npm run test:run`

3. Zobacz logi w Console podczas ręcznego importu

4. Sprawdź Supabase Edge Function logs

---

**Podsumowanie**: Stary cron prawdopodobnie nie wywołuje `aggregateShiftData()`, więc każda zmiana nadpisuje poprzednią zamiast je sumować. Nowa edge function to naprawia.
