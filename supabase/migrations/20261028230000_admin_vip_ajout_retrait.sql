-- Administration : passer un abonné en VIP ou lui retirer le VIP, sans créer de nouvelle période.
-- Les deux actions portent sur les périodes en cours et à venir (fin >= aujourd'hui) ; les périodes passées
-- gardent leur historique. Un abonné sans période en cours passe par « Activer » avec la case VIP.

create or replace function public.admin_passer_vip(p_user uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_n integer;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  update public.abonnements set vip = true
  where user_id = p_user and supprime_le is null and fin >= public.aujourdhui() and not vip;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    if exists (select 1 from public.abonnements where user_id = p_user and supprime_le is null and fin >= public.aujourdhui()) then
      raise exception 'Cet abonné est déjà VIP';
    end if;
    raise exception 'Aucun abonnement en cours ou à venir : utilisez « Activer » en cochant « Abonnement VIP »';
  end if;
  return v_n;
end $$;

create or replace function public.admin_retirer_vip(p_user uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_n integer;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  update public.abonnements set vip = false
  where user_id = p_user and supprime_le is null and fin >= public.aujourdhui() and vip;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Aucune période VIP en cours ou à venir pour cet abonné';
  end if;
  return v_n;
end $$;

revoke all on function public.admin_passer_vip(uuid) from public, anon;
revoke all on function public.admin_retirer_vip(uuid) from public, anon;
grant execute on function public.admin_passer_vip(uuid) to authenticated;
grant execute on function public.admin_retirer_vip(uuid) to authenticated;

-- Journal : les deux actions apparaissent sous leur nom
create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ligne jsonb := to_jsonb(coalesce(new, old)) - 'texte';
  v_action text;
begin
  if tg_table_name = 'abonnements' then
    if tg_op = 'INSERT' then v_action := 'abonnement_active';
    elsif new.supprime_le is not null and old.supprime_le is null then v_action := 'abonnement_supprime';
    elsif new.fin < old.fin then v_action := 'acces_coupe';
    elsif new.vip and not old.vip then v_action := 'vip_ajoute';
    elsif old.vip and not new.vip then v_action := 'vip_retire';
    else v_action := 'abonnement_modifie'; end if;
  elsif tg_table_name = 'suspensions' then
    if tg_op = 'INSERT' then v_action := 'abonnement_suspendu'; else v_action := 'abonnement_reactive'; end if;
  elsif tg_table_name = 'contenus' then
    if tg_op = 'INSERT' then v_action := 'contenu_ajoute';
    elsif tg_op = 'DELETE' then v_action := 'contenu_supprime';
    elsif new.publie and not old.publie then v_action := 'contenu_publie';
    elsif old.publie and not new.publie then v_action := 'contenu_retire';
    else v_action := 'contenu_modifie'; end if;
  elsif tg_table_name = 'commandes' then
    if tg_op = 'INSERT' then v_action := 'commande_ajoutee';
    elsif tg_op = 'DELETE' then v_action := 'commande_supprimee';
    elsif new.statut is distinct from old.statut then v_action := 'commande_' || new.statut;
    else v_action := 'commande_modifiee'; end if;
  else
    v_action := lower(tg_table_name || '_' || tg_op);
  end if;
  insert into public.journal_admin (auteur, action, cible, objet, details)
  values (auth.uid(), v_action,
          case when tg_table_name in ('abonnements', 'suspensions') then (v_ligne ->> 'user_id')::uuid end,
          (v_ligne ->> 'id')::bigint, v_ligne);
  return coalesce(new, old);
end $$;
