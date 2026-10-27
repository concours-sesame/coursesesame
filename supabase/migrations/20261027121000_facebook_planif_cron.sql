-- Toutes les cinq minutes : publication sur la page Facebook des lignes de facebook_publications arrivées à leur heure
select cron.schedule('facebook-publications', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://iyftcjszvnaaakirlsdd.supabase.co/functions/v1/facebook',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-import', (select decrypted_secret from vault.decrypted_secrets where name = 'textes_import')),
    body := '{"action":"planif"}'::jsonb,
    timeout_milliseconds := 120000);
$$);
