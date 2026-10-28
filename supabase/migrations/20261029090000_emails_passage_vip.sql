-- E-mail « Votre espace VIP est ouvert » : envoyé par la fonction emails (tâche des 15 minutes) quand un abonné
-- devient VIP en cours d'abonnement, soit par « Passer en VIP » (journal : vip_ajoute), soit par l'activation
-- d'une période VIP alors qu'il n'était pas VIP. La toute première période d'un compte reçoit déjà l'e-mail de
-- bienvenue, qui parle de l'espace VIP. Fenêtre de deux jours, comme l'e-mail de bienvenue.

create or replace function public.emails_file_vip()
returns table(type text, cle text, user_id uuid, email text, prenom text, donnees jsonb)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  return query
    -- « Passer en VIP » dans l'administration
    select 'passage_vip'::text, 'j' || j.id::text, j.cible, u.email::text, p.prenom,
           jsonb_build_object('fin', (select max(b.fin) from public.abonnements b
                                      where b.user_id = j.cible and b.supprime_le is null and b.vip and b.fin >= public.aujourdhui()))
    from public.journal_admin j
    join auth.users u on u.id = j.cible
    join public.profils p on p.id = j.cible
    where j.action = 'vip_ajoute' and j.quand > now() - interval '2 days'
      -- une seule fois pour plusieurs périodes passées en VIP d'un même geste
      and not exists (select 1 from public.journal_admin k where k.cible = j.cible and k.action = 'vip_ajoute'
                      and k.id < j.id and k.quand > j.quand - interval '1 minute')
      and exists (select 1 from public.abonnements b where b.user_id = j.cible and b.supprime_le is null and b.vip and b.fin >= public.aujourdhui())
      and not exists (select 1 from public.emails_envoyes e where e.user_id = j.cible and e.type = 'passage_vip'
                      and e.cle = 'j' || j.id::text and (e.statut <> 'erreur' or e.tentatives >= 3));
  return query
    -- Activation d'une période VIP pour un abonné qui n'était pas VIP
    select 'passage_vip'::text, 'a' || a.id::text, a.user_id, u.email::text, p.prenom,
           jsonb_build_object('fin', a.fin, 'debut', a.debut)
    from public.abonnements a
    join auth.users u on u.id = a.user_id
    join public.profils p on p.id = a.user_id
    where a.vip and a.supprime_le is null and a.cree_le > now() - interval '2 days'
      and exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.cree_le < a.cree_le)
      and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.cree_le < a.cree_le
                      and b.vip and b.fin >= (a.cree_le at time zone 'Africa/Abidjan')::date)
      and not exists (select 1 from public.emails_envoyes e where e.user_id = a.user_id and e.type = 'passage_vip'
                      and e.cle = 'a' || a.id::text and (e.statut <> 'erreur' or e.tentatives >= 3));
end $$;

revoke all on function public.emails_file_vip() from public, anon, authenticated;
grant execute on function public.emails_file_vip() to service_role;

-- Nouveau type d'envoi
alter table public.emails_envoyes drop constraint emails_envoyes_type_check,
  add constraint emails_envoyes_type_check check (type = any (array['bienvenue', 'rappel_fin', 'nouveautes', 'inactif', 'essai', 'campagne',
    'hebdo', 'alerte_demande', 'alerte_compte', 'renouvellement', 'passage_vip']));
