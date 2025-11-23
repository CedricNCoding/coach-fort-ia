-- Table pour la mémoire du Coach IA
CREATE TABLE IF NOT EXISTS public.ai_coach_memory (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index sur user_id pour performance
CREATE INDEX IF NOT EXISTS idx_ai_coach_memory_user_id ON public.ai_coach_memory(user_id);

-- RLS : chaque utilisateur ne peut voir que sa propre mémoire
ALTER TABLE public.ai_coach_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own coach memory"
ON public.ai_coach_memory
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION public.update_ai_coach_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_coach_memory_updated_at
BEFORE UPDATE ON public.ai_coach_memory
FOR EACH ROW
EXECUTE FUNCTION public.update_ai_coach_memory_updated_at();