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

### Maj 2024
- **Nowy scentralizowany system powiadomień (2024-05-09):** Zaimplementowano `ToastContext` oraz komponent `Toast.jsx`, które zapewniają nowoczesne, animowane powiadomienia wyświetlane dokładnie na środku ekranu z efektem rozmycia tła. Komunikaty znikają po 2 s i są dostępne globalnie w aplikacji (wstrzyknięte w `main.jsx`).
  - Nowe pliki: `src/components/ui/ToastContext.jsx`, `src/components/ui/Toast.jsx`
  - Zmienione pliki: `tailwind.config.js` (dodano animację `fade-scale`), `src/main.jsx`, `src/components/Admin/Rota/RotaManager.jsx`
- **AssignModal – zakładka Other Locations (2024-05-09):** Dodano nową zakładkę, która wyświetla wszystkich pracowników z innych lokalizacji (również niedostępnych). Zaktualizowano logikę filtrowania oraz widok mobilny/desktop.
  - Zmienione pliki: `src/components/Admin/Rota/AssignModal.jsx`
- **Assign Task – automatyczne zerowanie pola (2024-05-09):** Po przypisaniu pracownika pole "Assign Task" jest automatycznie czyszczone, a lista sugestii zamykana.
  - Zmienione pliki: `src/components/Admin/Rota/AssignModal.jsx`
- **Podział ekranu Export & Send Weekly Schedule na 4-krokowy kreator (2024-05-09):** Komponent `ExportRota.jsx` został przebudowany – teraz użytkownik przechodzi przez kolejne kroki (1) wybór tygodnia i pobranie danych, (2) pobieranie plików CSV/PDF, (3) wybór agencji, (4) edycja wiadomości e-mail i wysłanie. Dodano pasek postępu oraz przyciski "Back/Next". Logika generowania plików i otwierania mailto: nie zmieniła się.
- **Ulepszony interfejs pobierania plików w Export & Send (2024-05-09):** Zastąpiono domyślny mechanizm pobierania przeglądarki niestandardowym modalem pobierania plików w komponencie `ExportRota.jsx`. Zamiast automatycznego pobierania plików CSV/PDF, użytkownicy widzą teraz stylizowany, spójny z resztą aplikacji modal z przyciskiem do pobierania pliku.
- **Ulepszony interfejs pobierania PDF w My Rota (2024-05-09):** Zastąpiono domyślny mechanizm potwierdzenia przeglądarki (confirm) po pobraniu PDF w widoku My Rota niestandardowym modalem w stylu aplikacji. Nowy modal pokazuje nazwę pobranego pliku, zakres dat i oferuje przyciski do zamknięcia lub udostępnienia przez WhatsApp.
- **Ujednolicony format PDF w My Rota (2024-05-09):** Zoptymalizowano format generowanego PDF w widoku My Rota, zgodnie ze standardami firmowymi. PDF wyświetla dane w formie przejrzystej tabeli z nazwiskami pracowników w wierszach i dniami tygodnia w kolumnach. Zmiany obejmują: prosty format godzin (HH:MM-HH:MM), wyśrodkowany tekst w komórkach, nazwy zadań pod godzinami, nagłówki z nazwami dni i datami, naprzemienne kolorowanie wierszy oraz stopkę z numeracją stron.
- **Zmieniono format wyświetlania czasu na 24h (2024-05-09):** Zmodyfikowano format wyświetlania czasu w całej aplikacji z 12-godzinnego (AM/PM) na 24-godzinny. Zmiana objęła komponenty TodaysShiftInfo i ShiftDashboard, zapewniając spójny format wyświetlania czasu w całej aplikacji.
  - Zmienione pliki: `src/components/User/TodaysShiftInfo.jsx`, `src/components/User/ShiftDashboard.jsx`
- **Ulepszono obsługę nocnych zmian (2024-05-09):** Przebudowano logikę obliczania czasu w komponencie TodaysShiftInfo oraz ShiftDashboard, aby poprawnie obsługiwać zmiany nocne przekraczające północ. Zmodyfikowano funkcje `isShiftNow`, `getShiftProgress` i `getTimeRemaining` aby prawidłowo obliczać postęp i pozostały czas dla zmian nocnych. Pasek postępu i status "ACTIVE" teraz poprawnie działają dla wszystkich typów zmian.
  - Zmienione pliki: `src/components/User/TodaysShiftInfo.jsx`, `src/components/User/ShiftDashboard.jsx`
- **Ulepszono modal udostępniania w My Rota (2024-05-09):** Zastąpiono natywne okno dialogowe `confirm` niestandardowym modalem wyboru formatu udostępniania (tekstowy lub PDF) w widoku `My Rota` na urządzeniach mobilnych. Nowy modal jest spójny wizualnie z resztą aplikacji.
  - Zmienione pliki: `src/pages/WeeklyRotaPage.jsx`
- **Ulepszono wybór daty w eksporcie grafiku (2024-05-09):** W modal "Export & Send Weekly Schedule", domyślna data jest teraz ustawiana na najbliższą sobotę. Dodatkowo, w kalendarzu można wybrać tylko soboty; inne dni są wyszarzone i nieaktywne. Zastąpiono standardowy `input[type="date"]` komponentem `react-datepicker`.
  - Zmienione pliki: `src/components/Admin/ExportRota.jsx`
- **Dodano ikonę kalendarza do DatePicker w eksporcie (2024-05-09):** W komponencie `ExportRota.jsx`, do pola wyboru daty (`react-datepicker`) dodano widoczną ikonę kalendarza, umieszczoną wewnątrz pola po prawej stronie.
  - Zmienione pliki: `src/components/Admin/ExportRota.jsx`
- **Rozszerzono modal eksportu i ulepszono kalendarz (2024-05-09):** Zwiększono rozmiar modalu eksportu grafiku i poprawiono wyświetlanie kalendarza, aby był w pełni widoczny. Ikona kalendarza została zmieniona na białą dla lepszej widoczności na ciemnym tle. Dodano style CSS zapewniające prawidłowe wyświetlanie kalendarza i wyraźne oznaczenie tylko dni sobotnich jako dostępnych do wyboru.
  - Zmienione pliki: `src/components/Admin/ExportRota.jsx`

### Czerwiec 2024
- **Dodano widget informujący o dzisiejszej zmianie (2024-06-20):** Zaimplementowano widget "Today's Shift" na stronie głównej, który pokazuje szczegółowe informacje o zmianie użytkownika zaplanowanej na dzisiejszy dzień. Widget wyświetla godziny rozpoczęcia i zakończenia, lokalizację, typ zmiany oraz status (aktywna/nieaktywna). W przypadku aktywnej zmiany widoczny jest czas pozostały do jej zakończenia oraz informacje o nadchodzących lub trwających przerwach. Komponent automatycznie odświeża się co 15 minut i jest w pełni responsywny.
  - Nowe pliki: `src/components/User/TodaysShiftInfo.jsx`
  - Zmienione pliki: `src/pages/CalendarPage.jsx`, `tailwind.config.js`
- **Dodano udostępnianie PDF przez WhatsApp (2024-06-17):** Dodano możliwość generowania i udostępniania harmonogramu w formacie PDF przez WhatsApp. PDF zawiera uporządkowany i sformatowany harmonogram w orientacji poziomej, z podziałem na dni i typy zmian. Funkcja ta pozwala na łatwiejsze czytanie i drukowanie grafików przez odbiorców. Dodano dwa przyciski udostępniania (tekst i PDF) na desktopie oraz jeden przycisk z opcjami na urządzeniach mobilnych.
  - Zmienione pliki: `src/pages/WeeklyRotaPage.jsx`
- **Ulepszone filtry typów zmian w widoku My Rota (2024-06-16):** Zmodyfikowano układ filtrów typów zmian (dniówka/popołudnie/noc) w widoku My Rota. Filtry zostały przeniesione do tej samej linii co nawigacja dat i wybór lokalizacji, co poprawia ergonomię interfejsu i pozwala na szybsze przełączanie między różnymi widokami.
  - Zmienione pliki: `src/pages/WeeklyRotaPage.jsx`
- **Dodano filtrowanie według typów zmian (2024-06-16):** Dodano nowe zakładki do filtrowania zmian według typu (dniówka/popołudnie/noc) w widoku My Rota na komputerach. Umożliwia to łatwe przeglądanie tylko wybranych typów zmian. Wybór użytkownika jest zapisywany między sesjami.
  - Zmienione pliki: `src/pages/WeeklyRotaPage.jsx`
- **Ulepszono widok przypisywania pracowników (2024-06-16):** Zmodyfikowano interfejs AssignModal, aby oddzielać pracowników według preferencji zmian. Pracownicy preferujący zmianę aktualnie przypisywaną są pokazywani domyślnie w zakładce "Available", a pracownicy preferujący inne zmiany są dostępni w nowej zakładce "Other Shifts". Zmiana ta ułatwia przypisywanie pracowników zgodnie z ich preferencjami, jednocześnie zachowując możliwość przypisania każdego dostępnego pracownika.
  - Zmienione pliki: `src/components/Admin/Rota/AssignModal.jsx`
- **Usunięto funkcjonalność Available Shifts (2024-06-15):** Usunięto stronę Available Shifts i wszystkie związane z nią komponenty. Funkcjonalność samodzielnego zgłaszania się do zmian została tymczasowo wyłączona.
  - Zmienione pliki: `src/pages/AvailableShiftsPage.jsx` (usunięty), `src/components/HomePage.jsx` (usunięto nawigację i routing)
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