-- Suivi des contacts et relance des inscrits.
-- 1) Contacts (prospects : fiche offerte, test de niveau) qui ont accepté les conseils et offres et donné un e-mail :
--    trois e-mails, à 1, 3 et 7 jours (prospects.suivi_etape 0 -> 3). Arrêt dès que l'adresse correspond à un compte,
--    à la désinscription, ou si le contact a plus de 30 jours. En journée seulement (9 h - 20 h, heure d'Abidjan).
-- 2) Inscrits qui n'ont jamais eu d'abonnement et acceptent les e-mails d'information : deux relances, 2 et 10 jours
--    après la création du compte (type « relance_inscrit », clés r1 et r2), dans les 60 jours.
alter table public.prospects add column if not exists suivi_etape smallint not null default 0 check (suivi_etape between 0 and 3);
alter table public.prospects add column if not exists suivi_le timestamptz;
alter table public.prospects add column if not exists suivi_erreur text;

create or replace function public.emails_file_prospects()
returns table (id bigint, prenom text, email text, source text, concours text, resultat jsonb, jeton uuid, etape int)
language sql
stable
security definer
set search_path to ''
as $$
  select p.id, p.prenom, p.email, p.source, p.concours, p.resultat, p.jeton, p.suivi_etape + 1
  from public.prospects p
  where p.accepte_offres and p.desinscrit_le is null and p.email is not null and p.suivi_etape < 3
    and p.cree_le > now() - interval '30 days'
    and p.cree_le <= now() - (case p.suivi_etape when 0 then interval '1 day' when 1 then interval '3 days' else interval '7 days' end)
    -- écart minimal avec l'e-mail précédent, pour un contact plus ancien que le calendrier prévu
    and (p.suivi_le is null or p.suivi_le <= now() - (case p.suivi_etape when 1 then interval '2 days' else interval '4 days' end))
    and (now() at time zone 'Africa/Abidjan')::time between time '09:00' and time '20:00'
    and not exists (select 1 from auth.users u where lower(u.email) = lower(p.email))
  order by p.cree_le
  limit 100;
$$;

-- Réserve l'étape avant l'envoi : une seule exécution l'obtient
create or replace function public.prospect_suivi_reserver(p_id bigint, p_etape int)
returns boolean
language sql
volatile
security definer
set search_path to ''
as $$
  with m as (update public.prospects set suivi_etape = p_etape, suivi_le = now(), suivi_erreur = null
             where id = p_id and suivi_etape = p_etape - 1 returning 1)
  select exists (select 1 from m);
$$;
create or replace function public.prospect_suivi_erreur(p_id bigint, p_erreur text)
returns void
language sql
volatile
security definer
set search_path to ''
as $$
  update public.prospects set suivi_erreur = left(p_erreur, 300) where id = p_id;
$$;

create or replace function public.emails_file_relances()
returns table (type text, cle text, user_id uuid, email text, prenom text, donnees jsonb)
language sql
stable
security definer
set search_path to ''
as $$
  select 'relance_inscrit'::text, r.cle, p.id, u.email::text, p.prenom, jsonb_build_object('jeton', p.jeton_emails, 'cle', r.cle, 'concours', p.concours)
  from public.profils p
  join auth.users u on u.id = p.id
  cross join (values ('r1', interval '2 days'), ('r2', interval '10 days')) as r(cle, delai)
  where p.emails_nouveautes
    and p.cree_le <= now() - r.delai and p.cree_le > now() - interval '60 days'
    and (now() at time zone 'Africa/Abidjan')::time between time '09:00' and time '20:00'
    and not exists (select 1 from public.abonnements a where a.user_id = p.id and a.supprime_le is null)
    and not exists (select 1 from public.demandes_activation d where d.user_id = p.id and d.statut = 'en_attente')
    and not exists (select 1 from public.admins x where x.user_id = p.id)
    and not exists (select 1 from public.emails_envoyes e where e.user_id = p.id and e.type = 'relance_inscrit' and e.cle = r.cle
                    and (e.statut <> 'erreur' or e.tentatives >= 3))
    -- la seconde relance seulement si la première est partie, une semaine au moins auparavant
    and (r.cle = 'r1' or exists (select 1 from public.emails_envoyes e where e.user_id = p.id and e.type = 'relance_inscrit' and e.cle = 'r1'
                                  and e.statut = 'envoye' and e.cree_le <= now() - interval '7 days'));
$$;

revoke all on function public.emails_file_prospects() from public, anon, authenticated;
revoke all on function public.prospect_suivi_reserver(bigint, int) from public, anon, authenticated;
revoke all on function public.prospect_suivi_erreur(bigint, text) from public, anon, authenticated;
revoke all on function public.emails_file_relances() from public, anon, authenticated;
grant execute on function public.emails_file_prospects() to service_role;
grant execute on function public.prospect_suivi_reserver(bigint, int) to service_role;
grant execute on function public.prospect_suivi_erreur(bigint, text) to service_role;
grant execute on function public.emails_file_relances() to service_role;

alter table public.emails_envoyes drop constraint emails_envoyes_type_check,
  add constraint emails_envoyes_type_check check (type = any (array['bienvenue', 'rappel_fin', 'nouveautes', 'inactif', 'essai', 'campagne',
    'hebdo', 'alerte_demande', 'alerte_compte', 'renouvellement', 'passage_vip', 'relance_inscrit']));
