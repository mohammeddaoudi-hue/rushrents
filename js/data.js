// Eén plek waar de site haar inhoud ophaalt. Wil je later een andere bron (andere API, Google Sheet),
// dan pas je alleen deze functies aan; de rest van de site blijft gelijk.
// Wie de site op een andere pagina dan de homepage binnenkomt, krijgt de intro van de homepage niet meer (zie js/intro-start.js).
// Statische preview (GitHub Pages, gemaakt door tools/export-pages.mjs): elke pagina draagt daar <meta name="rr-modus" content="statisch">.
// Dan bestaat er geen server: de site leest momentopnames uit api/*.json en een aanvraag gaat als WhatsApp-bericht. Lokaal verandert er niets.
import { huurdagen } from './prijs.js';
export const STATISCH = document.querySelector('meta[name="rr-modus"]')?.content === 'statisch';
const BASIS = new URL('../', import.meta.url).pathname; // de map boven js/: lokaal '/', in de preview '/rushrents/'
try { sessionStorage.setItem('rr.intro', '1'); } catch { /* zonder opslag speelt de intro toch niet */ }
async function haal(pad, opties) {
  const r = await fetch(pad, { cache: 'no-store', headers: { Accept: 'application/json' }, ...opties });
  let data = null;
  try { data = await r.json(); } catch { /* geen JSON */ }
  if (!r.ok) { const e = new Error(data?.fout || 'Er ging iets mis. Probeer het opnieuw.'); e.veld = data?.veld || ''; e.status = r.status; throw e; }
  return data;
}

/** Vloot: [{ id, naam, merk, model, categorie, hoofdfoto, fotos, videos, leeftijd, platen, prijsDag, ... }] */
export async function loadFleet() { return (STATISCH ? await opname('wagens') : await haal('/rushrents/api/wagens')).wagens; }

/** Instellingen: { whatsapp, instagram, snapchat, facebook, tiktok, email, locatie, adres, uurVan, uurTot, bedrijfsnaam, ondernemingsnummer, zetel, faq, huurvoorwaarden } */
export async function loadSettings() { return STATISCH ? opname('instellingen') : haal('/rushrents/api/instellingen'); }

/** Beschikbaarheid voor de kalender: { demo, vandaag, wagens: { [id]: { nietBeschikbaar, dagen: { 'JJJJ-MM-DD': 'vol' | 'deels' } } } } */
export async function loadAvailability() { return STATISCH ? { ...(await opname('beschikbaarheid')), vandaag: vandaagBrussel() } : haal('/rushrents/api/beschikbaarheid'); }

/** Is deze exacte periode vrij? Geeft { [id]: true | false }. De server beslist; de site rekent dit nooit zelf uit (behalve in de statische preview, zie vrijStatisch). */
export async function checkPeriod(p, wagenId = '') {
  if (STATISCH) { const [wagens, inst] = await Promise.all([opname('wagens'), opname('instellingen')]); const ids = wagens.wagens.map((w) => w.id).filter((x) => !wagenId || x === wagenId); await Promise.all(ids.map((x) => opname('bezetting/' + x))); return vrijStatisch(p, wagenId); }
  const q = new URLSearchParams({ van: p.van, vanUur: p.vanUur, tot: p.tot, totUur: p.totUur, ...(wagenId ? { wagen: wagenId } : {}) });
  return (await haal('/rushrents/api/beschikbaar?' + q)).wagens;
}

/** Reservatie aanvragen. Geeft { nr, status, ... } of gooit een fout met .message en .veld. In de statische preview: WhatsApp opent met de aanvraag, geeft { statisch: true, wa, ... } */
export async function requestReservation(body) {
  if (STATISCH) return aanvraagViaWhatsApp(body);
  return haal('/rushrents/api/reservaties', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
}

// ---- statische preview: momentopnames + dezelfde regels als de server ---------------------------
const opnames = new Map(), binnen = new Map(); // binnen = al geladen, zodat een aanvraag zonder wachten (binnen de klik) WhatsApp kan openen
function opname(naam) {
  if (!opnames.has(naam)) opnames.set(naam, haal(BASIS + 'api/' + naam + '.json').then((d) => { binnen.set(naam, d); return d; }, (e) => { opnames.delete(naam); if (e.status === 404 && naam.startsWith('bezetting/')) e.message = 'Deze wagen staat niet meer op de site.'; throw e; }));
  return opnames.get(naam);
}
const vandaagBrussel = () => { const p = {}; for (const x of fmtBrussel.formatToParts(new Date())) p[x.type] = x.value; return `${p.year}-${p.month}-${p.day}`; };
const geldigeDag = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const dagPlusUtc = (dag, n) => new Date(Date.parse(dag + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const HALFUUR_RE = /^([01]\d|2[0-3]):(00|30)$/;
const periodeFout = (t) => Object.assign(new Error(t), { veld: 'periode', status: 400 });
/** zelfde controles, volgorde en meldingen als GET /api/beschikbaar (periodeUit + controleerKlantPeriode in tools/lib/reservaties.mjs),
 *  daarna per wagen isBeschikbaar() uit tools/lib/db.mjs op de bezette stukken van de momentopname. Werkt alleen op wat al geladen is. */
function vrijStatisch(p, wagenId = '') {
  const inst = binnen.get('instellingen') || {}, TE_LANG = 'Neem contact op via WhatsApp voor langere huur.', TE_VER = 'Zo ver vooruit reserveer je via WhatsApp.';
  if (!geldigeDag(p.van) || !geldigeDag(p.tot)) throw periodeFout('Kies een dag om af te halen en een dag om terug te brengen.');
  if (!HALFUUR_RE.test(p.vanUur) || !HALFUUR_RE.test(p.totUur)) throw periodeFout('Kies een uur op het hele of halve uur.');
  const a = brusselMs(p.van, p.vanUur), b = brusselMs(p.tot, p.totUur);
  if (!(a < b)) throw periodeFout('Het terugbrengen moet na het afhalen liggen.');
  const d = huurdagen(p.van, p.vanUur, p.tot, p.totUur);
  if (!uurBestaat(p.van, p.vanUur) || !uurBestaat(p.tot, p.totUur)) throw periodeFout('Dit uur bestaat niet op die dag, de klok gaat dan vooruit. Kies een ander uur.');
  if (d > 365) throw periodeFout(TE_LANG);
  if (a < Date.now()) throw periodeFout('Het afhaalmoment ligt in het verleden. Kies een nieuw moment.');
  const geheel = (v, min, max, std) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : std; };
  const g = { maxHuurDagen: geheel(inst.maxHuurDagen, 1, 365, 30), maxVooruitDagen: geheel(inst.maxVooruitDagen, 1, 730, 180), uurVan: HALFUUR_RE.test(inst.uurVan) ? inst.uurVan : '00:00', uurTot: HALFUUR_RE.test(inst.uurTot) ? inst.uurTot : '23:30' };
  if (d > g.maxHuurDagen) throw periodeFout(TE_LANG);
  if (p.van > dagPlusUtc(vandaagBrussel(), g.maxVooruitDagen)) throw periodeFout(TE_VER);
  if ([p.vanUur, p.totUur].some((u) => u < g.uurVan || u > g.uurTot)) throw periodeFout(`Afhalen en terugbrengen kan tussen ${g.uurVan} en ${g.uurTot}. Kies een ander uur.`);
  const uit = {};
  for (const w of binnen.get('wagens')?.wagens || []) {
    if (wagenId && w.id !== wagenId) continue;
    const bz = binnen.get('bezetting/' + w.id);
    if (!bz) { uit[w.id] = false; continue; }
    const om = Math.max(0, Math.min(7 * 24 * 60, Number(bz.omloopMinuten) || 0)) * 60000; // de omlooptijd geldt alleen rond een reservatie, niet rond een blokkade
    uit[w.id] = !bz.nietBeschikbaar && !bz.stukken.some((x) => { const v = Date.parse(x.van), t = Date.parse(x.tot); return x.soort === 'blokkade' ? v < b && t > a : v < b + om && t > a - om; });
  }
  return uit;
}
/** de aanvraag als WhatsApp-bericht naar het nummer uit de instellingen. Loopt zonder wachten, zodat de browser het venster binnen de klik opent. */
function aanvraagViaWhatsApp(body) {
  const w = (binnen.get('wagens')?.wagens || []).find((x) => x.id === body.wagenId), nummer = binnen.get('instellingen')?.whatsapp;
  if (!w || !nummer) throw Object.assign(new Error('De pagina is nog niet helemaal geladen. Probeer het opnieuw.'), { status: 503 });
  const p = { van: body.van, vanUur: body.vanUur, tot: body.tot, totUur: body.totUur };
  if (!vrijStatisch(p, w.id)[w.id]) throw periodeFout('Deze wagen is in die periode niet vrij. Kies een andere periode.');
  const k = body.klant || {}, extras = (w.extras || []).filter((x) => (body.extras || []).includes(x.naam)).map((x) => x.naam);
  const motor = w.categorie === 'Motor' || /\bA2?\b/.test(w.rijbewijs || '');
  const regels = [
    'Hallo Rush Rents, ik wil deze wagen reserveren.', '',
    `Wagen: ${w.naam}`, `Afhalen: ${metDag(p.van)} ${p.vanUur}`, `Terugbrengen: ${metDag(p.tot)} ${p.totUur}`,
    extras.length ? `Extra's: ${extras.join(', ')}` : null, body.locatie ? `Ander adres: ${body.locatie}` : null, body.opmerking ? `Opmerking: ${body.opmerking}` : null, '',
    `Naam: ${[k.voornaam, k.naam].filter(Boolean).join(' ')}`, `Gsm: ${k.gsm || ''}`, `E-mail: ${k.email || ''}`, `Geboortedatum: ${nlDatum(k.geboortedatum)}`,
    `Rijbewijs sinds: ${k.rijbewijsSinds || ''}`, motor && k.rijbewijsCategorie ? `Categorie rijbewijs: ${k.rijbewijsCategorie}` : null,
  ].filter((r) => r !== null);
  const wa = `https://wa.me/${nummer}?text=${encodeURIComponent(regels.join('\n'))}`;
  const venster = window.open(wa, '_blank');
  if (venster) venster.opener = null; else location.href = wa; // pop-up geblokkeerd: dan in hetzelfde tabblad
  return { statisch: true, wa, wagenNaam: w.naam, afhalen: { dag: p.van, uur: p.vanUur }, terugbrengen: { dag: p.tot, uur: p.totUur } };
}

// ---- datums (dag als JJJJ-MM-DD) ----------------------------------------------------------------
const twee = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
export const datum = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const plus = (s, n) => { const d = datum(s); d.setDate(d.getDate() + n); return iso(d); };
export const MAANDEN = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
/** "20 nov" (met jaartal als het niet dit jaar is) */
export const kort = (s) => { const d = datum(s); return `${d.getDate()} ${MND[d.getMonth()]}` + (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''); };
/** "vr 20 nov" */
export const metDag = (s) => `${DAG[datum(s).getDay()]} ${kort(s)}`;
/** halve uren tussen twee tijden */
export function uren(van = '00:00', tot = '23:30') {
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const uit = [];
  for (let m = min(van); m <= min(tot); m += 30) uit.push(`${twee(Math.floor(m / 60))}:${twee(m % 60)}`);
  return uit.length ? uit : ['10:00'];
}
/** leeftijd in volle jaren op een dag */
export function leeftijdOp(geboortedatum, dag) {
  const [gy, gm, gd] = geboortedatum.split('-').map(Number), [y, m, d] = dag.split('-').map(Number);
  return y - gy - (m < gm || (m === gm && d < gd) ? 1 : 0);
}
/** Belgisch of Nederlands nummer leesbaar: 32492575758 -> 0492 57 57 58 */
export function telefoon(n = '') {
  if (/^32\d{9}$/.test(n)) return `0${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)} ${n.slice(9, 11)}`;
  if (/^31\d{9}$/.test(n)) return `0${n.slice(2, 3)} ${n.slice(3, 7)} ${n.slice(7, 11)}`;
  return n ? '+' + n : '';
}

/** Bezetting van één wagen voor de uurkeuze: { vandaag, nu, nietBeschikbaar, dagen, stukken: [{ van, tot }] (UTC), omloopMinuten } */
export async function loadOccupancy(wagenId) {
  if (STATISCH) { if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(wagenId)) throw Object.assign(new Error('Deze wagen staat niet meer op de site.'), { status: 404 }); await opname('instellingen'); return { ...(await opname('bezetting/' + wagenId)), vandaag: vandaagBrussel(), nu: new Date().toISOString() }; }
  return haal('/rushrents/api/bezetting?wagen=' + encodeURIComponent(wagenId));
}
/** "Mijn reservatie": opzoeken met nummer + achternaam of gsm-nummer; annuleren kan zolang de status Aangevraagd is */
const sleutelVelden = (sleutel) => (/\d{6,}/.test(String(sleutel).replace(/[^\d]/g, '')) ? { gsm: sleutel } : { naam: sleutel });
const viaWhatsApp = () => { throw Object.assign(new Error('Je reservatie opzoeken of annuleren doe je via WhatsApp.'), { status: 404 }); };
export async function lookupReservation(nr, sleutel) { if (STATISCH) viaWhatsApp(); return haal('/rushrents/api/reservatie?' + new URLSearchParams({ nr, ...sleutelVelden(sleutel) })); }
export async function cancelReservation(nr, sleutel) { if (STATISCH) viaWhatsApp(); return haal('/rushrents/api/reservatie/annuleren', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ nr, ...sleutelVelden(sleutel) }) }); }

// Brusselse dag + uur -> moment in milliseconden (klopt ook als de klok verspringt), zelfde regel als op de server
const fmtBrussel = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const verschil = (ms) => { const p = {}; for (const x of fmtBrussel.formatToParts(new Date(ms))) p[x.type] = Number(x.value); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
export function brusselMs(dag, uur = '00:00') {
  const [y, m, d] = dag.split('-').map(Number), [h, mi] = uur.split(':').map(Number);
  const w = Date.UTC(y, m - 1, d, h, mi);
  return w - verschil(w - verschil(w));
}
/** bestaat dit uur op die dag in Brussel? (in de nacht dat de klok vooruit gaat, bestaat 02:00-02:59 niet) */
export function uurBestaat(dag, uur) {
  const p = {}; for (const x of fmtBrussel.formatToParts(new Date(brusselMs(dag, uur)))) p[x.type] = x.value;
  return `${p.hour}:${p.minute}` === uur;
}
/** "2026-11-20" -> "20/11/2026" en terug (leeg bij een datum die niet bestaat) */
export const nlDatum = (s) => (s ? s.split('-').reverse().join('/') : '');
export function isoUitNl(t) {
  const m = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/.exec(String(t).trim());
  if (!m) return '';
  const s = `${m[3]}-${twee(Number(m[2]))}-${twee(Number(m[1]))}`, d = datum(s);
  return iso(d) === s ? s : '';
}
