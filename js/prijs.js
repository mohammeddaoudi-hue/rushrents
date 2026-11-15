// Huurdagen en prijsberekening. Dezelfde code draait in de browser (tonen) en op de server (opslaan),
// zodat de klant en de eigenaar altijd hetzelfde bedrag zien.

/** "150", "€ 150", "12,50" -> getal; leeg of ongeldig -> 0 */
export const getal = (v) => { const n = Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
/** bedrag afgerond op de cent: 0.1 + 0.2 -> 0.3, 12.499999 -> 12.5 */
export const cent = (n) => Math.round((Number(n) || 0) * 100 + 1e-7) / 100;
/** 1100 -> "€ 1.100", 12.5 -> "€ 12,50", 1100.5 -> "€ 1.100,50"; altijd afgerond op de cent */
export const euro = (n) => { const [heel, deel] = cent(n).toFixed(2).split('.'); return '€ ' + heel.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (deel === '00' ? '' : ',' + deel); };
const meervoud = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;

/** aantal huurdagen: elke begonnen 24 uur telt als een dag; 0 als terugbrengen niet na afhalen ligt */
export function huurdagen(van, vanUur, tot, totUur) {
  const uren = (Date.parse(`${tot}T${totUur}:00Z`) - Date.parse(`${van}T${vanUur}:00Z`)) / 36e5;
  return uren > 0 ? Math.max(1, Math.ceil(uren / 24 - 1e-9)) : 0;
}

/**
 * Prijs voor een wagen en een aantal dagen. Alleen als de wagen een dagprijs heeft, anders null.
 * Met een weekprijs wordt de goedkoopste combinatie van weken en losse dagen gekozen.
 * extras: gekozen extra's [{ naam, prijsDag }]; een extra zonder prijs telt niet mee in het bedrag.
 * Geeft { regels: [{ tekst, bedrag }], totaal } zodat de berekening zichtbaar is.
 */
export function berekenPrijs(wagen, dagen, extras = []) {
  const dag = getal(wagen.prijsDag), week = getal(wagen.prijsWeek);
  if (!dag || !dagen) return null;
  let beste = { weken: 0, losse: dagen, totaal: cent(dagen * dag) };
  if (week) for (let k = 1; k <= Math.ceil(dagen / 7); k++) {
    const losse = Math.max(0, dagen - 7 * k), totaal = cent(k * week + losse * dag);
    if (totaal < beste.totaal) beste = { weken: k, losse, totaal };
  }
  // elk bedrag op de cent, zodat de regels en het totaal nooit 100.28999 tonen of opslaan
  const regels = [];
  if (beste.weken) regels.push({ tekst: `${meervoud(beste.weken, 'week', 'weken')} × ${euro(week)}`, bedrag: cent(beste.weken * week) });
  if (beste.losse) regels.push({ tekst: `${meervoud(beste.losse, 'dag', 'dagen')} × ${euro(dag)}`, bedrag: cent(beste.losse * dag) });
  for (const x of Array.isArray(extras) ? extras : []) { const p = getal(x?.prijsDag); if (p && x.naam) regels.push({ tekst: `${x.naam}: ${meervoud(dagen, 'dag', 'dagen')} × ${euro(p)}`, bedrag: cent(dagen * p) }); }
  return { regels, totaal: cent(regels.reduce((a, r) => a + r.bedrag, 0)) };
}
