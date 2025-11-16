-- Ensure pgcrypto extension is installed in the 'extensions' schema (default on Lovable Cloud)
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Create or replace get_encryption_key returning text
DROP FUNCTION IF EXISTS public.get_encryption_key();
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    current_setting('app.encryption_key', true),
    'default-encryption-key-change-in-production'
  );
$$;

-- Recreate setter using fully qualified pgcrypto functions
DROP FUNCTION IF EXISTS public.set_user_api_key(uuid, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.set_user_api_key(
  _user_id uuid,
  _api_key text,
  _model_name text DEFAULT 'gpt-4.1-mini',
  _base_url text DEFAULT 'https://api.openai.com/v1/chat/completions',
  _user_role text DEFAULT NULL,
  _user_needs text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.ai_settings (
    user_id,
    api_key,
    model_name,
    base_url,
    user_role,
    user_needs
  ) VALUES (
    _user_id,
    encode(extensions.pgp_sym_encrypt(_api_key, public.get_encryption_key()), 'base64'),
    _model_name,
    _base_url,
    _user_role,
    _user_needs
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    api_key = CASE 
      WHEN _api_key IS NOT NULL AND _api_key != '' 
      THEN encode(extensions.pgp_sym_encrypt(_api_key, public.get_encryption_key()), 'base64')
      ELSE ai_settings.api_key 
    END,
    model_name = COALESCE(_model_name, ai_settings.model_name),
    base_url = COALESCE(_base_url, ai_settings.base_url),
    user_role = COALESCE(_user_role, ai_settings.user_role),
    user_needs = COALESCE(_user_needs, ai_settings.user_needs),
    updated_at = now();
END;
$$;

-- Recreate getter using fully qualified pgcrypto functions
DROP FUNCTION IF EXISTS public.get_user_api_key(uuid);
CREATE OR REPLACE FUNCTION public.get_user_api_key(_user_id uuid)
RETURNS TABLE(api_key text, model_name text, base_url text, user_role text, user_needs text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN ai_settings.api_key IS NOT NULL 
      THEN extensions.pgp_sym_decrypt(decode(ai_settings.api_key, 'base64'), public.get_encryption_key())
      ELSE NULL 
    END,
    ai_settings.model_name,
    ai_settings.base_url,
    ai_settings.user_role,
    ai_settings.user_needs
  FROM public.ai_settings
  WHERE ai_settings.user_id = _user_id;
END;
$$;