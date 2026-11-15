// Staat in de kop van de wagenpagina en laadt meteen. Onthoudt of de pagina opent met een overgang vanuit de vorige pagina (de foto van de
// wagenkaart loopt dan over in de hoofdfoto) of zonder (rechtstreeks geopend of herladen). Zonder overgang opent de hoofdfoto met haar
// eigen masker: zie css/reserveren.css. Een browser die dit niet meldt, toont de foto gewoon meteen.
addEventListener('pagereveal', function (e) { document.documentElement.classList.add(e.viewTransition ? 'met-overgang' : 'zonder-overgang'); });
