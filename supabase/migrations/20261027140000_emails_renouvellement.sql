-- Invitation à renouveler, dix jours avant la fin de l'abonnement (fonction emails, type « renouvellement ») :
-- abonnés qui acceptent les e-mails d'information, sans abonnement plus long à la suite, ni suspension.
alter table public.emails_envoyes drop constraint emails_envoyes_type_check;
alter table public.emails_envoyes add constraint emails_envoyes_type_check check (type = any (array['bienvenue', 'rappel_fin',
  'nouveautes', 'inactif', 'essai', 'campagne', 'hebdo', 'alerte_demande', 'alerte_compte', 'renouvellement']));

-- Ajout du bloc dans emails_file, avant la relance d'inactivité (le reste de la fonction est inchangé)
do $migration$
declare
  d text := pg_get_functiondef('public.emails_file'::regproc);
  bloc text := $bloc$  -- Invitation à renouveler : dix jours avant la fin, en journée
  if v_journee then
    return query
      select 'renouvellement'::text, a.id::text, a.user_id, u.email::text, p.prenom,
             jsonb_build_object('fin', a.fin, 'jeton', p.jeton_emails,
               'nouveaux', (select count(*) from public.contenus c where c.publie and c.publie_le > a.debut::timestamptz and c.publie_le <= now()),
               'titres', coalesce((select jsonb_agg(t.titre) from (select c.titre from public.contenus c
                  where c.publie and c.publie_le > a.debut::timestamptz and c.publie_le <= now() order by c.publie_le desc limit 3) t), '[]'::jsonb))
      from public.abonnements a
      join auth.users u on u.id = a.user_id
      join public.profils p on p.id = a.user_id
      where a.supprime_le is null and a.fin = v_jour + 10 and a.debut <= v_jour and p.emails_nouveautes
        and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.fin > a.fin)
        and not exists (select 1 from public.suspensions s where s.user_id = a.user_id and s.fin is null)
        and not exists (select 1 from public.admins ad where ad.user_id = a.user_id)
        and not exists (select 1 from public.emails_envoyes e where e.user_id = a.user_id and e.type = 'renouvellement' and e.cle = a.id::text
          and (e.statut <> 'erreur' or e.tentatives >= 3));
  end if;
$bloc$;
  repere text := '  -- Relance d''inactivité';
begin
  if position('''renouvellement''' in d) > 0 then
    return;
  end if;
  if position(repere in d) = 0 then
    raise exception 'Repère introuvable dans emails_file';
  end if;
  execute replace(d, repere, bloc || repere);
end
$migration$;
