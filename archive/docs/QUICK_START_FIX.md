# Quick Start - Naprawa Crona (5 minut)

## Problem
Chris Jenkins ma tylko **38 ruchów** zamiast **76** (38+38 z dwóch zmian).

## Przyczyna
Twój cron `import-performance-from-gmail` zatrzymywał się po pierwszej sekcji CSV.

## Rozwiązanie (3 kroki)

### 1. Deploy naprawionej funkcji (2 min)

```bash
cd c:\projekty\dark\yard-rota-app
cd supabase\functions
supabase functions deploy import-performance-from-gmail
```

**To wszystko!** Parser został naprawiony i teraz czyta wszystkie sekcje (Day/Afternoon/Night).

### 2. Poczekaj na automatyczne wywołanie (lub wywołaj ręcznie)

Cron uruchamia się codziennie o 06:30. Możesz poczekać lub wywołać ręcznie:

W Supabase Dashboard → Edge Functions → import-performance-from-gmail → kliknij "Invoke"

### 3. Zweryfikuj w logach (1 min)

Supabase Dashboard → Edge Functions → import-performance-from-gmail → Logs

**Szukaj**:
```
✅ Found 3 header sections in CSV              <- Poprawnie (było 1)
✅ Parsed 6+ shift entries from 3 sections     <- Poprawnie (było 2)
✅ CJ200: Aggregated 2 shifts → 76 total moves <- SUKCES!
```

### 4. Sprawdź bazę (30 sek)

Supabase Dashboard → SQL Editor:

```sql
SELECT 
  p.yard_system_id,
  sp.number_of_moves,
  sp.report_date
FROM shunter_performance sp
JOIN profiles p ON p.id = sp.user_id
WHERE p.yard_system_id = 'CJ200'
ORDER BY sp.report_date DESC
LIMIT 1;
```

**Oczekiwane**: `number_of_moves` = **76** ✅

## Co zostało naprawione?

### Parser CSV - Przed i Po

**PRZED (źle)**:
```typescript
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("shunter user id")) {
    headerIdx = i;
    break;  // ❌ Zatrzymuje po pierwszym nagłówku
  }
}
// Parsuje tylko od headerIdx+1 do końca
// Pomija sekcje Afternoon i Night
```

**PO (dobrze)**:
```typescript
// Znajduje WSZYSTKIE nagłówki
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("shunter user id")) {
    headerIndices.push(i);  // ✅ Zapisuje wszystkie
  }
}

// Parsuje WSZYSTKIE linie, pomijając tylko nagłówki
for (let i = 0; i < lines.length; i++) {
  if (headerSet.has(i)) continue;  // ✅ Świadomie pomija nagłówki
  // ... parsuj dane ...
}
```

## Rezultat

| Shunter | Przed | Po | Różnica |
|---------|-------|-----|---------|
| Chris Jenkins | 38 | **76** ✅ | +38 |
| Inne z wieloma zmianami | Niepełne | **Pełne** ✅ | Zależy |

## Pliki do przejrzenia

**Musisz wiedzieć**:
- ✅ `CRON_FIX_INSTRUCTIONS.md` - szczegółowe instrukcje
- ✅ `supabase/functions/import-performance-from-gmail/index.ts` - naprawiony kod

**Opcjonalnie**:
- `PERFORMANCE_IMPORT_FIX_SUMMARY.md` - pełne podsumowanie
- `HOW_TO_FIX_CRON.md` - ogólne instrukcje (przed znalezieniem crona)
- `src/utils/csvImportHelper.test.js` - testy (uruchom: `npm run test:run`)

## Troubleshooting

### Logi pokazują "Found 1 header sections"

Deploy nie zadziałał. Spróbuj ponownie:

```bash
supabase functions deploy import-performance-from-gmail --project-ref twoj-projekt-ref
```

### Nadal widzę 38 ruchów

1. Sprawdź czy deploy się udał (Supabase Dashboard → Edge Functions)
2. Sprawdź logi ostatniego wywołania
3. Wywołaj funkcję ręcznie (Invoke button)
4. Jeśli nadal problem - skontaktuj się ze mną

### "No new reports to process"

To OK - oznacza że nie ma nowych emaili z label FILTER. Sprawdź:
1. Czy email z raportem ma odpowiedni label (GMAIL_FILTER_LABEL_ID)
2. Czy nie ma już label PROCESSED

## ✅ Checklist

- [ ] Deploy: `supabase functions deploy import-performance-from-gmail`
- [ ] Poczekaj na 06:30 lub wywołaj ręcznie (Invoke)
- [ ] Sprawdź logi: "Found 3 header sections"
- [ ] Sprawdź logi: "CJ200: Aggregated 2 shifts → 76"
- [ ] Sprawdź bazę: Chris ma 76 ruchów ✅
- [ ] Gotowe! 🎉

---

**Czas wdrożenia**: ~5 minut  
**Status**: Gotowe do deploy  
**Rezultat**: Chris Jenkins i inni będą mieli poprawne sumy ruchów

**Data**: 2026-01-31
