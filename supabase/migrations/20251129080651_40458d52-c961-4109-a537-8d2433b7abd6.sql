-- Table pour les runs effectués
CREATE TABLE public.runs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  distance_km NUMERIC(6,2) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  avg_heart_rate INTEGER,
  max_heart_rate INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT runs_distance_positive CHECK (distance_km > 0),
  CONSTRAINT runs_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT runs_hr_valid CHECK (avg_heart_rate IS NULL OR (avg_heart_rate > 0 AND avg_heart_rate <= 250)),
  CONSTRAINT runs_max_hr_valid CHECK (max_heart_rate IS NULL OR (max_heart_rate > 0 AND max_heart_rate <= 250))
);

-- Table pour les runs planifiés
CREATE TABLE public.planned_runs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  slot INTEGER NOT NULL DEFAULT 1,
  target_distance_km NUMERIC(6,2),
  target_duration_minutes INTEGER,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'planned',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT planned_runs_slot_valid CHECK (slot >= 1 AND slot <= 3),
  CONSTRAINT planned_runs_status_valid CHECK (status IN ('planned', 'completed', 'skipped'))
);

-- Enable RLS
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for runs
CREATE POLICY "Users can manage their runs"
ON public.runs
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS policies for planned_runs
CREATE POLICY "Users can manage their planned runs"
ON public.planned_runs
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());