-- Fecha de nacimiento del atleta. El onboarding pedía la edad como número
-- fijo y quedaba vieja; ahora la app manda birth_date y la edad se deriva.
-- Nullable: los perfiles creados antes de esta migración no la tienen.
ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS birth_date DATE;
