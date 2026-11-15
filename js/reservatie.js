// "Mijn reservatie": opzoeken met reservatienummer + achternaam of gsm-nummer. Annuleren kan zolang de status Aangevraagd is.
// Weigerde Rush Rents de aanvraag en stelde het een andere wagen voor, dan staat die hier met een knop naar die wagen.
import { lookupReservation, cancelReservation, telefoon, STATISCH } from './data.js';
import { euro } from './prijs.js';
import { CONFIG, $, h, ico, moment, waUrl, startBasis } from './basis.js';

const STATUS = { aangevraagd: 'Aangevraagd', bevestigd: 'Bevestigd', lopend: 'Bevestigd', afgerond: 'Afgerond', geweigerd: 'Geweigerd', geannuleerd: 'Geannuleerd', verlopen: 'Verlopen' };
const vorm = $('#zoek'), fout = $('#zoek-fout'), doel = $('#gevonden');
const schoonNr = (v) => String(v || '').toUpperCase().replace(/\s+/g, '');

function toon(r, sleutel) {
  const rijen = [['Status', STATUS[r.status] || r.status], ['Wagen', r.wagenNaam], ['Afhalen', moment(r.afhalen.dag, r.afhalen.uur)], ['Terugbrengen', moment(r.terugbrengen.dag, r.terugbrengen.uur)], ['Huurprijs', r.prijs ? euro(r.prijs.totaal) : 'Bij bevestiging'], ['Borg', r.borg ? euro(r.borg) : ''], ['Reden', r.reden]].filter(([, v]) => v);
  const uitleg = { aangevraagd: `Rush Rents bevestigt je reservatie persoonlijk via WhatsApp of telefoon. De wagen blijft ${CONFIG.optieUren} uur voor jou gereserveerd.`, verlopen: 'Deze aanvraag is verlopen. Vraag de wagen opnieuw aan of stuur een bericht.' }[r.status];
  const voorstel = r.status === 'geweigerd' && r.voorstel && h('div', { class: 'voorstel', id: 'voorstel' },
    h('p', { text: `Rush Rents stelt een andere wagen voor: ${r.voorstel.wagenNaam}.` }),
    h('a', { class: 'btn btn-wit', href: `/rushrents/reserveren/${r.voorstel.wagenId}`, text: `Bekijk de ${r.voorstel.wagenNaam}`, onclick: () => { try { sessionStorage.setItem('rr.periode', JSON.stringify({ van: r.afhalen.dag, vanUur: r.afhalen.uur, tot: r.terugbrengen.dag, totUur: r.terugbrengen.uur })); } catch { /* zonder opslag kies je de periode opnieuw */ } } }));
  doel.replaceChildren(h('div', { class: 'paneel', id: 'reservatie' },
    h('p', { class: 'nummer', text: r.nr }),
    uitleg && h('p', { text: uitleg }),
    voorstel,
    h('dl', { class: 'specs' }, ...rijen.flatMap(([a, b]) => [h('dt', { text: a }), h('dd', { text: b })])),
    h('div', { class: 'knoppen' },
      h('a', { class: 'btn btn-lijn', href: waUrl(`Hallo Rush Rents, ik heb een vraag over reservatie ${r.nr}.`), target: '_blank', rel: 'noopener' }, ico('whatsapp', 'ico-wa'), 'WhatsApp'),
      CONFIG.whatsapp && h('a', { class: 'btn btn-lijn', href: 'tel:+' + CONFIG.whatsapp, text: 'Bel ' + telefoon(CONFIG.whatsapp) }),
      r.status === 'aangevraagd' && h('button', { type: 'button', class: 'btn btn-lijn', id: 'annuleer', text: 'Annuleer aanvraag', onclick: async (e) => {
        const knop = e.currentTarget;
        if (knop.dataset.zeker !== '1') { knop.dataset.zeker = '1'; knop.textContent = 'Tik nog eens om te annuleren'; return; }
        knop.disabled = true;
        try { toon(await cancelReservation(r.nr, sleutel), sleutel); } catch (err) { fout.textContent = err.message; fout.hidden = false; knop.disabled = false; }
      } }))));
}
vorm.addEventListener('submit', async (e) => {
  e.preventDefault(); fout.hidden = true;
  const nr = schoonNr(vorm.nr.value), sleutel = vorm.sleutel.value.trim();
  if (!nr || !sleutel) { fout.textContent = 'Vul je reservatienummer en je achternaam of gsm-nummer in.'; fout.hidden = false; return; }
  try { toon(await lookupReservation(nr, sleutel), sleutel); } catch (err) { doel.replaceChildren(); fout.textContent = err.message; fout.hidden = false; }
});
await startBasis();
const nr = new URLSearchParams(location.search).get('nr');
// statische preview: er is geen server die reservaties bewaart, dus opzoeken en annuleren gaat via WhatsApp
if (STATISCH) vorm.replaceWith(h('div', { class: 'paneel', id: 'reservatie-wa' },
  h('p', { text: 'Je reservatie opzoeken, wijzigen of annuleren doe je via WhatsApp. Rush Rents antwoordt je daar persoonlijk.' }),
  h('div', { class: 'knoppen' }, h('a', { class: 'btn btn-wit', id: 'reservatie-wa-knop', href: waUrl(nr ? `Hallo Rush Rents, ik heb een vraag over reservatie ${schoonNr(nr)}.` : 'Hallo Rush Rents, ik heb een vraag over mijn reservatie.'), target: '_blank', rel: 'noopener' }, ico('whatsapp', 'ico-wa'), 'Stuur een bericht via WhatsApp'))));
else if (nr) { vorm.nr.value = schoonNr(nr); vorm.sleutel.focus(); }
document.documentElement.classList.add('is-klaar');
