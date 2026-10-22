-- Espace abonnés : les vidéos sont réservées aux formules d'une semaine et plus
--
-- Une vidéo (contenu de type « video ») n'est lisible que si la période d'abonnement en cours compte au moins
-- 7 jours : c'est le cas de toutes les formules d'une semaine et plus (8 jours pour un premier accès d'une
-- semaine avec le jour offert, 7 jours pour une prolongation). La formule d'un jour (2 jours au plus avec le
-- jour offert) garde l'accès à tout le reste, sauf les ouvrages complets.
-- Les vidéos restent visibles dans la bibliothèque (titre et description), avec un cadenas : seul leur
-- fichier est refusé. Sans abonnement en cours, rien ne change : le fichier est déjà refusé.

-- Vrai si l'appelant peut lire les vidéos (formule d'au moins 7 jours en cours, ou administrateur)
create function public.acces_videos() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (public.appareil_autorise() and not public.suspendu() and exists (
    select 1 from public.abonnements a
    where a.user_id = auth.uid() and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin
      and a.fin - a.debut + 1 >= 7));
$$;

-- Fichiers : une vidéo exige en plus une formule d'une semaine et plus, un ouvrage complet une formule d'un mois et plus
create or replace function public.fichier_autorise(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (
      select 1 from public.contenus c
      where c.fichier = chemin and c.publie and c.publie_le <= now()
        and (not public.est_ouvrage(c.matiere) or public.acces_ouvrages())
        and (c.type <> 'video' or public.acces_videos())));
$$;

revoke execute on function public.acces_videos() from public, anon;
grant execute on function public.acces_videos() to authenticated;
