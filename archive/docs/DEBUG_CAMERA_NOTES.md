## Camera issues – debug + fixes (Feb 2026)

### Symptomy
- Web/PWA (systemowy aparat z `<input capture>`) po „OK” wracał na główną / gubił stan, brak miniaturki.
- Dodanie kolejnego zdjęcia nadpisywało poprzednie.
- Na Android (Capacitor) występował reload WebView po powrocie z aparatu.

### Główne przyczyny
- `initialize()` w `PreCheckPage` wywoływał `setLoading(true)` przy każdej reinit -> `DuringShiftReport` odmontowywał się w trakcie zwrotu z aparatu.
- `onImagesChange` używane z funkcją (prev => [...prev, ...new]) trafiało do handlerów oczekujących tablicy -> stan był nadpisywany.
- Brak trwałego przechowania zdjęć na czas reloadu WebView (systemowy aparat zabijał stronę).
- Brak importu `InlineWebCamera` (crash po kliknięciu „Take Photo” w pewnym etapie).

### Kluczowe poprawki (stan na koniec debug)
- `PreCheckPage`: `setLoading(true)` tylko przy pierwszym init (ref `initializedRef`), logi step/setStep.
- `ImageUpload`: 
  - Zapis pełnej listy zdjęć do `sessionStorage.pending_photos` jako `dataUrl` (append, nie nadpisuj).
  - Odczyt `pending_photos` przy starcie i ponowne podanie do `processAndAddFiles` (bez kasowania).
  - `onImagesChange(prev => [...prev, ...newImages])` + logi; konwersja na `dataUrl` po kompresji.
- `PreCheckForm`: handlery zdjęć przyjmują funkcje lub tablice; używają aktualizacji funkcyjnej, więc kolejne zdjęcia nie nadpisują poprzednich.
- Systemowy aparat na web pozostawiony (input capture); mechanizm `pending_photos` chroni przed reloadem.

### Logika utrzymania zdjęć
1. Po `processAndAddFiles` cała lista (`merged`) trafia do `pending_photos` (array of `{name,dataUrl}`).
2. Przy mount `ImageUpload`:
   - Odczyt `pending_photos`; próba konwersji do File; `processAndAddFiles`.
   - `pending_photos` nie jest czyszczone automatycznie (pozostaje jako kopia awaryjna).
3. React state aktualizowany funkcyjnie, by uniknąć utraty poprzednich elementów.

### Debug instrumentation (pozostawione)
- Żółty panel DEBUG w `ImageUpload` (localStorage `_dbg_log`).
- Logi w `PreCheckPage` (initialize/start/end, render branch).
- Logi w `DuringShiftReport` (mount/unmount, setImages).
- Logi w `ImageUpload` (processAndAddFiles, pending read/write).

### Lekcje na przyszłość
- Przy `input capture` na mobile/Chromium liczyć się z reloadem WebView: trzeba trwale zapisywać zdjęcia (dataUrl) i stan kroku (`sessionStorage`).
- Gdy `onImagesChange` może być funkcją, wszystkie handlery rodzica muszą akceptować funkcję, inaczej dojdzie do nadpisania.
- Unikać ponownego `setLoading(true)` na reinit – trzymać komponenty w montażu podczas powrotu z aparatu.
- Przy debugowaniu na urządzeniu bez dostępu do lokalnego serwera logów: logować do localStorage i pokazywać panel diagnostyczny.

### Co pozostawić
- Mechanizm `pending_photos` (ochrona przed reloadem po systemowym aparacie).
- Instrumentację można usunąć po potwierdzeniu stabilności, ale do kolejnych problemów warto mieć tę procedurę pod ręką.
