-- Fix search_path for get_encryption_key function
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS bytea
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT decode(coalesce(
    current_setting('app.encryption_key', true),
    'default-encryption-key-change-in-production'
  ), 'escape')::bytea;
$$;