-- Épreuves officielles de l'ENA : droit constitutionnel et résumé de texte (cycle moyen supérieur),
-- connaissance du monde contemporain en QCM (cycle moyen). Déjà appliquée sur le projet le 25 octobre 2026.
alter table public.epreuves_blanches drop constraint epreuves_blanches_epreuve_check;
alter table public.epreuves_blanches add constraint epreuves_blanches_epreuve_check check (epreuve = any (array['preselection','sog','droit_civil','droit_commercial','droit_penal','droit_administratif','organisation_judiciaire','opaj','opea','informatique','systeme_penitentiaire','administration_penitentiaire','droits_enfant','fonction_publique','etude_texte','pecos','note_synthese','droit_constitutionnel','resume_texte','cmc']));
