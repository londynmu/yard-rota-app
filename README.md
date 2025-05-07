Dziękuję za przesłanie pliku README.md. Teraz mogę uporządkować jego treść w bardziej przejrzysty i logiczny sposób, zachowując wszystkie ważne informacje.

# Yard Rota App

## Główne funkcje

Yard Rota to aplikacja mobilna do układania i zarządzania grafikami pracowniczymi z następującymi funkcjami:
- Planowanie zmian pracowników
- Zarządzanie lokalizacjami i agencjami
- System powiadomień dla administratorów
- Eksport grafików w formatach CSV i PDF
- Widok tygodniowy grafiku z podziałem na zmiany
- Zarządzanie przerwami dla pracowników
- Samodzielne zgłaszanie do zmian przez pracowników

## Narzędzia administracyjne

### Logout All Users Script

Ten skrypt pozwala wylogować wszystkich użytkowników z aplikacji Yard Rota poprzez zakończenie ich sesji Supabase. Jest to przydatne przy wprowadzaniu zmian w uwierzytelnianiu, wymaganiach profilowych lub innych funkcjach wymagających ponownego logowania.

#### Wymagania wstępne

- Node.js 14+ 
- Klucz Service Role z panelu Supabase

#### Wersje skryptu

Dostępne są dwie wersje:
1. **logout-all-users.js** - wersja ES Modules (dla Node.js 14+)
2. **logout-all-users-commonjs.js** - wersja CommonJS (kompatybilna ze wszystkimi wersjami Node.js)

#### Instrukcja konfiguracji

1. **Utwórz plik .env** w tym samym katalogu co skrypt z kluczem Supabase:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
   
   Klucz można znaleźć w panelu Supabase: Project Settings > API > Project API keys

2. **Zainstaluj zależności**:
   ```bash
   npm install
   ```

3. **Uruchom skrypt** używając jednej z metod:

   **Opcja 1: Za pomocą skryptów npm**
   ```bash
   # Wersja CommonJS (zalecana)
   npm run logout
   
   # Lub wybierz konkretną wersję
   npm run logout-cjs    # wersja CommonJS
   npm run logout-esm    # wersja ES Modules
   ```
   
   **Opcja 2: Bezpośrednie uruchomienie**
   ```bash
   # Wersja ES Modules
   node logout-all-users.js
   
   # Wersja CommonJS 
   node logout-all-users-commonjs.js
   ```

#### Co robi skrypt

1. Łączy się z instancją Supabase przy użyciu klucza service role
2. Pobiera wszystkich użytkowników z systemu uwierzytelniania Supabase
3. Kończy wszystkie sesje dla każdego użytkownika
4. Dostarcza podsumowanie udanych i nieudanych prób wylogowania

#### Uwagi o bezpieczeństwie

Klucz service role ma uprawnienia administratora i powinien być chroniony. Nigdy nie commituj pliku `.env` do kontroli wersji.

#### Rozwiązywanie problemów

W przypadku błędów:
- Sprawdź poprawność klucza SUPABASE_SERVICE_ROLE_KEY w pliku `.env`
- Upewnij się, że masz odpowiednie uprawnienia w Supabase
- Sprawdź wersję Node.js (powinna być 14+)
- Jeśli występują błędy składni, wypróbuj wersję CommonJS
- Ignoruj błędy lintera dotyczące 'require' lub 'process'

## Ostatnie zmiany

### Czerwiec 2024
- **Naprawiono zgłaszanie się do dostępnych zmian (2024-06-14):** Poprawiono logikę w `AvailableShiftsPage.jsx` w funkcji `handleClaimShift`. Wcześniej, zapytanie o dostępne rekordy do przypisania pracownika mogło zwracać pusty wynik, nawet jeśli istniały wolne miejsca w slocie oznaczonym jako "available". Zmiana polega na tym, że najpierw weryfikowany jest status głównego rekordu slotu (czy nadal jest `available`), a następnie wyszukiwany jest dowolny pasujący rekord (data, lokalizacja, czas) z `user_id` ustawionym na `null`. Ten konkretny, znaleziony rekord jest następnie aktualizowany o ID pracownika, a jego status zmieniany na `null` (ponieważ to miejsce jest już zajęte).
  - Zmienione pliki: `src/pages/AvailableShiftsPage.jsx`
- **Naprawiono problem z trwałością statusu "dostępności" slotu (2024-06-14):** Poprawiono logikę przełączania dostępności slotu w `RotaManager.jsx`. Gdy slot jest oznaczany jako niedostępny, wszystkie powiązane rekordy w bazie danych (`scheduled_rota`) są aktualizowane (status na `null`). Zapewnia to, że zmiana statusu jest prawidłowo odzwierciedlana po odświeżeniu strony. Poprzednio aktualizowany był tylko jeden rekord, co przy logice grupowania slotów mogło prowadzić do przywrócenia statusu "available", jeśli inne powiązane rekordy nadal miały taki status.
  - Zmienione pliki: `src/components/Admin/Rota/RotaManager.jsx`
- **Poprawiono przełączanie dostępności slotu (2024-06-14):** W komponencie `SlotCard.jsx` usprawniono obsługę przełączania dostępności slotu. Dodano stan ładowania (`isTogglingAvailability`), aby zapobiec wielokrotnym kliknięciom i wizualnie sygnalizować operację. Usunięto optymistyczne aktualizacje lokalnego stanu; komponent teraz czeka na potwierdzenie z backendu (przez `RotaManager.jsx`) przed odzwierciedleniem zmiany statusu, co zapewnia spójność UI z danymi serwera.
  - Zmienione pliki: `src/components/Admin/Rota/SlotCard.jsx`, `src/components/Admin/Rota/RotaManager.jsx`
- **Dodano samodzielne zgłaszanie do zmian (2024-06-13):** Zaimplementowano system umożliwiający pracownikom samodzielne zgłaszanie się do dostępnych zmian. Administratorzy mogą oznaczać zmiany jako dostępne do samodzielnego wyboru. Pracownicy widzą tylko zmiany, które nie kolidują z ich istniejącym harmonogramem.
- **Sortowanie wielopoziomowe w widoku Rota (2024-06-12):** Ulepszono funkcjonalność sortowania w widoku tygodniowym. Zaimplementowano trzystopniowy system sortowania: 1) według czasu rozpoczęcia, 2) według czasu zakończenia, 3) alfabetycznie według nazwiska pracownika.
- **Dodano zakładki Rugby/NRC (2024-06-12):** Dodano oddzielne zakładki dla lokalizacji Rugby i NRC na stronie My Rota. System filtruje zmiany według lokalizacji, a wybór użytkownika jest zapisywany między sesjami.
- **Ulepszono sugestie pracowników według czasu zakończenia (2024-06-11):** Ulepszona logika sugestii pracowników, priorytetyzująca osoby, których preferowany czas zakończenia pokrywa się z czasem zakończenia slotu.
- **Naprawiono pozycjonowanie dropdown powiadomień (2024-06-11):** Poprawiono interfejs dropdown powiadomień.
- **Ulepszono zarządzanie lokalizacjami (2024-06-11):** Wzbogacono interfejs o przyciski ikonowe i funkcjonalność usuwania.
- **Dodano ikony dla widoku mobilnego (2024-06-11):** Zastąpiono przyciski tekstowe intuicyjnymi ikonami.
- **Ulepszono interfejs zarządzania agencjami (2024-06-11):** Wzbogacono interfejs o nowoczesne okna dialogowe i powiadomienia.
- **Dodano usuwanie agencji (2024-06-11):** Dodano możliwość trwałego usunięcia agencji w zakładce "Agencies".
- **Dodano zakładkę Locations (2024-06-11):** Utworzono nową zakładkę "Locations" w panelu administracyjnym.
- **Dodano zakładkę Agencies (2024-06-11):** Utworzono nową zakładkę "Agencies" w panelu administracyjnym.
- **Dodano zakładkę Breaks Config (2024-06-11):** Utworzono nową zakładkę "Breaks Config" w panelu administracyjnym.
- **Naprawiono sortowanie slotów w Rota Planner (2024-06-11):** Poprawiono kolejność wyświetlania slotów.

### Maj 2024
- **Dodano zapamiętywanie pozycji przewijania w Rota Planner (2024-05-20):** Zaimplementowano zapamiętywanie pozycji przewijania na stronie Rota Planner.
- **Naprawiono trwałość daty Rota Planner przy odświeżaniu (2024-05-20):** Naprawiono problem, gdzie odświeżanie strony resetowało datę.
- **Trwałość daty Rota Planner (2024-05-17):** Zaimplementowano zapamiętywanie ostatnio przeglądanej daty.
- **Naprawiono automatyczne przewijanie zakładki Ustawienia (2024-05-17):** Naprawiono problem z automatycznym przewijaniem.
- **Naprawiono dropdown powiadomień na urządzeniach mobilnych (2024-05-16):** Ulepszono wyświetlanie dropdown powiadomień.
- **Ulepszono logikę przypisywania przerw (2024-05-16):** Zmodyfikowano funkcjonalność przypisywania przerw.
- **Reorganizacja formatu eksportu według lokalizacji (2024-05-16):** Zmodyfikowano funkcjonalność eksportu CSV i PDF.
- **Ulepszono komunikaty o błędach dla duplikatów slotów (2024-05-15):** Wzbogacono wyświetlanie błędów w modalu Add Slot.
- **Zapobieganie duplikatom slotów (2024-05-15):** Dodano walidację w funkcjonalności Add Slot.
- **Zakładki lokalizacji w Rota Planner (2024-05-14):** Zastąpiono dropdown wyboru lokalizacji systemem zakładek.
- **Usunięto zakładkę Preferences z Settings (2024-05-14):** Usunięto zakładkę Preferences z panelu Settings w Admin Dashboard.
- **Usunięto zakładkę Export z Admin Dashboard (2024-05-14):** Usunięto zakładkę Export z nawigacji Admin Dashboard.
- **Ulepszono format e-maila (2024-05-14):** Zaktualizowano format wiadomości e-mail w funkcji Export schedule.
- **Naprawiono funkcjonalność wysyłania e-maili (2024-05-14):** Naprawiono funkcjonalność wysyłania e-maili.
- **Naprawiono błąd generowania PDF (2024-05-14):** Naprawiono błąd "W.autoTable is not a function".
- **Naprawiono numerowanie stron w PDF (2024-05-14):** Naprawiono niepoprawne numerowanie stron w generowanych PDF-ach.

## Wytyczne dotyczące kodu i UI

- Interfejs powinien być MOBILE-FRIENDLY
- Priorytetem jest prostota, szybkość i czytelność
- Persistent UI State powinien być używany dla poprawy użyteczności
- Modalne okienka powinny mieć czarny tekst na białym tle dla czytelności
- Pola czasowe używają formatu 15-minutowego (00, 15, 30, 45)
- Na widoku mobilnym należy używać minimalnych marginesów
- Kontenery powinny zajmować prawie całą szerokość ekranu na urządzeniach mobilnych

## Standardy kodowania

- Zawsze aktualizuj README.md po zmianach
- Pracuj z istniejącym kodem; nie dodawaj nowych funkcji bez wyraźnego polecenia
- Konsultuj z użytkownikiem wszelkie decyzje projektowe
- Upewnij się, że frontend współpracuje z backendem
- Dostarczaj konkretne, praktyczne rozwiązania