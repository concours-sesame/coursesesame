-- Essai gratuit : réglage depuis l'administration (onglet Abonnés), et annonce du site qui suit ce réglage.

-- L'essai est-il proposé ? Lu par le site public pour afficher ou retirer l'annonce de l'essai.
create or replace function public.essai_ouvert() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select actif from public.essai_reglages), false);
$$;
revoke all on function public.essai_ouvert() from public;
grant execute on function public.essai_ouvert() to anon, authenticated;

-- État de l'essai pour l'administrateur : réglage, essais ouverts, en cours, et inscrits devenus abonnés payants
create or replace function public.admin_essai()
returns table(actif boolean, jours integer, maj_le timestamptz, ouverts bigint, en_cours bigint, devenus_abonnes bigint)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select r.actif, r.jours, r.maj_le,
      (select count(*) from public.abonnements a where a.moyen = 'Essai gratuit'),
      (select count(*) from public.abonnements a where a.moyen = 'Essai gratuit' and a.supprime_le is null
         and public.aujourdhui() between a.debut and a.fin),
      (select count(distinct a.user_id) from public.abonnements a where a.moyen = 'Essai gratuit'
         and exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.montant > 0))
    from public.essai_reglages r;
end $$;

-- Ouvre ou ferme l'essai, règle sa durée (1 à 7 jours) et, si p_terminer, arrête aussi les essais en cours.
-- Renvoie le nombre d'essais arrêtés.
create or replace function public.admin_regler_essai(p_actif boolean, p_jours integer default null, p_terminer boolean default false)
returns integer
language plpgsql security definer set search_path to '' as $$
declare
  v_n integer := 0;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if p_jours is not null and (p_jours < 1 or p_jours > 7) then
    raise exception 'La durée de l''essai va de 1 à 7 jours.';
  end if;
  update public.essai_reglages
     set actif = coalesce(p_actif, actif), jours = coalesce(p_jours, jours), maj_le = now();
  if coalesce(p_terminer, false) then
    update public.abonnements
       set fin = public.aujourdhui() - 1,
           debut = least(debut, public.aujourdhui() - 1),
           note = left(concat_ws(' · ', note, 'Essai arrêté le ' || to_char(public.aujourdhui(), 'DD/MM/YYYY')), 300)
     where moyen = 'Essai gratuit' and supprime_le is null and fin >= public.aujourdhui();
    get diagnostics v_n = row_count;
  end if;
  insert into public.journal_admin (auteur, action, details)
  values (auth.uid(), case when (select actif from public.essai_reglages) then 'essai_ouvert' else 'essai_ferme' end,
          jsonb_build_object('jours', (select jours from public.essai_reglages), 'essais_arretes', v_n));
  return v_n;
end $$;

revoke all on function public.admin_essai() from public, anon;
revoke all on function public.admin_regler_essai(boolean, integer, boolean) from public, anon;
grant execute on function public.admin_essai() to authenticated;
grant execute on function public.admin_regler_essai(boolean, integer, boolean) to authenticated;
