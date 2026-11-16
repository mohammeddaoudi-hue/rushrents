// Beslist voor de eerste weergave of de intro speelt (zie js/intro.js). Staat in de kop van de homepage en laadt meteen.
// De intro speelt één keer per sessie, alleen als het bezoek op de homepage begint, en niet bij "minder beweging".
(function () {
  var d = document.documentElement, gezien = true, rustig = false;
  try { gezien = sessionStorage.getItem('rr.intro') === '1'; sessionStorage.setItem('rr.intro', '1'); } catch (e) { gezien = true; }
  try { rustig = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { rustig = false; }
  // DRIVE THE DREAM wacht verborgen op zijn animatie (js/intro.js); na 6 s staat hij er hoe dan ook
  if (!rustig && 'animate' in Element.prototype) { d.classList.add('droom-wacht'); setTimeout(function () { d.classList.add('droom-klaar'); }, 6000); }
  if (rustig) { if (gezien) d.classList.add('intro-gezien'); return; }
  if (gezien || location.hash || !('animate' in Element.prototype)) { d.classList.add('intro-gezien'); return; }
  d.classList.add('met-intro');
  // vangnet: start js/intro.js niet binnen 4 seconden, dan gaat de plaat weg en staat de hero er gewoon
  setTimeout(function () { if (!d.classList.contains('intro-loopt')) { d.classList.remove('met-intro'); d.classList.add('intro-gezien'); } }, 4000);
})();
