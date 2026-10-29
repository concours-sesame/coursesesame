-- Test de niveau gratuit (page test-de-niveau/) : le visiteur répond à 20 questions puis laisse son prénom et un e-mail
-- ou un numéro WhatsApp pour voir son résultat. Le contact est enregistré dans prospects par la fonction fiche-offerte
-- (action « test »), avec source = 'test', sans numéro de fiche, et le résultat du test.
alter table public.prospects alter column fiche drop not null;
alter table public.prospects add column if not exists source text not null default 'fiche' check (source in ('fiche', 'test'));
alter table public.prospects add column if not exists resultat jsonb;
alter table public.prospects add constraint prospects_fiche_ou_test check (source = 'test' or fiche is not null);
