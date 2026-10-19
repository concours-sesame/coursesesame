-- Recherche des abonnés dans les textes officiels et la jurisprudence (rubriques sans plafond de lecture).
-- Elle porte sur le texte préparé pour l'agent de révision (table « passages ») et ne renvoie qu'un court extrait
-- autour des mots trouvés, avec le numéro de page : l'abonné ouvre ensuite le document à cette page. Les ouvrages et
-- les autres contenus n'y figurent jamais. Réservée aux abonnés en cours et à l'administrateur.

create function public.rechercher_textes(p_texte text)
returns table (contenu_id bigint, titre text, matiere text, page integer, extrait text)
language plpgsql stable security definer set search_path = '' as $$
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
      and c.publie and c.publie_le <= now()
      and (c.matiere ilike 'Texte officiel%' or c.matiere ilike 'Jurisprudence%')
    order by ts_rank(p.recherche, v_requete) desc, c.titre, p.page
    limit 30;
end $$;
revoke all on function public.rechercher_textes(text) from public, anon;
grant execute on function public.rechercher_textes(text) to authenticated;
