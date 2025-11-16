-- Ajouter une colonne pour les jours de récurrence des plans
ALTER TABLE workout_templates 
ADD COLUMN recurring_days jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workout_templates.recurring_days IS 'Jours de la semaine où le plan doit être automatiquement planifié. Format: [1, 3, 5] pour Lundi, Mercredi, Vendredi (1=Lundi, 7=Dimanche)';