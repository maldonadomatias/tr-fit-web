-- Extend users table with role
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'athlete'
  CHECK (role IN ('athlete', 'coach', 'admin'));

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Athlete profiles
CREATE TABLE IF NOT EXISTS athlete_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  age INT NOT NULL CHECK (age BETWEEN 12 AND 100),
  height_cm INT NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
  weight_kg NUMERIC(5, 2) NOT NULL CHECK (weight_kg BETWEEN 30 AND 250),
  level TEXT NOT NULL CHECK (level IN ('principiante', 'intermedio', 'avanzado')),
  goal TEXT NOT NULL CHECK (goal IN ('hipertrofia', 'fuerza', 'recomp')),
  days_per_week INT NOT NULL CHECK (days_per_week BETWEEN 3 AND 6),
  equipment TEXT NOT NULL CHECK (equipment IN
    ('gym_completo', 'gym_basico', 'casa_basica', 'solo_bw')),
  injuries TEXT[] NOT NULL DEFAULT '{}',
  coach_id UUID REFERENCES users(id),
  onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athlete_profiles_coach ON athlete_profiles(coach_id);

-- Coach profiles
CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT
);
