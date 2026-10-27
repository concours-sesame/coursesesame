-- Textes de lois relevés sur loidici.biz (rubrique « Lois article par article », codes, conventions internationales,
-- Code de la construction, Code foncier urbain), pour la rédaction des fiches de révision. Tables privées : RLS active
-- sans aucune politique, lecture par le service seulement. Les questions-réponses, tests et commentaires du site,
-- œuvre de sa propriétaire, ne sont pas relevés. Le relevé se fait côté base : pg_net interroge l'API WordPress du site
-- (une requête par page de 100 articles, notée dans sources_loidici_requetes), puis loidici_verser() range les réponses.
-- Les citations des fiches se vérifient ensuite dans le texte officiel (passages) : loidici ajoute parfois une virgule
-- ou un chiffre entre parenthèses, et ses pages consolidées ne suivent pas toujours les lois modificatives.
create table if not exists public.sources_loidici (
  id integer primary key,
  titre text not null,
  rubriques text[] not null default '{}',
  lien text,
  publie_le timestamptz,
  modifie_le timestamptz,
  texte text not null,
  releve_le timestamptz not null default now()
);
alter table public.sources_loidici enable row level security;
revoke all on public.sources_loidici from anon, authenticated;
create index if not exists sources_loidici_texte_idx on public.sources_loidici
  using gin (to_tsvector('french', titre || ' ' || texte));

-- Page de l'API (1 à 59 pour les articles, 1001 et suivantes pour les rubriques) et requête pg_net correspondante
create table if not exists public.sources_loidici_requetes (
  page integer primary key,
  requete bigint not null
);
alter table public.sources_loidici_requetes enable row level security;
revoke all on public.sources_loidici_requetes from anon, authenticated;

create table if not exists public.sources_loidici_rubriques (id integer primary key, nom text not null);
alter table public.sources_loidici_rubriques enable row level security;
revoke all on public.sources_loidici_rubriques from anon, authenticated;

-- HTML vers texte : sauts de ligne, balises retirées, entités décodées.
create or replace function public.loidici_texte(h text) returns text
language plpgsql immutable set search_path = public as $$
declare t text; m text[];
begin
  t := regexp_replace(coalesce(h,''), '<br\s*/?>|</p>|</h[1-6]>|</li>|</tr>', E'\n', 'gi');
  t := regexp_replace(t, '<[^>]+>', '', 'g');
  for m in select regexp_matches(t, '&#(\d+);', 'g') loop
    t := replace(t, '&#'||m[1]||';', chr(m[1]::int));
  end loop;
  for m in select regexp_matches(t, '&#x([0-9a-fA-F]+);', 'g') loop
    t := replace(t, '&#x'||m[1]||';', chr(('x'||lpad(m[1],8,'0'))::bit(32)::int));
  end loop;
  t := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(t,
        '&nbsp;',' '),'&lt;','<'),'&gt;','>'),'&quot;','"'),'&laquo;','«'),'&raquo;','»'),
        '&rsquo;','’'),'&hellip;','…'),'&eacute;','é'),'&amp;','&');
  t := regexp_replace(t, '[ \t ]+', ' ', 'g');
  t := regexp_replace(t, '\n\s*\n+', E'\n', 'g');
  return btrim(t, E' \n');
end $$;

-- Verse dans sources_loidici les réponses reçues par pg_net (pages d'articles seulement).
create or replace function public.loidici_verser() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into sources_loidici(id, titre, rubriques, lien, publie_le, modifie_le, texte)
  select (p->>'id')::int,
         loidici_texte(p->'title'->>'rendered'),
         coalesce((select array_agg(r.nom order by r.nom) from jsonb_array_elements_text(p->'categories') c
                   join sources_loidici_rubriques r on r.id = c::int), '{}'),
         p->>'link', (p->>'date')::timestamptz, (p->>'modified')::timestamptz,
         loidici_texte(p->'content'->>'rendered')
  from sources_loidici_requetes q
  join net._http_response h on h.id = q.requete and h.status_code = 200
  cross join lateral jsonb_array_elements(h.content::jsonb) p
  where q.page < 1000
  on conflict (id) do update set titre = excluded.titre, rubriques = excluded.rubriques,
    lien = excluded.lien, modifie_le = excluded.modifie_le, texte = excluded.texte, releve_le = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.loidici_verser() from public, anon, authenticated;
