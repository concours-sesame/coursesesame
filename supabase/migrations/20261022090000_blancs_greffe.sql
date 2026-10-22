-- Concours blancs du Greffe (École des greffes de l'INFJ), un jeu de séries par cycle : cycle supérieur (administrateurs
-- des greffes et parquets), cycle moyen supérieur (attachés) et cycle moyen (secrétaires). Nouvelles épreuves :
-- organisation judiciaire, OPAJ (organisation politique, administrative et judiciaire), OPEA (organisation politique,
-- économique et administrative) et informatique et bureautique (vrai ou faux, même format JSON que la présélection).
alter table public.epreuves_blanches drop constraint epreuves_blanches_concours_check;
alter table public.epreuves_blanches add constraint epreuves_blanches_concours_check
  check (concours in ('magistrature', 'greffe', 'greffe_cs', 'greffe_cms', 'greffe_cm', 'penitentiaire', 'eppjej', 'ena'));
alter table public.epreuves_blanches drop constraint epreuves_blanches_epreuve_check;
alter table public.epreuves_blanches add constraint epreuves_blanches_epreuve_check
  check (epreuve in ('preselection', 'sog', 'droit_civil', 'droit_commercial', 'droit_penal', 'droit_administratif',
    'organisation_judiciaire', 'opaj', 'opea', 'informatique'));
