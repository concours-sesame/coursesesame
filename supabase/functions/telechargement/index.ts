// Fonction « telechargement » : fermée le 19 octobre 2026. Elle livrait des pages au filigrane en texte, qu'un logiciel
// d'édition pouvait effacer. La lecture et le téléchargement passent désormais par la fonction « pages », qui livre
// des images au filigrane fondu dans les pixels. Elle reste déployée pour répondre aux pages encore ouvertes sur
// l'ancienne version du site.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return new Response(JSON.stringify({ error: "Le site a été mis à jour. Rechargez la page, puis recommencez le téléchargement." }), {
    status: 410,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
