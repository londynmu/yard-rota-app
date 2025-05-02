# Instrukcje aktualizacji bazy danych

Aby naprawić błędy występujące w panelu administratora, należy wykonać następujące kroki:

1. Zaloguj się do panelu administratora Supabase
2. Przejdź do sekcji SQL Editor
3. Utwórz nowy zapytanie i wklej poniższy kod:

```sql
-- Create RPC function to check if user has admin role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS JSONB SECURITY DEFINER
AS $$
DECLARE
  user_role TEXT;
  is_admin BOOLEAN := FALSE;
  user_rec RECORD;
BEGIN
  -- First check if user exists in auth.users
  SELECT role INTO user_role FROM auth.users WHERE id = user_id;
  
  -- Check if user has service_role or is our default admin
  IF user_role = 'service_role' OR EXISTS (
    SELECT 1 FROM auth.users WHERE id = user_id AND email = 'tideend@gmail.com'
  ) THEN
    is_admin := TRUE;
  END IF;
  
  -- Return result as JSONB
  RETURN jsonb_build_object('is_admin', is_admin);
END;
$$ LANGUAGE plpgsql;
```

4. Wykonaj zapytanie klikając przycisk "Run"
5. Po wykonaniu zapytania, odśwież aplikację

## Czy to jest ryzykowne?

Ta zmiana jest bezpieczna z następujących powodów:
1. Dodajemy tylko nową funkcję, nie modyfikujemy istniejących danych ani struktury tabel
2. Funkcja jest oznaczona jako SECURITY DEFINER, co znaczy że będzie działać z uprawnieniami użytkownika, który ją utworzył
3. Funkcja tylko sprawdza role użytkowników i nie wykonuje żadnych operacji modyfikujących dane
4. Zmiany w kodzie aplikacji są defensywne - nawet jeśli funkcja RPC nie zadziała, aplikacja nadal będzie działać poprawnie dzięki mechanizmom awaryjnym 