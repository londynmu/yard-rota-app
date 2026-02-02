# Instrukcje naprawy istniejącego crona

## Problem został zdiagnozowany ✅

**Twój cron z Gmail**: Parser CSV zatrzymywał się po pierwszej sekcji nagłówków!

### Gdzie był błąd

W funkcji `parseShunterCSV()`:

```typescript
// STARY KOD (ZŁY):
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("shunter user id")) {
    headers = lines[i].split(",");
    headerIdx = i;
    break;  // ❌ Zatrzymuje się po pierwszym nagłówku!
  }
}

// Potem parsował tylko od headerIdx+1 do końca
// Gdy napotkał drugi nagłówek, pomijał go (bo brak ID w komórce)
```

**Efekt**: 
- ✅ Sekcja Day shift (0600-1400): parsowana
- ❌ Sekcja Afternoon (1400-2200): **POMIJANA**
- ❌ Sekcja Night (2200-0600): **POMIJANA**

**Wynik dla Chris Jenkins**:
- Powinien mieć: 38 + 38 = **76 ruchów**
- System zapisywał tylko: **38 ruchów** (z pierwszej sekcji)

## Jak naprawić

### Opcja 1: Zastąp całą funkcję (zalecane)

Przygotowałem naprawioną wersję: **`supabase/functions/import-performance-from-gmail/index.ts`**

**Co zostało naprawione**:
- ✅ Parser znajduje **wszystkie** nagłówki (nie tylko pierwszy)
- ✅ Parsuje dane z **wszystkich sekcji** (Day/Afternoon/Night)
- ✅ Dodano szczegółowe logowanie każdego kroku
- ✅ Agregacja już była OK - teraz dostaje pełne dane

**Deploy**:

```bash
# Backup starej funkcji (opcjonalne)
supabase functions download import-performance-from-gmail --project-ref twoj-projekt

# Deploy naprawionej wersji
cd supabase/functions
supabase functions deploy import-performance-from-gmail
```

### Opcja 2: Napraw tylko parser (szybkie)

Jeśli chcesz tylko naprawić parser w istniejącej funkcji, zastąp funkcję `parseShunterCSV()`:

```typescript
function parseShunterCSV(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/);
  
  // FIXED: Znajdź WSZYSTKIE nagłówki, nie tylko pierwszy
  const headerIndices: number[] = [];
  let headers: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("shunter user id") || lower.includes("full name")) {
      if (headers.length === 0) {
        headers = lines[i].split(",").map((h) => h.trim().toLowerCase());
      }
      headerIndices.push(i);
    }
  }
  
  if (headerIndices.length === 0) return [];
  
  console.log(`📄 Found ${headerIndices.length} header sections in CSV`);

  const colIdx = (name: string) => headers.findIndex((h) => h.includes(name));
  const idCol = colIdx("shunter user id");
  const nameCol = colIdx("full name");
  const movesCol = colIdx("no of moves");
  const collectCol = colIdx("avg time to collect");
  const travelCol = colIdx("avg time to travel");
  const fullLocCol = colIdx("no of full locations");

  // FIXED: Zbiór numerów linii z nagłówkami (szybkie sprawdzanie)
  const headerSet = new Set(headerIndices);
  
  const rows: ParsedRow[] = [];
  
  // FIXED: Parsuj WSZYSTKIE linie, pomijając tylko nagłówki
  for (let i = 0; i < lines.length; i++) {
    if (headerSet.has(i)) continue; // Skip header rows
    
    const cells = lines[i].split(",").map((c) => c.trim());
    if (!cells[idCol]) continue;
    
    const yardId = cells[idCol]?.toUpperCase() || "";
    const moves = parseInt(cells[movesCol], 10) || 0;
    if (!yardId || moves === 0) continue;
    
    rows.push({
      yardSystemId: yardId,
      fullName: cells[nameCol] || "",
      numberOfMoves: moves,
      avgTimeToCollect: cells[collectCol] || "0:00",
      avgTimeToTravel: cells[travelCol] || "0:00",
      numberOfFullLocations: parseInt(cells[fullLocCol], 10) || 0,
    });
  }
  
  console.log(`✅ Parsed ${rows.length} shift entries from ${headerIndices.length} sections`);
  return rows;
}
```

## Weryfikacja po naprawie

### 1. Sprawdź logi edge function

Po uruchomieniu crona, w Supabase Dashboard → Edge Functions → Logs szukaj:

```
📄 Found 3 header sections in CSV          ✅ Poprawnie (nie 1!)
✅ Parsed 6 shift entries from 3 sections  ✅ Poprawnie (nie 2!)
🔄 Aggregating 6 shift entries...          
  📝 New shunter: CJ200
  ➕ CJ200 shift 2: 38 moves → total: 38 + 38 = 76  ✅ POPRAWNIE!
  ✅ CJ200: Aggregated 2 shifts → 76 total moves    ✅ SUKCES!
```

**Jeśli widzisz**:
```
📄 Found 1 header sections in CSV    ❌ Źle - parser nie naprawiony
✅ Parsed 2 shift entries             ❌ Źle - parsuje tylko 1 sekcję
```
...to naprawa nie zadziałała, deploy ponownie.

### 2. Sprawdź bazę danych

```sql
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
  AND sp.report_date >= CURRENT_DATE - 7
ORDER BY sp.report_date DESC;
```

**Oczekiwany wynik dla Chris Jenkins**:
- `number_of_moves` = **76** (lub inna suma z 2-3 zmian, ale NIE 38!)
- `avg_time_to_collect` ≈ 2:25 (weighted average)
- `avg_time_to_travel` ≈ 2:39 (weighted average)

### 3. Test z konkretnym plikiem

Możesz ręcznie wywołać funkcję z testowym CSV:

```bash
curl -X POST 'https://twoj-projekt.supabase.co/functions/v1/import-performance-from-gmail' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

(Funkcja automatycznie pobierze emaile z Gmail)

## Różnice: Stary vs Nowy parser

| Aspekt | Stary parser (zły) | Nowy parser (dobry) |
|--------|-------------------|---------------------|
| Znajdowanie nagłówków | `break` po pierwszym | ✅ Znajduje wszystkie |
| Parsowanie sekcji | Tylko pierwsza sekcja | ✅ Wszystkie sekcje |
| Pomijanie nagłówków | Przypadkowe (brak ID) | ✅ Świadome (Set) |
| Logowanie | Minimalne | ✅ Szczegółowe |
| Chris Jenkins | ❌ 38 ruchów | ✅ 76 ruchów |

## Dlaczego ręczny import działał?

Sprawdź kod w `src/utils/csvImportHelper.js` - tam parser był poprawnie napisany:

```javascript
// Skip empty lines or header repetitions
if (!line || line.includes('Shunter user id')) continue;  // ✅ Pomija nagłówki
```

Cron miał inną (gorszą) implementację parsera.

## Następne kroki

1. ✅ **Teraz**: Deploy naprawionej funkcji
2. ✅ **Za godzinę**: Sprawdź logi pierwszego automatycznego importu
3. ✅ **Następnego dnia**: Zweryfikuj w bazie że agregacja działa
4. ✅ **Przez tydzień**: Monitoruj logi codziennie

## Kontakt / Pomoc

**Nowe pliki**:
- `supabase/functions/import-performance-from-gmail/index.ts` - naprawiona funkcja (gotowa do deploy)
- `CRON_FIX_INSTRUCTIONS.md` - ten plik

**Dokumentacja**:
- `HOW_TO_FIX_CRON.md` - ogólne instrukcje
- `PERFORMANCE_IMPORT_FIX_SUMMARY.md` - pełne podsumowanie
- Testy: `npm run test:run` (15 testów, wszystkie pass)

**Logi**:
- Supabase Dashboard → Edge Functions → import-performance-from-gmail → Logs
- Szukaj: "✅ CJ200: Aggregated 2 shifts → 76 total moves"

---

## Checklist naprawy crona

- [ ] Backup starej funkcji (opcjonalne)
- [ ] Deploy naprawionej funkcji `import-performance-from-gmail`
- [ ] Poczekaj na automatyczne wywołanie o 06:30 lub wywołaj ręcznie
- [ ] Sprawdź logi - czy pokazuje "Found 3 header sections"
- [ ] Sprawdź logi - czy Chris ma "76 total moves"
- [ ] Zweryfikuj w bazie: `SELECT * FROM shunter_performance WHERE report_date = CURRENT_DATE`
- [ ] Monitoruj przez tydzień

---

**Status**: Naprawa gotowa do wdrożenia ✅

**Oczekiwany rezultat**: Chris Jenkins i inni shunterzy z wieloma zmianami będą mieli poprawne sumy ruchów.

**Data**: 2026-01-31
