-- Fiche offerte : le visiteur laisse son prénom et un e-mail ou un numéro WhatsApp, et reçoit une fiche de révision
-- entière. Écriture seulement par la fonction fiche-offerte (clé secrète) ; lecture par l'administrateur.
create table public.prospects (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  prenom text not null check (length(prenom) between 1 and 60),
  email text check (email is null or length(email) <= 254),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+?[0-9]{8,15}$'),
  concours text check (concours is null or concours in ('infj', 'greffe', 'penitentiaire', 'eppjej', 'ena', 'autre')),
  fiche int not null,
  page text,
  -- Accord pour recevoir conseils et offres (case facultative du formulaire)
  accepte_offres boolean not null default false,
  email_envoye boolean not null default false,
  desinscrit_le timestamptz,
  jeton uuid not null default gen_random_uuid() unique,
  ip text, -- sert seulement à limiter les abus ; effacée après un jour par la fonction
  check (email is not null or whatsapp is not null)
);
create index prospects_cree_le on public.prospects (cree_le desc);
create index prospects_ip on public.prospects (ip, cree_le);
alter table public.prospects enable row level security;
revoke all on table public.prospects from anon, authenticated;

create policy prospects_admin on public.prospects for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
grant select on table public.prospects to authenticated;

