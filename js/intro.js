// Hero van de homepage: de intro met het RR-beeldmerk, daarna de trage beweging naar voren.
// Intro (één keer per sessie): het RR-beeldmerk bouwt op uit zijn blokken, de Cullinan verschijnt in de R'en en het masker opent vanuit de
// binnenruimte van de R tot de hele hero. Daarna schuift RUSHRENTS in één beweging open (van onder naar boven, achter de wagen) en
// verschijnt de knop. Eén tijdlijn (Web Animations): transform, opacity, clip-path en het tekenen van de lijnen. Klikken, een toets of
// scrollen zet meteen de eindtoestand. Tijden in milliseconden vanaf de start. De start wacht tot de foto gedecodeerd is, maar nooit
// langer dan 600 ms.
// Daarna: de foto en de vrijgeknipte wagen gaan samen traag naar voren (schaal en duur uit data/hero.json, via #hero-data), en staan dan
// stil. Het woordmerk beweegt niet mee; het draaipunt ligt op de daklijn (css/site.css), zodat het dak op zijn plek blijft.
const UIT = 'cubic-bezier(.2,.7,.2,1)'; // aankomen: snel weg, rustig landen
const OPEN = 'cubic-bezier(.7,0,.2,1)'; // maskers en wipes: krachtig en rustig
const ZACHT = 'cubic-bezier(.4,0,.2,1)';
const MAAT = { hoog: 0.24, breed: 0.34 }; // het beeldmerk: 24% van de schermhoogte hoog; op een staand scherm (gsm) 34% van de breedte breed
const T = {
  blok: 400, trap: 40, afstand: 32, // 8 blokken, elk 400 ms, om de 40 ms; ze komen 32 px ver, elk uit hun eigen richting
  heel: 640, // vanaf hier ligt het beeldmerk als één vlak over de blokken
  lijnen: [430, 260, 100], // de fijne lijnen tekenen zich van links naar rechts: start, duur per lijn, spreiding. Klaar op 790.
  foto: [1000, 320], // na 210 ms stilstand: de foto verschijnt in het beeldmerk, van onder naar boven
  rand: [1000, 480], // de omtrek van de blokken als haarlijn
  open: [1200, 900], drijf: 0.25, // het masker opent: eerst een rustige duw naar voren (een kwart van de weg in gelijk tempo), dan de curve OPEN
  binnen: [1220, 280], // de binnenruimtes van de R'en gaan open: het venster wordt één vorm
  merk: [1950, 800], // RUSHRENTS: één wipe van onder naar boven. Klaar op 2750.
  knop: [2300, 400], // de knop
};
const RICHTING = { links: [-1, 0], rechts: [1, 0], boven: [0, -1], onder: [0, 1], schuin: [0.669, 0.743] };
const SOORTEN = ['pointerdown', 'keydown', 'wheel', 'touchmove', 'scroll'];

const html = document.documentElement, intro = document.getElementById('intro');
const $ = (s) => document.querySelector(s);
const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;
let inst = {};
try { inst = JSON.parse(document.getElementById('hero-data').textContent) || {}; } catch { /* zonder instellingen: geen trage beweging */ }
/** de foto en, als ze er is, de vrijgeknipte wagen: ze bewegen altijd samen */
const lagen = () => [$('.hero-foto img'), $('.hero-wagen img')].filter(Boolean);
let animaties = [], klaar = false, duwt = false;

/** de trage beweging naar voren: begint na `wacht` ms, loopt één keer en blijft dan staan */
function duw(wacht) {
  if (duwt || rustig || !inst.duw || html.hasAttribute('data-hero-stil')) return;
  duwt = true;
  for (const el of lagen()) { const a = el.animate({ transform: ['scale(1)', `scale(${inst.duw.schaal})`] }, { duration: inst.duw.ms, delay: wacht, easing: 'ease-out', fill: 'forwards' }); a.id = 'hero-duw'; }
}

/** de voortgang van een cubic-bezier-curve op tijdstip t (0 tot 1) */
function curve(tekst) {
  const [x1, y1, x2, y2] = tekst.match(/[\d.]+/g).map(Number);
  return (t) => {
    let u = t;
    for (let i = 0; i < 8; i++) { const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t, dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2); if (Math.abs(dx) < 1e-6) break; u = Math.min(1, Math.max(0, u - x / dx)); }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  };
}
/** waar een punt van de foto (aandelen fx, fy van het beeld) op het scherm staat, en hoe breed het hele beeld getoond wordt */
function fotoPunt(foto, fx, fy) {
  const k = foto.getBoundingClientRect(), nb = foto.naturalWidth || k.width, nh = foto.naturalHeight || k.height;
  const s = Math.max(k.width / nb, k.height / nh), b = nb * s, h = nh * s; // de foto vult haar vak, onderaan verankerd (object-position 50% 100%)
  return { x: k.left + (k.width - b) / 2 + fx * b, y: k.top + (k.height - h) + fy * h, breedte: b, kader: k };
}

function einde() {
  if (klaar) return; klaar = true;
  for (const a of animaties) a.cancel();
  html.classList.remove('met-intro', 'intro-loopt'); html.classList.add('intro-gezien');
  intro.style.display = '';
  for (const soort of SOORTEN) removeEventListener(soort, einde, true);
  duw(0); // is de intro overgeslagen voor ze startte, dan begint de trage beweging hier
}
/** de foto is er niet op tijd: geen intro, de plaat vervaagt in 300 ms */
function vervaag() {
  if (klaar) return;
  for (const a of animaties) a.cancel();
  html.classList.remove('met-intro'); html.classList.add('intro-gezien'); intro.style.display = 'block';
  const a = intro.animate({ opacity: [1, 0] }, { duration: 300, easing: ZACHT, fill: 'forwards' });
  animaties = [a]; a.finished.then(einde, () => {});
}

function start() {
  if (klaar) return;
  const foto = $('.hero-foto img'), gat = $('.intro-gat'), merk = $('.intro-merk');
  const stijl = getComputedStyle(intro), getal = (naam) => Number(stijl.getPropertyValue(naam)) || 0;
  const staand = matchMedia('(max-aspect-ratio: 4/5)').matches;
  // de maat van het beeldmerk: k = schermpixels per eenheid van de tekening
  const k = staand ? (MAAT.breed * innerWidth) / getal('--rr-b') : (MAAT.hoog * innerHeight) / getal('--rr-h');
  const mx = getal('--rr-mx'), my = getal('--rr-my'), breedte = getal('--rr-b'), straal = getal('--rr-straal') || 30;
  intro.style.setProperty('--k', k.toFixed(4));
  // Het masker opent vanuit het punt in de binnenruimte van de R dat het verst van elke rand ligt (daar past een cirkel met straal
  // --rr-straal). Het is open als die cirkel voorbij de verste hoek van het scherm is; een kwart reserve, zodat de laatste rand het
  // beeld verlaat voor de beweging uitloopt.
  const ox = innerWidth / 2 - k * mx, oy = innerHeight / 2 - k * my;
  const hoek = Math.max(...[[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight]].map(([x, y]) => Math.hypot(x - ox, y - oy)));
  const schaal = Math.max(4, (1.25 * hoek) / (straal * k));
  const speel = (el, frames, o) => { const a = el.animate(frames, { fill: 'both', ...o }); animaties.push(a); return a; };
  const stap = T.afstand / k;

  // 1. de blokken schuiven elk uit hun eigen richting op hun plek
  for (const blok of intro.querySelectorAll('.intro-blok')) {
    const [x, y] = RICHTING[blok.dataset.uit] || [0, 0];
    speel(blok, { opacity: [0, 1], transform: [`translate(${x * stap}px, ${y * stap}px)`, 'translate(0, 0)'] }, { duration: T.blok, delay: Number(blok.dataset.nr) * T.trap, easing: UIT });
  }
  // liggen de blokken, dan komt het hele beeldmerk als één vlak erover: zo staat er geen naad tussen de stukken
  speel($('.intro-heel'), { opacity: [0, 1] }, { duration: 100, delay: T.heel, easing: 'linear' });
  // de fijne lijnen tekenen zich in, de ster verschijnt als haar lijn er is. Daarna staat het beeldmerk 210 ms stil.
  for (const lijn of intro.querySelectorAll('.intro-lijn')) speel(lijn, { strokeDashoffset: [1, 0] }, { duration: T.lijnen[1], delay: T.lijnen[0] + Number(lijn.dataset.x) * T.lijnen[2], easing: ZACHT });
  const ster = $('.intro-ster');
  speel(ster, { opacity: [0, 1] }, { duration: 160, delay: T.lijnen[0] + Number(ster.dataset.x) * T.lijnen[2] + 120, easing: ZACHT });

  // 2. het witte beeldmerk schuift weg, van onder naar boven: je kijkt door de R'en naar de foto. Het hele toneel (foto, wagenlaag en
  //    verloop) staat in die fase vergroot, zo dat het stuk uit data/hero.json (de grille, op gsm het voorwiel) achter het beeldmerk
  //    ligt. Tijdens het openen wijkt het beeld terug naar zijn eigen maat. Het draaipunt ligt binnen het toneel, dus het beeld blijft
  //    het toneel de hele tijd vullen: er komt nooit een rand van de foto in beeld.
  speel($('.intro-dicht'), { opacity: [1, 0] }, { duration: 1, delay: T.foto[0] - 1, easing: 'linear' }); // tot hier is de plaat dicht; het witte beeldmerk dekt nu de gaten
  const wissel = speel(merk, { clipPath: ['inset(0 0 0 0)', 'inset(0 0 100% 0)'] }, { duration: T.foto[1], delay: T.foto[0], easing: OPEN, fill: 'forwards' });
  speel(merk, { opacity: [1, 0] }, { duration: 1, delay: T.foto[0] + T.foto[1], easing: 'linear' }); // vangnet voor een browser die een groep niet kan afsnijden: het witte beeldmerk is na de wipe hoe dan ook weg
  const fotoStijl = getComputedStyle(foto), deel = (naam, anders) => Number(fotoStijl.getPropertyValue(naam)) || anders;
  const toneel = $('.hero-toneel'), vak = toneel.getBoundingClientRect(), punt = fotoPunt(foto, deel('--focus-x', 0.5), deel('--focus-y', 0.5));
  const mx0 = innerWidth / 2, my0 = innerHeight / 2;
  // het draaipunt bij schaal s: het punt van het scherm dat op zijn plek blijft als het stuk van de foto in het midden van het scherm ligt
  const draaipunt = (s) => [(mx0 - s * punt.x) / (1 - s), (my0 - s * punt.y) / (1 - s)];
  const binnen = ([x, y]) => x >= vak.left && x <= vak.right && y >= vak.top && y <= vak.bottom;
  let groter = Math.min(3, Math.max(1.08, (1.1 * k * breedte) / (deel('--focus-b', 0.2) * punt.breedte))), punt0 = draaipunt(groter);
  while (!binnen(punt0) && groter < 3.2) { groter += 0.01; punt0 = draaipunt(groter); }
  const anker = `${(Math.min(vak.right, Math.max(vak.left, punt0[0])) - vak.left).toFixed(1)}px ${(Math.min(vak.bottom, Math.max(vak.top, punt0[1])) - vak.top).toFixed(1)}px`;
  speel(toneel, { transformOrigin: [anker, anker], transform: [`scale(${groter.toFixed(3)})`, 'scale(1)'] }, { duration: T.open[1], delay: T.open[0], easing: OPEN });
  // de omtrek van de blokken blijft als haarlijn staan zolang de foto klein in het beeldmerk zit
  speel($('.intro-rand'), [{ opacity: 0, offset: 0 }, { opacity: 0.5, offset: 0.3 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0, offset: 1 }], { duration: T.rand[1], delay: T.rand[0], easing: 'linear' });

  // 3. het masker opent in één beweging. Eerst gaan de binnenruimtes van de R'en open, zodat het venster één vorm is; dan vlieg je er
  //    doorheen. De schaal groeit in gelijke verhoudingen (2x, 4x, 8x ...), anders zit de hele beweging in één tel; het tempo volgt OPEN.
  speel($('.intro-binnen'), { opacity: [1, 0] }, { duration: T.binnen[1], delay: T.binnen[0], easing: ZACHT });
  const open = curve(OPEN), tempo = (t) => T.drijf * t + (1 - T.drijf) * open(t), stappen = 40;
  const groei = Array.from({ length: stappen + 1 }, (_, i) => ({ offset: i / stappen, transform: `scale(${k * schaal ** tempo(i / stappen)})` }));
  for (const el of [gat, merk]) speel(el, groei, { duration: T.open[1], delay: T.open[0], easing: 'linear' });

  // 4. RUSHRENTS schuift in één beweging open, van onder naar boven; daarna de knop. De trage beweging naar voren begint als de foto
  //    op haar plek staat.
  const woord = speel($('.hero-merk'), { clipPath: ['inset(100% 0 0 0)', 'inset(0 0 0 0)'] }, { duration: T.merk[1], delay: T.merk[0], easing: OPEN });
  const knop = speel($('.hero-in'), { opacity: [0, 1] }, { duration: T.knop[1], delay: T.knop[0], easing: ZACHT });
  duw(T.open[0] + T.open[1]);
  html.classList.add('intro-loopt');
  // staat de foto er nog niet als ze in het beeldmerk moet verschijnen, dan stopt de intro hier
  const kijk = setInterval(() => {
    if (klaar) return clearInterval(kijk);
    if (wissel.currentTime >= T.foto[0]) { clearInterval(kijk); if (!(foto.complete && foto.naturalWidth)) vervaag(); }
  }, 50);
  Promise.all([woord.finished, knop.finished]).then(einde, () => {});
}

const gedecodeerd = () => Promise.all(lagen().map((el) => (el.decode ? el.decode().catch(() => {}) : null)));
if (html.classList.contains('met-intro') && intro) {
  for (const soort of SOORTEN) addEventListener(soort, einde, { capture: true, passive: true });
  const zichtbaar = document.visibilityState === 'visible' ? Promise.resolve() : new Promise((r) => addEventListener('visibilitychange', r, { once: true }));
  zichtbaar.then(() => Promise.race([gedecodeerd(), new Promise((r) => setTimeout(r, 600))])).then(start);
} else gedecodeerd().then(() => duw(0)); // geen intro (tweede bezoek van de sessie): alleen de trage beweging
