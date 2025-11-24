-- Ajouter le champ target_rpe (RPE cible) aux exercices de template
ALTER TABLE public.workout_template_exercises 
ADD COLUMN IF NOT EXISTS target_rpe integer;

COMMENT ON COLUMN public.workout_template_exercises.target_rpe IS 'RPE cible pour cet exercice (1-10)';