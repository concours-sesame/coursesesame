-- La sauvegarde hebdomadaire couvre aussi les concours blancs : les épreuves en libre accès avec leurs corrigés
-- (epreuves_blanches), les concours chronométrés et les copies des candidats.
create or replace function sauvegardes.prendre()
 returns smallint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_place smallint := (extract(week from now())::int % 8)::smallint;
begin
  insert into sauvegardes.instantanes (emplacement, pris_le, donnees) select v_place, now(), jsonb_build_object(
    'utilisateurs', (select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'cree_le', u.created_at)) from auth.users u),
    'profils', (select jsonb_agg(x) from public.profils x),
    'admins', (select jsonb_agg(x) from public.admins x),
    'abonnements', (select jsonb_agg(x) from public.abonnements x),
    'suspensions', (select jsonb_agg(x) from public.suspensions x),
    'parrainages', (select jsonb_agg(x) from public.parrainages x),
    'contenus', (select jsonb_agg(x) from public.contenus x),
    'grand_oral', (select jsonb_agg(x) from public.grand_oral x),
    'annonces', (select jsonb_agg(x) from public.annonces x),
    'commandes', (select jsonb_agg(x) from public.commandes x),
    'notes_abonnes', (select jsonb_agg(x) from public.notes_abonnes x),
    'qcm_progres', (select jsonb_agg(x) from public.qcm_progres x),
    'agent_echanges', (select jsonb_agg(x) from public.agent_echanges x),
    'agent_consignes', (select jsonb_agg(x) from public.agent_consignes x),
    'agent_reglages', (select jsonb_agg(x) from public.agent_reglages x),
    'emails_reglages', (select jsonb_agg(x) from public.emails_reglages x),
    'epreuves_blanches', (select jsonb_agg(x) from public.epreuves_blanches x),
    'concours_blancs', (select jsonb_agg(x) from public.concours_blancs x),
    'copies_blanc', (select jsonb_agg(x) from public.copies_blanc x))
  on conflict (emplacement) do update set pris_le = excluded.pris_le, donnees = excluded.donnees;
  return v_place;
end $function$;
