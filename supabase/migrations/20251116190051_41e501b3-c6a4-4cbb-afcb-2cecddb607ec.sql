-- Mettre à jour la fonction get_user_api_key pour utiliser correctement get_encryption_key
-- qui retourne maintenant text au lieu de bytea
DROP FUNCTION IF EXISTS public.get_user_api_key(uuid);

CREATE OR REPLACE FUNCTION public.get_user_api_key(_user_id uuid)
 RETURNS TABLE(api_key text, model_name text, base_url text, user_role text, user_needs text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN ai_settings.api_key IS NOT NULL 
      THEN pgp_sym_decrypt(decode(ai_settings.api_key, 'base64'), get_encryption_key())
      ELSE NULL 
    END,
    ai_settings.model_name,
    ai_settings.base_url,
    ai_settings.user_role,
    ai_settings.user_needs
  FROM public.ai_settings
  WHERE ai_settings.user_id = _user_id;
END;
$function$;