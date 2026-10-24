-- Concours blancs de l'administration pénitentiaire et de l'EPPJEJ : un identifiant par cycle (supérieur, moyen
-- supérieur, moyen) et les épreuves propres à ces concours (droit pénitentiaire, administration pénitentiaire,
-- droits de l'enfant, fonction publique).
alter table public.epreuves_blanches drop constraint epreuves_blanches_concours_check;
alter table public.epreuves_blanches add constraint epreuves_blanches_concours_check
  check (concours in ('magistrature', 'greffe', 'greffe_cs', 'greffe_cms', 'greffe_cm', 'penitentiaire', 'penitentiaire_cs',
    'penitentiaire_cms', 'penitentiaire_cm', 'eppjej', 'eppjej_cs', 'eppjej_cms', 'eppjej_cm', 'ena'));
alter table public.epreuves_blanches drop constraint epreuves_blanches_epreuve_check;
alter table public.epreuves_blanches add constraint epreuves_blanches_epreuve_check
  check (epreuve in ('preselection', 'sog', 'droit_civil', 'droit_commercial', 'droit_penal', 'droit_administratif',
    'organisation_judiciaire', 'opaj', 'opea', 'informatique', 'systeme_penitentiaire', 'administration_penitentiaire',
    'droits_enfant', 'fonction_publique'));
