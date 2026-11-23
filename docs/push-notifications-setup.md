# Push notifications — kroki tylko dla Michała (Android)

Agent pisze kod. Ty robisz konta i sekrety. **Ta faza: tylko Android** (iOS ewentualnie kiedyś osobno — nie teraz). WhatsApp bez zmian.

**Strefa czasowa:** wszystkie czasy przerw i crona to **UK — `Europe/London`** (nie UTC).

## Co robi agent (nie Ty)

- tabele w Supabase (`device_tokens`, `push_opt_in`, ledger wysyłek), Edge Functions, cron
- Flutter: FCM (Gradle Kotlin DSL), zapis tokenu, **przełącznik włącz/wyłącz w Profile**
- dwa triggery przerwy: **10 minut przed** oraz **w momencie startu** (Europe/London)
- faza 2: push o brakującym pre-checku (osobno od WhatsApp)
- faza 3: digest FCM „dodano Cię do shifta” o **10:00 i 16:00** Europe/London (bez usunięć; oficjalny tydzień zostaje na WhatsAppie w piątek 18:00)

## Co już zrobione

1. Projekt Firebase **`yard-rota`** i aplikacja Android `com.yard.rota`.
2. Plik klienta leży w repo:  
   `apps/yard_rota_flutter/android/app/google-services.json`
3. (Opcjonalnie) druga appka Android `com.yard.rota.dev` w Firebase — przydatna do buildów debug. Jeśli jej nie ma, debug z sufiksem `.dev` może nie dostać FCM.

## Co jeszcze robisz Ty

### 1. Sekret serwera w Supabase

1. Masz już JSON service account (Firebase → Project settings → Service accounts → Generate new private key).
2. **Nie wrzucaj tego pliku do gita.**
3. Supabase → projekt `jkjvtvwedjiupxoibpld` → **Edge Functions → Secrets**.
4. Dodaj sekret o dokładnej nazwie:

```text
FIREBASE_SERVICE_ACCOUNT
```

5. Wartość = **cała zawartość pliku JSON** (jeden ciąg, cały obiekt `{ ... }`).
6. Usuń lokalną kopię JSON albo trzymaj ją poza repo.

### 2. Po wdrożeniu kodu przez agenta

1. Zainstaluj build Android z FCM, zaloguj się.
2. Zaakceptuj powiadomienia systemowe i włącz **Push notifications** w Profile.
3. W Table Editor sprawdź tabelę `device_tokens` (powinien być wiersz z Twoim tokenem).
4. Napisz agentowi — po udanym teście ręcznym włączy cron (czasy w **Europe/London**).

### 3. Rota assignment digests (po migracji + deploy)

1. Migracja `20261123141000_rota_assignment_push_digest.sql` + deploy `send-rota-assignment-push`.
2. Smoke: dodaj shunterowi przyszły slot, wywołaj Edge z service role, sprawdź FCM + wiersz w `rota_assignment_push_sends`.
3. Tap push → **My Rota**.
4. Włącz cron `rota-assignment-push-digest` dopiero po udanym smoke (`cron.alter_job(..., active := true)`).

### 4. Czego nie ruszać

- Twilio / WhatsApp (osobny piątkowy cron tygodnia — patrz `docs/whatsapp-rota-send.md`)
- produkcyjna baza — migracje tylko po Twojej wyraźnej zgodzie
- iOS / Apple Developer (poza tą fazą)
