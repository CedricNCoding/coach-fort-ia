-- Cast returned columns to text to match RETURNS TABLE types
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
    END::text,
    ai_settings.model_name::text,
    ai_settings.base_url::text,
    ai_settings.user_role::text,
    ai_settings.user_needs::text
  FROM public.ai_settings
  WHERE ai_settings.user_id = _user_id;
END;
$$;