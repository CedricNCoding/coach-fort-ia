-- Corriger la fonction get_encryption_key pour retourner text au lieu de bytea
-- car pgp_sym_encrypt attend deux paramètres TEXT
DROP FUNCTION IF EXISTS public.get_encryption_key();

CREATE OR REPLACE FUNCTION public.get_encryption_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    current_setting('app.encryption_key', true),
    'default-encryption-key-change-in-production'
  );
$function$;