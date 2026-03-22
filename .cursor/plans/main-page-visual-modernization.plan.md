# Modernizacja wizualna strony głównej (tylko UI, bez logiki)

## Twardy zakres (Twoje wymagania)

- **Wyłącznie zmiany wizualne:** `className`, ewentualnie atrybuty czysto prezentacyjne (`aria-*` tylko jeśli naprawiają regresję a11y po zmianie wyglądu — domyślnie nie ruszać).
- **Zero zmian logiki:** bez zmian w warunkach renderowania, kolejności hooków, zależnościach `useEffect` / `useMemo` / `useCallback`, wywołaniach Supabase, routingu, `Navigate`, filtrach nawigacji, propsach przekazywanych do dzieci (chyba że prop jest wyłącznie stylizacyjny i już istnieje — wtedy i tak nie dodajemy nowej logiki).
- **Bez refaktorów strukturalnych** w tej iteracji: np. **nie** przenosić `AvailabilityDialog` na `Modal.jsx` (to zmienia kompozycję, focus, eventy — wykracza poza „tylko klasy”).
- **Animacje:** `framer-motion` dozwolone **tylko** jako opakowanie z **identycznymi** warunkami widoczności co dziś (ten sam `if (...) return null`, te same klucze list, te same `onClick` — handlery nieedytowane).

---

## Co jest bezpieczne vs ryzykowne (audyt)

| Obszar | Bezpieczne (wizualnie) | Nie robić (logika / zachowanie) |
|--------|-------------------------|----------------------------------|
| [HomePage.jsx](src/components/HomePage.jsx) | Klasy tła shell, nagłówka, dropdown, dolnego paska; token `rota` zamiast `to-indigo-50` | `lazyWithRetry`, `Routes`/`Route`, `Navigate`, `topNavLinks`/`bottomNavLinks`, `hideHeaderOnMobile`, `useEffect` profilu |
| [CalendarPage.jsx](src/pages/CalendarPage.jsx) | Klasy na `div` scrolla, legendzie, nagłówku miesiąca, przyciskach strzałek, linku „Manage my breaks”, popupie `popup.show` (kolory obramowania/tła) | `handleDayClick`, localStorage, `selectedShifts`/`selectedLocation`, props do `ShiftDashboard`, `useAvailabilityData`, `showPopup` |
| [PreCheckReminder.jsx](src/components/PreCheck/PreCheckReminder.jsx) | Box, typografia, obramowania; styl **outline** na `Link`/`button` (te same `to`, `onClick`) | `checkIfNeeded`, zapytania Supabase, `needsPreCheck`/`dismissed` flow |
| [CalendarGrid.jsx](src/components/Calendar/CalendarGrid.jsx) | Stringi z `getColorByStatus`, klasy skeletonu, opcjonalnie `motion.button` z **tymi samymi** `disabled`/`onClick`/`type` | `generateDays` / `generateCalendarWeeks`, warunek `isPastDate` przy kliknięciu |
| [ShunterOfTheMonthCard.jsx](src/components/User/ShunterOfTheMonthCard.jsx) | Klasy nagłówka, wierszy, chevron; ewent. `rounded`/`shadow` | `getMonthlyAwards`, sortowanie `monthKey`, `open` toggle — tylko `className` na istniejących elementach |
| [ShiftDashboard.jsx](src/components/User/ShiftDashboard.jsx) | Tylko klasy Tailwind na kontenerach / tekście **bez** zmiany propsów z rodzica | Jakakolwiek zmiana sortowania przerw, filtrów, dni operacyjnych 06:00–05:59 |
| [AvailabilityDialog.jsx](src/components/Calendar/AvailabilityDialog.jsx) | Klasy overlay i panelu (jak dziś: własny `fixed` — zostaje), przyciski — **outline** zgodnie z regułą projektu | `useEffect`/`initialData`, `handleSubmit`, `onSave`/`onClose` |

**Reguły produkcyjne do respektowania po wizualnych zmianach:** [main-page-breaks-logic.mdc](.cursor/rules/main-page-breaks-logic.mdc) (bez zmian w kodzie sortowania — tylko upewnić się, że nic nie dotykamy w logice listy przerw).

---

## Doprecyzowanie względem pierwszego planu

1. **Shell [HomePage.jsx](src/components/HomePage.jsx):** Nadal tylko klasy / tokeny tła — bez dotykania routingu.
2. **[CalendarPage.jsx](src/pages/CalendarPage.jsx):** Ujednolicenie tła = wyłącznie `className` na istniejącym wrapperze — **bez** zmiany hierarchii DOM, która wpływa na scroll lub `h-full`.
3. **PreCheck / przyciski:** Zmiana z „filled” na „outline” to **tylko styl** — `Link` nadal `to="/precheck"`, `button` nadal `setDismissed(true)`.
4. **Shunter:** Przy zmianie palety (ścieżka A z poprzedniego planu) — zaktualizować [shunter-card-visual-reference.mdc](.cursor/rules/shunter-card-visual-reference.mdc) **osobnym commitem/docs**, albo wybrać ścieżkę B (minimalne klasy, amber zostaje w nagłówku).
5. **Opcjonalny refactor `Modal` dla AvailabilityDialog:** **Wycofany** z zakresu „tylko wizualnie”; zostaje aktualna struktura + nowe klasy.
6. **ShiftDashboard:** W tej iteracji albo **pominąć**, albo ograniczyć do plików / fragmentów, gdzie wyraźnie widać tylko `className` (bez ruszania hooków w tym samym bloku).

---

## Checklista przed merge (żeby nic nie zepsuć)

- [ ] Brak diffów w treści funkcji handlerów (poza ewent. `className` w JSX — handlery byte-identical lub tylko formatowanie).
- [ ] Brak zmian w stringach SQL / `.from(` / `.eq(` w edytowanych plikach.
- [ ] `PreCheckReminder` nadal zwraca `null` w tych samych stanach co wcześniej.
- [ ] Kalendarz: klik w przeszłość nadal pokazuje ten sam komunikat; w przyszłość — ten sam dialog.
- [ ] `/calendar`: `ShiftDashboard` dostaje **te same** propsy z [CalendarPage.jsx](src/pages/CalendarPage.jsx).
- [ ] Test manualny mobile: dolna nawigacja, safe area, ukryty nagłówek na `/calendar`.

---

## Kolejność wdrożenia (wizualnie, małe ryzyko → większe powierzchnie)

1. [HomePage.jsx](src/components/HomePage.jsx) — tylko tokeny tła / klasy shell.
2. [CalendarPage.jsx](src/pages/CalendarPage.jsx) — wrapper, legenda, nagłówek, CTA link (klasy).
3. [PreCheckReminder.jsx](src/components/PreCheck/PreCheckReminder.jsx).
4. [CalendarGrid.jsx](src/components/Calendar/CalendarGrid.jsx).
5. [ShunterOfTheMonthCard.jsx](src/components/User/ShunterOfTheMonthCard.jsx) (+ reguła `.mdc` jeśli pełna zmiana wyglądu nagłówka).
6. [AvailabilityDialog.jsx](src/components/Calendar/AvailabilityDialog.jsx) — tylko klasy.
7. [ShiftDashboard.jsx](src/components/User/ShiftDashboard.jsx) — **opcjonalnie**, wyłącznie warstwa klas w wybranych sekcjach.

---

## To-dos (zaktualizowane)

- [ ] Shell HomePage: wyłącznie `className` / token `rota` dla tła — **bez** routingu i hooków
- [ ] CalendarPage: wyłącznie style na istniejących elementach — **bez** zmiany propsów do ShiftDashboard i handlerów
- [ ] PreCheckReminder: style + outline buttons — **bez** zmiany `checkIfNeeded` i warunków widoczności
- [ ] CalendarGrid: `getColorByStatus` + ewent. `motion.*` przy zachowaniu `onClick`/`isPastDate`
- [ ] ShunterOfTheMonthCard: tylko klasy; przy pełnej zmianie wzorca — aktualizacja `shunter-card-visual-reference.mdc`
- [ ] AvailabilityDialog: tylko klasy — **bez** migracji na `Modal.jsx`
- [ ] ShiftDashboard: opcjonalnie, tylko `className` w wybranych miejscach
- [ ] QA: checklista powyżej + regresja listy przerw (wizualnie nie zmienia logiki, ale warto potwierdzić)
