-- Témoignages d'admis : l'admis remplit le formulaire de la page temoignage/ et coche l'accord de publication (accord
-- écrit, daté). Rien n'est publié avant la validation de l'administrateur ; l'admis peut retirer son accord à tout
-- moment (sur WhatsApp), l'administrateur retire alors le témoignage. Le site n'affiche que le prénom, l'initiale du
-- nom, le concours, l'année et le texte ; le contact sert seulement à vérifier la réussite et l'identité.
create table public.temoignages_admis (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  prenom text not null check (length(prenom) between 1 and 60),
  nom text not null check (length(nom) between 1 and 60),
  contact text not null check (length(contact) between 6 and 254),
  concours text not null check (concours in ('infj', 'greffe', 'penitentiaire', 'eppjej', 'ena', 'autre')),
  annee int not null check (annee between 2000 and 2100),
  detail text check (detail is null or length(detail) <= 120),
  texte text not null check (length(texte) between 40 and 800),
  accord_publication boolean not null check (accord_publication),
  accord_le timestamptz not null default now(),
  publie boolean not null default false,
  publie_le timestamptz,
  retire_le timestamptz
);
alter table public.temoignages_admis enable row level security;
create policy "temoignages_admis : lecture (admin)" on public.temoignages_admis for select to authenticated using ((select public.est_admin()));
create policy "temoignages_admis : modification (admin)" on public.temoignages_admis for update to authenticated using ((select public.est_admin()));
create policy "temoignages_admis : suppression (admin)" on public.temoignages_admis for delete to authenticated using ((select public.est_admin()));
revoke all on public.temoignages_admis from anon, authenticated;
grant select, update, delete on public.temoignages_admis to authenticated;

-- Dépôt depuis la page publique (visiteur non connecté) ; au plus 30 dépôts par heure pour tout le site
create or replace function public.deposer_temoignage(p_prenom text, p_nom text, p_contact text, p_concours text, p_annee int,
  p_detail text, p_texte text, p_accord boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  if not coalesce(p_accord, false) then
    raise exception 'Cochez l''accord de publication pour envoyer votre témoignage.';
  end if;
  if (select count(*) from public.temoignages_admis where cree_le > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de témoignages reçus en une heure. Réessayez plus tard.';
  end if;
  insert into public.temoignages_admis (prenom, nom, contact, concours, annee, detail, texte, accord_publication)
  values (btrim(p_prenom), btrim(p_nom), btrim(p_contact), p_concours, p_annee, nullif(btrim(coalesce(p_detail, '')), ''),
          btrim(p_texte), true);
  return true;
end $$;
revoke all on function public.deposer_temoignage(text, text, text, text, int, text, text, boolean) from public;
grant execute on function public.deposer_temoignage(text, text, text, text, int, text, text, boolean) to anon, authenticated;

-- Témoignages publiés, pour l'accueil : prénom, initiale du nom, concours, année, précision et texte
create or replace function public.temoignages_publies()
returns table (prenom text, initiale text, concours text, annee int, detail text, texte text)
language sql
stable
security definer
set search_path to ''
as $$
  select t.prenom, upper(left(t.nom, 1)), t.concours, t.annee, t.detail, t.texte
  from public.temoignages_admis t
  where t.publie and t.retire_le is null
  order by t.publie_le desc nulls last
  limit 12;
$$;
revoke all on function public.temoignages_publies() from public;
grant execute on function public.temoignages_publies() to anon, authenticated;
