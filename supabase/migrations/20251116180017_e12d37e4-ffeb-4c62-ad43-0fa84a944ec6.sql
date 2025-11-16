-- Add measurement type to exercises table
ALTER TABLE public.exercises 
ADD COLUMN measurement_type VARCHAR DEFAULT 'reps' CHECK (measurement_type IN ('reps', 'time'));

-- Add time fields to workout_template_exercises
ALTER TABLE public.workout_template_exercises 
ADD COLUMN target_time_seconds INTEGER;

-- Add time field to session_sets
ALTER TABLE public.session_sets 
ADD COLUMN time_seconds INTEGER;

-- Add comments for clarity
COMMENT ON COLUMN public.exercises.measurement_type IS 'Type of measurement: reps (repetitions) or time (seconds)';
COMMENT ON COLUMN public.workout_template_exercises.target_time_seconds IS 'Target time in seconds for time-based exercises';
COMMENT ON COLUMN public.session_sets.time_seconds IS 'Actual time in seconds for time-based exercises';