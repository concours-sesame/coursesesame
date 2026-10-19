-- Textes officiels et jurisprudence dans l'espace abonnés.
-- Un contenu dont la matière commence par « Texte officiel » ou « Jurisprudence » (ex. « Texte officiel · Droit pénal »)
-- est un texte public : il se lit sans plafond quotidien, ne compte pas dans le total servant aux 5 % de téléchargement,
-- et son fichier d'origine peut être téléchargé en entier par les abonnés (lien temporaire).
-- Les textes sont versés par la fonction Edge « import-texte », qui ne télécharge que depuis des sources officielles.

create function public.est_texte_officiel(p_matiere text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_matiere ~* '^\s*(texte officiel|jurisprudence)', false);
$$;
grant execute on function public.est_texte_officiel(text) to authenticated, service_role;

-- Lien direct : vidéos et textes officiels (jamais les ouvrages, corrigés ni fiches en PDF)
create or replace function public.fichier_direct_autorise(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (
    public.fichier_autorise(chemin)
    and exists (select 1 from public.contenus c where c.fichier = chemin
                and (c.type = 'video' or public.est_texte_officiel(c.matiere))));
$$;

-- Les 5 % de téléchargement se calculent sur les ouvrages et documents de l'éditeur, sans les textes officiels
create or replace function public.telechargement_limites(out quota integer, out par_document integer)
language sql stable security definer set search_path = '' as $$
  select greatest(15, floor(0.05 * coalesce(sum(x.m), 0)))::integer, 15
  from (select max(p.page) m from public.passages p join public.contenus c on c.id = p.contenu_id
        where c.type = 'pdf' and c.publie and c.publie_le <= now() and not public.est_texte_officiel(c.matiere)
        group by p.contenu_id) x;
$$;

-- Clé de la fonction d'import, gardée dans le coffre (Vault) ; seule la base peut l'appeler
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'textes_import', 'Clé de la fonction import-texte');

create function public.textes_verifier_import(p_cle text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_cle = (select decrypted_secret from vault.decrypted_secrets where name = 'textes_import'), false);
$$;
revoke all on function public.textes_verifier_import(text) from public, anon, authenticated;
grant execute on function public.textes_verifier_import(text) to service_role;

-- Lecture à l'écran : un texte officiel ne compte pas dans le plafond quotidien
create or replace function public.noter_page_lue(p_user uuid, p_contenu bigint, p_page integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_jour date := public.aujourdhui();
  v_nb integer;
begin
  perform pg_advisory_xact_lock(hashtext('lecture:' || p_user::text));
  select count(*) into v_nb from public.pages_lues where user_id = p_user and jour = v_jour;
  if exists (select 1 from public.contenus c where c.id = p_contenu and public.est_texte_officiel(c.matiere))
     or exists (select 1 from public.pages_lues where user_id = p_user and jour = v_jour and contenu_id = p_contenu and page = p_page) then
    return greatest(public.lecture_plafond() - v_nb, 0);
  end if;
  if v_nb >= public.lecture_plafond() then
    raise exception 'Vous avez lu % pages aujourd''hui, le maximum par jour. La lecture reprend demain.', public.lecture_plafond()
      using errcode = 'P0001';
  end if;
  insert into public.pages_lues (user_id, jour, contenu_id, page) values (p_user, v_jour, p_contenu, p_page);
  return public.lecture_plafond() - v_nb - 1;
end $$;
