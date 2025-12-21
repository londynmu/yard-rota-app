# 🚀 Quick Start - Logi Aktywności (5 minut)

## 1️⃣ Uruchom SQL (2 minuty)

### Przejdź do Supabase:
```
1. Otwórz: https://supabase.com/dashboard
2. Wybierz swój projekt
3. Kliknij "SQL Editor" w menu po lewej
4. Kliknij "New Query"
```

### Wklej i uruchom:
```
1. Otwórz plik: sql/setup_activity_tracking.sql
2. Skopiuj CAŁĄ zawartość (Ctrl+A, Ctrl+C)
3. Wklej do SQL Editor (Ctrl+V)
4. Kliknij "Run" (lub Ctrl+Enter)
```

### Powinno się pojawić:
```
✅ Activity tracking setup complete!
✅ You can now view detailed activity logs in Admin Dashboard → Statistics → Page Activity Logs
```

## 2️⃣ Przetestuj (3 minuty)

### A. Wygeneruj trochę danych:
```
1. Zaloguj się do aplikacji
2. Poklikaj po różnych stronach:
   - Calendar
   - My Rota
   - Profile
   - Admin Dashboard
3. To utworzy przykładowe dane
```

### B. Zobacz logi:
```
1. Idź do: Admin Dashboard
2. Kliknij "Statistics" w menu
3. Zobaczysz nowe zakładki na górze:
   
   [Overview] [User List] [Activity Patterns] [Page Activity Logs] [User Activity Summary] [Retention]
                                               ↑                    ↑
                                            NOWE!                NOWE!
```

### C. Sprawdź "Page Activity Logs":
```
Zobaczysz tabelę z wierszami typu:

┌──────────────────────────┬─────────────────────┬──────────────────────┬────────────┐
│ User                     │ Page Visited        │ Time                 │ Session    │
├──────────────────────────┼─────────────────────┼──────────────────────┼────────────┤
│ Jan Kowalski             │ Calendar            │ 21.12.2025, 14:30:45 │ session_1  │
│ jan.kowalski@email.com   │ /calendar           │ 5 minutes ago        │ 234ab...   │
├──────────────────────────┼─────────────────────┼──────────────────────┼────────────┤
│ Anna Nowak               │ My Rota             │ 21.12.2025, 14:28:12 │ session_1  │
│ anna.nowak@email.com     │ /my-rota            │ 7 minutes ago        │ 567cd...   │
└──────────────────────────┴─────────────────────┴──────────────────────┴────────────┘
```

### D. Sprawdź "User Activity Summary":
```
Zobaczysz ranking:

┌──────────────────────────┬─────────────┬──────────────┬───────────────────┬─────────────────┐
│ User                     │ Total Views │ Unique Pages │ Most Visited Page │ Last Activity   │
├──────────────────────────┼─────────────┼──────────────┼───────────────────┼─────────────────┤
│ Jan Kowalski             │     45      │      8       │ Calendar          │ 5 minutes ago   │
│ jan.kowalski@email.com   │             │              │                   │                 │
├──────────────────────────┼─────────────┼──────────────┼───────────────────┼─────────────────┤
│ Anna Nowak               │     32      │      6       │ My Rota           │ 15 minutes ago  │
│ anna.nowak@email.com     │             │              │                   │                 │
└──────────────────────────┴─────────────┴──────────────┴───────────────────┴─────────────────┘
```

## 3️⃣ Sprawdź filtry

```
Na górze każdej zakładki jest selektor czasu:

[24h] [3d] [7d] [14d] [30d]
           ↑
        (wybrane)

Kliknij różne opcje aby zobaczyć dane z różnych okresów
```

## ✅ To wszystko!

**Gotowe!** Masz teraz pełny system logowania aktywności użytkowników.

## 📱 Co dalej?

Teraz możesz:

1. **Monitorować użytkowników w czasie rzeczywistym**
   - Kto jest teraz online
   - Co oglądają
   - Jak długo przeglądają

2. **Analizować wzorce**
   - Które strony są najpopularniejsze
   - Kto jest najbardziej aktywny
   - Kiedy użytkownicy są najbardziej aktywni

3. **Troubleshooting**
   - "User zgłasza problem" → sprawdź co oglądał przed problemem
   - "Nowa funkcja nie jest używana" → sprawdź ile osób ją odwiedza

## 🆘 Problem?

### Nie działa?
1. Sprawdź konsolę przeglądarki (F12)
2. Szukaj błędów czerwonym kolorem
3. Jeśli widzisz "function does not exist" - uruchom ponownie SQL

### Nadal nie działa?
1. Sprawdź czy jesteś zalogowany jako admin
2. Sprawdź czy w `profiles` masz `role = 'admin'`
3. Odśwież stronę (Ctrl+F5)

---

**Wszystko gotowe w 5 minut!** 🎉

