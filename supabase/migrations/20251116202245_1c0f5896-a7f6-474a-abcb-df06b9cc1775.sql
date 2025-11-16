-- Ajouter les colonnes pour gérer les semaines de décharge
ALTER TABLE public.planned_workouts 
ADD COLUMN is_deload BOOLEAN DEFAULT FALSE,
ADD COLUMN deload_factor NUMERIC DEFAULT 0.75;

COMMENT ON COLUMN public.planned_workouts.is_deload IS 'Indique si cette séance fait partie d''une semaine de décharge';
COMMENT ON COLUMN public.planned_workouts.deload_factor IS 'Facteur de réduction pour la décharge (ex: 0.75 = 75% du volume/charge normal)';