-- Avant-première VIP : un contenu coché « avant-première » s'ouvre aux abonnés VIP dès sa mise en ligne (publie_le)
-- et aux autres abonnés sept jours plus tard. Le contenu reste invisible aux abonnés non VIP pendant ces sept jours
-- (lecture, fichier, recherche dans les textes) et l'e-mail des nouveautés l'annonce le jour où il s'ouvre à tous.

alter table public.contenus add column if not exists avant_premiere boolean not null default false;

-- Date d'ouverture d'un contenu pour l'abonné qui appelle
create or replace function public.contenu_ouvert(p_publie_le timestamptz, p_avant boolean)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_publie_le <= now() - case when p_avant and not public.acces_vip() then interval '7 days' else interval '0 days' end;
$$;
revoke all on function public.contenu_ouvert(timestamptz, boolean) from public, anon;
grant execute on function public.contenu_ouvert(timestamptz, boolean) to authenticated, service_role;

alter policy "contenus : lecture (abonnés en cours, admin)" on public.contenus
  using ((select public.est_admin()) or (publie and public.contenu_ouvert(publie_le, avant_premiere) and (select public.abonnement_actif())
         and (type = any (array['pdf', 'video']) or not public.est_ouvrage(matiere) or (select public.acces_ouvrages()))));

create or replace function public.fichier_autorise(chemin text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (
      select 1 from public.contenus c
      where c.fichier = chemin and c.publie and public.contenu_ouvert(c.publie_le, c.avant_premiere)
        and (not public.est_ouvrage(c.matiere) or public.acces_ouvrages())
        and (c.type <> 'video' or public.acces_videos())
        and (not c.vip or public.acces_vip())));
$$;

create or replace function public.rechercher_textes(p_texte text)
returns table(contenu_id bigint, titre text, matiere text, page integer, extrait text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_requete tsquery;
begin
  if not (public.abonnement_actif() or public.est_admin()) then
    raise exception 'Abonnement requis' using errcode = '42501';
  end if;
  v_requete := websearch_to_tsquery('french', left(coalesce(p_texte, ''), 200));
  if v_requete is null or numnode(v_requete) = 0 then return; end if;
  return query
    select p.contenu_id, c.titre, c.matiere, p.page,
           ts_headline('french', p.texte, v_requete, 'StartSel=[[, StopSel=]], MaxWords=40, MinWords=18, MaxFragments=2, FragmentDelimiter=" … "')
    from public.passages p
    join public.contenus c on c.id = p.contenu_id
    where p.recherche @@ v_requete
      and c.publie and (public.est_admin() or public.contenu_ouvert(c.publie_le, c.avant_premiere))
      and (c.matiere ilike 'Texte officiel%' or c.matiere ilike 'Jurisprudence%')
    order by ts_rank(p.recherche, v_requete) desc, c.titre, p.page
    limit 30;
end $$;

-- E-mail des nouveautés : un contenu en avant-première est annoncé le jour où il s'ouvre à tous
do $$
declare
  v_def text := pg_get_functiondef('public.emails_file()'::regprocedure);
  v_avant text := 'where c.publie and c.publie_le > r.derniere_annonce and c.publie_le <= now();';
  v_apres text := 'where c.publie and c.publie_le + case when c.avant_premiere then interval ''7 days'' else interval ''0 days'' end > r.derniere_annonce
      and c.publie_le + case when c.avant_premiere then interval ''7 days'' else interval ''0 days'' end <= now();';
begin
  if position(v_avant in v_def) = 0 then
    raise exception 'emails_file : requête des nouveautés introuvable';
  end if;
  execute replace(v_def, v_avant, v_apres);
end $$;
