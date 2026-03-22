# Plan: pełna modernizacja wg przewodnika (vs stan obecny)

## Odpowiedź na pytanie: czy wszystko z przewodnika zostało wprowadzone?

**Nie.** Wdrożenie było **częściowe** i celowo **inne** niż „kompletny przewodnik” z kilku powodów:

| Element przewodnika | Status | Dlaczego |
|---------------------|--------|----------|
| Uproszczenie `tailwind.config.js` (usunięcie ~90% `rota.*`) | **Nie** | Cała aplikacja (kalendarz, modale, przyciski, shift cards) opiera się na `rota.*`; usunięcie to refaktor **setek klas** w wielu plikach, nie tylko strony głównej. |
| Nowy `src/styles/theme.css` z `@import 'tailwindcss'` (styl Tailwind v4) | **Nie** | Projekt użyje **Tailwind v3** (`@tailwind` w [index.css](src/index.css)); wklejenie v4-theme bez migracji builda jest niespójne i ryzykowne. |
| Globalne utility: `.glass-card`, `.btn-modern`, `.badge-*`, `.calendar-day-*` | **Nie** | Style są rozrzucone w komponentach; przewodnik zakłada warstwę `@layer components` — do zrobienia osobno. |
| `import { motion } from 'motion/react'` | **Nie** | W [package.json](package.json) jest **`framer-motion`**, nie pakiet `motion` — import z przewodnika nie zadziała bez zmiany zależności. |
| PreCheck: niebieski gradient + **wypełniony** CTA (`from-blue-600 to-blue-700`) | **Nie** | Zastosowano **outline** zgodnie z [.cursor/rules/confirm-dialog-visual-reference.mdc](.cursor/rules/confirm-dialog-visual-reference.mdc) i wcześniejszą prośbą „tylko wizualnie / spójnie z projektem”. |
| Shunter: `AnimatePresence` + `motion` na expand, `motion.svg` na chevron, stagger wierszy | **Częściowo** | Zaktualizowano kolory/gradienty; **bez** przebudowy animacji otwierania na layout height (nadal CSS `max-h` + `transition`). |
| CalendarGrid: `ring-blue-500`, `animate-pulse-slow` na „today”, skala hover 1.05 | **Częściowo** | Są gradienty + `motion.button`; **inny** ring (`charcoal`), **brak** `pulse-slow` i **inna** skala hover (1.02). |
| Lighthouse 95+, metryki FCP/TTI | **Nie mierzone / nie gwarantowane** | To cele marketingowe przewodnika, nie efekt samej zmiany CSS. |

**Co zostało zrobione wcześniej (skrót):** shell `HomePage` (`to-rota-page-bg-to`), `CalendarPage` (tło, legenda, CTA outline, toolbar), `PreCheckReminder` (glass + framer-motion + outline), `CalendarGrid` (gradienty + motion), `ShunterOfTheMonthCard` (nowa paleta nagłówka/wierszy), `AvailabilityDialog` (outline, tokeny `rota`), aktualizacja [shunter-card-visual-reference.mdc](.cursor/rules/shunter-card-visual-reference.mdc).

---

## Konflikty do rozstrzygnięcia (zanim zrobimy „pełną” wersję)

1. **Przyciski:** Przewodnik = gradienty / `btn-primary` z fill. Reguły projektu = **outline only** (Modal/Confirm też).  
   - **Opcja A:** Trzymać outline wszędzie (spójność z regułami).  
   - **Opcja B:** Wyjątek tylko dla „marketingowych” CTA (np. PreCheck „Start”) — wymaga **aktualizacji reguły** w `.cursor/rules`, żeby nie blokować przyszłych agentów.

2. **Tokeny `rota.*`:** Przewodnik = wyciąć i zastąpić `base.*`.  
   - **Opcja A (zalecana):** Zostawić `rota.*`, dodać **aliasy semantyczne** w `theme.extend` (np. `ds.surface`, `ds.border`) mapowane na istniejące wartości — stopniowa adopcja bez big-bangu.  
   - **Opcja B:** Pełna migracja `rota` → nowy system (wiele plików, wysokie ryko regresji).

3. **Tailwind v4 vs v3:** Przewodnik zakłada składnię v4 w `theme.css`.  
   - **Rekomendacja:** Zostać przy **v3**; dodać `@layer components` w [index.css](src/index.css) (lub osobny plik importowany **po** `@tailwind` — bez `@import 'tailwindcss'` w środku, żeby nie zduplikować pipeline).

4. **Motion:** Ujednolicić na **`framer-motion`** (już w projekcie) albo dodać pakiet **`motion`** i import `motion/react` — decyzja jedna na cały projekt.

---

## Plan wdrożenia (ponownie, pełny obraz)

### Faza 0 — Decyzje (Ty / product)

- [ ] Przyciski: wyłącznie outline (**A**) czy dopuszczamy fill dla wybranych CTA (**B** + zmiana reguły)?
- [ ] Tokeny: tylko rozszerzenie (**aliasy**) czy pełna migracja z `rota`?
- [ ] Animacje Shunter: zostać przy CSS height czy przejść na `AnimatePresence` + `motion` (płynniejsze, ale większy diff JSX)?

### Faza 1 — Fundament (bez usuwania `rota`)

1. Dodać w [tailwind.config.js](tailwind.config.js) **opcjonalną** grupę (np. `ds` lub rozszerzenie `boxShadow` / `keyframes`) zgodnie z przewodnikiem: `shadow-soft`, `animate-pulse-slow`, itd. — wartości spójne z istniejącym UI.
2. W [index.css](src/index.css) dodać `@layer components` z klasami z przewodnika: `.glass-card`, `.badge-success` / `.badge-danger` / `.badge-info`, ewent. `.card-modern` — **używając `@apply` i kolorów już dostępnych** (slate + istniejące `rota` gdzie trzeba).
3. **Nie** wprowadzać `theme.css` z `@import 'tailwindcss'` dopóki projekt nie jest oficjalnie na Tailwind v4.

### Faza 2 — Komponenty „core” strony głównej (dopasowanie do przewodnika)

4. **PreCheckReminder:** Jeśli **B** — niebieski gradient jak w przewodniku + CTA fill; jeśli **A** — zostawić/ne dopracować glass i kontrast bez fill.
5. **ShunterOfTheMonthCard:**  
   - opcjonalnie: `motion.button` nagłówek, `AnimatePresence` + `motion` dla treści (zamiast `max-h-80`), stagger `motion.div` na wierszach;  
   - karta zewnętrzna: `bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg` jak w przewodniku.
6. **CalendarGrid:**  
   - „Today”: `ring-blue-500` (lub token `rota` jeśli wolisz spójność z plannerem) + opcjonalnie `animate-pulse-slow` z Fazy 1;  
   - dopasować `whileHover` do 1.05 jeśli tak ma być jak w przewodniku;  
   - holiday: `to-cyan-50` jak w diffie przewodnika (obecnie częściowo `sky/blue`).

### Faza 3 — Poza stroną główną (osobny zakres)

7. Przeniesienie wzorców z Fazy 1 na inne ekrany (Admin, Weekly Rota, Profile) — **osobny plan**, inaczej „wszystko z przewodnika” rozleje się na setki plików.

### Faza 4 — Jakość

8. `npm run build` + smoke test `/calendar` (mobile + desktop).  
9. Kontrast (np. WebAIM) dla nowych gradientów — poprawki klas tekstu, nie logiki.

---

## Checklist przewodnika — mapowanie

- [ ] Motion zainstalowany → **jest `framer-motion`** (nie `motion` — do ujednolicenia nazewnictwa w kodzie).
- [ ] `tailwind.config.js` „uproszczony” → **czeka decyzja**: aliasy vs migracja `rota`.
- [ ] `theme.css` + import → **zastąpione** przez rozszerzenie `index.css` / tailwind config (v3).
- [ ] PreCheckReminder jak w diffie → **częściowo**; CTA zależy od decyzji outline vs fill.
- [ ] Shunter jak w diffie → **częściowo**; brak pełnego Motion expand/stagger.
- [ ] CalendarGrid jak w diffie → **częściowo**; today/pulse/holiday cyan do dopracowania.
- [ ] Global utilities → **do zrobienia** (Faza 1).
- [ ] Lighthouse 95+ → **poza zakresem** jako obietnica; ewentualnie osobny audyt.

---

## Następny krok

Po Twojej odpowiedzi na **Fazę 0** (A/B dla przycisków + aliasy vs migracja `rota` + poziom Motion w Shunter) można wykonać implementację kolejno Faza 1 → 2.

**Plik planu:** [`.cursor/plans/design-system-full-refresh.plan.md`](design-system-full-refresh.plan.md)
