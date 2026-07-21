
/* --- v25 theme color picker --- */
(function(){
  const STORAGE_KEY = 'mountAetheriaThemeAccentV25';
  const THEMES = [
    {id:'gold', name:'Aether Gold', note:'classic warm glow', hex:'#ffcc66', rgb:'255,204,102', contrast:'#090604'},
    {id:'ruby', name:'Ruby Red', note:'heroic crimson', hex:'#ff5f6d', rgb:'255,95,109', contrast:'#100306'},
    {id:'ember', name:'Ember Orange', note:'forge fire', hex:'#ff8a3d', rgb:'255,138,61', contrast:'#120703'},
    {id:'rose', name:'Rose Magick', note:'soft arcane pink', hex:'#ff7ab6', rgb:'255,122,182', contrast:'#12040b'},
    {id:'violet', name:'Astral Violet', note:'mystic purple', hex:'#b48cff', rgb:'180,140,255', contrast:'#090512'},
    {id:'blue', name:'Crystal Blue', note:'clean spell glow', hex:'#66a6ff', rgb:'102,166,255', contrast:'#030914'},
    {id:'cyan', name:'Aqua Mist', note:'bright water aura', hex:'#5ee7df', rgb:'94,231,223', contrast:'#021110'},
    {id:'emerald', name:'Emerald', note:'forest life magic', hex:'#4ee28a', rgb:'78,226,138', contrast:'#031006'},
    {id:'lime', name:'Tonberry Lime', note:'sharp green pop', hex:'#b8f56d', rgb:'184,245,109', contrast:'#071003'},
    {id:'moon', name:'Moon Silver', note:'cool pale glow', hex:'#d7dcff', rgb:'215,220,255', contrast:'#060711'}
  ];
  function themeById(id){ return THEMES.find(t => t.id === id) || THEMES[0]; }
  function setTheme(theme, persist){
    const t = typeof theme === 'string' ? themeById(theme) : (theme || THEMES[0]);
    const root = document.documentElement;
    root.style.setProperty('--accent', t.hex);
    root.style.setProperty('--accent-rgb', t.rgb);
    root.style.setProperty('--accent-contrast', t.contrast || '#050505');
    root.style.setProperty('--accent-soft', `rgba(${t.rgb},.12)`);
    root.style.setProperty('--accent-mid', `rgba(${t.rgb},.32)`);
    root.style.setProperty('--accent-glow', `rgba(${t.rgb},.42)`);
    document.body?.setAttribute('data-theme-accent', t.id);
    if(persist) {
      try { localStorage.setItem(STORAGE_KEY, t.id); } catch(e) {}
    }
    renderThemeGrid(t.id);
  }
  function renderThemeGrid(activeId){
    const grid = document.getElementById('themeColorGrid');
    if(!grid) return;
    grid.innerHTML = THEMES.map(t => `
      <button type="button" class="ma-theme-swatch ${t.id === activeId ? 'active' : ''}" style="--swatch:${t.hex};--swatch-rgb:${t.rgb}" onclick="setSheetThemeColor('${t.id}')" aria-label="Use ${t.name} theme">
        <span class="ma-theme-dot" aria-hidden="true"></span>
        <span class="ma-theme-name"><strong>${t.name}</strong><small>${t.note}</small></span>
      </button>`).join('');
  }
  window.setSheetThemeColor = (id) => setTheme(themeById(id), true);
  window.openThemeColorPicker = () => {
    const modal = document.getElementById('themeColorModal');
    renderThemeGrid(document.body?.getAttribute('data-theme-accent') || (localStorage.getItem(STORAGE_KEY) || 'gold'));
    if(modal) modal.style.display = 'flex';
  };
  window.closeThemeColorPicker = () => {
    const modal = document.getElementById('themeColorModal');
    if(modal) modal.style.display = 'none';
  };
  document.addEventListener('keydown', (event) => {
    if(event.key === 'Escape') closeThemeColorPicker();
  });
  document.addEventListener('DOMContentLoaded', () => {
    let saved = 'gold';
    try { saved = localStorage.getItem(STORAGE_KEY) || 'gold'; } catch(e) {}
    setTheme(themeById(saved), false);
  });
  // Apply immediately too, in case this script loads after DOMContentLoaded.
  let saved = 'gold';
  try { saved = localStorage.getItem(STORAGE_KEY) || 'gold'; } catch(e) {}
  setTheme(themeById(saved), false);
})();
