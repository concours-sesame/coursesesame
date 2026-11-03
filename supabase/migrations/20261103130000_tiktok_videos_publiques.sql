-- Vidéos fabriquées pour TikTok (« QCM du jour », « L'article du jour », « La fiche du jour ») : contenus gratuits, rangés
-- dans un espace de stockage public « tiktok » pour que l'éditeur puisse aussi les télécharger et les publier à la main.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tiktok', 'tiktok', true, 52428800, array['video/mp4'])
on conflict (id) do nothing;

alter table public.tiktok_publications drop constraint tiktok_publications_source_check;
alter table public.tiktok_publications add constraint tiktok_publications_source_check
  check (source ~ '^(assets/video|videos|tiktok/[a-z0-9-]+)/[a-z0-9-]+\.mp4$');
