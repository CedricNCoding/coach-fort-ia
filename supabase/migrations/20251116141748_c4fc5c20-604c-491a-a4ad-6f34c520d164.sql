-- Ajouter le champ superset_rest_seconds pour gérer le temps de repos par superset
ALTER TABLE workout_template_exercises
ADD COLUMN superset_rest_seconds integer;

-- Mettre à jour les exercices existants : copier target_rest_seconds vers superset_rest_seconds pour les exercices en superset
UPDATE workout_template_exercises
SET superset_rest_seconds = target_rest_seconds
WHERE superset_group IS NOT NULL;