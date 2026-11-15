import { loadSettings } from './data.js';

const el = document.querySelector('#tekst');
try {
  const s = await loadSettings();
  el.textContent = s.huurvoorwaarden || 'De huurvoorwaarden krijg je bij de bevestiging van je reservatie.';
} catch {
  el.textContent = 'De huurvoorwaarden kunnen nu niet geladen worden. Stuur ons een bericht via WhatsApp.';
}
