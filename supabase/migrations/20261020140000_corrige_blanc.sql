-- Concours blanc : corrigé-type rattaché à l'épreuve (contenu de la bibliothèque, programmé pour paraître à la fin de
-- l'épreuve). corrige_blanc ne le livre qu'une fois l'épreuve terminée et le contenu publié ; l'outil de l'abonné
-- affiche alors le bouton « Lire le corrigé-type ».

alter table public.concours_blancs add column if not exists corrige_id bigint references public.contenus (id) on delete set null;

create function public.corrige_blanc(p_concours bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select b.corrige_id from public.concours_blancs b
  join public.contenus c on c.id = b.corrige_id and c.publie and c.publie_le <= now()
  where b.id = p_concours and b.publie and now() > b.debut + make_interval(mins => b.duree_minutes)
    and (public.abonnement_actif() or public.est_admin());
$$;
revoke all on function public.corrige_blanc(bigint) from public, anon;
grant execute on function public.corrige_blanc(bigint) to authenticated;
