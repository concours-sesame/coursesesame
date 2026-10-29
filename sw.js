/* Service worker des Cours Sésame et SAJ, écrit par tools/build.js : ne pas modifier à la main.
   Pages publiques : réseau d'abord, copie gardée si le réseau manque, sinon la page /hors-ligne/.
   Fichiers du site : copie d'abord (leurs adresses changent à chaque version). Rien pour Supabase, les vidéos
   ni l'espace abonnés, dont les contenus restent en ligne. */
const VERSION = "320659f393";
// Les pages gardent le même cache d'une version à l'autre ; les fichiers changent de cache à chaque version
const PAGES = "pages", FICHIERS = "fichiers-" + VERSION, MAX_PAGES = 80;
const AVANCE = ["/","/hors-ligne/","/assets/css/style.css?v=b8568c7087","/assets/js/data.js?v=ea6090f11a","/assets/js/render.js?v=e1bb10e093","/assets/js/app.js?v=26d12de608","/assets/js/hors-ligne.js?v=486349bb1c","/assets/img/favicon.svg","/assets/img/icone-192.png","/assets/fonts/mona-sans-latin-wdth-normal.woff2","/assets/fonts/source-sans-3-latin-400-italic.woff2","/assets/fonts/source-sans-3-latin-400-normal.woff2","/assets/fonts/source-sans-3-latin-600-normal.woff2","/assets/fonts/source-sans-3-latin-700-normal.woff2","/assets/fonts/source-serif-4-latin-400-italic.woff2","/assets/fonts/source-serif-4-latin-400-normal.woff2","/assets/fonts/source-serif-4-latin-600-normal.woff2","/assets/fonts/source-serif-4-latin-700-normal.woff2"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(FICHIERS).then(c => c.addAll(AVANCE.filter(u => u.startsWith("/assets/")))).then(() =>
    caches.open(PAGES)).then(c => c.addAll(["/", "/hors-ligne/"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(k => k !== PAGES && k !== FICHIERS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const horsChamp = u => u.origin !== location.origin || u.pathname.startsWith("/espace-abonnes/") || u.pathname.startsWith("/assets/video/")
  || u.pathname === "/sw.js";
async function rogner() {
  const c = await caches.open(PAGES), cles = await c.keys();
  for (const k of cles.slice(0, Math.max(0, cles.length - MAX_PAGES))) await c.delete(k);
}
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  // Espace abonnés : jamais gardé ; sans réseau, la page hors connexion plutôt qu'une erreur du navigateur
  if (r.mode === "navigate" && u.origin === location.origin && u.pathname.startsWith("/espace-abonnes/")) {
    e.respondWith(fetch(r).catch(() => caches.match("/hors-ligne/")));
    return;
  }
  if (horsChamp(u)) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(rep => {
      if (rep.ok && rep.type === "basic") { const copie = rep.clone(); caches.open(PAGES).then(c => c.put(u.pathname, copie)).then(rogner); }
      return rep;
    }).catch(() => caches.match(u.pathname).then(m => m || caches.match("/hors-ligne/"))));
    return;
  }
  if (u.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(rep => {
      if (rep.ok && rep.type === "basic" && !r.headers.has("range")) { const copie = rep.clone(); caches.open(FICHIERS).then(c => c.put(r, copie)); }
      return rep;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m2 => m2 || Response.error()))));
  }
});
