-- ============================================
-- Strong Coach IA - Tables principales
-- Base de données MySQL-friendly (pas d'ENUM natif, booléens en SMALLINT)
-- ============================================

-- Table exercises : bibliothèque d'exercices (builtin + utilisateur)
CREATE TABLE IF NOT EXISTS public.exercises (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  muscle_group VARCHAR(255),
  equipment VARCHAR(255),
  notes TEXT,
  is_builtin SMALLINT DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  default_rest_seconds INT DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour éviter les doublons d'exercices utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_user_name 
ON public.exercises(user_id, name) 
WHERE is_builtin = 0;

-- Index pour les requêtes par user
CREATE INDEX IF NOT EXISTS idx_exercises_user_id 
ON public.exercises(user_id);

-- Table workout_templates : Plans d'entraînement (PLAN)
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  goal VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_templates_user_id 
ON public.workout_templates(user_id);

-- Table workout_template_exercises : exercices inclus dans un Plan (avec supersets)
CREATE TABLE IF NOT EXISTS public.workout_template_exercises (
  id BIGSERIAL PRIMARY KEY,
  workout_template_id BIGINT NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_id BIGINT NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  superset_group VARCHAR(100),
  target_sets INT DEFAULT 3,
  target_reps_min INT DEFAULT 6,
  target_reps_max INT DEFAULT 12,
  target_weight_kg DECIMAL(6,2),
  target_difficulty_note VARCHAR(255),
  target_rest_seconds INT,
  is_active SMALLINT DEFAULT 1 CHECK (is_active IN (0, 1)),
  next_target_weight_kg DECIMAL(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_exercises_template_order 
ON public.workout_template_exercises(workout_template_id, order_index);

-- Table planned_workouts : calendrier des séances planifiées (2 slots max/jour)
CREATE TABLE IF NOT EXISTS public.planned_workouts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot INT NOT NULL CHECK (slot IN (1, 2)),
  workout_template_id BIGINT REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'skipped', 'adjusted')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contrainte unique : un seul planned_workout par (user_id, date, slot)
CREATE UNIQUE INDEX IF NOT EXISTS idx_planned_workouts_user_date_slot 
ON public.planned_workouts(user_id, date, slot);

-- Table sessions : séances réellement réalisées
CREATE TABLE IF NOT EXISTS public.sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planned_workout_id BIGINT REFERENCES public.planned_workouts(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  total_tonnage DECIMAL(10,2),
  avg_difficulty DECIMAL(4,2),
  ai_feedback TEXT,
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'aborted')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_started 
ON public.sessions(user_id, started_at DESC);

-- Table session_sets : séries réalisées dans une séance
CREATE TABLE IF NOT EXISTS public.session_sets (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  exercise_id BIGINT NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  template_exercise_id BIGINT REFERENCES public.workout_template_exercises(id) ON DELETE SET NULL,
  set_index INT NOT NULL,
  reps INT NOT NULL,
  weight_kg DECIMAL(6,2) NOT NULL,
  perceived_difficulty INT CHECK (perceived_difficulty >= 1 AND perceived_difficulty <= 10),
  pain SMALLINT DEFAULT 0 CHECK (pain IN (0, 1)),
  pain_notes TEXT,
  is_warmup SMALLINT DEFAULT 0 CHECK (is_warmup IN (0, 1)),
  actual_rest_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_sets_session_exercise 
ON public.session_sets(session_id, exercise_id);

-- Table ai_settings : Réglages IA par utilisateur
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT,
  model_name VARCHAR(255) DEFAULT 'gpt-4.1-mini',
  base_url VARCHAR(255) DEFAULT 'https://api.openai.com/v1/chat/completions',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table progression_log : historique des ajustements du programme
CREATE TABLE IF NOT EXISTS public.progression_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id BIGINT NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  template_exercise_id BIGINT REFERENCES public.workout_template_exercises(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  old_sets INT,
  old_reps_min INT,
  old_reps_max INT,
  old_weight_kg DECIMAL(6,2),
  new_sets INT,
  new_reps_min INT,
  new_reps_max INT,
  new_weight_kg DECIMAL(6,2),
  reason TEXT,
  source VARCHAR(50) CHECK (source IN ('ai', 'deterministic'))
);

CREATE INDEX IF NOT EXISTS idx_progression_log_user_exercise 
ON public.progression_log(user_id, exercise_id, changed_at DESC);

-- ============================================
-- RLS Policies : toutes les données filtrées par user_id
-- ============================================

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_template_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_log ENABLE ROW LEVEL SECURITY;

-- Exercises : utilisateur peut voir les siens + builtin
CREATE POLICY "Users can view their exercises and builtin"
ON public.exercises FOR SELECT
USING (user_id = auth.uid() OR is_builtin = 1);

CREATE POLICY "Users can insert their own exercises"
ON public.exercises FOR INSERT
WITH CHECK (user_id = auth.uid() AND is_builtin = 0);

CREATE POLICY "Users can update their own exercises"
ON public.exercises FOR UPDATE
USING (user_id = auth.uid() AND is_builtin = 0);

CREATE POLICY "Users can delete their own exercises"
ON public.exercises FOR DELETE
USING (user_id = auth.uid() AND is_builtin = 0);

-- Workout templates
CREATE POLICY "Users can manage their workout templates"
ON public.workout_templates FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Workout template exercises : accès via le template
CREATE POLICY "Users can manage their template exercises"
ON public.workout_template_exercises FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workout_templates wt
    WHERE wt.id = workout_template_id AND wt.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workout_templates wt
    WHERE wt.id = workout_template_id AND wt.user_id = auth.uid()
  )
);

-- Planned workouts
CREATE POLICY "Users can manage their planned workouts"
ON public.planned_workouts FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Sessions
CREATE POLICY "Users can manage their sessions"
ON public.sessions FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Session sets : accès via la session
CREATE POLICY "Users can manage their session sets"
ON public.session_sets FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  )
);

-- AI settings
CREATE POLICY "Users can manage their ai settings"
ON public.ai_settings FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Progression log
CREATE POLICY "Users can view their progression log"
ON public.progression_log FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert progression log"
ON public.progression_log FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ============================================
-- Exercices builtin par défaut
-- ============================================

INSERT INTO public.exercises (user_id, name, muscle_group, equipment, is_builtin, default_rest_seconds, notes)
VALUES
  (NULL, 'Squat', 'Jambes', 'Barre', 1, 180, 'Roi des exercices de jambes'),
  (NULL, 'Développé couché', 'Pectoraux', 'Barre', 1, 120, 'Exercice de base pour les pectoraux'),
  (NULL, 'Soulevé de terre', 'Dos', 'Barre', 1, 180, 'Exercice complet du dos et jambes'),
  (NULL, 'Développé militaire', 'Épaules', 'Barre', 1, 120, 'Pour développer les épaules'),
  (NULL, 'Rowing barre', 'Dos', 'Barre', 1, 120, 'Épaisseur du dos'),
  (NULL, 'Tractions', 'Dos', 'Poids du corps', 1, 120, 'Largeur du dos'),
  (NULL, 'Dips', 'Pectoraux/Triceps', 'Poids du corps', 1, 90, 'Exercice polyarticulaire'),
  (NULL, 'Curl barre', 'Biceps', 'Barre', 1, 60, 'Isolation biceps'),
  (NULL, 'Extension triceps', 'Triceps', 'Poulie', 1, 60, 'Isolation triceps'),
  (NULL, 'Leg curl', 'Ischio-jambiers', 'Machine', 1, 90, 'Isolation ischio-jambiers'),
  (NULL, 'Leg extension', 'Quadriceps', 'Machine', 1, 90, 'Isolation quadriceps'),
  (NULL, 'Presse à cuisses', 'Jambes', 'Machine', 1, 150, 'Alternative au squat')
ON CONFLICT DO NOTHING;