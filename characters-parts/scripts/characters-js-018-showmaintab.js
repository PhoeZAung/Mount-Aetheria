

(function(){
  function showMainTab(id){
    if(!id) return;
    document.querySelectorAll('.main-tabs .tab-btn').forEach(function(btn){ btn.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(panel){ panel.classList.remove('active'); });
    var btn = document.getElementById('btn-' + id);
    var panel = document.getElementById(id);
    if(btn) btn.classList.add('active');
    if(panel) panel.classList.add('active');
    try {
      if(id === 'other' && typeof window.switchOtherTab === 'function') {
        window.switchOtherTab(localStorage.getItem('activeOtherSub') || 'calendar');
      }
    } catch(e) {}
  }
  window.switchTab = showMainTab;
  function bindTabs(){
    document.querySelectorAll('.main-tabs .tab-btn[id^="btn-"]').forEach(function(btn){
      if(btn.__maTabFallbackBound) return;
      btn.__maTabFallbackBound = true;
      btn.addEventListener('click', function(ev){
        var id = String(btn.id || '').replace(/^btn-/, '');
        if(id) showMainTab(id);
      }, true);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindTabs, {once:true});
  else bindTabs();
})();

