-- Sauvegarde automatique : chaque dimanche à 3 h (heure d'Abidjan), une photographie des tables essentielles est
-- gardée dans le schéma privé « sauvegardes » (jamais exposé par l'API), les 8 dernières seulement. Elle protège
-- contre une erreur de manipulation (abonnement ou contenu supprimé, profil modifié), pas contre la perte du projet :
-- la sauvegarde hors de Supabase reste celle de tools/sauvegarde.sql et tools/sauvegarde.py (README).
-- Ne sont pas copiés : le texte préparé pour l'agent (passages, se refait depuis l'administration), les journaux de
-- connexion et de lecture, les fichiers PDF.
-- Huit emplacements (numéro de la semaine modulo 8) réutilisés à tour de rôle : la photographie de la semaine remplace
-- celle d'il y a huit semaines, sans suppression.
-- Restauration : lire sauvegardes.instantanes.donnees -> '<table>' (tableau JSON des lignes), puis réinsérer avec
-- jsonb_populate_recordset.

create schema if not exists sauvegardes;
revoke all on schema sauvegardes from public, anon, authenticated;

create table sauvegardes.instantanes (
  id bigint generated always as identity primary key,
  pris_le timestamptz not null default now(),
  donnees jsonb not null,
  emplacement smallint unique check (emplacement between 0 and 7)
);
revoke all on sauvegardes.instantanes from public, anon, authenticated;

create function sauvegardes.prendre() returns smallint
language plpgsql security definer set search_path = '' as $$
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
    'emails_reglages', (select jsonb_agg(x) from public.emails_reglages x))
  on conflict (emplacement) do update set pris_le = excluded.pris_le, donnees = excluded.donnees;
  return v_place;
end $$;
revoke all on function sauvegardes.prendre() from public, anon, authenticated;

select cron.schedule('sauvegarde-hebdomadaire', '0 3 * * 0', 'select sauvegardes.prendre()');
select sauvegardes.prendre();
