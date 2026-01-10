-- Table pour le suivi du poids corporel
CREATE TABLE public.body_weights (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg DECIMAL(5,2) NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les requêtes par utilisateur et date
CREATE INDEX idx_body_weights_user_date ON public.body_weights(user_id, measured_at DESC);

-- Activer RLS
ALTER TABLE public.body_weights ENABLE ROW LEVEL SECURITY;

-- Policies RLS
CREATE POLICY "Users can view their own body weights"
  ON public.body_weights
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own body weights"
  ON public.body_weights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own body weights"
  ON public.body_weights
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own body weights"
  ON public.body_weights
  FOR DELETE
  USING (auth.uid() = user_id);