
/* --- v43: Collapsible Admin Control sidebar --- */
(function(){
  const KEY = 'maAdminSidebarCollapsed';
  function setAdminSidebarCollapsed(collapsed, persist = true){
    document.body.classList.toggle('admin-sidebar-collapsed', !!collapsed);
    const btn = document.getElementById('adminSidebarToggle');
    const arrow = document.getElementById('adminSidebarToggleArrow');
    if(arrow) arrow.textContent = collapsed ? '›' : '‹';
    if(btn){
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.setAttribute('aria-label', collapsed ? 'Open Admin Control' : 'Collapse Admin Control');
      btn.title = collapsed ? 'Open Admin Control' : 'Collapse Admin Control';
    }
    if(persist){
      try{ localStorage.setItem(KEY, collapsed ? '1' : '0'); }catch(e){}
    }
  }
  window.setAdminSidebarCollapsed = setAdminSidebarCollapsed;
  window.toggleAdminSidebar = function(){
    setAdminSidebarCollapsed(!document.body.classList.contains('admin-sidebar-collapsed'));
  };
  function initAdminSidebarToggle(){
    let collapsed = false;
    try{ collapsed = localStorage.getItem(KEY) === '1'; }catch(e){}
    if(window.matchMedia && window.matchMedia('(max-width: 768px)').matches) collapsed = false;
    setAdminSidebarCollapsed(collapsed, false);
  }
  document.addEventListener('DOMContentLoaded', initAdminSidebarToggle);
  window.addEventListener('load', initAdminSidebarToggle);
  window.addEventListener('resize', () => {
    if(window.matchMedia && window.matchMedia('(max-width: 768px)').matches){
      setAdminSidebarCollapsed(false, false);
    }
  });
})();
