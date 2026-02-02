# Import Performance CSV - Edge Function

Automatyczny import raportów performance z agregacją wielu zmian.

## Funkcjonalność

Ta edge function:
- ✅ Parsuje CSV z wieloma sekcjami shift (Day/Afternoon/Night)
- ✅ Deduplikuje identyczne wpisy (YMS export bug)
- ✅ **Agreguje zmiany** - sumuje ruchy z wielu zmian tego samego dnia
- ✅ Liczy weighted average dla czasów collect/travel
- ✅ Mapuje Yard System ID → user_id z profiles
- ✅ Importuje do bazy z upsert (nadpisuje jeśli ta sama data)
- ✅ Loguje szczegółowo każdy krok

**Używa tej samej logiki co ręczny import w Admin Panel.**

## Wdrożenie

### 1. Deploy Edge Function

```bash
# Z głównego folderu projektu
cd supabase/functions
supabase functions deploy import-performance-csv
```

### 2. Ustaw zmienne środowiskowe

W Supabase Dashboard → Settings → Edge Functions → Environment Variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Skonfiguruj cron job w Supabase

#### Opcja A: pg_cron (w bazie danych)

Wykonaj w SQL Editor:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cron job to invoke edge function daily at 06:30
SELECT cron.schedule(
  'import-performance-daily',
  '30 6 * * *', -- Every day at 06:30
  $$
  SELECT
    net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/import-performance-csv',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'csvContent', (SELECT content FROM email_attachments WHERE date = CURRENT_DATE - 1 LIMIT 1),
        'reportDate', (CURRENT_DATE - 1)::text
      )
    );
  $$
);

-- Check cron jobs
SELECT * FROM cron.job;

-- Unschedule if needed
SELECT cron.unschedule('import-performance-daily');
```

**Problem**: Wymaga integracji z Gmail API lub innym źródłem emaili.

#### Opcja B: Zewnętrzny scheduler (zalecane tymczasowo)

Użyj zewnętrznego serwisu (GitHub Actions, Zapier, n8n) który:
1. Pobiera email z załącznikiem CSV o 06:30
2. Wysyła POST request do edge function

Przykład curl:

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/import-performance-csv' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -d '{
    "csvContent": "Report,Shunt Utilisation...",
    "reportDate": "2026-01-30"
  }'
```

## Testowanie

### Test ręczny z pliku CSV

Stwórz `test-import.js`:

```javascript
import { readFileSync } from 'fs';

const csvContent = readFileSync('./raportyyms/Shunters (1).csv', 'utf-8');

const response = await fetch('http://localhost:54321/functions/v1/import-performance-csv', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_LOCAL_ANON_KEY'
  },
  body: JSON.stringify({
    csvContent: csvContent,
    reportDate: '2026-01-30'
  })
});

const result = await response.json();
console.log('Import result:', result);
```

Uruchom:

```bash
# Najpierw uruchom local Supabase
supabase start

# Deploy function lokalnie
supabase functions serve import-performance-csv

# W drugim terminalu uruchom test
node test-import.js
```

### Weryfikacja w bazie

```sql
-- Sprawdź czy Chris Jenkins ma 76 ruchów
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

-- Powinno pokazać: CJ200, Chris Jenkins, 76 moves
```

## Logowanie

Edge function loguje szczegółowo każdy krok:

```
🚀 [import-performance-csv] Edge function invoked
📅 Processing report for date: 2026-01-30
📄 [parseShunterCSV] Parsed 2 shift entries from CSV
🔍 [dedupeIdenticalEntries] Removed 0 duplicate entries
🔄 [aggregateShiftData] Processing 2 shift entries
  📝 New shunter: CJ200
  ➕ CJ200 shift 1: 38 moves (collect: 2:31, travel: 2:43) → total: 0 + 38 = 38
  ➕ CJ200 shift 2: 38 moves (collect: 2:19, travel: 2:35) → total: 38 + 38 = 76
  ✅ CJ200: Aggregated 2 shifts → 76 total moves
✅ [aggregateShiftData] Completed: 2 entries → 1 unique shunters
🔍 [matchUsersWithCSV] Fetching user profiles...
✅ [matchUsersWithCSV] Found 25 profiles with Yard System ID
✅ [matchUsersWithCSV] Matched: 1, Unmatched: 0
📊 [importPerformanceData] Importing 1 performance records for 2026-01-30
  📝 CJ200 (Chris Jenkins): 76 moves (2 shifts aggregated)
💾 [importPerformanceData] Upserting 1 records to database...
✅ [importPerformanceData] Successfully imported 1 records
✅ [import-performance-csv] Import completed successfully
```

Logi dostępne w: Supabase Dashboard → Edge Functions → import-performance-csv → Logs

## Troubleshooting

### Problem: "Missing Yard System ID in profile"

Oznacza że shunter z CSV nie ma ustawionego yard_system_id w tabeli profiles.

**Rozwiązanie**: Admin Panel → Users → Edit → dodaj Yard System ID

### Problem: Import pokazuje tylko 38 ruchów zamiast 76

To był oryginalny bug - sprawdź czy:
1. Edge function używa najnowszej wersji kodu
2. Funkcja `aggregateShiftData` jest wywoływana
3. Logi pokazują "Aggregated 2 shifts → 76 total moves"

### Problem: "Failed to fetch user profiles"

Edge function nie ma dostępu do bazy.

**Rozwiązanie**: Sprawdź czy SUPABASE_SERVICE_ROLE_KEY jest ustawiony poprawnie.

## Porównanie: Stary cron vs Nowa Edge Function

| Feature | Stary cron (źle) | Nowa edge function (dobrze) |
|---------|------------------|----------------------------|
| Parsowanie CSV | Tylko 1 sekcja? | ✅ Wszystkie sekcje |
| Deduplikacja | ? | ✅ Tak (YMS bug) |
| **Agregacja zmian** | ❌ Nie lub źle | ✅ Tak (weighted avg) |
| Import | Overwrite per shift | ✅ Upsert per user+date |
| Logowanie | Minimalne | ✅ Szczegółowe |
| Kod | ? (gdzie jest?) | ✅ W repozytorium |
| Testy | Brak | ✅ Unit tests w repo |

## Next Steps

Po wdrożeniu nowej edge function:

1. ✅ Test ręczny z `Shunters (1).csv`
2. ✅ Weryfikuj że Chris Jenkins ma 76 ruchów
3. ❓ Znajdź i wyłącz stary cron (jeśli istnieje)
4. ✅ Skonfiguruj nowy cron do wywoływania tej edge function
5. ✅ Monitor logów przez tydzień

## Kontakt

Pytania? Sprawdź:
- Plan: `.cursor/plans/fix_performance_import_aggregation_*.plan.md`
- Testy: `src/utils/csvImportHelper.test.js`
- Helper: `src/utils/csvImportHelper.js`
