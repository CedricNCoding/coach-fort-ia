-- Table pour stocker les préférences utilisateur par exercice
CREATE TABLE public.user_exercise_preferences (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id BIGINT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  preference VARCHAR NOT NULL CHECK (preference IN ('loved', 'neutral', 'disliked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, exercise_id)
);

-- RLS pour user_exercise_preferences
ALTER TABLE public.user_exercise_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own exercise preferences"
ON public.user_exercise_preferences
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Table pour stocker les conversations avec le coach
CREATE TABLE public.coach_conversations (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS pour coach_conversations
ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own coach conversations"
ON public.coach_conversations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ajouter colonne training_environment à user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN training_environment VARCHAR DEFAULT 'gym' 
CHECK (training_environment IN ('gym', 'home_equipped', 'home_minimal'));