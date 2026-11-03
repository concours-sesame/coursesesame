-- Lettre d'information sans compte : un visiteur laisse son prénom et son e-mail (fonction fiche-offerte, action
-- « lettre »). Il reçoit tout de suite un e-mail de bienvenue, puis les deux derniers e-mails du suivi des contacts
-- (concours blancs à 3 jours, espace abonnés à 7 jours) : la ligne est créée avec suivi_etape = 1.
alter table public.prospects drop constraint if exists prospects_source_check;
alter table public.prospects add constraint prospects_source_check check (source in ('fiche', 'test', 'lettre'));
