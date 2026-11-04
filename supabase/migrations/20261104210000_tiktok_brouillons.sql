-- TikTok refuse la publication directe d'une application pas encore auditée vers un compte public
-- (« unaudited_client_can_only_post_to_private_accounts », 4 novembre 2026). Choix de Bat : en attendant l'audit, chaque
-- vidéo du jour part en brouillon dans la boîte de réception TikTok de l'éditeur, qui la publie en public d'un geste ;
-- la fonction tiktok lui envoie la légende à coller par e-mail. Après l'audit : remettre mode = 'direct'.
update public.tiktok_publications set mode = 'brouillon' where statut = 'programmee';
