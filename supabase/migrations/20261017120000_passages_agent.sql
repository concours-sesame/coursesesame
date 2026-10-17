-- Agent de révision, première étape : texte des contenus exclusifs, page par page, pour la recherche.
-- Le texte est extrait par la page d'administration (dans le navigateur de l'administrateur) puis enregistré ici.
-- Réservé à l'administrateur : les abonnés n'y ont aucun accès direct.

create table public.passages (
  id bigint generated always as identity primary key,
  contenu_id bigint not null references public.contenus (id) on delete cascade,
  page integer not null check (page >= 1),
  texte text not null check (char_length(texte) <= 20000),
  recherche tsvector generated always as (to_tsvector('french', texte)) stored,
  unique (contenu_id, page)
);
comment on table public.passages is 'Texte des contenus exclusifs, une ligne par page (PDF) ou par partie (fiche). Texte vide : page sans texte lisible (image scannée).';
create index passages_recherche on public.passages using gin (recherche);
alter table public.passages enable row level security;
create policy "passages : admin" on public.passages for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
grant select, insert, update, delete on public.passages to authenticated;

-- Bilan par contenu : pages enregistrées, pages sans texte lisible, nombre de caractères
create function public.admin_bilan_passages()
returns table(contenu_id bigint, pages integer, pages_vides integer, caracteres bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select p.contenu_id, count(*)::integer,
           (count(*) filter (where char_length(btrim(p.texte)) < 40))::integer,
           sum(char_length(p.texte))::bigint
    from public.passages p
    group by p.contenu_id;
end $$;
revoke all on function public.admin_bilan_passages() from public, anon;
grant execute on function public.admin_bilan_passages() to authenticated;
