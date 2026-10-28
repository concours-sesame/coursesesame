-- Espace VIP : les ouvrages complets et les vidéos réservées ne sont plus compris dans l'abonnement normal, mais dans
-- l'abonnement VIP (triple du prix normal, toutes durées). L'abonnement normal garde les sujets corrigés, les fiches,
-- les QCM, les textes officiels, la jurisprudence et les corrigés des concours blancs.
--
-- Les périodes enregistrées avant ce changement (ancien_regime) gardent leurs droits jusqu'à leur fin : ouvrages
-- complets si la période compte au moins 28 jours, vidéos si elle compte au moins 7 jours, comme auparavant.

alter table public.abonnements
  add column vip boolean not null default false,
  add column ancien_regime boolean not null default false;
update public.abonnements set ancien_regime = true;
comment on column public.abonnements.vip is 'Période VIP : ouvrages complets et vidéos réservées, quelle que soit la durée.';
comment on column public.abonnements.ancien_regime is 'Période enregistrée avant l''espace VIP : droits d''alors (ouvrages dès 28 jours, vidéos dès 7 jours) jusqu''à sa fin.';

-- Formules demandées depuis l'espace : les mêmes durées, en normal ou en VIP (« vip-m1 »…)
alter table public.demandes_activation drop constraint demandes_activation_formule_check;
alter table public.demandes_activation add constraint demandes_activation_formule_check
  check (formule ~ '^(vip-)?(j1|j7|j14|m1|m2|m3|m6|m12)$');

-- Période en cours qui ouvre l'espace VIP
create function public.acces_vip()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (public.appareil_autorise() and not public.suspendu() and exists (
    select 1 from public.abonnements a
    where a.user_id = auth.uid() and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin and a.vip));
$$;
revoke all on function public.acces_vip() from public, anon;
grant execute on function public.acces_vip() to authenticated;

create or replace function public.acces_ouvrages()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (public.appareil_autorise() and not public.suspendu() and exists (
    select 1 from public.abonnements a
    where a.user_id = auth.uid() and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin
      and (a.vip or (a.ancien_regime and a.fin - a.debut + 1 >= 28))));
$$;

create or replace function public.acces_videos()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (public.appareil_autorise() and not public.suspendu() and exists (
    select 1 from public.abonnements a
    where a.user_id = auth.uid() and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin
      and (a.vip or (a.ancien_regime and a.fin - a.debut + 1 >= 7))));
$$;

-- Activation par l'administrateur : nouvel argument p_vip. Une période VIP s'enchaîne après la dernière période VIP
-- seulement : un abonné normal en cours qui passe au VIP l'obtient dès aujourd'hui (les deux périodes se recouvrent).
drop function public.admin_activer(uuid, integer, date, integer, text, text);
create function public.admin_activer(p_user uuid, p_mois integer default 1, p_jusqu_au date default null,
  p_montant integer default null, p_moyen text default null, p_note text default null, p_vip boolean default false)
returns date language plpgsql security definer set search_path = '' as $$
declare
  v_fin_actuelle date;
  v_debut date;
  v_fin date;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profils where id = p_user) then
    raise exception 'Compte introuvable';
  end if;
  select max(fin) into v_fin_actuelle from public.abonnements
  where user_id = p_user and supprime_le is null and (not coalesce(p_vip, false) or vip);
  v_debut := greatest(public.aujourdhui(), coalesce(v_fin_actuelle + 1, public.aujourdhui()));
  if p_jusqu_au is not null then
    if p_jusqu_au < v_debut then
      raise exception 'La date de fin doit être au plus tôt le %', to_char(v_debut, 'DD/MM/YYYY');
    end if;
    v_fin := p_jusqu_au;
  else
    if p_mois is null or p_mois < 1 or p_mois > 24 then
      raise exception 'Durée invalide (de 1 à 24 mois)';
    end if;
    v_fin := (v_debut + make_interval(months => p_mois))::date - 1;
  end if;
  insert into public.abonnements (user_id, debut, fin, montant, moyen, note, cree_par, vip)
  values (p_user, v_debut, v_fin, p_montant, nullif(btrim(p_moyen), ''), nullif(btrim(p_note), ''), auth.uid(), coalesce(p_vip, false));
  return v_fin;
end $$;
revoke all on function public.admin_activer(uuid, integer, date, integer, text, text, boolean) from public, anon;
grant execute on function public.admin_activer(uuid, integer, date, integer, text, text, boolean) to authenticated;

-- Liste des paiements de l'administration : la colonne vip en plus
drop function public.admin_paiements(uuid);
create function public.admin_paiements(p_user uuid default null)
returns table (id bigint, user_id uuid, prenom text, nom text, debut date, fin date, montant integer, moyen text, note text,
  cree_le timestamptz, vip boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select a.id, a.user_id, p.prenom, p.nom, a.debut, a.fin, a.montant, a.moyen, a.note, a.cree_le, a.vip
    from public.abonnements a join public.profils p on p.id = a.user_id
    where a.supprime_le is null and (p_user is null or a.user_id = p_user)
    order by a.cree_le desc
    limit 500;
end $$;
revoke all on function public.admin_paiements(uuid) from public, anon;
grant execute on function public.admin_paiements(uuid) to authenticated;

-- E-mail de bienvenue : « ouvrages compris » suit la nouvelle règle (seule modification de emails_file)
do $$
declare
  v_def text := pg_get_functiondef('public.emails_file()'::regprocedure);
  v_ancien text := '''ouvrages'', a.fin - a.debut + 1 >= 28)';
begin
  if position(v_ancien in v_def) = 0 then
    raise exception 'emails_file : expression attendue introuvable';
  end if;
  execute replace(v_def, v_ancien, '''ouvrages'', a.vip or (a.ancien_regime and a.fin - a.debut + 1 >= 28), ''vip'', a.vip)');
end $$;
