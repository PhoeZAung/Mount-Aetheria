
/* --- v8 clean final: HP Temp separate from Max Temp --- */
(function(){
  const priorOpenStatEdit = window.openStatEdit;
  function activeData(){
    try { if (typeof getActiveData === 'function') return getActiveData() || {}; } catch(e) {}
    try { if (typeof data === 'function') return data() || {}; } catch(e) {}
    return {};
  }
  function cls(){
    const probe=document.getElementById('hp_curr');
    if(probe?.classList?.contains('save-field')) return 'save-field';
    return 'live-field';
  }
  function ensureHidden(id, fallback='0'){
    let el=document.getElementById(id);
    if(!el){
      el=document.createElement('input'); el.type='hidden'; el.id=id; el.className=cls(); document.body.appendChild(el);
    }
    if(el.type !== 'hidden') return el;
    const d=activeData();
    if((el.value === '' || el.value == null) && d[id] !== undefined && d[id] !== null && String(d[id]).trim() !== '') el.value=String(d[id]);
    if(el.value === '' || el.value == null) el.value=String(fallback);
    d[id]=el.value;
    return el;
  }
  function num(id){ return Number(document.getElementById(id)?.value || activeData()[id] || 0) || 0; }
  function setVal(id, value){
    const el=document.getElementById(id); if(!el) return;
    el.value=String(value);
    activeData()[id]=String(value);
  }
  function labelFor(id, text){ const s=document.getElementById(id)?.closest('label')?.querySelector('small'); if(s) s.textContent=text; }
  function refreshVitals(){
    ensureHidden('hp_max','0'); ensureHidden('hp_max_temp','0');
    const hpGrid=document.getElementById('hp_curr')?.closest('.vital-number-grid');
    if(hpGrid){
      hpGrid.className='vital-number-grid ma-v8-hp-grid';
      labelFor('hp_curr','Current'); labelFor('hp_temp','Temp'); labelFor('hp_effective_max','Total Max');
      const hpCurr=document.getElementById('hp_curr'), hpTemp=document.getElementById('hp_temp'), hpTotal=document.getElementById('hp_effective_max');
      if(hpCurr){ hpCurr.readOnly=false; hpCurr.removeAttribute('aria-readonly'); hpCurr.classList.remove('readonly-yellow'); }
      if(hpTemp){ hpTemp.readOnly=false; hpTemp.removeAttribute('aria-readonly'); hpTemp.classList.remove('readonly-yellow'); }
      if(hpTotal){ hpTotal.readOnly=true; hpTotal.setAttribute('aria-readonly','true'); hpTotal.value=String(Math.max(0, num('hp_max') + num('hp_max_temp'))); }
    }
  }
  window.refreshEffectiveVitals = refreshVitals;
  function mini(label,id,readonly=false){
    const el=ensureHidden(id,'0');
    const value=String(el.value||'0').replace(/"/g,'&quot;');
    return '<div class="mini-field"><label>'+label+'</label><input type="number" '+(readonly?'readonly aria-readonly="true" class="graybase"':'data-ma-v8-field="'+id+'"')+' value="'+value+'"></div>';
  }
  function total(label,value){ return '<div class="mini-field"><label>'+label+'</label><div class="total-pill" id="maV8TotalPill">'+Math.max(0,Number(value)||0)+'</div></div>'; }
  function bindEdit(body, ids, calc){
    const recalc=()=>{ const p=body.querySelector('#maV8TotalPill'); if(p) p.textContent=String(Math.max(0, calc())); refreshVitals(); };
    body.querySelectorAll('[data-ma-v8-field]').forEach(inp=>{
      const run=()=>{ setVal(inp.dataset.maV8Field, inp.value || 0); const hidden=document.getElementById(inp.dataset.maV8Field); if(hidden){ hidden.dispatchEvent(new Event('input',{bubbles:true})); hidden.dispatchEvent(new Event('change',{bubbles:true})); } recalc(); try{ if(typeof save==='function') save(true); }catch(e){} };
      inp.addEventListener('input',run); inp.addEventListener('change',run);
    });
    recalc();
    try { if(typeof refreshMpDisplays === 'function') refreshMpDisplays(); } catch(e) {}
  }
  window.openStatEdit = function(section){
    const overlay=document.getElementById('statEditOverlay');
    const body=document.getElementById('statEditBody');
    const title=document.getElementById('statEditTitle');
    if(!body) return typeof priorOpenStatEdit==='function' ? priorOpenStatEdit(section) : undefined;
    if(section === 'hp'){
      ensureHidden('hp_max','0'); ensureHidden('hp_max_temp','0');
      if(title) title.textContent='Edit HP';
      body.innerHTML='<div class="formula-line"><strong>HP</strong><div class="formula-parts">'+mini('Current','hp_curr',false)+mini('Temp HP','hp_temp',false)+mini('Base','hp_max',true)+mini('Max Temp','hp_max_temp',false)+total('Total Max', num('hp_max')+num('hp_max_temp'))+'</div><div class="section-note">Temp HP is separate from Max Temp. Base is calculated from class HP. Max Temp modifies the total maximum.</div></div>';
      bindEdit(body,['hp_curr','hp_temp','hp_max_temp'],()=>num('hp_max')+num('hp_max_temp'));
      if(overlay) overlay.style.display='flex';
      return;
    }
    return typeof priorOpenStatEdit==='function' ? priorOpenStatEdit(section) : undefined;
  };
  ['hp_curr','hp_temp','hp_max','hp_max_temp','mp','mp_temp','mp_max_temp','spell_dc_base','class','character_level','str','dex','con','int','wis','cha'].forEach(id=>{
    document.addEventListener('input', e=>{ if(e.target && e.target.id===id) setTimeout(refreshVitals,0); }, true);
    document.addEventListener('change', e=>{ if(e.target && e.target.id===id) setTimeout(refreshVitals,0); }, true);
  });
  const oldSwitchTab=window.switchTab;
  window.switchTab=function(id){
    if(typeof oldSwitchTab==='function') oldSwitchTab(id);
    setTimeout(refreshVitals,0);
  };
  document.addEventListener('DOMContentLoaded', refreshVitals);
  setTimeout(refreshVitals,50); setTimeout(refreshVitals,300); setTimeout(refreshVitals,1000);
})();
