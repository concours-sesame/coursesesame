-- Vidéos du jour (QCM, article, fiche et notion du jour, publiées aussi sur TikTok)
-- 1. Ouvertes à tous les abonnés, VIP ou non (contenus.video_ouverte) ; les autres vidéos restent réservées au VIP.
-- 2. Publication TikTok sans validation au cas par cas : l'éditeur a donné son accord pour tout le calendrier
--    (publication publique, commentaires ouverts). tiktok_publications.automatique permet, tant que TikTok n'autorise
--    pas encore la publication publique pour l'application (avant son audit), de publier en « moi seul » plutôt que
--    de perdre la vidéo du jour.

alter table public.contenus add column if not exists video_ouverte boolean not null default false;
comment on column public.contenus.video_ouverte is
  'Vidéo lisible par tout abonné en cours, sans abonnement VIP (vidéos du jour publiées aussi sur TikTok).';

update public.contenus set video_ouverte = true
where type = 'video' and fichier ~ '^videos/((qcm|article|fiche)-du-jour-[0-9]{3}|notion-(crpc|omission-de-porter-secours|recel|controle-judiciaire|sursis|association-de-malfaiteurs|emancipation|saisie-attribution|casier-judiciaire|adoption|rehabilitation|faux-et-usage-de-faux|bail-professionnel|arbitrage-ohada|conseil-superieur-magistrature))\.mp4$';

create or replace function public.fichier_autorise(chemin text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (
      select 1 from public.contenus c
      where c.fichier = chemin and c.publie and public.contenu_ouvert(c.publie_le, c.avant_premiere)
        and (not public.est_ouvrage(c.matiere) or public.acces_ouvrages())
        and (c.type <> 'video' or c.video_ouverte or public.acces_videos())
        and (not c.vip or public.acces_vip())));
$function$;

-- L'aperçu public dit, pour chaque vidéo, si elle est ouverte à tous les abonnés
drop function if exists public.apercu_contenus();
create function public.apercu_contenus()
 returns table(id bigint, titre text, description text, type text, concours text[], matiere text, publie_le timestamp with time zone, video_ouverte boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id, c.titre, c.description, c.type, c.concours, c.matiere, c.publie_le, c.video_ouverte
  from public.contenus c
  where c.publie and c.publie_le <= now()
  order by c.publie_le desc
  limit 1000;
$function$;
grant execute on function public.apercu_contenus() to anon, authenticated;

alter table public.tiktok_publications add column if not exists automatique boolean not null default false;
comment on column public.tiktok_publications.automatique is
  'Publication validée d''avance par l''éditeur : si TikTok refuse la confidentialité choisie, elle part en SELF_ONLY.';

update public.tiktok_publications
set statut = 'programmee', confidentialite = 'PUBLIC_TO_EVERYONE', commentaires = true, automatique = true, valide_le = now()
where statut = 'a_valider';
