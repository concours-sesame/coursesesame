-- Aperçu public des contenus : la liste « Au programme » de la page de l'espace abonnés montre désormais
-- tous les titres publiés, rangés par rubrique. Le plafond de 60 lignes en cachait une partie (66 contenus
-- publiés au 13 octobre 2026) : il passe à 1 000. La fonction ne renvoie toujours que des titres,
-- descriptions, types, matières et concours, jamais un fichier, un texte ou un lien.
create or replace function public.apercu_contenus()
returns table(id bigint, titre text, description text, type text, concours text[], matiere text, publie_le timestamp with time zone)
language sql stable security definer set search_path = '' as $$
  select c.id, c.titre, c.description, c.type, c.concours, c.matiere, c.publie_le
  from public.contenus c
  where c.publie
  order by c.publie_le desc
  limit 1000;
$$;
