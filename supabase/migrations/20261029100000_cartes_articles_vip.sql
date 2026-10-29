-- Espace VIP : « Les articles à savoir par cœur ». Chaque carte porte la référence d'un article et son texte exact,
-- tiré des fiches de révision (citations vérifiées au Journal officiel). Les cartes ne sont lisibles que par les
-- abonnés VIP (acces_vip) ; leur texte n'est pas dans le dépôt public, il est chargé directement en base.
-- La progression suit la méthode des boîtes de la révision du jour (table qcm_progres).

create table public.cartes_articles (
  id bigint generated always as identity primary key,
  fiche integer not null check (fiche between 1 and 9999),
  titre_fiche text not null check (char_length(titre_fiche) <= 200),
  matiere text not null check (char_length(matiere) <= 80),
  concours text[] not null default '{}',
  reference text not null check (char_length(reference) <= 300),
  texte text not null check (char_length(texte) between 5 and 4000),
  ordre integer not null default 0,
  unique (fiche, reference)
);
alter table public.cartes_articles enable row level security;
create policy "cartes_articles : lecture (VIP, admin)" on public.cartes_articles for select to authenticated
  using ((select public.acces_vip()));
grant select on public.cartes_articles to authenticated;

create table public.cartes_progres (
  user_id uuid not null references auth.users (id) on delete cascade,
  carte_id bigint not null references public.cartes_articles (id) on delete cascade,
  boite smallint not null default 0 check (boite between 0 and 5),
  prochaine date not null default public.aujourdhui(),
  bonnes integer not null default 0 check (bonnes >= 0),
  erreurs integer not null default 0 check (erreurs >= 0),
  maj_le timestamptz not null default now(),
  primary key (user_id, carte_id)
);
alter table public.cartes_progres enable row level security;
create policy "cartes_progres : lecture (titulaire, admin)" on public.cartes_progres for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
create policy "cartes_progres : ajout (titulaire VIP)" on public.cartes_progres for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.acces_vip()));
create policy "cartes_progres : modification (titulaire VIP)" on public.cartes_progres for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.acces_vip()));
grant select, insert, update on public.cartes_progres to authenticated;
