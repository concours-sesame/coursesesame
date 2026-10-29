/* Page hors connexion : liste des pages gardées sur cet appareil par le service worker (cache « pages ») */
(function () {
  "use strict";
  const zone = document.getElementById("pagesHorsLigne");
  if (!zone || !window.caches) return;
  caches.open("pages").then(async c => {
    const cles = (await c.keys()).filter(k => !/\/hors-ligne\/$/.test(new URL(k.url).pathname));
    if (!cles.length) return;
    const ul = zone.querySelector("ul");
    for (const k of cles.slice(-40).reverse()) {
      const rep = await c.match(k);
      const t = rep ? ((await rep.text()).match(/<title>([^<]*)<\/title>/) || [])[1] : "";
      const li = document.createElement("li"), a = document.createElement("a");
      a.href = new URL(k.url).pathname;
      const tmp = document.createElement("textarea");
      tmp.innerHTML = t || a.href;
      a.textContent = tmp.value.replace(/ \| Les Cours Sésame et SAJ$/, "");
      li.appendChild(a); ul.appendChild(li);
    }
    zone.hidden = false;
  });
})();
