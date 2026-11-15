// Wagenpagina met reserveren: /reserveren/<wagen-id>. Stappen: Periode, Extra's, Gegevens, Controleren, daarna de bevestiging.
// De browserknoppen werken (elke stap is een #-adres) en wat je invulde blijft bewaard tot je de pagina sluit.
// De status (Beschikbaar / Niet beschikbaar) verschijnt pas nadat de bezoeker zelf een periode koos; de server beslist.
import { loadFleet, loadOccupancy, checkPeriod, requestReservation, iso, datum, plus, metDag, uren, leeftijdOp, MAANDEN, brusselMs, uurBestaat, nlDatum, isoUitNl, STATISCH } from './data.js';
import { huurdagen, berekenPrijs, getal, euro } from './prijs.js';
import { CONFIG, $, $$, h, ico, moment, waUrl, plaats, startBasis } from './basis.js';
import { fotoSet } from './fotos.js';

const id = location.pathname.replace(/^\/rushrents(?=\/)/, '').split('/').filter(Boolean)[1] || '';
const STAPPEN = ['periode', 'extras', 'gegevens', 'controleren'];
let W = null, bezet = { dagen: {}, stukken: [], nietBeschikbaar: false, vandaag: iso(new Date()), nu: new Date().toISOString(), omloopMinuten: 0 };
let vrij = null, maand0 = 0, kies = 'van', bezig = false, klaar = null, getoond = '', periodeFout = '', ronde = 0, wisselNr = 0;
const S = { van: '', tot: '', vanUur: '10:00', totUur: '10:00', extras: [], leeftijd: '', locatie: '', klant: { voornaam: '', naam: '', gsm: '', email: '', geboortedatum: '', rijbewijsSinds: '', rijbewijsCategorie: 'B' }, opmerking: '', akkoord: false };
const sleutel = 'rr.res.' + id;
const bewaar = () => { try { sessionStorage.setItem(sleutel, JSON.stringify({ ...S, akkoord: false })); } catch { /* zonder opslag blijft alles staan tot je de pagina sluit */ } };
/** de gekozen periode delen met de vloot op de startpagina: alleen na een eigen keuze die de server controleerde */
const deel = () => { try { sessionStorage.setItem('rr.periode', JSON.stringify({ van: S.van, vanUur: S.vanUur, tot: S.tot, totUur: S.totUur })); } catch { /* zonder opslag tonen de kaarten geen status */ } };
const lees = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
const klopt = () => !!(S.van && S.tot && brusselMs(S.tot, S.totUur) > brusselMs(S.van, S.vanUur));
const dagen = () => (klopt() ? huurdagen(S.van, S.vanUur, S.tot, S.totUur) : 0);
const dagTekst = (d) => `${d} ${d === 1 ? 'dag' : 'dagen'}`;
const gekozenExtras = () => (W.extras || []).filter((x) => S.extras.includes(x.naam));
const prijs = () => berekenPrijs(W, dagen(), gekozenExtras());
const minLeeftijd = () => { const n = parseInt(W.leeftijd, 10); return Number.isFinite(n) ? n : 0; };
const teJongKlasse = () => !!S.leeftijd && !!minLeeftijd() && Number(S.leeftijd) < minLeeftijd();
const vraagtA = () => W.categorie === 'Motor' || /\bA2?\b/.test(W.rijbewijs || '');
const laatsteDag = () => plus(bezet.vandaag, Math.max(1, Number(CONFIG.maxVooruitDagen) || 180));
const urenLijst = (dag = '') => uren(CONFIG.uurVan, CONFIG.uurTot).filter((u) => !dag || uurBestaat(dag, u));
const zeg = (t) => { $('#lees-voor').textContent = t; };
const stapNu = () => { const s = location.hash.slice(1); return s === 'klaar' && klaar ? 'klaar' : STAPPEN.includes(s) ? s : 'periode'; };
const ga = (s) => { if (location.hash === '#' + s) teken({ wissel: true }); else location.hash = s; };
function toonFout(t) { const f = $('#res-fout'); f.textContent = t; f.hidden = !t; }

// ---- uren: wat kan er niet (zelfde regels als de server: de omlooptijd geldt alleen rond reservaties) ----------
const stukken = () => bezet.stukken.map((x) => { const om = x.soort === 'blokkade' ? 0 : bezet.omloopMinuten * 60000; return [Date.parse(x.van) - om, Date.parse(x.tot) + om]; });
const afhaalKan = (dag, uur) => { const t = brusselMs(dag, uur); return t > Date.parse(bezet.nu) && !stukken().some(([a, b]) => t >= a && t < b); };
const terugKan = (dag, uur) => { const a0 = brusselMs(S.van, S.vanUur), t = brusselMs(dag, uur); return t > a0 && !stukken().some(([a, b]) => a < t && b > a0); };
function eersteUur(dag, test, voorkeur) { const l = urenLijst(dag); return l.includes(voorkeur) && test(dag, voorkeur) ? voorkeur : l.find((u) => u >= voorkeur && test(dag, u)) || l.find((u) => test(dag, u)) || voorkeur; }
/** kan deze dag de dag van terugbrengen zijn? Ook een volle dag kan dat, als de wagen er om 00:00 terug mag staan. */
const eindKan = (dag) => !!S.van && dag >= S.van && urenLijst(dag).some((u) => terugKan(dag, u));

/** zet de dag van afhalen ('van') of terugbrengen ('tot'); geeft een foutmelding of '' */
function kiesDatum(wat, dag) {
  if (dag < bezet.vandaag) return 'Deze dag is voorbij.';
  if (dag > laatsteDag()) return 'Zo ver vooruit reserveer je via WhatsApp.';
  if (wat === 'van') {
    if (bezet.nietBeschikbaar || bezet.dagen[dag] === 'vol' || !urenLijst(dag).some((u) => afhaalKan(dag, u))) return `De wagen is niet beschikbaar op ${metDag(dag)}.`;
    S.van = dag; S.vanUur = eersteUur(dag, afhaalKan, S.vanUur);
    if (S.tot) { if (eindKan(S.tot)) S.totUur = eersteUur(S.tot, terugKan, S.totUur); else S.tot = ''; }
    kies = S.tot ? 'van' : 'tot';
    return '';
  }
  if (!S.van) return 'Kies eerst de dag van afhalen.';
  if (dag < S.van) return 'Het terugbrengen moet na het afhalen liggen.';
  if (!eindKan(dag)) {
    for (let d = S.van; d <= dag; d = plus(d, 1)) if (bezet.dagen[d] === 'vol') return `Die periode loopt over een dag waarop de wagen niet beschikbaar is (${metDag(d)}). Kies een andere dag om terug te brengen.`;
    return 'In die periode is de wagen niet beschikbaar. Kies een andere dag om terug te brengen.';
  }
  S.tot = dag; S.totUur = eersteUur(dag, terugKan, S.totUur); kies = 'van';
  return '';
}
function pasToe(wat, dag) {
  periodeFout = kiesDatum(wat, dag);
  if (periodeFout) { teken(); return; }
  toonMaand(wat === 'van' ? S.van : S.tot);
  controleer();
}
function toonMaand(dag) {
  const start = datum(bezet.vandaag), d = datum(dag), i = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth(), breed = matchMedia('(min-width: 1000px)').matches ? 2 : 1;
  if (i < maand0) maand0 = i; else if (i > maand0 + breed - 1) maand0 = i - breed + 1;
}
async function controleer() {
  vrij = null;
  const mijn = ++ronde;
  bewaar();
  if (!klopt()) { teken(); return; }
  if (dagen() > (Number(CONFIG.maxHuurDagen) || 30)) { periodeFout = 'Neem contact op via WhatsApp voor langere huur.'; teken(); return; }
  teken();
  try { const r = await checkPeriod({ van: S.van, vanUur: S.vanUur, tot: S.tot, totUur: S.totUur }, id); if (mijn !== ronde) return; vrij = !!r[id]; periodeFout = ''; deel(); }
  catch (e) { if (mijn !== ronde) return; periodeFout = e.message; }
  if (vrij !== null) zeg(`Afhalen ${moment(S.van, S.vanUur)}, terugbrengen ${moment(S.tot, S.totUur)}. ${vrij ? 'Beschikbaar' : 'Niet beschikbaar'}.`);
  teken();
}

// ---- galerij ----------------------------------------------------------------------------------
function bouwGalerij() {
  const gal = $('#galerij'), baan = $('#gal-baan'), eerste = $('#hoofdfoto');
  const fotos = [...(W.hoofdfoto ? [W.hoofdfoto] : []), ...W.fotos.filter((f) => f !== W.hoofdfoto)];
  // elke foto krijgt haar kleinere versies (avif) mee waar die bestaan; de foto zelf blijft de terugval. De <img> blijft het element waarmee de galerij werkt.
  const metMaten = (img, f, sizes) => { const set = fotoSet(f); if (set) h('picture', { class: 'gal-beeld' }, h('source', { type: 'image/avif', srcset: set, sizes }), img); return img; };
  const GROOT = '(min-width: 1000px) calc(min(100vw - 80px, 1240px) - 464px), (min-width: 640px) calc(100vw - 64px), 100vw';
  const dias = fotos.map((f, i) => (i === 0 && eerste ? eerste : metMaten(h('img', { class: 'gal-dia' + (i === 0 ? ' is-actief' : ''), src: '/rushrents/media/' + f, alt: `${W.naam}, foto ${i + 1}`, loading: i === 0 ? 'eager' : 'lazy', decoding: 'async', width: 840, height: 560 }), f, GROOT)));
  for (const v of W.videos) dias.push(h('video', { class: 'gal-dia', src: '/rushrents/media/' + v, controls: true, muted: true, playsinline: true, preload: 'none', poster: W.hoofdfoto ? '/rushrents/media/' + W.hoofdfoto : null, 'aria-label': `Video van de ${W.naam}` }));
  if (!dias.length) { gal.hidden = true; return; }
  if (!dias[0].classList.contains('is-actief')) dias[0].classList.add('is-actief');
  baan.replaceChildren(...dias.map((d) => d.closest('picture') || d)); // de hoofdfoto blijft in haar <picture> (kleinere versies, zie tools/foto-maten.mjs)
  if (dias.length < 2) return;
  const teller = h('p', { class: 'gal-teller', 'aria-hidden': 'true', text: `1 / ${dias.length}` });
  const duimen = dias.map((d, i) => h('button', { type: 'button', class: 'gal-duim' + (i === 0 ? ' is-actief' : ''), 'aria-label': d.tagName === 'VIDEO' ? 'Video' : `Foto ${i + 1}`, 'aria-pressed': String(i === 0), onclick: () => toon(i, true) },
    ((f) => { const img = metMaten(h('img', { src: '/rushrents/media/' + f, alt: '', loading: 'lazy', width: 88, height: 59 }), f, '88px'); return img.closest('picture') || img; })(d.tagName === 'VIDEO' ? W.hoofdfoto : fotos[i])));
  let nu = 0;
  const vegen = () => getComputedStyle(baan).display === 'flex';
  function toon(i, schuif) {
    nu = Math.max(0, Math.min(dias.length - 1, i));
    dias.forEach((d, n) => d.classList.toggle('is-actief', n === nu));
    duimen.forEach((d, n) => { d.classList.toggle('is-actief', n === nu); d.setAttribute('aria-pressed', String(n === nu)); });
    teller.textContent = `${nu + 1} / ${dias.length}`;
    if (schuif && vegen()) baan.scrollTo({ left: nu * baan.clientWidth, behavior: 'smooth' });
  }
  baan.tabIndex = 0;
  baan.setAttribute('role', 'group');
  baan.setAttribute('aria-label', `Foto's van de ${W.naam}`);
  baan.addEventListener('scroll', () => { if (!vegen()) return; const i = Math.round(baan.scrollLeft / baan.clientWidth); if (i !== nu) toon(i, false); }, { passive: true });
  baan.addEventListener('keydown', (e) => { const stap = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (stap) { e.preventDefault(); toon(nu + stap, true); } });
  gal.append(teller, h('div', { class: 'gal-duimen' }, ...duimen));
}

// ---- kalender ---------------------------------------------------------------------------------
function kalender() {
  const start = datum(bezet.vandaag), eind = datum(laatsteDag()), breed = matchMedia('(min-width: 1000px)').matches ? 2 : 1;
  const max = Math.max(0, (eind.getFullYear() - start.getFullYear()) * 12 + eind.getMonth() - start.getMonth() + 1 - breed);
  maand0 = Math.max(0, Math.min(max, maand0));
  const maanden = Array.from({ length: breed }, (_, i) => new Date(start.getFullYear(), start.getMonth() + maand0 + i, 1));
  const klik = (dag) => {
    const wat = kies === 'van' || !S.van || dag < S.van ? 'van' : 'tot';
    if (wat === 'van') S.tot = '';
    pasToe(wat, dag);
  };
  const el = h('div', { class: 'kal' },
    h('button', { type: 'button', class: 'kal-pijl is-vorige', id: 'kal-vorige', 'aria-label': 'Vorige maand', disabled: maand0 === 0, onclick: () => { maand0--; teken(); } }, ico('links')),
    h('button', { type: 'button', class: 'kal-pijl is-volgende', id: 'kal-volgende', 'aria-label': 'Volgende maand', disabled: maand0 >= max, onclick: () => { maand0++; teken(); } }, ico('rechts')),
    h('div', { class: 'kal-maanden' }, ...maanden.map((m) => {
      const aantal = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const cellen = Array.from({ length: (m.getDay() + 6) % 7 }, () => h('span', { class: 'dag leeg' }));
      for (let d = 1; d <= aantal; d++) {
        const dag = iso(new Date(m.getFullYear(), m.getMonth(), d));
        const voorbij = dag < bezet.vandaag || dag > laatsteDag(), vol = !voorbij && (bezet.nietBeschikbaar || bezet.dagen[dag] === 'vol');
        const alsEinde = vol && !bezet.nietBeschikbaar && kies === 'tot' && eindKan(dag);
        const inKeuze = S.van && S.tot && dag > S.van && dag < S.tot, rand = dag === S.van || dag === S.tot;
        cellen.push(h('button', { type: 'button', class: ['dag', voorbij && 'is-voorbij', vol && 'is-bezet', inKeuze && 'is-keuze', rand && 'is-rand', dag === bezet.vandaag && 'is-vandaag'].filter(Boolean).join(' '), 'data-dag': dag, disabled: voorbij || (vol && !alsEinde), 'aria-pressed': rand ? 'true' : null,
          'aria-label': `${metDag(dag)}${vol ? ', niet beschikbaar' : voorbij ? ', niet te kiezen' : ''}${dag === S.van ? ', afhalen' : dag === S.tot ? ', terugbrengen' : ''}`, onclick: () => klik(dag) }, h('span', { text: String(d) })));
      }
      return h('section', { class: 'maand' }, h('h3', { class: 'maand-titel', text: `${MAANDEN[m.getMonth()]} ${m.getFullYear()}` }), h('div', { class: 'weekdagen', 'aria-hidden': 'true' }, ...['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((t) => h('span', { text: t }))), h('div', { class: 'dagen' }, ...cellen));
    })),
    h('p', { class: 'kal-legenda' }, h('s', { text: '12' }), 'Niet beschikbaar'));
  el.addEventListener('keydown', (e) => { // pijltjestoetsen tussen de dagen
    const stap = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key], van = e.target.dataset?.dag;
    if (!stap || !van) return;
    e.preventDefault();
    for (let d = plus(van, stap), i = 0; i < 60; d = plus(d, Math.sign(stap)), i++) { const b = $(`[data-dag="${d}"]:not(:disabled)`, el); if (b) { b.focus(); break; } }
  });
  return el;
}
/** dag (intypen als dd/mm/jjjj of aanklikken in de kalender) + uur */
function momentVeld(wat) {
  const van = wat === 'van', dag = van ? S.van : S.tot, uur = van ? S.vanUur : S.totUur, kan = van ? afhaalKan : terugKan, naam = van ? 'Afhalen' : 'Terugbrengen';
  const inp = h('input', { id: 'veld-' + wat, type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'dd/mm/jjjj', maxlength: 10, value: nlDatum(dag) });
  const verwerk = () => {
    const t = inp.value.trim();
    if (!t || t === nlDatum(dag)) return;
    const nieuw = isoUitNl(t);
    if (!nieuw) { periodeFout = 'Typ de datum als dd/mm/jjjj.'; teken(); return; }
    pasToe(wat, nieuw);
  };
  inp.addEventListener('input', (e) => {
    if (e.inputType?.startsWith('insert')) { inp.value = inp.value.replace('//', '/'); if (/^\d{2}$/.test(inp.value) || /^\d{2}\/\d{2}$/.test(inp.value)) inp.value += '/'; }
    if (inp.value.length === 10 && isoUitNl(inp.value)) verwerk();
  });
  inp.addEventListener('focus', () => { kies = van || !S.van ? 'van' : 'tot'; });
  inp.addEventListener('change', verwerk);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); verwerk(); } });
  const kiesUur = h('select', { id: 'uur-' + wat, 'aria-label': `Uur van ${naam.toLowerCase()}`, disabled: !dag, onchange: (e) => {
    if (van) { S.vanUur = e.target.value; if (S.tot) { if (eindKan(S.tot)) S.totUur = eersteUur(S.tot, terugKan, S.totUur); else S.tot = ''; } } else S.totUur = e.target.value;
    periodeFout = ''; controleer();
  } }, ...urenLijst(dag).map((u) => h('option', { value: u, text: u, selected: u === uur, disabled: dag ? !kan(dag, u) : null })));
  return h('div', { class: 'veld' }, h('label', { for: 'veld-' + wat, text: naam }), h('span', { class: 'veld-rij' }, inp, kiesUur));
}

// ---- stappen ----------------------------------------------------------------------------------
// leeftijd: eigen keuzelijst met elk getal apart (listbox); op gsm een blad onderaan, op desktop een lijst in het midden
function leeftijdVeld() {
  const jaren = Array.from({ length: 53 }, (_, i) => String(18 + i));
  const toon = (v) => (v === '70' ? '70+' : v);
  const lijst = h('ul', { class: 'lft-lijst', role: 'listbox', 'aria-label': 'Leeftijd bestuurder', tabindex: '-1' }, ...jaren.map((v) => h('li', { role: 'option', 'data-v': v, 'aria-selected': String(v === S.leeftijd), tabindex: '-1', text: toon(v) })));
  const dlg = h('dialog', { class: 'lft' }, h('p', { class: 'lft-kop', text: 'Leeftijd bestuurder' }), lijst);
  const knop = h('button', { type: 'button', class: 'lft-veld', id: 'leeftijd', 'aria-haspopup': 'listbox' }, h('span', { text: S.leeftijd ? toon(S.leeftijd) + ' jaar' : 'Kies leeftijd' }), ico('chevron'));
  const kiesL = (v) => { S.leeftijd = v; bewaar(); dlg.close(); teken(); };
  const focus = (v) => { const li = lijst.querySelector(`[data-v="${v}"]`); if (li) { li.focus(); li.scrollIntoView({ block: 'center' }); } };
  let getypt = '', klok;
  knop.addEventListener('click', () => { dlg.showModal(); focus(S.leeftijd || String(Math.max(18, minLeeftijd() || 23))); });
  lijst.addEventListener('click', (e) => { const v = e.target.dataset?.v; if (v) kiesL(v); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', (e) => {
    const nu = document.activeElement?.dataset?.v, i = jaren.indexOf(nu);
    if (e.key === 'ArrowDown') { e.preventDefault(); focus(jaren[Math.min(jaren.length - 1, i + 1)]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focus(jaren[Math.max(0, i - 1)]); }
    else if (e.key === 'Enter' && nu) { e.preventDefault(); kiesL(nu); }
    else if (/^\d$/.test(e.key)) { getypt = (getypt + e.key).slice(-2); clearTimeout(klok); klok = setTimeout(() => { getypt = ''; }, 900); const doel = jaren.find((v) => v.startsWith(getypt)) || jaren.find((v) => v === getypt); if (doel) focus(doel); }
  });
  return h('div', { class: 'invoer' }, h('span', { text: 'Leeftijd bestuurder' }), knop, dlg, teJongKlasse() && h('span', { class: 'fout', id: 'leeftijd-fout', text: `Deze wagen vraagt minstens ${minLeeftijd()} jaar` }));
}
function statusRegel() {
  if (periodeFout) return h('p', { class: 'res-status fout', id: 'status', role: 'alert', text: periodeFout });
  const toon = bezet.nietBeschikbaar || vrij !== null, ok = !bezet.nietBeschikbaar && vrij === true;
  return h('p', { class: 'res-status' + (toon ? ' status' + (ok ? ' is-ok' : '') : ''), id: 'status', role: 'status', text: toon ? (ok ? 'Beschikbaar' : 'Niet beschikbaar') : '' });
}
function stapPeriode() {
  const specs = [['Soort', W.categorie], ['Minimumleeftijd', W.leeftijd], ['Rijbewijs', W.rijbewijs], ['Platen', W.platen], ['Kilometers', W.kmInbegrepen], ['Extra kilometer', W.prijsExtraKm], ['Borg', getal(W.borg) ? euro(getal(W.borg)) : ''], ['Versnelling', W.versnelling], ['Brandstof', W.brandstof], ['Zitplaatsen', W.zitplaatsen], ['Actie', W.actie], ['Afhalen in', plaats()]].filter(([, v]) => v);
  return [
    h('div', { class: 'blok' },
      h('h2', { text: 'Afhalen en terugbrengen', tabindex: '-1' }),
      h('div', { class: 'pv' }, momentVeld('van'), momentVeld('tot')),
      kalender(),
      statusRegel(),
      leeftijdVeld()),
    h('div', { class: 'blok' }, h('h2', { text: 'Over deze wagen' }),
      h('dl', { class: 'specs' + (specs.length > 5 ? ' is-twee' : '') }, ...specs.flatMap(([a, b]) => [h('dt', { text: a }), h('dd', { text: b })])),
      h('a', { class: 'tekstknop', id: 'wa-vraag', href: waUrl(`Hallo Rush Rents, ik heb een vraag over de ${W.naam}.`), target: '_blank', rel: 'noopener' }, ico('whatsapp', 'ico-wa'), 'Vraag stellen via WhatsApp')),
  ];
}
function stapExtras() {
  const lijst = W.extras || [];
  return [h('div', { class: 'blok' }, h('h2', { text: 'Extra\'s', tabindex: '-1' }),
    lijst.length ? h('div', {}, ...lijst.map((x) => h('label', { class: 'optie' }, h('input', { type: 'checkbox', checked: S.extras.includes(x.naam) || null, onchange: (e) => { S.extras = e.target.checked ? [...S.extras, x.naam] : S.extras.filter((n) => n !== x.naam); bewaar(); tekenRand(); } }), h('span', { text: x.naam }), h('small', { text: getal(x.prijsDag) ? `+ ${euro(getal(x.prijsDag))} per dag` : 'Prijs bij bevestiging' })))) : null,
    h('label', { class: 'invoer' }, h('span', { text: 'Afhalen of terugbrengen op een ander adres (optioneel, op aanvraag)' }), h('input', { id: 'ander-adres', value: S.locatie, maxlength: 160, autocomplete: 'street-address', oninput: (e) => { S.locatie = e.target.value; bewaar(); } })),
    h('label', { class: 'invoer' }, h('span', { text: 'Opmerking (optioneel)' }), h('textarea', { id: 'opmerking', rows: 3, maxlength: 600, oninput: (e) => { S.opmerking = e.target.value; bewaar(); } }, S.opmerking)))];
}
const VELDEN = [['voornaam', 'Voornaam', { autocomplete: 'given-name' }], ['naam', 'Naam', { autocomplete: 'family-name' }], ['gsm', 'Gsm', { type: 'tel', inputmode: 'tel', autocomplete: 'tel' }], ['email', 'E-mail', { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off' }], ['geboortedatum', 'Geboortedatum', { type: 'date', autocomplete: 'bday' }], ['rijbewijsSinds', 'Rijbewijs sinds (jaar)', { inputmode: 'numeric', maxlength: 4 }]];
function veldFout(naam) {
  const k = S.klant, v = String(k[naam] || '').trim();
  if (naam === 'voornaam' && !v) return 'Vul je voornaam in.';
  if (naam === 'naam' && !v) return 'Vul je naam in.';
  if (naam === 'gsm' && !/^(\+|00)?[\d\s./-]{9,17}$/.test(v)) return 'Vul een Belgisch of Nederlands gsm-nummer in, met of zonder landcode.';
  if (naam === 'email' && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return 'Dit e-mailadres klopt niet.';
  if (naam === 'geboortedatum') { if (!v) return 'Vul je geboortedatum in.'; const min = minLeeftijd() || 18; const echt = leeftijdOp(v, S.van || bezet.vandaag); if (echt < min) return minLeeftijd() ? `Voor de ${W.naam} moet de bestuurder minstens ${min} jaar zijn op de dag van afhalen.` : 'De bestuurder moet minstens 18 jaar zijn.'; if (S.leeftijd && (S.leeftijd === '70' ? echt < 70 : Math.abs(echt - Number(S.leeftijd)) > 1)) return `Je geboortedatum past niet bij de gekozen leeftijd (${S.leeftijd === '70' ? '70+' : S.leeftijd}).`; }
  if (naam === 'rijbewijsSinds' && (!/^(19|20)\d{2}$/.test(v) || Number(v) > Number(bezet.vandaag.slice(0, 4)) || (k.geboortedatum && Number(v) < Number(k.geboortedatum.slice(0, 4)) + 18))) return 'Vul het jaar in waarin je je rijbewijs haalde.';
  return '';
}
function stapGegevens() {
  const rij = ([naam, label, extra]) => { const fout = h('span', { class: 'fout', id: 'fout-' + naam, role: 'alert' });
    const inp = h('input', { name: naam, id: 'k-' + naam, value: S.klant[naam], 'aria-describedby': 'fout-' + naam, ...extra, oninput: (e) => { S.klant[naam] = e.target.value; bewaar(); }, onblur: () => { const f = veldFout(naam); fout.textContent = f; inp.toggleAttribute('aria-invalid', !!f); } });
    return h('label', { class: 'invoer' }, h('span', { text: label }), inp, fout); };
  return [h('form', { class: 'blok', id: 'gegevens', novalidate: true, onsubmit: (e) => { e.preventDefault(); verder(); } }, h('h2', { text: 'Jouw gegevens', tabindex: '-1' }),
    h('div', { class: 'rooster' }, ...VELDEN.map(rij),
      vraagtA() && h('label', { class: 'invoer' }, h('span', { text: 'Categorie rijbewijs' }), h('select', { name: 'rijbewijsCategorie', id: 'k-categorie', onchange: (e) => { S.klant.rijbewijsCategorie = e.target.value; bewaar(); } }, ...['A2', 'A'].map((c) => h('option', { value: c, text: c, selected: c === S.klant.rijbewijsCategorie }))), h('span', { class: 'fout', id: 'fout-rijbewijsCategorie', role: 'alert' })),
      h('label', { class: 'honing', 'aria-hidden': 'true' }, h('span', { text: 'Website' }), h('input', { name: 'website', id: 'website', tabindex: '-1', autocomplete: 'off' }))),
    h('button', { type: 'submit', class: 'vh', tabindex: '-1', text: 'Verder' }))];
}
function stapControleren() {
  const k = S.klant, p = prijs();
  const blok = (titel, stap, rijen) => h('div', { class: 'blok' + (titel === 'Prijs' ? ' alleen-smal' : '') }, h('div', { class: 'wijzig-rij' }, h('h2', { text: titel, tabindex: stap === 'periode' ? '-1' : null }), stap && h('a', { class: 'tekstknop', href: '#' + stap, text: 'Wijzig' })), h('dl', { class: 'specs' }, ...rijen.filter(([, v]) => v).flatMap(([a, b]) => [h('dt', { text: a }), h('dd', { text: b })])));
  return [
    blok('Periode', 'periode', [['Wagen', W.naam], ['Afhalen', moment(S.van, S.vanUur)], ['Terugbrengen', moment(S.tot, S.totUur)], ['Huurperiode', dagTekst(dagen())], ['Plaats', plaats()]]),
    (gekozenExtras().length || S.locatie || S.opmerking) ? blok('Extra\'s', 'extras', [['Extra\'s', gekozenExtras().map((x) => x.naam).join(', ')], ['Ander adres', S.locatie], ['Opmerking', S.opmerking]]) : null,
    blok('Gegevens', 'gegevens', [['Naam', `${k.voornaam} ${k.naam}`], ['Gsm', k.gsm], ['E-mail', k.email], ['Geboortedatum', nlDatum(k.geboortedatum)], ['Rijbewijs', (vraagtA() ? k.rijbewijsCategorie + ', ' : '') + 'sinds ' + k.rijbewijsSinds]]),
    blok('Prijs', '', [...(p ? p.regels.map((x) => [x.tekst, euro(x.bedrag)]) : []), [p ? 'Totaal' : 'Prijs', p ? euro(p.totaal) : 'Bij bevestiging'], ['Borg', getal(W.borg) ? euro(getal(W.borg)) : '']]),
    h('div', { class: 'blok' },
      h('p', { class: 'let', text: STATISCH ? 'Je aanvraag gaat als bericht naar Rush Rents op WhatsApp. Daar bevestigt Rush Rents je reservatie persoonlijk.' : 'Zolang je aanvraag de status Aangevraagd heeft, annuleer je gratis via Mijn reservatie.' }),
      CONFIG.huurvoorwaarden ? h('label', { class: 'vink' }, h('input', { type: 'checkbox', id: 'akkoord', checked: S.akkoord || null, onchange: (e) => { S.akkoord = e.target.checked; } }), h('span', {}, 'Ik ga akkoord met de ', h('a', { href: '/rushrents/voorwaarden/', target: '_blank', rel: 'noopener', text: 'huurvoorwaarden' }))) : null),
  ];
}
function ics(r) {
  const t = (m) => m.dag.replaceAll('-', '') + 'T' + m.uur.replace(':', '') + '00';
  const tekst = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rush Rents//Reservatie//NL', 'BEGIN:VEVENT', `UID:${r.nr}@rushrents`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')}`, `DTSTART;TZID=Europe/Brussels:${t(r.afhalen)}`, `DTEND;TZID=Europe/Brussels:${t(r.terugbrengen)}`, `SUMMARY:Rush Rents: ${r.wagenNaam} (${r.nr})`, `LOCATION:${plaats()}`, `DESCRIPTION:Afhalen ${moment(r.afhalen.dag, r.afhalen.uur)}\\, terugbrengen ${moment(r.terugbrengen.dag, r.terugbrengen.uur)}. Status bij aanvraag: aangevraagd.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return URL.createObjectURL(new Blob([tekst], { type: 'text/calendar' }));
}
function stapKlaar() {
  const r = klaar;
  if (r.statisch) return [h('div', { class: 'blok' }, h('h2', { class: 'vh', text: 'Je aanvraag staat klaar in WhatsApp', tabindex: '-1' }),
    h('p', { class: 'status is-ok', text: 'Klaar in WhatsApp' }),
    h('p', { text: 'WhatsApp opent met je aanvraag. Verstuur het bericht daar. Rush Rents bevestigt je reservatie persoonlijk via WhatsApp.' }),
    h('dl', { class: 'specs' }, ...[['Wagen', r.wagenNaam], ['Afhalen', moment(r.afhalen.dag, r.afhalen.uur)], ['Terugbrengen', moment(r.terugbrengen.dag, r.terugbrengen.uur)], ['Plaats', plaats()]].flatMap(([a, b]) => [h('dt', { text: a }), h('dd', { text: b })])),
    h('div', { class: 'knoppen' }, h('a', { class: 'btn btn-wit', id: 'res-wa', href: r.wa, target: '_blank', rel: 'noopener' }, ico('whatsapp', 'ico-wa'), 'Open WhatsApp opnieuw')))];
  return [h('div', { class: 'blok' }, h('h2', { class: 'vh', text: 'Je aanvraag is verstuurd', tabindex: '-1' }), h('p', { class: 'klein', text: 'Reservatienummer' }), h('p', { class: 'nummer', id: 'res-nummer', text: r.nr }),
    h('p', { class: 'status is-ok', text: 'Aangevraagd' }),
    h('p', { text: `Rush Rents bevestigt je reservatie persoonlijk via WhatsApp of telefoon. De wagen blijft ${CONFIG.optieUren} uur voor jou gereserveerd.` }),
    h('dl', { class: 'specs' }, ...[['Wagen', r.wagenNaam], ['Afhalen', moment(r.afhalen.dag, r.afhalen.uur)], ['Terugbrengen', moment(r.terugbrengen.dag, r.terugbrengen.uur)], ['Plaats', plaats()]].flatMap(([a, b]) => [h('dt', { text: a }), h('dd', { text: b })])),
    h('div', { class: 'knoppen' },
      h('a', { class: 'btn btn-wit', id: 'ics', href: ics(r), download: `rush-rents-${r.nr}.ics`, text: 'Zet in agenda' }),
      h('a', { class: 'btn btn-lijn', id: 'res-link', href: `/rushrents/reservatie/?nr=${encodeURIComponent(r.nr)}`, text: 'Bekijk je reservatie' }),
      h('a', { class: 'btn btn-lijn', id: 'res-wa', href: waUrl(`Hallo Rush Rents, ik heb zonet reservatie ${r.nr} aangevraagd: ${r.wagenNaam}, van ${moment(r.afhalen.dag, r.afhalen.uur)} tot ${moment(r.terugbrengen.dag, r.terugbrengen.uur)}.`), target: '_blank', rel: 'noopener' }, ico('whatsapp', 'ico-wa'), 'Stuur ook via WhatsApp')))];
}

// ---- samenvatting + knoppen -------------------------------------------------------------------
function hint() {
  if (stapNu() !== 'periode') return '';
  if (bezet.nietBeschikbaar) return 'Deze wagen is nu niet beschikbaar.';
  if (!S.van) return 'Kies de dag van afhalen.';
  if (!S.tot) return 'Kies de dag van terugbrengen.';
  if (teJongKlasse()) return `Deze wagen vraagt minstens ${minLeeftijd()} jaar.`;
  if (vrij === false) return 'Kies een andere periode.';
  return '';
}
function prijsRij() { const p = prijs(), dag = getal(W.prijsDag); return p ? ['Totaal', euro(p.totaal)] : ['Prijs', dag ? `${euro(dag)} per dag` : 'Bij bevestiging']; }
function overzicht(stap) {
  const p = prijs(), d = dagen(), [prijsNaam, prijsTekst] = prijsRij();
  const rij = (a, b, klasse = '') => h('p', { class: 'som-rij' + (klasse ? ' ' + klasse : '') }, h('span', { text: a }), typeof b === 'string' ? h('span', { text: b }) : b);
  return h('div', { class: 'ov' }, h('h2', { text: 'Je reservatie' }),
    rij('Afhalen', S.van ? moment(S.van, S.vanUur) : h('span', { class: 'is-leeg', text: 'Kies een dag' })),
    rij('Terugbrengen', S.tot ? moment(S.tot, S.totUur) : h('span', { class: 'is-leeg', text: 'Kies een dag' })),
    d ? rij('Huurperiode', dagTekst(d)) : null,
    ...(p && p.regels.length > 1 ? p.regels.map((x) => rij(x.tekst, euro(x.bedrag))) : []),
    rij(prijsNaam, p ? h('strong', { id: 'totaal', text: prijsTekst }) : h('span', { id: 'totaal', text: prijsTekst }), 'is-totaal'),
    getal(W.borg) ? rij('Borg', euro(getal(W.borg))) : null,
    stap !== 'klaar' && knop('ov-knop'),
    stap !== 'klaar' && h('p', { class: 'ov-hint', text: hint() }));
}
function knopTekst() { const s = stapNu(); return s === 'controleren' ? (bezig ? 'Even geduld' : STATISCH ? 'Verstuur via WhatsApp' : 'Reservatie aanvragen') : 'Verder'; }
function magVerder() { const s = stapNu(); if (s === 'periode') return vrij === true && klopt() && !bezet.nietBeschikbaar && !teJongKlasse(); if (s === 'controleren') return !bezig; return true; }
function knop(klasse = '') { return h('button', { type: 'button', class: `btn btn-wit verder ${klasse}`, id: klasse || 'voet-knop', disabled: !magVerder(), onclick: verder, text: knopTekst() }); }
async function verder() {
  const s = stapNu(); toonFout('');
  if (s === 'periode') return magVerder() && ga('extras');
  if (s === 'extras') return ga('gegevens');
  if (s === 'gegevens') {
    const fout = VELDEN.map(([n]) => [n, veldFout(n)]).find(([, f]) => f);
    if (fout) { const inp = $(`[name="${fout[0]}"]`); $('#fout-' + fout[0]).textContent = fout[1]; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
    return ga('controleren');
  }
  if (bezig) return;
  if (CONFIG.huurvoorwaarden && !S.akkoord) return toonFout('Vink aan dat je akkoord gaat met de huurvoorwaarden.');
  bezig = true; tekenRand();
  try {
    klaar = await requestReservation({ wagenId: id, van: S.van, vanUur: S.vanUur, tot: S.tot, totUur: S.totUur, extras: S.extras, leeftijd: S.leeftijd, klant: S.klant, locatie: S.locatie, opmerking: S.opmerking, akkoord: S.akkoord, website: $('#website')?.value || '' });
    bezig = false; try { sessionStorage.removeItem(sleutel); } catch { /* niets te wissen */ }
    ga('klaar');
  } catch (e) {
    bezig = false;
    if (e.veld === 'periode') { try { bezet = { ...bezet, ...(await loadOccupancy(id)) }; } catch { /* kalender blijft zoals hij was */ } vrij = false; periodeFout = e.message; ga('periode'); }
    else if (e.veld && e.status !== 429) { ga('gegevens'); setTimeout(() => { const inp = $(`[name="${e.veld}"]`); if (inp) { $('#fout-' + e.veld).textContent = e.message; inp.setAttribute('aria-invalid', 'true'); inp.focus(); } else toonFout(e.message); }, 400); }
    else { tekenRand(); toonFout(e.message); }
  }
}

// ---- tekenen ----------------------------------------------------------------------------------
const BOUW = { periode: stapPeriode, extras: stapExtras, gegevens: stapGegevens, controleren: stapControleren, klaar: stapKlaar };
/** alles rond de stap: samenvatting, voortgang, vaste balk op gsm */
function tekenRand(s = stapNu()) {
  $('#overzicht').replaceChildren(overzicht(s));
  const lijst = $('#voortgang'); lijst.classList.toggle('is-klaar', s === 'klaar');
  for (const li of $$('li', lijst)) { const i = STAPPEN.indexOf(li.dataset.stap), nu = s === 'klaar' ? STAPPEN.length : STAPPEN.indexOf(s); li.classList.toggle('is-nu', i === nu); li.classList.toggle('is-af', i < nu); if (i === nu) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); }
  const voet = $('#res-voet'), [, prijsTekst] = prijsRij(), p = prijs(); voet.hidden = s === 'klaar';
  voet.replaceChildren(h('div', { class: 'som' }, h('strong', { text: p ? prijsTekst : prijsTekst === 'Bij bevestiging' ? 'Prijs bij bevestiging' : prijsTekst }), h('span', { text: klopt() ? dagTekst(dagen()) : 'Kies je periode' })), knop());
}
function teken({ wissel = false } = {}) {
  if (!W) return;
  let s = stapNu();
  if (s !== 'periode' && s !== 'klaar' && !(vrij === true && klopt())) { history.replaceState(null, '', '#periode'); s = 'periode'; } // zonder geldige periode altijd terug naar stap 1
  const stap = $('#stap'), doos = $('#stap-doos'), mijn = ++wisselNr;
  const inhoud = () => BOUW[s]().flat().filter(Boolean);
  const zacht = wissel && getoond && getoond !== s && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  tekenRand(s);
  if (!zacht) { // zelfde stap: inhoud vervangen en de focus op dezelfde plek houden
    const a = document.activeElement, kies2 = a && stap.contains(a) ? (a.id ? '#' + a.id : a.dataset?.dag ? `[data-dag="${a.dataset.dag}"]` : '') : '';
    stap.classList.remove('is-weg'); doos.style.height = ''; doos.classList.remove('is-bezig');
    stap.replaceChildren(...inhoud()); getoond = s;
    if (kies2) { const el = $(kies2, stap); if (el && !el.disabled) { el.focus({ preventScroll: true }); if (el.type === 'text') el.setSelectionRange(el.value.length, el.value.length); } }
    return;
  }
  // andere stap: oude inhoud vervaagt, de hoogte loopt mee, nieuwe inhoud verschijnt
  doos.style.height = doos.offsetHeight + 'px'; doos.classList.add('is-bezig'); stap.classList.add('is-weg');
  setTimeout(() => {
    if (mijn !== wisselNr) return;
    stap.replaceChildren(...inhoud()); getoond = s;
    doos.style.height = stap.offsetHeight + 'px'; stap.classList.remove('is-weg');
    $('h2', stap)?.focus({ preventScroll: true });
    setTimeout(() => { if (mijn !== wisselNr) return; doos.style.height = ''; doos.classList.remove('is-bezig'); }, 270);
  }, 100);
}
/** bij een nieuwe stap: de stappenbalk rustig in beeld, zonder naar de top te springen */
function naarStappen() { const v = $('#voortgang'), top = v.getBoundingClientRect().top; if (top < $('.nav').offsetHeight + 8 || top > innerHeight * .45) v.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
addEventListener('hashchange', () => { toonFout(''); teken({ wissel: true }); naarStappen(); });
matchMedia('(min-width: 1000px)').addEventListener('change', () => teken());

async function start() {
  const [, wagens, bez] = await Promise.allSettled([startBasis(), loadFleet(), loadOccupancy(id)]);
  W = wagens.status === 'fulfilled' ? wagens.value.find((w) => w.id === id) : null;
  if (!W) { $('#res-naam').textContent = 'Deze wagen staat niet meer op de site'; $('#galerij').hidden = true; $('#voortgang').hidden = true; $('#stap').replaceChildren(h('a', { class: 'btn btn-wit', href: '/rushrents/#wagens', text: 'Bekijk de wagens' })); document.documentElement.classList.add('is-klaar'); return; }
  $('#res-naam').textContent = W.naam;
  document.title = `${W.naam} reserveren · Rush Rents`;
  if (bez.status === 'fulfilled') bezet = { ...bezet, ...bez.value };
  bouwGalerij();
  const oud = lees(sleutel), gedeeld = lees('rr.periode');
  if (oud) Object.assign(S, oud, { klant: { ...S.klant, ...(oud.klant || {}) }, akkoord: false });
  else if (gedeeld && gedeeld.van >= bezet.vandaag) Object.assign(S, gedeeld);
  if (S.van && (S.van < bezet.vandaag || S.van > laatsteDag())) { S.van = ''; S.tot = ''; }
  const lijst = urenLijst();
  for (const k of ['vanUur', 'totUur']) if (!lijst.includes(S[k])) S[k] = lijst.includes('10:00') ? '10:00' : lijst[0];
  if (vraagtA() && !['A2', 'A'].includes(S.klant.rijbewijsCategorie)) S.klant.rijbewijsCategorie = /\bA\b/.test(W.rijbewijs || '') && !/A2/.test(W.rijbewijs || '') ? 'A' : 'A2';
  if (S.van) { toonMaand(S.van); kies = S.tot ? 'van' : 'tot'; }
  if (klopt()) await controleer(); else teken();
  document.documentElement.classList.add('is-klaar');
}
start();
