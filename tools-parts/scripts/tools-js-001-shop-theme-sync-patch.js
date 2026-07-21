
/* SHOP_THEME_SYNC_PATCH */
(function(){
  const KEY = 'mountAetheriaThemeAccentV25';

  const THEMES = {
    gold:    ['#ffcc66','255,204,102','#090604'],
    ruby:    ['#ff5f6d','255,95,109','#100306'],
    ember:   ['#ff8a3d','255,138,61','#120703'],
    rose:    ['#ff7ab6','255,122,182','#12040b'],
    violet:  ['#b48cff','180,140,255','#090512'],
    blue:    ['#66a6ff','102,166,255','#030914'],
    cyan:    ['#5ee7df','94,231,223','#021110'],
    emerald: ['#4ee28a','78,226,138','#031006'],
    lime:    ['#b8f56d','184,245,109','#071003'],
    moon:    ['#d7dcff','215,220,255','#060711']
  };

  function getThemeId(){
    try { return localStorage.getItem(KEY) || 'gold'; }
    catch(e) { return 'gold'; }
  }

  function applyTheme(){
    const t = THEMES[getThemeId()] || THEMES.gold;
    const root = document.documentElement;

    root.style.setProperty('--accent', t[0]);
    root.style.setProperty('--accent-rgb', t[1]);
    root.style.setProperty('--accent-contrast', t[2]);
    root.style.setProperty('--accent-soft', 'rgba(' + t[1] + ',.12)');
    root.style.setProperty('--accent-mid', 'rgba(' + t[1] + ',.32)');
    root.style.setProperty('--accent-glow', 'rgba(' + t[1] + ',.42)');
    root.style.setProperty('--accent-strong', 'rgba(' + t[1] + ',.68)');
    root.style.setProperty('--shop-gold', t[0]);
    root.style.setProperty('--shop-gold-hi', t[0]);
    root.style.setProperty('--shop-gold-soft', 'rgba(' + t[1] + ',.12)');
  }

  applyTheme();
  document.addEventListener('DOMContentLoaded', applyTheme);
  window.addEventListener('storage', function(e){
    if(e.key === KEY) applyTheme();
  });

  // Force it to win if older shop scripts repaint gold after load.
  setInterval(applyTheme, 1000);
})();
