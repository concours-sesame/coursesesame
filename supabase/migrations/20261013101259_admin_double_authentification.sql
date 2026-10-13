-- Administration : validation en deux étapes (code à 6 chiffres d'une application d'authentification)
--
-- Supabase Auth gère les facteurs TOTP (table auth.mfa_factors) et porte le niveau de la session dans le
-- jeton : « aal1 » après le mot de passe, « aal2 » après le code. Dès qu'un administrateur a activé un
-- facteur, ses droits d'administrateur ne valent qu'avec une session « aal2 » : un mot de passe volé ne
-- suffit plus. Tant qu'aucun facteur n'est activé, rien ne change.
-- est_admin() sert à toutes les règles d'accès et fonctions d'administration : la règle s'applique partout.

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'));
$$;
