-- Ajouter un champ video_url à la table exercises pour stocker les liens YouTube
ALTER TABLE public.exercises 
ADD COLUMN video_url TEXT;