# Instrukcja uruchomienia pełnych logów aktywności

## Co zostało dodane?

System śledzenia aktywności użytkowników był już zaimplementowany, ale nie był widoczny w interfejsie. Teraz:

1. ✅ Utworzono nowe funkcje SQL do pobierania szczegółowych logów
2. ✅ Dodano 2 nowe zakładki w Admin Dashboard → Statistics:
   - **"Page Activity Logs"** - szczegółowe logi kto, kiedy i jaką stronę odwiedził
   - **"User Activity Summary"** - podsumowanie aktywności użytkowników (kto był najbardziej aktywny)

## Kroki instalacji

### 1. Uruchom nowe funkcje SQL

Musisz wykonać plik SQL w swojej bazie danych Supabase:

```bash
# Zaloguj się do Supabase Dashboard
# Przejdź do: SQL Editor
# Wklej i uruchom zawartość pliku:
```

Plik do uruchomienia: `sql/get_full_activity_logs.sql`

**LUB** jeśli używasz Supabase CLI:

```bash
supabase db push sql/get_full_activity_logs.sql
```

### 2. Co zawiera SQL?

Tworzy 3 nowe funkcje:

- `get_full_activity_logs(days_back, limit_count)` - pełne logi aktywności z danymi użytkowników
- `get_user_activity_logs(user_id, limit_count)` - aktywność konkretnego użytkownika
- `get_user_activity_summary(days_back)` - podsumowanie aktywności wszystkich użytkowników

### 3. Sprawdź czy działa

1. Zaloguj się jako admin
2. Idź do: **Admin Dashboard** → **Statistics**
3. Zobaczysz nowe zakładki:
   - **Page Activity Logs** - tu zobaczysz pełne logi
   - **User Activity Summary** - tu zobaczysz ranking najbardziej aktywnych użytkowników

### 4. Co zobaczysz w logach?

W zakładce "Page Activity Logs" zobaczysz:

- **Imię i nazwisko** użytkownika
- **Email** użytkownika  
- **Jaką stronę** odwiedził (tytuł i ścieżka)
- **Kiedy** dokładnie (data, godzina + "X minutes/hours/days ago")
- **ID sesji** (aby śledzić ciąg odwiedzin)

W zakładce "User Activity Summary" zobaczysz:

- **Kto był najbardziej aktywny** (posortowane po liczbie odwiedzin)
- **Ile stron** oglądał każdy użytkownik
- **Ile unikalnych stron** odwiedził
- **Jaką stronę** odwiedzał najczęściej
- **Kiedy był ostatnio aktywny**

### 5. Filtry czasowe

Możesz filtrować dane po czasie:
- **24h** - ostatnie 24 godziny
- **3d** - ostatnie 3 dni
- **7d** - ostatni tydzień (domyślne)
- **14d** - ostatnie 2 tygodnie
- **30d** - ostatni miesiąc

## Jak to działa?

System automatycznie śledzi każdą wizytę na stronie dzięki:

1. **Hook usePageTracking** (już działał) - zapisuje każdą wizytę do tabeli `page_visits`
2. **Nowe funkcje SQL** - pobierają dane z `page_visits` i łączą z `profiles` i `auth.users`
3. **Nowe zakładki w LoginStats** - wyświetlają dane w czytelnej formie

## Bezpieczeństwo

- Tylko administratorzy mogą oglądać logi aktywności innych użytkowników
- Funkcje używają `SECURITY DEFINER` z Row Level Security (RLS)
- Zwykli użytkownicy mogą tylko zapisywać własne wizyty

## Troubleshooting

### Nie widzę nowych zakładek?
- Sprawdź czy jesteś zalogowany jako admin
- Odśwież stronę (Ctrl+F5)

### Zakładki są puste?
- Sprawdź czy uruchomiłeś SQL (`sql/get_full_activity_logs.sql`)
- Sprawdź w konsoli przeglądarki czy są błędy
- Upewnij się że hook `usePageTracking` jest aktywny (już jest w `App.jsx`)

### Widzę błąd "function does not exist"?
- Oznacza to że nie uruchomiłeś SQL
- Idź do Supabase Dashboard → SQL Editor
- Wklej i uruchom zawartość `sql/get_full_activity_logs.sql`

## Co dalej?

System jest w pełni funkcjonalny. Możesz teraz:

1. Monitorować aktywność użytkowników w czasie rzeczywistym
2. Zobaczyć które strony są najbardziej popularne
3. Sprawdzić kto i kiedy był aktywny
4. Śledzić wzorce użytkowania aplikacji

Wszystkie dane są zbierane automatycznie, nie musisz nic więcej konfigurować! 🎉

