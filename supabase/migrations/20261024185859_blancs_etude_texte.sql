-- Étude de texte (compréhension, vocabulaire, résumé, production écrite) : épreuve du cycle moyen de l'administration
-- pénitentiaire (agents d'encadrement).
alter table public.epreuves_blanches drop constraint epreuves_blanches_epreuve_check;
alter table public.epreuves_blanches add constraint epreuves_blanches_epreuve_check
  check (epreuve in ('preselection', 'sog', 'droit_civil', 'droit_commercial', 'droit_penal', 'droit_administratif',
    'organisation_judiciaire', 'opaj', 'opea', 'informatique', 'systeme_penitentiaire', 'administration_penitentiaire',
    'droits_enfant', 'fonction_publique', 'etude_texte'));
