
/* --- Admin UI repair v35 runtime helpers --- */
(function(){
  function setActiveSideTab(name){
    const valid = name === 'groups' ? 'groups' : 'users';
    document.getElementById('adminUsersPanel')?.classList.toggle('active', valid === 'users');
    document.getElementById('adminGroupsPanel')?.classList.toggle('active', valid === 'groups');
    const usersBtn = document.getElementById('adminSideUsersBtn');
    const groupsBtn = document.getElementById('adminSideGroupsBtn');
    usersBtn?.classList.toggle('active', valid === 'users');
    groupsBtn?.classList.toggle('active', valid === 'groups');
    usersBtn?.setAttribute('aria-selected', valid === 'users' ? 'true' : 'false');
    groupsBtn?.setAttribute('aria-selected', valid === 'groups' ? 'true' : 'false');
    try { localStorage.setItem('mountAetheriaAdminSideTab', valid); } catch(_e) {}
  }
  window.switchAdminSideTab = setActiveSideTab;

  function togglePanelMenu(force){
    const pop = document.getElementById('panelMenuPopover');
    if(!pop) return;
    const next = (typeof force === 'boolean') ? force : !pop.classList.contains('open');
    pop.classList.toggle('open', next);
    pop.setAttribute('aria-hidden', next ? 'false' : 'true');
  }
  window.togglePanelMenu = togglePanelMenu;

  function polishAdminSheet(){
    document.body?.classList.add('ma-ffd20-admin');
    const shop = document.getElementById('shop_tags');
    if(shop && !shop.nextElementSibling?.classList?.contains('shop-tag-help')){
      const help = document.createElement('div');
      help.className = 'shop-tag-help';
      help.textContent = 'Comma-separated shop access tags for this character.';
      shop.insertAdjacentElement('afterend', help);
    }
    document.querySelectorAll('.ma-prestige-admin,#prestige_class,#prestige_level,#ffd20PrestigeSelect,#ffd20PrestigeLevel').forEach(el => {
      if(el && el.closest('#editorModal')) return;
      el.remove?.();
    });
  }
  window.addEventListener('click', event => {
    if(!event.target.closest('#panelMenuShell')) togglePanelMenu(false);
  });
  document.addEventListener('DOMContentLoaded', () => {
    let saved = 'users';
    try { saved = localStorage.getItem('mountAetheriaAdminSideTab') || 'users'; } catch(_e) {}
    setActiveSideTab(saved);
    polishAdminSheet();
  });
  const observer = new MutationObserver(() => polishAdminSheet());
  try { observer.observe(document.documentElement, { childList:true, subtree:true }); } catch(_e) {}
  window.addEventListener('load', () => { polishAdminSheet(); setTimeout(polishAdminSheet, 400); setTimeout(polishAdminSheet, 1400); });
})();
