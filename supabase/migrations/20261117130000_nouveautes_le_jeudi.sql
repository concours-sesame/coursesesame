-- Annonce des nouveautés regroupée une fois par semaine, le jeudi (avec le récapitulatif du lundi, deux e-mails
-- par semaine au plus). Avant, la vidéo du jour faisait partir une annonce chaque matin.
-- Les contenus mis en ligne depuis la dernière annonce s'additionnent jusqu'au jeudi suivant.
-- La relance d'inactivité garde exactement sa règle d'avant : elle ne part que les jours sans aucune nouveauté
-- (variable v_tous), et non les jours où l'annonce attend le jeudi.
do $migration$
declare
  d text := pg_get_functiondef('public.emails_file'::regproc);
  n text;
begin
  n := replace(d, E'  v_contenus jsonb;\n', E'  v_contenus jsonb;\n  v_tous jsonb;\n');
  n := replace(n, E'      into v_contenus\n    from public.contenus c', E'      into v_tous\n    from public.contenus c');
  n := replace(n, E'  end if;\n  return query\n    select ''bienvenue''::text',
    E'  end if;\n  -- Annonce des nouveautés : le jeudi seulement (récapitulatif le lundi)\n  v_contenus := case when extract(isodow from v_jour) = 4 then v_tous end;\n  return query\n    select ''bienvenue''::text');
  n := replace(n, 'and not v_lundi and v_contenus is null then', 'and not v_lundi and v_tous is null then');
  if n = d or position('v_tous jsonb;' in n) = 0 or position('into v_tous' in n) = 0
     or position('v_contenus := case when extract(isodow' in n) = 0 or position('v_tous is null then' in n) = 0 then
    raise exception 'emails_file : modification incomplète, rien n''est changé';
  end if;
  execute n;
end
$migration$;
