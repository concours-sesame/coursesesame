-- Tableau des ventes (onglet Pilotage › Ventes de l'administration) : l'entonnoir sur une période de p_jours jours,
-- comparé à la période précédente de même durée, et la provenance des nouveaux comptes et des nouveaux clients.
--   visiteurs      navigateurs distincts venus sur le site, hors administrateurs et hors navigateurs déjà rattachés à un
--                  compte créé avant la période (abonnés qui reviennent lire)
--   offre          parmi eux, ceux qui ont ouvert la page de l'espace abonnés (tarifs, inscription)
--   contacts       fiches offertes et tests de niveau (prospects)
--   comptes        comptes créés (hors administrateurs)
--   demandes       comptes qui ont envoyé une demande d'activation
--   clients        comptes dont le premier abonnement payant date de la période ; recettes_nouveaux leur montant
--   renouvellements abonnements payants d'un compte qui en avait déjà un ; recettes_renouvellements leur montant
--   delai_jours    délai médian entre la création du compte et le premier paiement, pour les clients de la période
-- La provenance d'un compte est celle de la première visite connue de l'un de ses navigateurs (180 jours de visites).
create or replace function public.admin_entonnoir(p_jours integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_j integer := least(greatest(coalesce(p_jours, 30), 1), 180);
  v_fin timestamptz := now();
  v_debut timestamptz := now() - make_interval(days => v_j);
  v_avant timestamptz := now() - make_interval(days => 2 * v_j);
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return (
    with admins as (select user_id from public.admins),
    vis as (
      select v.* from public.visites v
      where v.quand > v_avant
        and not exists (select 1 from public.visites w join admins a on a.user_id = w.user_id where w.visiteur = v.visiteur)
    ),
    -- premier paiement de chaque compte, et rang de chaque abonnement payant
    payes as (
      select a.user_id, a.cree_le, a.montant, row_number() over (partition by a.user_id order by a.cree_le, a.id) as rang
      from public.abonnements a
      where a.supprime_le is null and coalesce(a.montant, 0) > 0
        and not exists (select 1 from admins x where x.user_id = a.user_id)
    ),
    comptes as (
      select p.id, p.cree_le from public.profils p where not exists (select 1 from admins x where x.user_id = p.id)
    ),
    origine as (
      select distinct on (v.user_id) v.user_id, public.provenance_groupe(v.provenance) as groupe
      from public.visites v
      where v.user_id is not null and coalesce(v.provenance, '') <> '(site)'
      order by v.user_id, v.quand
    ),
    -- première visite de chaque navigateur rattaché à un compte : plus fiable que la visite connectée
    origine_nav as (
      select distinct on (c.user_id) c.user_id, public.provenance_groupe(v.provenance) as groupe
      from (select distinct visiteur, user_id from public.visites where user_id is not null) c
      join public.visites v on v.visiteur = c.visiteur
      where coalesce(v.provenance, '') <> '(site)'
      order by c.user_id, v.quand
    ),
    -- navigateurs déjà rattachés à un compte et date de création de ce compte (le plus ancien)
    deja as (
      select w.visiteur, min(c.cree_le) as compte_le
      from public.visites w join comptes c on c.id = w.user_id
      group by w.visiteur
    ),
    periodes as (select 'courante' as cle, v_debut as d, v_fin as f union all select 'precedente', v_avant, v_debut),
    chiffres as (
      select pe.cle, jsonb_build_object(
        'visiteurs', (select count(distinct v.visiteur) from vis v left join deja x on x.visiteur = v.visiteur
                        where v.quand > pe.d and v.quand <= pe.f and (x.compte_le is null or x.compte_le > pe.d)),
        'offre', (select count(distinct v.visiteur) from vis v left join deja x on x.visiteur = v.visiteur
                    where v.quand > pe.d and v.quand <= pe.f and v.page like '/espace-abonnes/%' and (x.compte_le is null or x.compte_le > pe.d)),
        'contacts', (select count(*) from public.prospects where cree_le > pe.d and cree_le <= pe.f),
        'contacts_accord', (select count(*) from public.prospects where cree_le > pe.d and cree_le <= pe.f and accepte_offres),
        'comptes', (select count(*) from comptes where cree_le > pe.d and cree_le <= pe.f),
        'demandes', (select count(distinct d.user_id) from public.demandes_activation d where d.cree_le > pe.d and d.cree_le <= pe.f
                       and not exists (select 1 from admins x where x.user_id = d.user_id)),
        'clients', (select count(*) from payes where rang = 1 and cree_le > pe.d and cree_le <= pe.f),
        'recettes_nouveaux', (select coalesce(sum(montant), 0) from payes where rang = 1 and cree_le > pe.d and cree_le <= pe.f),
        'renouvellements', (select count(*) from payes where rang > 1 and cree_le > pe.d and cree_le <= pe.f),
        'recettes_renouvellements', (select coalesce(sum(montant), 0) from payes where rang > 1 and cree_le > pe.d and cree_le <= pe.f),
        'clients_issus_comptes_periode', (select count(*) from payes y join comptes c on c.id = y.user_id
                                            where y.rang = 1 and y.cree_le > pe.d and y.cree_le <= pe.f and c.cree_le > pe.d),
        'delai_jours', (select percentile_cont(0.5) within group (order by extract(epoch from y.cree_le - c.cree_le) / 86400)
                          from payes y join comptes c on c.id = y.user_id where y.rang = 1 and y.cree_le > pe.d and y.cree_le <= pe.f)
      ) as j
      from periodes pe
    ),
    provenances as (
      select coalesce(n.groupe, o.groupe, 'Inconnue') as groupe,
        count(*) filter (where c.cree_le > v_debut) as comptes,
        count(*) filter (where exists (select 1 from payes y where y.user_id = c.id and y.rang = 1 and y.cree_le > v_debut)) as clients
      from comptes c
      left join origine_nav n on n.user_id = c.id
      left join origine o on o.user_id = c.id
      group by 1
    )
    select jsonb_build_object(
      'jours', v_j,
      'courante', (select j from chiffres where cle = 'courante'),
      'precedente', (select j from chiffres where cle = 'precedente'),
      'provenances', coalesce((select jsonb_agg(jsonb_build_object('provenance', groupe, 'comptes', comptes, 'clients', clients) order by clients desc, comptes desc)
                               from provenances where comptes > 0 or clients > 0), '[]'::jsonb)
    )
  );
end $$;
revoke all on function public.admin_entonnoir(integer) from public, anon;
grant execute on function public.admin_entonnoir(integer) to authenticated;
