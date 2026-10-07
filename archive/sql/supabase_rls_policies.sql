-- Polityki RLS (Row Level Security) dla aplikacji Yard Rota
-- Te polityki umożliwiają każdemu zalogowanemu użytkownikowi widzieć dane innych użytkowników w rocie

-- Włączenie RLS dla tabeli profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Włączenie RLS dla tabeli scheduled_rota
ALTER TABLE scheduled_rota ENABLE ROW LEVEL SECURITY;

-- Polityka dla tabeli profiles - pozwala każdemu zalogowanemu użytkownikowi na odczyt wszystkich profili
CREATE POLICY "Każdy może odczytać dane profilu" ON profiles
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Polityka dla tabeli profiles - użytkownik może edytować tylko swój profil
CREATE POLICY "Użytkownicy mogą edytować tylko swoje profile" ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- Polityka dla tabeli scheduled_rota - pozwala każdemu zalogowanemu użytkownikowi na odczyt wszystkich slotów
CREATE POLICY "Każdy może odczytać dane roty" ON scheduled_rota
FOR SELECT
USING (auth.role() = 'authenticated');

-- Polityka dla tabeli scheduled_rota - ograniczenie edycji slotów do administratorów
CREATE POLICY "Tylko administratorzy mogą zarządzać rotą" ON scheduled_rota
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- UWAGA: Jeśli takie polityki już istnieją, należy je najpierw usunąć:
-- DROP POLICY IF EXISTS "Nazwa istniejącej polityki" ON profiles;
-- DROP POLICY IF EXISTS "Nazwa istniejącej polityki" ON scheduled_rota;

-- Dodatkowe polityki zapewniające dostęp do danych JOIN

-- Polityka dla tabeli locations - wszyscy użytkownicy mogą widzieć lokalizacje
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Każdy może odczytać lokalizacje" ON locations
FOR SELECT
USING (auth.role() = 'authenticated');

-- Polityka dla tabeli availability - użytkownicy mogą widzieć dostępność wszystkich
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Każdy może odczytać dostępność innych" ON availability
FOR SELECT
USING (auth.role() = 'authenticated');

-- Polityka dla tabeli settings - wszyscy użytkownicy mogą odczytywać ustawienia
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Każdy może odczytać ustawienia" ON settings
FOR SELECT
USING (auth.role() = 'authenticated'); 