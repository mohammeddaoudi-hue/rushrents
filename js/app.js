// Homepage: vloot met filter, gekozen periode boven de vloot, veelgestelde vragen.
import { loadFleet, loadAvailability, checkPeriod, uren } from './data.js';
import { getal, euro } from './prijs.js';
import { CONFIG, $, $$, h, ico, moment, startBasis, onthul } from './basis.js';
import { fotoSet } from './fotos.js';

const staat = { wagens: [], beschikbaarheid: null, vandaag: '', filter: 'Alle', periode: null, vrij: null };
// De periode staat hier alleen als de bezoeker ze zelf koos (in de kalender van een wagen of hierboven). Zonder keuze staat er geen status op de kaarten.
const bewaar = () => { try { staat.periode ? sessionStorage.setItem('rr.periode', JSON.stringify(staat.periode)) : sessionStorage.removeItem('rr.periode'); } catch { /* zonder opslag geldt de periode tot je de pagina sluit */ } };
const herstel = () => { try { const p = JSON.parse(sessionStorage.getItem('rr.periode') || 'null'); return p && p.van >= staat.vandaag && p.tot >= p.van ? p : null; } catch { return null; } };
const klopt = (p) => !!(p && p.van && p.tot && (p.tot > p.van || (p.tot === p.van && p.totUur > p.vanUur)));
const periodeTekst = (p) => `${moment(p.van, p.vanUur)} tot ${moment(p.tot, p.totUur)}`;
const reserveer = (w) => `/rushrents/reserveren/${w.id}`;

// ---- vloot ----------------------------------------------------------------------------------
const nietBeschikbaar = (w) => !!staat.beschikbaarheid?.wagens?.[w.id]?.nietBeschikbaar;
/** status op een kaart: alleen "Beschikbaar" of "Niet beschikbaar", of niets zolang er geen periode gekozen is */
function kaartStatus(w) {
  if (nietBeschikbaar(w)) return { vrij: false, vast: true };
  if (staat.periode && staat.vrij && w.id in staat.vrij) return { vrij: staat.vrij[w.id], vast: false };
  return null;
}
/** de foto van de aangeklikte kaart loopt over in de hoofdfoto van de wagenpagina (en terug) */
function merkFoto(id) { for (const f of $$('.car-foto')) f.style.viewTransitionName = f.closest('.car').dataset.id === id ? 'wagenfoto' : ''; }
// hoe breed een kaart op het scherm staat (voor de keuze van de fotobreedte): de eerste (uitgelicht) is groter; op gsm loopt de foto van rand tot rand
const MAAT_GROOT = '(min-width: 1000px) min(790px, 62vw), (min-width: 640px) calc(100vw - 64px), 100vw', MAAT_KLEIN = '(min-width: 1000px) min(398px, 32vw), (min-width: 640px) 46vw, 100vw';
const nr = (n) => String(n + 1).padStart(2, '0');
/** i = plaats in de getoonde lijst (0 = uitgelicht), n = aantal getoonde wagens */
function kaart(w, i, n) {
  const s = kaartStatus(w), uit = i === 0, feiten = [w.categorie, w.leeftijd, w.rijbewijs && `Rijbewijs ${w.rijbewijs}`, w.platen].filter(Boolean);
  const set = w.hoofdfoto ? fotoSet(w.hoofdfoto) : ''; // kleinere versies (avif); de foto zelf blijft de terugval
  const vooraf = () => { if (!document.querySelector(`link[data-vooraf="${w.id}"]`)) document.head.append(h('link', { rel: 'prefetch', href: reserveer(w), 'data-vooraf': w.id })); };
  // alleen de eerste kaart van de hele vloot opent met het masker bij het scrollen (data-onthul); de andere staan er gewoon.
  // Welke kaart uitgelicht staat en welk volgnummer ze draagt, zet filterVloot() (dat hangt af van het filter).
  return h('a', { class: 'car' + (uit ? ' is-uitgelicht' : ''), href: reserveer(w), 'data-id': w.id, 'data-onthul': uit || null, onpointerenter: vooraf, ontouchstart: vooraf, onclick: () => merkFoto(w.id) },
    h('span', { class: 'car-media' },
      w.hoofdfoto ? h('picture', {}, set ? h('source', { type: 'image/avif', srcset: set, sizes: uit ? MAAT_GROOT : MAAT_KLEIN }) : null, h('img', { class: 'car-foto', src: '/rushrents/media/' + w.hoofdfoto, alt: '', decoding: 'async', loading: 'lazy', width: 840, height: 560 })) : null,
      h('span', { class: 'car-rand', 'aria-hidden': 'true' })),
    h('span', { class: 'car-body' },
      h('span', { class: 'car-kop' }, h('span', { class: 'car-nr', text: nr(i) + (uit && n > 1 ? ' / ' + nr(n - 1) : '') }), h('span', { class: 'car-lijn', 'aria-hidden': 'true' }), s?.vast ? null : h('span', { class: 'car-ga' }, 'Reserveren', ico('pijl'))),
      h('span', { class: 'car-titel' }, h('h3', { class: 'car-naam', text: w.naam }), h('span', { class: 'car-prijs' }, ...(getal(w.prijsDag) ? ['vanaf ', h('strong', { text: euro(getal(w.prijsDag)) }), ' / dag'] : []))),
      h('span', { class: 'car-feiten' }, ...feiten.map((f) => h('span', { class: 'car-feit', text: f })), w.actie ? h('span', { class: 'car-feit is-actie', text: w.actie }) : null),
      s && h('span', { class: 'car-status status' + (s.vrij ? ' is-ok' : ''), text: s.vrij ? 'Beschikbaar' : 'Niet beschikbaar' })));
}
// filter: één balk met vakken; het lichte vlak (.tabs-wijzer) glijdt naar het gekozen vak
function toonFilters() {
  const cats = [...new Set(staat.wagens.map((w) => w.categorie))];
  if (!cats.includes(staat.filter)) staat.filter = 'Alle';
  const baan = h('span', { class: 'tabs-baan' }, h('span', { class: 'tabs-wijzer', 'aria-hidden': 'true' }), ...['Alle', ...cats].map((c) => h('button', { type: 'button', class: 'tab', 'aria-pressed': String(c === staat.filter), text: c, onclick: () => { staat.filter = c; zetTab(); filterVloot(true); } })));
  $('#filters').replaceChildren(baan);
  zetTab();
  requestAnimationFrame(() => requestAnimationFrame(() => baan.classList.add('is-klaar'))); // de eerste plaatsing gebeurt zonder beweging
}
function zetTab() {
  const baan = $('.tabs-baan'); if (!baan) return;
  for (const b of $$('.tab', baan)) b.setAttribute('aria-pressed', String(b.textContent === staat.filter));
  const nu = $('.tab[aria-pressed="true"]', baan), wijzer = $('.tabs-wijzer', baan); if (!nu) return;
  wijzer.style.width = nu.offsetWidth + 'px'; wijzer.style.translate = nu.offsetLeft + 'px 0';
}
addEventListener('resize', zetTab, { passive: true });
document.fonts?.ready.then(zetTab); // de breedte van de vakken staat pas vast als het lettertype er is
/** het filter verbergt kaarten; ze worden niet opnieuw gebouwd, dus de foto's blijven staan. De eerste zichtbare kaart staat uitgelicht en
 *  de volgnummers tellen de zichtbare kaarten. meteen = geen masker meer op de uitgelichte kaart (na een keuze van de bezoeker). */
function filterVloot(meteen = false) {
  const zicht = $$('#cars .car').filter((k) => { const w = staat.wagens.find((x) => x.id === k.dataset.id); k.hidden = !(w && (staat.filter === 'Alle' || w.categorie === staat.filter)); if (meteen) k.classList.add('is-zicht'); return !k.hidden; });
  zicht.forEach((k, i) => {
    const uit = i === 0;
    k.classList.toggle('is-uitgelicht', uit);
    $('.car-nr', k).textContent = nr(i) + (uit && zicht.length > 1 ? ' / ' + nr(zicht.length - 1) : '');
    // wordt een kaart uitgelicht, dan haalt de browser eerst de grotere foto op en wisselt daarna pas: zo staat de foto nooit leeg.
    // (Een kaart die niet meer uitgelicht is, houdt haar grotere foto.)
    const bron = $('source', k);
    if (uit && bron && bron.getAttribute('sizes') !== MAAT_GROOT) { const proef = new Image(); proef.sizes = MAAT_GROOT; proef.srcset = bron.srcset; proef.onload = () => bron.setAttribute('sizes', MAAT_GROOT); }
  });
}
/** bouwt alle kaarten: één keer bij de start, en opnieuw als de gekozen periode wijzigt (dan verandert de status op elke kaart) */
function toonVloot(meteen = false) {
  const kaarten = staat.wagens.map((w, i, lijst) => kaart(w, i, lijst.length));
  $('#cars').replaceChildren(...kaarten);
  filterVloot(meteen);
  $('#periode-regel').hidden = !staat.periode;
  if (staat.periode) $('[data-periode]').textContent = periodeTekst(staat.periode);
  if (!meteen) onthul();
}
async function zetPeriode(p) {
  staat.periode = p; staat.vrij = null; bewaar();
  if (p) { try { staat.vrij = await checkPeriod(p); } catch { staat.periode = null; bewaar(); } }
  toonVloot(true);
}
// het lichtpunt op de rand van een wagenfoto volgt de aanwijzer (alleen met een muis; de rand zelf staat in css/site.css)
if (matchMedia('(hover: hover)').matches) $('#cars').addEventListener('pointermove', (e) => {
  const m = e.target.closest?.('.car')?.querySelector('.car-media'); if (!m) return;
  const r = m.getBoundingClientRect(); m.style.setProperty('--mx', Math.round(e.clientX - r.left) + 'px'); m.style.setProperty('--my', Math.round(e.clientY - r.top) + 'px');
}, { passive: true });
const pv = { van: $('#pv-van'), tot: $('#pv-tot'), vanUur: $('#pv-van-uur'), totUur: $('#pv-tot-uur'), vorm: $('#periode-vorm'), fout: $('#pv-fout') };
$('[data-periode-wis]').addEventListener('click', () => { pv.vorm.hidden = true; zetPeriode(null); });
$('[data-periode-wijzig]').addEventListener('click', (e) => {
  const open = pv.vorm.hidden; pv.vorm.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open));
  if (open && staat.periode) { pv.van.value = staat.periode.van; pv.tot.value = staat.periode.tot; pv.vanUur.value = staat.periode.vanUur; pv.totUur.value = staat.periode.totUur; pv.van.min = pv.tot.min = staat.vandaag; pv.fout.hidden = true; }
});
pv.vorm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = { van: pv.van.value, vanUur: pv.vanUur.value, tot: pv.tot.value, totUur: pv.totUur.value };
  if (!klopt(p)) { pv.fout.textContent = 'Het terugbrengen moet na het afhalen liggen.'; pv.fout.hidden = false; return; }
  try { const vrij = await checkPeriod(p); staat.periode = p; staat.vrij = vrij; bewaar(); pv.vorm.hidden = true; $('[data-periode-wijzig]').setAttribute('aria-expanded', 'false'); toonVloot(true); }
  catch (err) { pv.fout.textContent = err.message; pv.fout.hidden = false; }
});

// ---- veelgestelde vragen: alleen vragen met een antwoord; openen met een hoogte-overgang, de plus wordt een min ----------
function vraag(x, i) {
  const paneel = h('div', { class: 'vraag-paneel', id: 'antwoord-' + i, role: 'region', inert: true }, h('div', {}, h('p', { text: x.antwoord })));
  const knop = h('button', { type: 'button', class: 'vraag-knop', 'aria-expanded': 'false', 'aria-controls': 'antwoord-' + i }, h('span', { text: x.vraag }), h('span', { class: 'vraag-teken', 'aria-hidden': 'true' }));
  const el = h('div', { class: 'vraag' }, h('h3', {}, knop), paneel);
  knop.addEventListener('click', () => { const open = !el.classList.contains('is-open'); el.classList.toggle('is-open', open); knop.setAttribute('aria-expanded', String(open)); paneel.inert = !open; });
  return el;
}

// terug vanaf een wagenpagina: de hoofdfoto loopt terug naar haar kaart, maar alleen als die kaart er al staat (terug in de geschiedenis
// met de pagina uit het geheugen). Staat ze er niet, dan is er geen overgang met de foto: anders zweeft de foto van de wagen over de pagina.
addEventListener('pagereveal', (e) => {
  const stap = globalThis.navigation?.activation, van = stap?.from?.url;
  if (!e.viewTransition || !van) return;
  const id = /\/reserveren\/([a-z0-9-]+)/.exec(new URL(van).pathname)?.[1];
  if (!id) return;
  if ($(`.car[data-id="${id}"] .car-foto`)) merkFoto(id); else if (stap.navigationType === 'traverse') e.viewTransition.skipTransition();
});

// zacht scrollen alleen bij een klik op een link binnen deze pagina (#wagens, #huren ...). Bij het laden springt de pagina meteen naar haar
// plek (html heeft geen scroll-behavior: smooth meer: "Alle wagens" vanaf een wagenpagina landde bovenaan en scrolde dan zichtbaar).
addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || a.target === '_blank' || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const naam = a.getAttribute('href').slice(1), doel = naam && document.getElementById(naam);
  if (!doel) return;
  e.preventDefault();
  doel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  history.pushState(null, '', '#' + naam);
});

// ---- slotblok: het beeldmerk achter de tekst beweegt licht mee met het scrollen (hoogstens 30 px), alleen terwijl het blok in beeld is ----
const slotRr = $('.slot-rr');
if (slotRr && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const blok = slotRr.closest('.slot'); let inBeeld = false, loopt = false;
  const zet = () => { loopt = false; const r = blok.getBoundingClientRect(), deel = (r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2 + r.height / 2); slotRr.style.transform = `translate3d(0, ${(Math.max(-1, Math.min(1, deel)) * 30).toFixed(1)}px, 0)`; };
  new IntersectionObserver(([e]) => { inBeeld = e.isIntersecting; if (inBeeld) zet(); }).observe(blok);
  addEventListener('scroll', () => { if (inBeeld && !loopt) { loopt = true; requestAnimationFrame(zet); } }, { passive: true });
}

// ---- start ----------------------------------------------------------------------------------
async function start() {
  const [, wagens, beschikbaarheid] = await Promise.allSettled([startBasis(), loadFleet(), loadAvailability()]);
  const faq = (CONFIG.faq || []).filter((x) => x.vraag && x.antwoord);
  $('#vragen').hidden = !faq.length;
  for (const a of $$('[data-faq-link]')) a.hidden = !faq.length;
  $('#faq-lijst').replaceChildren(...faq.map(vraag));
  for (const s of [pv.vanUur, pv.totUur]) s.replaceChildren(...uren(CONFIG.uurVan, CONFIG.uurTot).map((t) => h('option', { value: t, text: t })));
  if (wagens.status !== 'fulfilled') { $('#vloot-fout').hidden = false; onthul(); return; }
  staat.wagens = wagens.value;
  if (beschikbaarheid.status === 'fulfilled') { staat.beschikbaarheid = beschikbaarheid.value; staat.vandaag = beschikbaarheid.value.vandaag; }
  toonFilters();
  const oud = herstel();
  if (oud) { staat.periode = oud; try { staat.vrij = await checkPeriod(oud); } catch { staat.periode = null; bewaar(); } }
  toonVloot();
  for (const id of ['wagens', 'huren', 'vragen', 'contact']) new IntersectionObserver((en) => { for (const e of en) if (e.isIntersecting) for (const a of $$('.nav-links a')) a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + id); }, { rootMargin: '-45% 0px -50% 0px' }).observe($('#' + id));
  document.documentElement.classList.add('is-klaar');
}
start();
