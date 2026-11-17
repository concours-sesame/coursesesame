-- E-mail « accès offert » : prévient l'abonné, dans les 15 minutes, quand l'administrateur lui ouvre la copie du mois
-- et les ouvrages sans le passer en VIP (table acces_particuliers). Un seul envoi par ouverture (clé = date de l'ouverture).
-- Les titres des ouvrages ouverts sont joints au message (ouvrages publiés, hors ouvrages réservés au VIP).
create or replace function public.emails_file_offert()
returns table(type text, cle text, user_id uuid, email text, prenom text, donnees jsonb)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  return query
    select 'acces_offert'::text, 'o' || floor(extract(epoch from x.cree_le))::bigint::text, x.user_id, u.email::text, p.prenom,
           jsonb_build_object('copies', x.copies, 'ouvrages', x.ouvrages, 'jusqu_au', x.jusqu_au,
             'titres', case when x.ouvrages then coalesce((select jsonb_agg(c.titre order by c.titre) from public.contenus c
               where c.publie and c.publie_le <= now() and public.est_ouvrage(c.matiere)
                 and not public.ouvrage_reserve_vip(c.titre, c.matiere)), '[]'::jsonb) else '[]'::jsonb end)
    from public.acces_particuliers x
    join auth.users u on u.id = x.user_id
    join public.profils p on p.id = x.user_id
    where x.cree_le > now() - interval '2 days' and (x.copies or x.ouvrages)
      and (x.jusqu_au is null or x.jusqu_au >= public.aujourdhui())
      and exists (select 1 from public.abonnements a where a.user_id = x.user_id and a.supprime_le is null
                  and public.aujourdhui() between a.debut and a.fin)
      and not exists (select 1 from public.emails_envoyes e where e.user_id = x.user_id and e.type = 'acces_offert'
                      and e.cle = 'o' || floor(extract(epoch from x.cree_le))::bigint::text and (e.statut <> 'erreur' or e.tentatives >= 3));
end $$;
revoke all on function public.emails_file_offert() from public, anon, authenticated;
grant execute on function public.emails_file_offert() to service_role;

alter table public.emails_envoyes drop constraint emails_envoyes_type_check,
  add constraint emails_envoyes_type_check check (type = any (array['bienvenue', 'rappel_fin', 'nouveautes', 'inactif', 'essai', 'campagne',
    'hebdo', 'alerte_demande', 'alerte_compte', 'renouvellement', 'passage_vip', 'relance_inscrit', 'acces_offert']));
