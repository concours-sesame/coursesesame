-- Parrainage : chaque compte a un code (6 caractères, sans lettres ni chiffres ambigus). Le filleul l'indique à
-- l'inscription (fonction « inscription », qui enregistre profils.parrain_id). Au premier abonnement payé du filleul,
-- la base offre 7 jours au parrain : une période gratuite (montant 0, moyen « Parrainage ») ajoutée à la suite de son
-- abonnement en cours, ou à partir du jour même. Une seule récompense par filleul (table parrainages).

create function public.nouveau_code_parrain() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

alter table public.profils add column code_parrain text unique default public.nouveau_code_parrain();
update public.profils set code_parrain = public.nouveau_code_parrain() where code_parrain is null;
alter table public.profils alter column code_parrain set not null;
alter table public.profils add column parrain_id uuid references public.profils (id) on delete set null
  check (parrain_id is null or parrain_id <> id);

create table public.parrainages (
  filleul_id uuid primary key references public.profils (id) on delete cascade,
  parrain_id uuid not null references public.profils (id) on delete cascade,
  abonnement_id bigint references public.abonnements (id) on delete set null,
  cree_le timestamptz not null default now()
);
alter table public.parrainages enable row level security;
create policy "parrainages : lecture (admin ou parrain)" on public.parrainages for select to authenticated
  using ((select public.est_admin()) or parrain_id = (select auth.uid()));
revoke all on public.parrainages from anon, authenticated;
grant select on public.parrainages to authenticated;

create function public.recompenser_parrain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parrain uuid;
  v_filleul text;
  v_debut date;
  v_id bigint;
begin
  if new.montant is null or new.montant <= 0 or new.supprime_le is not null then return new; end if;
  select p.parrain_id, trim(p.prenom || ' ' || p.nom) into v_parrain, v_filleul from public.profils p where p.id = new.user_id;
  if v_parrain is null then return new; end if;
  if exists (select 1 from public.parrainages x where x.filleul_id = new.user_id) then return new; end if;
  if exists (select 1 from public.abonnements a where a.user_id = new.user_id and a.id <> new.id and a.montant > 0 and a.supprime_le is null) then return new; end if;
  v_debut := greatest(public.aujourdhui(),
    coalesce((select max(a.fin) + 1 from public.abonnements a where a.user_id = v_parrain and a.supprime_le is null), public.aujourdhui()));
  insert into public.abonnements (user_id, debut, fin, montant, moyen, note, cree_par)
  values (v_parrain, v_debut, v_debut + 6, 0, 'Parrainage', left('7 jours offerts, parrainage de ' || v_filleul, 200), new.cree_par)
  returning id into v_id;
  insert into public.parrainages (filleul_id, parrain_id, abonnement_id) values (new.user_id, v_parrain, v_id);
  return new;
end $$;
revoke all on function public.recompenser_parrain() from public, anon, authenticated;
create trigger abonnements_parrainage after insert on public.abonnements
  for each row execute function public.recompenser_parrain();

-- Nombre de filleuls récompensés, pour l'abonné (encadré « Parrainez un ami »)
create function public.mes_parrainages() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.parrainages where parrain_id = auth.uid();
$$;
revoke all on function public.mes_parrainages() from public, anon;
grant execute on function public.mes_parrainages() to authenticated;
