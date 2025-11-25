-- Create table for system prompts management
CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  prompt_key varchar NOT NULL UNIQUE,
  prompt_content text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read prompts (for now, we'll make them admin-only in the app)
CREATE POLICY "Authenticated users can view prompts"
  ON public.ai_prompts
  FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can manage prompts (admin check in app layer)
CREATE POLICY "Authenticated users can manage prompts"
  ON public.ai_prompts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default prompts for existing AI functions
INSERT INTO public.ai_prompts (prompt_key, prompt_content, description) VALUES
('ai_coach_system', 'Tu es un coach sportif expert spécialisé dans l''entraînement de force et l''hypertrophie. Tu analyses les données d''entraînement des utilisateurs et fournis des recommandations personnalisées basées sur les principes de progression, récupération et prévention des blessures.', 'Prompt système pour le Coach IA'),
('ai_advise_set_system', 'Tu es un assistant d''entraînement qui aide l''utilisateur à décider combien de poids et de répétitions effectuer pour le prochain set, en te basant sur la performance actuelle et les objectifs.', 'Prompt système pour les conseils de série'),
('ai_feedback_progression_system', 'Tu es un coach qui analyse la performance d''une séance d''entraînement complète et propose des ajustements pour la prochaine fois.', 'Prompt système pour le feedback de progression'),
('ai_generate_week_plan_system', 'Tu es un coach sportif expert qui crée des programmes d''entraînement hebdomadaires personnalisés basés sur le profil de l''utilisateur, son historique et ses objectifs.', 'Prompt système pour la génération de programmes hebdomadaires');

-- Create table for AI interactions log (for export)
CREATE TABLE IF NOT EXISTS public.ai_interactions_log (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL,
  function_name varchar NOT NULL,
  prompt text NOT NULL,
  response text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_interactions_log ENABLE ROW LEVEL SECURITY;

-- Users can only view their own logs
CREATE POLICY "Users can view their own AI logs"
  ON public.ai_interactions_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- System can insert logs
CREATE POLICY "System can insert AI logs"
  ON public.ai_interactions_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());