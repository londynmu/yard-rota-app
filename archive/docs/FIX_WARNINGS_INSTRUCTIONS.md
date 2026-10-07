# Supabase Linter Warnings - Instructions

## ✅ Status: Główne błędy (ERROR) naprawione!

Wszystkie krytyczne błędy bezpieczeństwa zostały naprawione:
- ✅ View `user_availability` - usunięto SECURITY DEFINER
- ✅ Tabela `monthly_shunter_awards` - włączono RLS
- ✅ Tabela `imported_reports` - włączono RLS

---

## ⚠️ Pozostałe ostrzeżenia (WARN level)

### 🔧 1. Function Search Path Mutable (9 funkcji)

**Problem**: Funkcje z `SECURITY DEFINER` ale bez `SET search_path = ''` są podatne na "search path attacks".

**Ryzyko**: 🟡 Średnie - atakujący może podmienić schemat i przejąć kontrolę

**Funkcje do naprawienia**:
1. `update_shunter_performance_timestamp` ✅ **NAPRAWIONE w kodzie**
2. `get_most_visited_pages` ✅ **NAPRAWIONE w kodzie**
3. `get_page_visits_by_hour` ✅ **NAPRAWIONE w kodzie**
4. `get_page_visits_by_day` ✅ **NAPRAWIONE w kodzie**
5. `get_user_page_visits` ✅ **NAPRAWIONE w kodzie**
6. `get_detailed_login_history` ✅ **NAPRAWIONE w kodzie**
7. `get_active_users_by_timerange` ✅ **NAPRAWIONE w kodzie**
8. `create_temp_user` ⏳ (jeśli istnieje)
9. `update_user_profile` ⏳ (jeśli istnieje)

**✨ Łatwa naprawa - wykonaj w Supabase SQL Editor:**

```bash
# Plik do wykonania:
fix_function_search_paths.sql
```

Ten skrypt:
- ✅ Naprawia wszystkie 7 funkcji z page tracking
- ✅ Naprawia funkcję update_shunter_performance_timestamp
- ✅ Sprawdza czy create_temp_user i update_user_profile istnieją
- ✅ Pokazuje status po naprawie

**Po wykonaniu** uruchom ponownie linter - te ostrzeżenia powinny zniknąć! 🎯

---

### 🔌 2. Extension `pg_net` w schemacie public

**Problem**: Rozszerzenie `pg_net` jest zainstalowane w schemacie `public`.

**Ryzyko**: 🟢 Niskie - głównie problem organizacyjny

**Co to jest**: `pg_net` to rozszerzenie Supabase do wysyłania HTTP requests z bazy danych.

**Dlaczego to problem?**
- Schemat `public` jest dostępny dla wszystkich użytkowników
- Lepiej trzymać rozszerzenia w dedykowanych schematach (np. `extensions`)

**Czy trzeba naprawiać?** 
- ❌ **NIE** - to jest wbudowane rozszerzenie Supabase
- ⚠️ Przenoszenie rozszerzeń może zepsuć istniejące funkcje
- 💡 Supabase zaleca zostawienie tego jak jest, jeśli już działa

**Jak naprawić (jeśli naprawdę chcesz)**:
```sql
-- UWAGA: To może zepsuć istniejące funkcje!
-- Nie wykonuj bez backup'u!

ALTER EXTENSION pg_net SET SCHEMA extensions;
```

**Rekomendacja**: ⏸️ **POMIŃ to ostrzeżenie** - nie warte ryzyka.

---

### 🔐 3. Auth OTP Long Expiry

**Problem**: OTP (One Time Password) w emailach wygasa po więcej niż 1 godzinie.

**Ryzyko**: 🟡 Średnie - dłuższy czas na atak brute-force

**Gdzie zmienić**:
1. Otwórz [Supabase Dashboard](https://app.supabase.com)
2. Przejdź do **Authentication** → **Providers**
3. Kliknij **Email** provider
4. Znajdź sekcję **OTP Expiry**
5. Zmień na **3600 sekund (1 godzina)** lub mniej
6. Kliknij **Save**

**Zalecane wartości**:
- ✅ **3600s (1h)** - dobry balans między bezpieczeństwem a wygodą
- ✅ **1800s (30min)** - bardziej bezpieczne
- ⚠️ **600s (10min)** - bardzo bezpieczne, ale użytkownicy mogą się skarżyć

**Rekomendacja**: 🔧 **Zmień na 3600s (1h)**

---

### 🛡️ 4. Leaked Password Protection Disabled

**Problem**: Ochrona przed skompromitowanymi hasłami jest wyłączona.

**Ryzyko**: 🟡 Średnie - użytkownicy mogą używać zhackowanych haseł

**Co to jest**: Supabase sprawdza hasła w bazie [HaveIBeenPwned](https://haveibeenpwned.com/Passwords) - jeśli hasło było w leaku, blokuje rejestrację.

**Gdzie włączyć**:
1. Otwórz [Supabase Dashboard](https://app.supabase.com)
2. Przejdź do **Authentication** → **Providers**
3. Przewiń do sekcji **Password Settings**
4. Znajdź **Leaked Password Protection**
5. Włącz checkbox ✅
6. Kliknij **Save**

**Co się zmieni**:
- ✅ Użytkownicy nie będą mogli używać popularnych/zhackowanych haseł
- ✅ Automatyczna walidacja przy rejestracji i zmianie hasła
- ⚠️ Użytkownicy z słabymi hasłami będą musieli je zmienić

**Rekomendacja**: 🔧 **WŁĄCZ to od razu!** - zero negatywnych skutków, duży zysk dla bezpieczeństwa.

---

### 📦 5. Vulnerable Postgres Version

**Problem**: Aktualna wersja PostgreSQL (15.8.1.073) ma dostępne patche bezpieczeństwa.

**Ryzyko**: 🟡 Średnie - znane luki bezpieczeństwa

**Gdzie zaktualizować**:
1. Otwórz [Supabase Dashboard](https://app.supabase.com)
2. Przejdź do **Settings** → **Database**
3. Znajdź sekcję **Database Version**
4. Kliknij **Upgrade** (jeśli dostępne)
5. **UWAGA**: Upgrade wymaga **krótką przerwę** (downtime 1-2 minuty)

**Przed upgrade'em**:
- ✅ Zrób backup bazy danych (Settings → Backups)
- ✅ Zaplanuj upgrade w czasie małego ruchu (np. noc)
- ✅ Poinformuj użytkowników o krótkim maintenance window

**Rekomendacja**: 🔧 **Zaplanuj upgrade** - zrób to w weekend lub po godzinach.

---

## 📊 Podsumowanie prioritetów

### 🔴 Wysokie (zrób teraz):
1. ✅ **Function search paths** - wykonaj `fix_function_search_paths.sql`
2. ✅ **Leaked Password Protection** - włącz w Dashboard (2 minuty)

### 🟡 Średnie (zrób w tym tygodniu):
3. 🔧 **OTP Expiry** - zmień na 1h w Dashboard (1 minuta)
4. 🔧 **Postgres Upgrade** - zaplanuj upgrade na weekend

### 🟢 Niskie (opcjonalne):
5. ⏸️ **pg_net extension** - zostaw jak jest (nie warte ryzyka)

---

## 🚀 Quick Start - Napraw wszystko w 5 minut!

### Krok 1: Funkcje (2 min)
```bash
# Otwórz Supabase SQL Editor
# Skopiuj zawartość fix_function_search_paths.sql
# Wklej i wykonaj (RUN)
```

### Krok 2: Auth Settings (3 min)
1. Dashboard → **Authentication** → **Providers** → **Email**
2. **OTP Expiry**: zmień na `3600` sekund
3. **Leaked Password Protection**: włącz ✅
4. **Save**

### Krok 3: Weryfikacja
```bash
# Dashboard → Database → Linter → Run Linter
```

**Oczekiwany wynik po naprawieniu**:
- ✅ Function warnings: **ZNIKNĘŁY** (0 ostrzeżeń)
- ✅ Auth OTP: **ZNIKNĘŁO**
- ✅ Leaked passwords: **ZNIKNĘŁO**
- ⚠️ pg_net extension: **pozostaje** (OK, pomijamy)
- ⚠️ Postgres version: **pozostaje** (zaplanuj upgrade później)

---

## 📝 Pliki do wykonania

### Teraz (krytyczne):
- ✅ `fix_function_search_paths.sql` - naprawia wszystkie funkcje

### Już wykonane:
- ✅ `fix_security_issues.sql` - naprawił RLS i view (już wykonany!)
- ✅ `fix_user_availability_view_quick.sql` - naprawił view (już wykonany!)

---

## ❓ FAQ

**Q: Czy muszę naprawić wszystkie ostrzeżenia?**  
A: Nie, tylko wysokie i średnie priority. Extension w public i stara wersja PostgreSQL to nice-to-have.

**Q: Czy to zerwie działanie aplikacji?**  
A: Nie! Dodanie `SET search_path = ''` do funkcji nie zmienia ich działania, tylko zwiększa bezpieczeństwo.

**Q: Czy mogę wykonać te skrypty na produkcji?**  
A: Tak, są bezpieczne. Ale zawsze dobrze mieć backup.

**Q: Co jeśli coś pójdzie nie tak?**  
A: Funkcje można łatwo odtworzyć - ich definicje są w plikach `sql/`. View można usunąć i stworzyć ponownie.

**Q: Czy linter zniknie po naprawie?**  
A: Tak! Ostrzeżenia o funkcjach i auth znikną. Pozostaną tylko pg_net i postgres version (które możesz zignorować).

---

## 🎯 Następne kroki

1. ✅ Wykonaj `fix_function_search_paths.sql` w Supabase
2. ✅ Włącz Leaked Password Protection w Dashboard
3. ✅ Zmień OTP Expiry na 1h
4. ✅ Uruchom linter ponownie - sprawdź efekty
5. 📅 Zaplanuj Postgres upgrade na weekend
6. 🎉 Gotowe!

---

**Czas naprawy**: ~5 minut  
**Poziom trudności**: 🟢 Łatwy  
**Ryzyko**: 🟢 Bardzo niskie






