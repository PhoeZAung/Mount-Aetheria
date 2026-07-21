
/* --- v26 selected character menu polish --- */
(function(){
  document.addEventListener('click', (event) => {
    const pop = document.getElementById('panelMenuPopover');
    const fab = document.getElementById('panelMenuFab');
    const charList = document.getElementById('panelCharacterList');
    if(!pop || !charList || charList.hidden) return;
    if(pop.contains(event.target) || fab?.contains(event.target)) return;
    charList.hidden = true;
  }, true);
})();
