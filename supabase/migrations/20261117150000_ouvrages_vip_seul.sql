-- Ouvrages réservés au VIP, que l'accès offert (acces_particuliers) n'ouvre jamais. S'ajoutent aux Codes commentés
-- (« …, ouvrage VVIP ») et aux Annales, à la demande de l'administrateur (17 novembre 2026) :
--   Le concours de la magistrature en 1200 dissertations corrigées (tous les volumes)
--   Le concours de la magistrature en 2000 articles commentés (tous les volumes)
--   Guide méthodologique magistrature
-- Même règle dans l'espace abonnés (espace.js, reserveVip).
create or replace function public.ouvrage_reserve_vip(p_titre text, p_matiere text)
returns boolean language sql immutable set search_path to '' as $$
  select coalesce(p_titre ~* '\mVVIP\M', false)
      or coalesce(p_titre ~* '\mannales\M', false) or coalesce(p_matiere ~* '\mannales\M', false)
      or coalesce(p_titre ~* '1200 dissertations corrigées', false)
      or coalesce(p_titre ~* '2000 articles commentés', false)
      or coalesce(p_titre ~* '^guide méthodologique magistrature', false);
$$;
