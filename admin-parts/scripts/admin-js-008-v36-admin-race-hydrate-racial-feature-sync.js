
/* --- v36 admin race hydrate + racial feature sync --- */
(function(){
  if(window.maAdminRaceHydrateV36) return;
  window.maAdminRaceHydrateV36 = true;
  const DATA_URL = './data/ffd20_data.json';
  const STORAGE_PREFIX = 'mountAetheriaAdminRaceV36:';
  let raceNamesCache = null;
  let raceNamesPromise = null;
  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function clean(value){ return String(value ?? '').trim(); }
  function getData(){
    try { if(typeof window.maFfd20ActiveData === 'function') return window.maFfd20ActiveData() || {}; } catch(e) {}
    try { if(typeof window.getActiveData === 'function') return window.getActiveData() || {}; } catch(e) {}
    return {};
  }
  function characterKey(){
    const uid = clean(window.currentParentUid || '');
    const sid = clean(window.currentSummonId || '');
    return uid && sid ? uid + ':' + sid : '';
  }
  function storageKey(){ return STORAGE_PREFIX + (characterKey() || 'active'); }
  function ensureOption(select, value, text){
    if(!select || !value) return;
    if(!Array.from(select.options).some(opt => opt.value === value)){
      const opt = document.createElement('option'); opt.value = value; opt.textContent = text || value; select.appendChild(opt);
    }
  }
  function applyRace(value, writeData=false){
    const race = document.getElementById('race');
    const next = clean(value);
    if(race){
      if(next) ensureOption(race, next, next);
      race.value = next;
      if(next) race.setAttribute('value', next); else race.removeAttribute('value');
    }
    if(writeData){
      const data = getData();
      data.race = next;
    }
    if(next){ try { localStorage.setItem(storageKey(), next); } catch(e) {} }
    else { try { localStorage.removeItem(storageKey()); } catch(e) {} }
    window.maCurrentRaceValueV31 = next;
    window.maCurrentRaceValueV36 = next;
    return next;
  }
  function selectedRace(){
    const dataRace = clean(getData()?.race);
    if(dataRace) return dataRace;
    const el = document.getElementById('race');
    const domRace = clean(el?.value || el?.getAttribute('value'));
    if(domRace) return domRace;
    try { return clean(localStorage.getItem(storageKey()) || ''); } catch(e) { return ''; }
  }
  function raceNamesFromSelect(){
    const race = document.getElementById('race');
    return race ? Array.from(race.options).map(opt => clean(opt.value || opt.textContent)).filter(Boolean).filter(v => !/^choose race|loading races/i.test(v)) : [];
  }
  async function loadRaceNames(){
    if(raceNamesCache) return raceNamesCache;
    if(raceNamesPromise) return raceNamesPromise;
    raceNamesPromise = fetch(DATA_URL, {cache:'no-store'})
      .then(r => { if(!r.ok) throw new Error('Could not load race list'); return r.json(); })
      .then(lib => {
        const names = (Array.isArray(lib?.races) ? lib.races : []).map(r => clean(r?.name || r)).filter(Boolean);
        raceNamesCache = Array.from(new Set(names)).sort((a,b) => a.localeCompare(b));
        return raceNamesCache;
      })
      .catch(err => {
        console.warn('[admin race] race list fetch failed; using current select options', err);
        raceNamesCache = Array.from(new Set(raceNamesFromSelect())).sort((a,b) => a.localeCompare(b));
        return raceNamesCache;
      });
    return raceNamesPromise;
  }
  function optionHtml(names, current){
    return ['<option value="">Choose race</option>'].concat(names.map(name => `<option value="${esc(name)}" ${name===current?'selected':''}>${esc(name)}</option>`)).join('');
  }
  async function refreshRaceCard(){
    const card = document.getElementById('maRaceBuildCard');
    if(!card) return;
    const race = applyRace(selectedRace(), false);
    card.classList.add('ma-admin-race-hydrated-v36');
    const title = card.querySelector('.ma-race-title, .ma-build-card-title, strong');
    if(title) title.textContent = race || 'Choose Race';
    const sub = card.querySelector('.ma-race-sub, .ma-build-card-sub, small');
    if(sub) sub.textContent = race ? 'Click to change race' : 'No race selected';
    try { if(typeof window.maRefreshRaceCardV31 === 'function') window.maRefreshRaceCardV31(); } catch(e) {}
    try { if(typeof window.maRefreshRaceCardV29 === 'function') window.maRefreshRaceCardV29(); } catch(e) {}
  }
  async function syncRacialFeatures(){
    try { if(typeof window.maFfd20MoveRaceEffectsToRacial === 'function') window.maFfd20MoveRaceEffectsToRacial(getData()); } catch(e) { console.warn('[admin race] racial sync failed', e); }
    try { if(typeof window.renderAbilities === 'function'){ window.renderAbilities('active'); window.renderAbilities('passive'); window.renderAbilities('racial'); window.renderAbilities('feat'); } } catch(e) {}
    try { if(typeof window.triggerSave === 'function') window.triggerSave(); else if(typeof window.saveDataOnly === 'function') window.saveDataOnly(); else if(typeof window.maFfd20SaveNow === 'function') window.maFfd20SaveNow(); } catch(e) {}
    refreshRaceCard();
  }
  async function openPicker(){
    const race = document.getElementById('race');
    if(!race){ alert('Race field was not found on this sheet.'); return; }
    const current = applyRace(selectedRace(), false);
    const shell = document.createElement('div');
    shell.className = 'modal-overlay ma-editor-overlay';
    shell.style.display = 'flex';
    shell.innerHTML = `<div class="modal-content ma-editor-content" style="max-width:500px;"><div class="modal-header" data-editor-icon="✥"><h3>Edit Race</h3><button class="btn-close" type="button" data-close>×</button></div><div class="modal-body ma-editor-body"><div class="ma-edit-field"><label>Race</label><select id="maAdminRacePickerV36"><option value="${esc(current)}">${esc(current || 'Loading races...')}</option></select></div><div class="ma-race-picker-v36-loading"><strong>Race traits</strong> will refresh under the Racial tab when saved. Previous character race values are ignored while Admin is loading a new sheet.</div></div><div class="modal-footer ma-theme-footer"><button class="btn-save" type="button" data-save>Save Race</button></div></div>`;
    document.body.appendChild(shell);
    const picker = shell.querySelector('#maAdminRacePickerV36');
    const close = () => shell.remove();
    shell.querySelector('[data-close]')?.addEventListener('click', close);
    shell.addEventListener('click', e => { if(e.target === shell) close(); });
    loadRaceNames().then(names => { picker.innerHTML = optionHtml(names, current); });
    shell.querySelector('[data-save]')?.addEventListener('click', async () => {
      const next = applyRace(picker.value, true);
      race.dispatchEvent(new Event('input', {bubbles:true}));
      race.dispatchEvent(new Event('change', {bubbles:true}));
      try { if(typeof window.maFfd20ApplySheetChoices === 'function') await window.maFfd20ApplySheetChoices({silent:true}); } catch(e) { console.warn('[admin race] apply choices failed', e); }
      applyRace(next, true);
      await syncRacialFeatures();
      close();
    });
  }
  document.addEventListener('click', function(event){
    const card = event.target?.closest?.('#maRaceBuildCard');
    if(!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPicker();
  }, true);
  document.addEventListener('change', function(event){
    if(event.target?.id === 'race') setTimeout(syncRacialFeatures, 0);
  }, true);
  const boot = () => { refreshRaceCard(); loadRaceNames(); setTimeout(syncRacialFeatures, 80); };
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('load', boot);
  setTimeout(boot, 0);
  setTimeout(boot, 300);
  setInterval(refreshRaceCard, 1500);
  window.maAdminRaceHydrateV36Refresh = refreshRaceCard;
})();
