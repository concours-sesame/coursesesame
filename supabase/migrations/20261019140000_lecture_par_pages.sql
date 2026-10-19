-- Lecture et téléchargement des PDF par pages filigranées, sans jamais livrer le fichier d'origine aux abonnés.
-- La fonction Edge « pages » découpe le document (morceaux de 20 pages rangés dans « exclusif/pages/... »),
-- imprime la signature de l'abonné dans chaque page puis la transforme en image : le filigrane ne peut pas être
-- retiré. Lecture à l'écran : 300 pages différentes par jour au plus. Téléchargement : règles de
-- 20261019120000_telechargement_pages (5 % du total sur 7 jours, 15 pages par document).

-- ---------------------------------------------------------------------------
-- 1. Plus de lien direct vers les PDF pour les abonnés (les vidéos gardent leurs liens temporaires)
-- ---------------------------------------------------------------------------

create function public.fichier_direct_autorise(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (
    public.fichier_autorise(chemin)
    and exists (select 1 from public.contenus c where c.fichier = chemin and c.type = 'video'));
$$;
revoke all on function public.fichier_direct_autorise(text) from public, anon;
grant execute on function public.fichier_direct_autorise(text) to authenticated;

alter policy "exclusif : lecture (fichiers autorisés)" on storage.objects
  using (bucket_id = 'exclusif' and public.fichier_direct_autorise(name));

-- ---------------------------------------------------------------------------
-- 2. Nombre de pages de chaque document (rempli par la fonction Edge à la première lecture)
-- ---------------------------------------------------------------------------

create table public.documents_pages (
  contenu_id bigint primary key references public.contenus (id) on delete cascade,
  fichier text not null,
  nb integer not null check (nb > 0),
  maj_le timestamptz not null default now()
);
alter table public.documents_pages enable row level security;
revoke all on public.documents_pages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pages lues à l'écran : une ligne par page différente et par jour (heure d'Abidjan)
-- ---------------------------------------------------------------------------

create table public.pages_lues (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null default public.aujourdhui(),
  contenu_id bigint not null references public.contenus (id) on delete cascade,
  page integer not null check (page >= 1),
  lu_le timestamptz not null default now(),
  primary key (user_id, jour, contenu_id, page)
);
alter table public.pages_lues enable row level security;
create policy "pages_lues : lecture (titulaire, admin)" on public.pages_lues for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
revoke all on public.pages_lues from anon, authenticated;
grant select on public.pages_lues to authenticated;

-- Les téléchargements ne s'écrivent que par la fonction Edge
revoke insert, update, delete, truncate on public.telechargements from anon, authenticated;

create function public.lecture_plafond() returns integer
language sql immutable set search_path = '' as $$ select 300 $$;
grant execute on function public.lecture_plafond() to authenticated, service_role;

-- Enregistre une page lue (fonction Edge seulement). Une page déjà lue aujourd'hui ne compte pas deux fois.
-- Renvoie le nombre de pages encore lisibles aujourd'hui ; refuse au-delà du plafond.
create function public.noter_page_lue(p_user uuid, p_contenu bigint, p_page integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_jour date := public.aujourdhui();
  v_nb integer;
begin
  perform pg_advisory_xact_lock(hashtext('lecture:' || p_user::text));
  select count(*) into v_nb from public.pages_lues where user_id = p_user and jour = v_jour;
  if exists (select 1 from public.pages_lues where user_id = p_user and jour = v_jour and contenu_id = p_contenu and page = p_page) then
    return greatest(public.lecture_plafond() - v_nb, 0);
  end if;
  if v_nb >= public.lecture_plafond() then
    raise exception 'Vous avez lu % pages aujourd''hui, le maximum par jour. La lecture reprend demain.', public.lecture_plafond()
      using errcode = 'P0001';
  end if;
  insert into public.pages_lues (user_id, jour, contenu_id, page) values (p_user, v_jour, p_contenu, p_page);
  return public.lecture_plafond() - v_nb - 1;
end $$;
revoke all on function public.noter_page_lue(uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.noter_page_lue(uuid, bigint, integer) to service_role;

-- Pages lues aujourd'hui par l'abonné connecté
create function public.mes_pages_lues() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('lues', count(*), 'plafond', public.lecture_plafond())
  from public.pages_lues where user_id = auth.uid() and jour = public.aujourdhui();
$$;
revoke all on function public.mes_pages_lues() from public, anon;
grant execute on function public.mes_pages_lues() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Administration : téléchargements et lectures par abonné
-- ---------------------------------------------------------------------------

create function public.admin_telechargements(p_jours integer default 60)
returns table (id bigint, user_id uuid, prenom text, nom text, telephone text, contenu_id bigint, titre text,
               pages integer[], nb integer, cree_le timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select t.id, t.user_id, p.prenom, p.nom, p.telephone, t.contenu_id, t.titre, t.pages, t.nb, t.cree_le
    from public.telechargements t left join public.profils p on p.id = t.user_id
    where t.cree_le > now() - make_interval(days => least(greatest(p_jours, 1), 400))
    order by t.cree_le desc
    limit 2000;
end $$;
revoke all on function public.admin_telechargements(integer) from public, anon;
grant execute on function public.admin_telechargements(integer) to authenticated;

create function public.admin_pages_lues(p_jours integer default 30)
returns table (user_id uuid, jour date, contenu_id bigint, titre text, pages bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select l.user_id, l.jour, l.contenu_id, c.titre, count(*)
    from public.pages_lues l join public.contenus c on c.id = l.contenu_id
    where l.jour > public.aujourdhui() - least(greatest(p_jours, 1), 400)
    group by l.user_id, l.jour, l.contenu_id, c.titre
    order by l.jour desc;
end $$;
revoke all on function public.admin_pages_lues(integer) from public, anon;
grant execute on function public.admin_pages_lues(integer) to authenticated;
