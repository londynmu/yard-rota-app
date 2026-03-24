---
name: Stats page visual alignment
overview: "Performance (/performance) — pełna inwentaryzacja UI + doprowadzenie do modern page (wzór strony głównej)."
todos:
  - id: shell-sticky
    content: "PerformanceLeaderboard: scroll shell + page-content-inner + sticky bar + baner 06:30"
  - id: modals
    content: "3 modale + overlay + Modal.jsx lub glass-card; wybór opcji jak Calendar (bez orange fill)"
  - id: team-cards
    content: "Team Overview + leaderboard cards + renderDetailPanel + rank badge"
  - id: chart
    content: "PerformanceChart (wszystkie stany + ECharts kolory z theme)"
  - id: empty-skeleton
    content: "Empty state + skeleton loading + sekcja Detailed view"
  - id: motion-a11y
    content: "Opcjonalnie: scroll lock (Modal), framer-motion bez zmiany lub dopracowanie cieni"
---

# Performance / „Stats” — pełny przegląd + plan wizualny

## Zakres trasy

- **Strona:** [`src/pages/PerformanceLeaderboard.jsx`](src/pages/PerformanceLeaderboard.jsx) (`/performance`, etykieta „Stats” w nawigacji).
- **Komponent potomny:** [`src/components/PerformanceChart.jsx`](src/components/PerformanceChart.jsx) (lazy + `Suspense`).

---

## 1. Inwentaryzacja absolutnie wszystkich elementów UI

### 1.1 Kontener główny strony

| Element | Lokalizacja / opis | Uwagi |
|--------|---------------------|--------|
| Root wrapper | `min-h-screen bg-slate-50` | Do zamiany na shell jak Calendar + `bg-transparent` + scroll wewnętrzny |
| Brak widocznego tytułu strony w treści | — | Strona nie renderuje `h1` „Performance”; tytuł jest tylko w headerze (`HomePage`). Opcjonalnie dodać `h1` wizualnie spójny z `text-2xl font-bold text-charcoal tracking-tight` (jak miesiąc na kalendarzu) — **decyzja produktowa** |

### 1.2 Sticky pasek (zawsze widoczny)

| Element | Klasy / zachowanie |
|--------|---------------------|
| Tło paska | `sticky top-0 z-30 bg-slate-200 border-b border-gray-300 pt-safe` |
| Kontener | `container mx-auto px-4 py-3 md:py-4` |
| Układ | `flex flex-wrap … gap-2` — trzy przyciski |
| **Przycisk Range** | `rounded-full border-2 … font-semibold shadow-lg` — `getRangeLabel(selectedRange)` |
| **Przycisk Sort** | ten sam styl — etykieta „Sort” |
| **Przycisk Shift** | ten sam styl — „Shift: All \| Day \| Night” (skrót: brak „Afternoon” w etykiecie przy filtrze night) |

**Dopasowanie:** zamiana na `bg-white/80 backdrop-blur-md border-slate-200/60`, siatka 3 kolumny równej szerokości, segmenty jak `breakHeaderControls` ([`CalendarPage.jsx`](src/pages/CalendarPage.jsx)).

### 1.3 Baner warunkowy (czas 00:00–06:29)

| Element | Tekst / styl |
|--------|----------------|
| Widoczność | `h < 6 \|\| (h === 6 && m < 30)` |
| Blok | `bg-slate-100 border-b border-slate-300 px-4 py-2 text-center` |
| Tekst | „Next report will be available at 06:30.” — `text-sm text-slate-700 font-medium` |

**Dopasowanie:** lżejsze tło/obramowanie w tokenach (`border-slate-200/60`, `bg-base-50/80` lub `bg-white/60`).

### 1.4 Modale (3× `createPortal` do `document.body`)

Wspólne dla każdego:

| Część | Obecne klasy |
|-------|----------------|
| Overlay | `fixed inset-0 z-[9999] … bg-black/70 px-4` |
| Panel | `bg-white rounded-2xl border-2 border-gray-200 shadow-2xl max-w-sm p-4` |
| Nagłówek | `flex … pb-3 border-b border-gray-200` |
| Tytuł | `text-lg font-bold text-charcoal` — odpowiednio: „Select Range”, „Sort Leaderboard”, „Shift” |
| Przycisk zamknięcia | SVG X, `text-gray-500 hover:text-charcoal` |
| Lista opcji | `pt-4 space-y-2` |
| Opcja wybrana | `bg-orange-600 text-white border-orange-600` |
| Opcja nie wybrana | `bg-white text-charcoal border-gray-200` |

**Dopasowanie:** [`Modal.jsx`](src/components/ui/Modal.jsx) (blokuje `body` overflow, `z-50`, overlay `rgba(0,0,0,0.7)`, panel `bg-rota-modal-bg border-rota-modal-border`) + opcje w stylu outline (bez `orange-600`). **Uwaga:** `Modal` ma `z-50`; sticky header ma `z-30` — sprawdzić czy wystarczy; obecne modale używają `z-[9999]`.

**Modale — szczegóły treści:**

1. **Range:** 4 przyciski (`RANGE_OPTIONS`: Last Day, Last Week, Last Month, All Time).
2. **Sort:** 2 przyciski (`SORT_OPTIONS`: Total Moves, Per Day).
3. **Shift:** 3 przyciski (All, Day, Night).

### 1.5 Główna treść (pod sticky)

| Element | Opis |
|--------|------|
| Kontener | `container mx-auto px-4 py-4 md:py-6` |
| Stan **loading** | `space-y-4 animate-pulse` |
| Stan **pusty** | `text-center py-20` + emoji 📊 + nagłówek + opis |
| Stan **z danymi** | `Team overview` + `Trend` + `Detailed list` |

### 1.6 Skeleton (loading)

| Element | Struktura |
|--------|-----------|
| Karta „Team Overview” | `bg-white rounded-xl shadow-lg p-6 border-2 border-slate-200` + placeholdery `bg-slate-300` |
| Siatka 3 kolumn | `md:grid-cols-3` — trzy karty `bg-slate-100 rounded-lg p-4` |
| 5× wiersz listy | `bg-white rounded-xl … p-4` — avatar, linie tekstu, kółko |

**Dopasowanie:** `card-modern` / `glass-card`, `border-slate-200/60`, spójne `rounded-2xl`.

### 1.7 Stan pusty (brak danych)

| Element | Styl |
|--------|------|
| Emoji | `text-6xl mb-4` 📊 |
| Nagłówek | `text-xl font-semibold text-charcoal mb-2` — „No Performance Data” |
| Tekst | `text-gray-600` |

**Dopasowanie:** ikona zamiast emoji (opcjonalnie), `card-modern`, `text-slate-600`, nagłówek `text-xl font-bold` lub `text-2xl` jak sekcje głównej.

### 1.8 Sekcja „Team Overview”

| Element | Opis |
|--------|------|
| Obudowa | `motion.div` — `layout`, `cursor-pointer`, `onClick` toggle |
| Zwinięty | `rounded-full bg-gradient-to-r from-slate-400 to-slate-300` |
| Rozwinięty | `rounded-2xl bg-gradient-to-br from-slate-100 … border-2 border-slate-300` |
| Nagłówek | Emoji 📊 (motion), „Team Overview” `font-bold text-sm`, podtytuł „N active shunters” `text-white text-xs` |
| Chevron | SVG strzałka, obrót przy expand |
| Rozwinięta treść | 5 wierszy: Active shunters, Total moves, Avg moves/day, Total full locations, Top performer — `border-b border-slate-300`, wartości `text-lg font-bold` |

**Dopasowanie:** styl kart modern / glass, typografia sekcji, ewentualnie ikona zamiast emoji (spójność z resztą aplikacji).

### 1.9 Sekcja trendu (wykres)

| Element | Opis |
|--------|------|
| `Suspense` | `fallback`: `aspect-video min-h-[200px] rounded-xl bg-slate-100/90 animate-pulse` |
| Treść | `<PerformanceChart data={trendSeries} … />` |

### 1.10 Sekcja „Detailed view”

| Element | Opis |
|--------|------|
| Nagłówek sekcji | `text-xs uppercase tracking-wide text-gray-500` — „Detailed view” |
| Podtytuł | `text-sm text-gray-600` — liczba shunterów + „below average” lub „No shunters match…” |
| Hint | `text-sm text-gray-500` — „Tap card for details” |

**Dopasowanie:** `text-charcoal` / `text-slate-600` z theme; nagłówek jako `text-xl font-bold` jeśli ma być hierarchia jak na głównej.

### 1.11 Karty leaderboard (lista użytkowników)

| Element | Opis |
|--------|------|
| Kontener | `motion.div` — `whileHover`, `whileTap`, `onClick` toggle expand |
| Tło | `getRowBackgroundClass(rank)` — gradienty 1–3 miejsce, naprzemiennie `bg-blue-50` / `bg-green-50` |
| Ostrzeżenie | `border-l-4 border-l-amber-700/60` gdy `isBelowAverage` |
| **Badge rangi** | `getRankBadge` — `w-10 h-10 rounded-full bg-white border-2 border-gray-300 font-bold` |
| **Avatar** | `img` lub placeholder `bg-gray-400` … `font-bold text-white` |
| **Imię** | `font-bold text-charcoal truncate` |
| **Yard ID** | `text-xs text-gray-600 font-mono` |
| **Preferencja zmiany** | `text-[10px] font-medium text-gray-500` |
| **Below average** | `text-[10px] font-semibold text-amber-700` |
| **High output** | `text-[10px] font-semibold text-emerald-600` |
| **Kolumna prawa (stat)** | `text-2xl font-bold` + `text-xs text-gray-600` — zależnie od `sortOption`: moves, collect, travel, per_day, shift |

**Uwaga logiczna (poza samym UI):** `SORT_OPTIONS` ma tylko `moves` i `per_day`; gałęzie `collect`, `travel`, `shift` w JSX kart mogą być martwe — nie zmieniać wyglądu bez decyzji o usunięciu kodu.

### 1.12 Panel rozwinięty (`renderDetailPanel`)

| Element | Opis |
|--------|------|
| Obudowa | `bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden` |
| Wiersz 1 (3 kolumny) | Moves, Per Day, Days — `bg-gray-50`, `divide-x divide-gray-100`, etykiety `uppercase text-gray-500`, wartości `text-lg font-bold` |
| Wiersz „Vs team avg” | `border-t bg-gray-50/50`, `text-sm text-gray-600` |
| Wiersz 2 (Collect, Travel, Full Loc) | `divide-x`, bez `bg-gray-50` na komórkach |
| Tagi | `rounded-full text-[10px] font-semibold bg-gray-100 … border-gray-200` |

**Dopasowanie:** `card-modern` / obramowania `slate`, chipy `badge-*` lub jeden styl chipów, `font-medium` dla wartości gdzie ma być lżej.

### 1.13 [`PerformanceChart.jsx`](src/components/PerformanceChart.jsx) — wszystkie stany

| Stan | Opis |
|------|------|
| Brak danych | `bg-white border border-gray-200 rounded-2xl p-4 shadow-sm` + tekst „No trend data…” |
| Z danymi | Wrapper `bg-white border border-gray-200 rounded-2xl p-4 shadow-sm` |
| Nagłówek | `text-lg font-bold text-charcoal` — „Daily Moves Trend” |
| Wiersz metryk | Period, Days, Total, Avg/day, Best — `text-gray-500` / `font-semibold` / `text-orange-600` / `text-green-600` |
| Wykres | `ReactECharts` 300px wysokości |
| Stopka | `text-xs text-gray-500 text-center mt-2 italic` — „Tap chart to see daily details” |
| Opcje ECharts | Tooltip: `borderColor: '#ea580c'`, `itemStyle.color: '#ea580c'`, `lineStyle`, `areaStyle` z rgba pomarańczowym, osie `#6B7280`, `#E5E7EB`, `#F3F4F6` |

**Dopasowanie:** `card-modern` / `glass-card`; kolory w `option` przez tokeny z `tailwind.config.js`; nagłówek `text-xl font-bold tracking-tight`; metryki bez losowych `green-600`/`orange-600` poza theme.

---

## 2. Elementy poza samym JSX strony (powiązane)

| Element | Gdzie |
|--------|--------|
| Toast błędu | `toast.error('Failed to load leaderboard data')` — globalny [`ToastContext`](src/components/ui/ToastContext.jsx) — bez zmian wizualnych w tym zadaniu |
| Tytuł w `HomePage` | `/performance` → „Performance” w nagłówku — spójny z resztą aplikacji |

---

## 3. Cross-cutting (wdrożenie)

| Temat | Działanie |
|-------|-----------|
| Scroll pod modalem | `Modal.jsx` ustawia `document.body.style.overflow = hidden`; obecne modale custom — **warto** użyć `Modal` lub `useEffect` jak w [`WeeklyRotaPage`](src/pages/WeeklyRotaPage.jsx) |
| Dolny nav | Po dodaniu `page-content-inner` + scrollu: `pb-bottom-nav` jeśli treść zasłania pasek |
| `z-index` | Ujednolicić overlay modali ze `sticky` (30) i `Modal` (50) |
| `framer-motion` | Reguła: subtelne animacje — zostawić lub lekko zmniejszyć `boxShadow`/`y` hover |

---

## 4. Kolejność prac (bez zmian koncepcji, tylko pełniejsza lista)

1. Shell + sticky + baner + `page-content-inner` / `pb-bottom-nav`.
2. Trzy modale → `Modal` + styl opcji jak Calendar.
3. Skeleton + empty state.
4. Team Overview + karty + `renderDetailPanel` + badge.
5. Sekcja „Detailed view” (typografia).
6. `PerformanceChart` (wrapper + kolory + typografia).
7. Opcjonalnie: widoczny `h1` na stronie, `body` scroll przy modalach jeśli nie przez `Modal`.

---

## 5. Checklist „nic nie pominięte”

- [x] Root / tło strony  
- [x] Sticky 3 przyciski (Range, Sort, Shift)  
- [x] Baner 06:30  
- [x] Modal Range (overlay, panel, nagłówek, zamknięcie, 4 opcje)  
- [x] Modal Sort (2 opcje)  
- [x] Modal Shift (3 opcje)  
- [x] Kontener głównej treści  
- [x] Skeleton Team Overview + skeleton listy (5×)  
- [x] Empty state  
- [x] Team Overview (zwinięty / rozwinięty, emoji, wiersze statystyk)  
- [x] Suspense fallback wykresu  
- [x] PerformanceChart (pusty, pełny, nagłówek, metryki, wykres, stopka, kolory JS)  
- [x] Sekcja Detailed view (nagłówek, podtytuł, hint)  
- [x] Karty użytkownika (tło rang, border left, badge, avatar, teksty, staty, motion)  
- [x] Panel `renderDetailPanel` (wszystkie wiersze + tagi)  
- [x] Toast (tylko wzmianka — nie część layoutu strony)  

---

*Ten plik zastępuje rozszerza plan „stats page visual alignment” o pełną inwentaryzację; implementacja po akceptacji użytkownika.*
