-- Sauvegarde de l'espace abonnés : requête d'export, en lecture seule (aucune modification de la base).
-- À lancer avec le connecteur Supabase (execute_sql) sur le projet iyftcjszvnaaakirlsdd, puis passer
-- le résultat à tools/sauvegarde.py. Les PDF du compartiment « exclusif » ne sont pas exportés.
select json_build_object(
  'utilisateurs', (select json_agg(json_build_object('id', id, 'email', email, 'cree_le', created_at,
                     'derniere_connexion', last_sign_in_at) order by created_at) from auth.users),
  'profils', (select json_agg(p order by p.cree_le) from public.profils p),
  'admins', (select json_agg(a) from public.admins a),
  'abonnements', (select json_agg(b order by b.cree_le) from public.abonnements b),
  'suspensions', (select json_agg(s order by s.cree_le) from public.suspensions s),
  'contenus', (select json_agg(c order by c.cree_le) from public.contenus c)
) as sauvegarde;
