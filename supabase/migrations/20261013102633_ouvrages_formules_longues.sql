-- Espace abonnés : les ouvrages complets sont réservés aux formules d'un mois et plus
--
-- Un ouvrage complet est un contenu dont la matière commence par « Ouvrage » (comme pour la rubrique
-- « Ouvrages complets » de la bibliothèque). Il n'est lisible que si la période d'abonnement en cours
-- compte au moins 28 jours : c'est le cas de toutes les formules d'un mois et plus (28 à 31 jours pour
-- « 1 mois »), et d'aucune formule courte (« 2 semaines » compte 15 jours avec le jour offert).
-- Les formules courtes gardent l'accès à tout le reste : corrigés, QCM, vidéos, fiches.
-- Les ouvrages en PDF ou en vidéo restent visibles dans la bibliothèque (titre et description), avec
-- un cadenas : seul leur fichier est refusé. Un ouvrage saisi en texte ou en lien est masqué.

create function public.est_ouvrage(p_matiere text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_matiere ilike 'Ouvrage%', false);
$$;

-- Vrai si l'appelant peut lire les ouvrages complets (formule d'au moins 28 jours en cours, ou administrateur)
create function public.acces_ouvrages() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (public.appareil_autorise() and exists (
    select 1 from public.abonnements a
    where a.user_id = auth.uid() and public.aujourdhui() between a.debut and a.fin
      and a.fin - a.debut + 1 >= 28));
$$;

-- Fichiers : ceux d'un ouvrage complet exigent en plus une formule d'un mois et plus
create or replace function public.fichier_autorise(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (
      select 1 from public.contenus c
      where c.fichier = chemin and c.publie
        and (not public.est_ouvrage(c.matiere) or public.acces_ouvrages())));
$$;

alter policy "contenus : lecture (abonnés en cours, admin)" on public.contenus
  using ((select public.est_admin()) or (
    publie and (select public.abonnement_actif())
    and (type in ('pdf', 'video') or not public.est_ouvrage(matiere) or (select public.acces_ouvrages()))));

revoke execute on function public.est_ouvrage(text), public.acces_ouvrages() from public, anon;
grant execute on function public.est_ouvrage(text), public.acces_ouvrages() to authenticated;
