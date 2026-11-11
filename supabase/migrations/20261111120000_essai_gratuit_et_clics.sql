-- Essai gratuit de l'espace abonnés, et mesure des clics qui mènent à une commande ou à un compte.
--
-- Essai : une période de l'abonnement normal, sans paiement, que l'inscrit ouvre lui-même depuis son espace, une
-- seule fois. C'est une ligne de « abonnements » (montant 0, moyen « Essai gratuit »), comme les jours offerts par
-- le parrainage : toutes les règles d'accès s'appliquent donc sans changement (ni espace VIP, ni ouvrages complets,
-- ni corrigés des concours blancs, réservés aux formules d'une semaine et plus). L'essai ne donne droit à aucun
-- téléchargement de pages. Un interrupteur (essai_reglages.actif) le ferme sans rien modifier d'autre.

create table public.essai_reglages (
  id boolean primary key default true check (id),
  actif boolean not null default true,
  jours integer not null default 1 check (jours between 1 and 7),
  maj_le timestamptz not null default now()
);
insert into public.essai_reglages default values;
alter table public.essai_reglages enable row level security;
revoke all on public.essai_reglages from anon, authenticated;

-- Un seul essai par compte, même en cas de double clic
create unique index abonnements_un_essai on public.abonnements (user_id) where moyen = 'Essai gratuit';

-- Dix derniers chiffres du numéro : « +225 07 00 00 00 00 » et « 0700000000 » désignent la même personne
create or replace function public.norm_telephone(t text) returns text
language sql immutable set search_path to '' as $$
  select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10);
$$;

-- Raison pour laquelle l'essai n'est pas ouvert à l'inscrit connecté (null : il peut le démarrer)
create or replace function public.essai_refus() returns text
language plpgsql stable security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_tel text;
begin
  if v_uid is null then return 'Connexion requise.'; end if;
  if not coalesce((select actif from public.essai_reglages), false) then return 'L''essai gratuit n''est pas proposé en ce moment.'; end if;
  if not exists (select 1 from public.profils where id = v_uid) then return 'Compte introuvable.'; end if;
  if exists (select 1 from public.admins where user_id = v_uid) then return 'Compte administrateur.'; end if;
  if public.suspendu() then return 'Compte suspendu.'; end if;
  if exists (select 1 from public.abonnements where user_id = v_uid) then return 'L''essai gratuit est réservé aux nouveaux inscrits.'; end if;
  select public.norm_telephone(telephone) into v_tel from public.profils where id = v_uid;
  if char_length(v_tel) >= 8 and exists (
    select 1 from public.profils p join public.abonnements a on a.user_id = p.id
    where p.id <> v_uid and public.norm_telephone(p.telephone) = v_tel and a.moyen = 'Essai gratuit') then
    return 'Un essai gratuit a déjà été ouvert avec ce numéro de téléphone.';
  end if;
  return null;
end $$;

-- État de l'essai pour l'inscrit connecté : peut-il le démarrer, est-il en cours, est-il passé, combien de jours
create or replace function public.mon_essai()
returns table(disponible boolean, en_cours boolean, termine boolean, jours integer)
language sql stable security definer set search_path to '' as $$
  select public.essai_refus() is null,
    exists (select 1 from public.abonnements a where a.user_id = auth.uid() and a.supprime_le is null and a.moyen = 'Essai gratuit'
              and public.aujourdhui() between a.debut and a.fin)
      and not exists (select 1 from public.abonnements a where a.user_id = auth.uid() and a.supprime_le is null
              and a.moyen is distinct from 'Essai gratuit' and public.aujourdhui() between a.debut and a.fin),
    exists (select 1 from public.abonnements a where a.user_id = auth.uid() and a.moyen = 'Essai gratuit' and a.fin < public.aujourdhui())
      and not exists (select 1 from public.abonnements a where a.user_id = auth.uid() and a.supprime_le is null
              and a.moyen is distinct from 'Essai gratuit'),
    coalesce((select r.jours from public.essai_reglages r), 1);
$$;

-- Ouvre l'essai : aujourd'hui et le ou les jours suivants (un jour par défaut, soit vingt-quatre heures au moins)
create or replace function public.demarrer_essai() returns date
language plpgsql security definer set search_path to '' as $$
declare
  v_refus text := public.essai_refus();
  v_fin date;
begin
  if v_refus is not null then raise exception '%', v_refus; end if;
  v_fin := public.aujourdhui() + (select jours from public.essai_reglages);
  insert into public.abonnements (user_id, debut, fin, montant, moyen, note)
  values (auth.uid(), public.aujourdhui(), v_fin, 0, 'Essai gratuit', 'Essai gratuit de l''espace abonnés');
  return v_fin;
exception when unique_violation then
  raise exception 'L''essai gratuit a déjà été ouvert sur ce compte.';
end $$;

revoke all on function public.essai_refus() from public, anon;
revoke all on function public.mon_essai() from public, anon;
revoke all on function public.demarrer_essai() from public, anon;
grant execute on function public.essai_refus() to authenticated;
grant execute on function public.mon_essai() to authenticated;
grant execute on function public.demarrer_essai() to authenticated;

-- L'essai ne vaut pas paiement : une demande d'activation en attente le reste
create or replace function public.valider_demande_activation() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.moyen is not distinct from 'Parrainage' or new.moyen is not distinct from 'Essai gratuit' then return new; end if;
  update public.demandes_activation
     set statut = 'validee', traitee_le = now(), traitee_par = auth.uid()
   where user_id = new.user_id and statut = 'en_attente';
  return new;
end $$;

-- Aucun téléchargement de pages pendant un essai seul
create or replace function public.telechargement_limites_de(p_user uuid, out quota integer, out par_document integer)
returns record language sql stable security definer set search_path to '' as $$
  select case when e then 0 when v then 60 else 20 end, case when e then 0 when v then 15 else 5 end
  from (select
      exists (select 1 from public.abonnements a where a.user_id = p_user and a.supprime_le is null and a.vip
              and public.aujourdhui() between a.debut and a.fin) as v,
      exists (select 1 from public.abonnements a where a.user_id = p_user and a.supprime_le is null and a.moyen = 'Essai gratuit'
              and public.aujourdhui() between a.debut and a.fin)
        and not exists (select 1 from public.abonnements a where a.user_id = p_user and a.supprime_le is null
              and a.moyen is distinct from 'Essai gratuit' and public.aujourdhui() between a.debut and a.fin) as e) x;
$$;

-- E-mails : l'e-mail de bienvenue attend le premier abonnement payé ou offert par l'éditeur, et la relance des
-- inscrits jamais abonnés continue après un essai. Les deux fonctions sont retouchées sur place.
do $$
declare
  v_def text;
  v_neuf text;
begin
  select pg_get_functiondef('public.emails_file()'::regprocedure) into v_def;
  v_neuf := replace(v_def,
    'where a.supprime_le is null and a.cree_le > now() - interval ''2 days''
      and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.cree_le < a.cree_le)',
    'where a.supprime_le is null and a.moyen is distinct from ''Essai gratuit'' and a.cree_le > now() - interval ''2 days''
      and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.moyen is distinct from ''Essai gratuit'' and b.cree_le < a.cree_le)');
  if v_neuf = v_def then raise exception 'emails_file : passage de l''e-mail de bienvenue introuvable'; end if;
  execute v_neuf;

  select pg_get_functiondef('public.emails_file_relances()'::regprocedure) into v_def;
  v_neuf := replace(v_def,
    'and not exists (select 1 from public.abonnements a where a.user_id = p.id and a.supprime_le is null)',
    'and not exists (select 1 from public.abonnements a where a.user_id = p.id and a.supprime_le is null and a.moyen is distinct from ''Essai gratuit'')');
  if v_neuf = v_def then raise exception 'emails_file_relances : condition sur les abonnements introuvable'; end if;
  execute v_neuf;
end $$;

-- Clics : quel bouton, sur quelle page. Même discrétion que le relevé des visites (identifiant anonyme, pas
-- d'adresse IP), effacement au bout de 180 jours, aucun droit direct sur la table.
create table public.clics (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  visiteur uuid,
  page text not null,
  action text not null
);
create index clics_quand on public.clics (quand desc);
alter table public.clics enable row level security;
revoke all on public.clics from anon, authenticated;

create or replace function public.enregistrer_clic(p_visiteur uuid, p_page text, p_action text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if p_action is null or p_action !~ '^[a-z][a-z0-9-]{1,39}$' or p_page is null or p_page !~ '^/' then return; end if;
  -- Plafonds : 40 clics par visiteur et par heure, 600 par minute pour tout le site
  if (select count(*) from public.clics where visiteur = p_visiteur and quand > now() - interval '1 hour') >= 40 then return; end if;
  if (select count(*) from public.clics where quand > now() - interval '1 minute') >= 600 then return; end if;
  insert into public.clics (visiteur, page, action) values (p_visiteur, left(p_page, 200), p_action);
  if random() < 0.02 then delete from public.clics where quand < now() - interval '180 days'; end if;
end $$;
revoke all on function public.enregistrer_clic(uuid, text, text) from public;
grant execute on function public.enregistrer_clic(uuid, text, text) to anon, authenticated;
