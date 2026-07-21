

/* --- Admin synced startup: rerun sheet add-ons after Firebase/admin module becomes available --- */
(function(){
  function rerun(){
    try { window.maFfd20RefreshOptions?.(); } catch(e) {}try { window.maV34RefreshWeaponProficiency?.(); } catch(e) {}}
  window.addEventListener('load', () => { setTimeout(rerun, 300); setTimeout(rerun, 1200); setTimeout(rerun, 2500); });
})();

