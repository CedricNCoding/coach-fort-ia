-- Create user profiles table for AI week planning
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  age integer,
  level varchar,
  goal varchar,
  sessions_per_week integer,
  available_days jsonb DEFAULT '[]'::jsonb,
  equipment text,
  constraints text,
  session_duration_minutes integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their profile"
  ON public.user_profiles
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());