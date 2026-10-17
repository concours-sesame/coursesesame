-- Agent de révision : recherche des passages pondérée par la rareté des mots.
-- Les mots présents partout (« droit », « pénal », « ivoirien »...) faisaient remonter les sommaires. Désormais,
-- chaque mot du sujet pèse selon sa rareté dans l'ensemble des ouvrages (plafonnée, pour qu'un nom propre isolé ne
-- domine pas) ; les mots présents sur plus d'une page sur cinq sont ignorés ; les pages de sommaire ou de liste
-- numérotée sont pénalisées.

-- Fréquence de chaque mot (nombre de pages qui le contiennent), recalculée après chaque préparation du texte
create materialized view public.passages_lexiques as
  select word as lexeme, ndoc from ts_stat('select recherche from public.passages');
create unique index passages_lexiques_lexeme on public.passages_lexiques (lexeme);
revoke all on public.passages_lexiques from public, anon, authenticated;

create function public.admin_actualiser_lexiques() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  refresh materialized view public.passages_lexiques;
end $$;
revoke all on function public.admin_actualiser_lexiques() from public, anon;
grant execute on function public.admin_actualiser_lexiques() to authenticated;

create or replace function public.rechercher_passages(p_texte text, p_ouvrages boolean, p_matiere text default null, p_nombre integer default 8)
returns table(contenu_id bigint, titre text, matiere text, page integer, texte text, rang real)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_total numeric;
  v_mots text[];
  v_poids numeric[];
  v_requete tsquery;
begin
  select count(*) into v_total from public.passages;
  if v_total = 0 then return; end if;
  select array_agg(m.lexeme order by m.poids desc), array_agg(m.poids order by m.poids desc) into v_mots, v_poids
  from (select l.lexeme, least(ln(v_total / l.ndoc), ln(v_total / 15)) as poids
        from (select distinct t.lexeme from unnest(to_tsvector('french', left(coalesce(p_texte, ''), 8000))) t
              where char_length(t.lexeme) >= 3) q
        join public.passages_lexiques l on l.lexeme = q.lexeme
        where l.ndoc <= v_total * 0.2
        order by 2 desc
        limit 100) m;
  if v_mots is null then return; end if;
  v_requete := array_to_string(array(select quote_literal(x) from unnest(v_mots) x), ' | ')::tsquery;
  return query
    select p.contenu_id, c.titre, c.matiere, p.page, p.texte,
           ((select sum(u.w) from unnest(v_mots, v_poids) as u(x, w) where p.recherche @@ quote_literal(u.x)::tsquery)
             * case when (select count(*) from regexp_matches(p.texte, '(^|\n)\s*\d{1,4}[ .]', 'g')) > 8
                      or char_length(p.texte) - char_length(replace(p.texte, '....', '')) > 40 then 0.3 else 1 end
             * case when p_matiere is not null and c.matiere ilike '%' || p_matiere || '%' then 1.3 else 1 end)::real as rang
    from public.passages p
    join public.contenus c on c.id = p.contenu_id
    where p.recherche @@ v_requete
      and c.publie and c.publie_le <= now()
      and (p_ouvrages or not public.est_ouvrage(c.matiere))
    order by rang desc
    limit least(greatest(p_nombre, 1), 20);
end $$;
revoke all on function public.rechercher_passages(text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.rechercher_passages(text, boolean, text, integer) to service_role;
