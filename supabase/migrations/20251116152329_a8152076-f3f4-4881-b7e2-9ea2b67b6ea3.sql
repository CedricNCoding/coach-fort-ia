-- Ajouter les colonnes pour le rôle et les besoins de l'utilisateur dans ai_settings
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS user_role TEXT,
ADD COLUMN IF NOT EXISTS user_needs TEXT;