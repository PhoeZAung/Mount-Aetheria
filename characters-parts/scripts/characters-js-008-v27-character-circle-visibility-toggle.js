
/* --- v27 character circle visibility toggle --- */
(function(){
  const STORAGE_KEY = 'mountAetheriaSummonFabVisibleV27';
  window.getSummonFabVisibilityPreference = function(){
    try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch(e) { return true; }
  };
  function setPref(value){
    try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch(e) {}
  }
  window.updateSummonFabToggleButton = function(){
    const btn = document.getElementById('panelCharacterToggleBtn');
    const fab = document.getElementById('summonFab');
    const visible = window.getSummonFabVisibilityPreference();
    if(btn){
      btn.textContent = visible ? '👥 Character Circle: On' : '👥 Character Circle: Off';
      btn.classList.toggle('is-on', visible);
      btn.classList.toggle('is-off', !visible);
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }
    if(fab){
      fab.classList.toggle('ma-fab-hidden-by-player', !visible);
      const hasCharacters = (typeof characterSheets !== 'undefined' && Array.isArray(characterSheets) && characterSheets.length > 0);
      fab.style.display = (visible && hasCharacters) ? 'flex' : 'none';
    }
  };
  window.toggleSummonFabVisibility = function(){
    const next = !window.getSummonFabVisibilityPreference();
    setPref(next);
    window.updateSummonFabToggleButton();
    // Keep the hamburger menu open so the player can see the toggle state change.
  };
  document.addEventListener('DOMContentLoaded', window.updateSummonFabToggleButton);
  setTimeout(window.updateSummonFabToggleButton, 0);
})();
