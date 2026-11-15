// Gedeeld door alle pagina's: hulpjes, contactgegevens invullen, navigatie, menu.
import { loadSettings, telefoon, metDag } from './data.js';

// Alle contactgegevens op één plek. Ze komen uit data/instellingen.json en worden beheerd in het beheerpaneel (/beheer).
export const CONFIG = { whatsapp: '', instagram: '', snapchat: '', facebook: '', tiktok: '', email: '', locatie: 'Kortrijk', adres: '', uurVan: '00:00', uurTot: '23:30', maxHuurDagen: 30, maxVooruitDagen: 180, bedrijfsnaam: '', ondernemingsnummer: '', zetel: '', faq: [], huurvoorwaarden: '', optieUren: 24 };

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
/** icoon uit de sprite (officiële merk-glyphs van simple-icons + eigen lijn-iconen) */
export function ico(naam, klasse = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  s.setAttribute('class', 'ico' + (klasse ? ' ' + klasse : '')); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '/rushrents/img/iconen.svg#' + naam); s.append(u);
  return s;
}
export const moment = (dag, uur) => `${metDag(dag)} ${uur}`;
export const waUrl = (tekst) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(tekst)}`;
export const waVraag = (naam = '') => waUrl(naam ? `Hallo Rush Rents, ik heb een vraag over de ${naam}.` : 'Hallo Rush Rents, ik heb een vraag over het huren van een wagen.');
export const plaats = () => (CONFIG.adres ? `${CONFIG.adres}, ${CONFIG.locatie}` : CONFIG.locatie || 'Kortrijk');

// navigatie: na 80 px scrollen lager en van glas (pagina's zonder hero zijn dat vanaf het begin: klasse is-vast). De haarlijn onderaan de balk
// toont hoe ver je in de pagina bent (--lees, van 0 tot 1); één keer per beeld bijgewerkt.
const nav = $('.nav');
if (nav && !nav.classList.contains('is-vast')) {
  let loopt = false;
  const zet = () => { loopt = false; nav.classList.toggle('is-scroll', scrollY > 80); const max = document.documentElement.scrollHeight - innerHeight; nav.style.setProperty('--lees', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : '0'); };
  addEventListener('scroll', () => { if (!loopt) { loopt = true; requestAnimationFrame(zet); } }, { passive: true }); zet();
}
// zolang de hero in beeld is, toont de navigatie alleen het monogram; daarna komt het woordmerk erbij
const hero = $('.hero');
if (nav && hero && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => nav.classList.toggle('boven-hero', e.isIntersecting), { rootMargin: '-120px 0px 0px 0px' }).observe(hero);
else nav?.classList.remove('boven-hero');

/** onthullen bij scrollen, één keer (de beweging zelf staat in css/site.css). Wat bij de start al in beeld staat, blijft gewoon staan. */
export function onthul() {
  const els = $$('[data-onthul]:not(.is-zicht)');
  if (!('IntersectionObserver' in window)) { for (const el of els) el.classList.add('is-zicht'); return; }
  // een wagenkaart wacht tot haar foto er is (hoogstens 1,2 s): anders opent het masker op een leeg vlak
  const toon = (el) => {
    const foto = el.matches('.car') && el.querySelector('.car-foto'), ga = () => el.classList.add('is-zicht');
    if (!foto || foto.complete) return ga();
    foto.addEventListener('load', ga, { once: true }); foto.addEventListener('error', ga, { once: true }); setTimeout(ga, 1200);
  };
  // wat samen in beeld komt en op dezelfde rij staat, volgt elkaar op: --trap is de plaats in de rij (0, 1, 2)
  const zie = (io) => (en) => {
    const nu = en.filter((e) => e.isIntersecting);
    for (const e of nu) {
      const r = e.boundingClientRect;
      e.target.style.setProperty('--trap', nu.filter((x) => Math.abs(x.boundingClientRect.top - r.top) < 4 && x.boundingClientRect.left < r.left).length);
      toon(e.target); io.unobserve(e.target);
    }
  };
  const io = new IntersectionObserver((en) => zie(io)(en), { rootMargin: '0px 0px -8% 0px' });
  const ioKaart = new IntersectionObserver((en) => zie(ioKaart)(en), { threshold: 0.25 }); // een wagenkaart opent pas als een kwart ervan in beeld is
  for (const el of els) { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-zicht'); else (el.matches('.car') ? ioKaart : io).observe(el); }
  document.documentElement.classList.add('onthul');
}

/** laadt de instellingen en vult alle contactplekken op de pagina in */
export async function startBasis() {
  try { Object.assign(CONFIG, await loadSettings()); } catch { /* pagina werkt verder met de standaardwaarden */ }
  for (const a of $$('[data-wa]')) a.href = waVraag();
  for (const el of $$('[data-telefoon]')) el.textContent = telefoon(CONFIG.whatsapp);
  for (const el of $$('[data-locatie]')) el.textContent = CONFIG.locatie || 'Kortrijk';
  for (const el of $$('[data-locatie-lang]')) el.textContent = plaats();
  if (CONFIG.email) for (const m of $$('[data-mail]')) { m.hidden = false; m.href = 'mailto:' + CONFIG.email; m.textContent = CONFIG.email; }
  const soc = $('#socials');
  if (soc) {
    soc.replaceChildren();
    const link = (naam, url, icoon) => url && soc.append(h('a', { href: url, target: '_blank', rel: 'noopener', 'aria-label': naam, class: 'social' }, ico(icoon)));
    link('Instagram', CONFIG.instagram && `https://www.instagram.com/${CONFIG.instagram}/`, 'instagram');
    link('Snapchat', CONFIG.snapchat && `https://www.snapchat.com/add/${CONFIG.snapchat}`, 'snapchat');
    link('Facebook', CONFIG.facebook, 'facebook');
    link('TikTok', CONFIG.tiktok, 'tiktok');
    soc.closest('.voet-kol').hidden = !soc.children.length;
  }
  const b = $('#voet-bedrijf');
  if (b) { const delen = [CONFIG.bedrijfsnaam && `Rush Rents is een handelsnaam van ${CONFIG.bedrijfsnaam}`, CONFIG.ondernemingsnummer, CONFIG.zetel && `Maatschappelijke zetel: ${CONFIG.zetel}`].filter(Boolean); b.textContent = delen.join(' · '); b.hidden = !delen.length; }
  for (const a of $$('[data-voorwaarden-link]')) a.hidden = !CONFIG.huurvoorwaarden;
  const menu = $('#menu');
  if (menu) {
    $('.nav .menu-knop').addEventListener('click', () => menu.showModal());
    $('[data-menu-sluit]').addEventListener('click', () => menu.close());
    for (const a of $$('.menu-links a')) a.addEventListener('click', () => menu.close());
  }
  return CONFIG;
}
