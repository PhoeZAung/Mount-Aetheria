
/* --- v31 race card hydrate + instant picker ---
   Runs after the older race-card patch. It reads the module-published race cache
   and opens a race dialog immediately, instead of waiting on the JSON fetch before
   the UI responds. */
(function(){
  const DATA_URL = './data/ffd20_data.json';
  const STORAGE_PREFIX = 'mountAetheriaCurrentRaceV31:';
  let raceNamesCache = null;
  let raceNamesPromise = null;
  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function clean(value){
    const text = String(value || '').trim();
    if(!text || /^choose race$/i.test(text) || /^loading races/i.test(text)) return '';
    return text;
  }
  function currentCharacterId(){
    return clean(window.maCurrentCharacterIdV31 || document.body?.dataset?.maCurrentCharacterIdV31 || '');
  }
  function selectRaceValue(){
    const select = document.getElementById('race');
    return clean(select?.value) || clean(select?.getAttribute('value'));
  }
  function cachedRaceValue(){
    try {
      const id = currentCharacterId();
      if(id) return clean(localStorage.getItem(STORAGE_PREFIX + id));
    } catch(e) {}
    return '';
  }
  function raceFromAnywhere(){
    try { if(typeof window.maGetCurrentRaceV31 === 'function') return clean(window.maGetCurrentRaceV31()); } catch(e) {}
    return clean(window.maCurrentRaceValueV31)
        || clean(document.body?.dataset?.maCurrentRaceV31)
        || clean(document.documentElement?.dataset?.maCurrentRaceV31)
        || selectRaceValue()
        || cachedRaceValue();
  }
  function ensureOption(select, value, label){
    const v = clean(value);
    if(!select || !v) return;
    if(!Array.from(select.options || []).some(opt => opt.value === v)){
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = label || v;
      select.appendChild(opt);
    }
  }
  function applyRaceToHiddenSelect(value){
    const raceValue = clean(value);
    const select = document.getElementById('race');
    if(!select || !raceValue) return raceValue;
    ensureOption(select, raceValue, raceValue);
    select.value = raceValue;
    select.setAttribute('value', raceValue);
    try { window.maCurrentRaceValueV31 = raceValue; } catch(e) {}
    try { document.body.dataset.maCurrentRaceV31 = raceValue; } catch(e) {}
    return raceValue;
  }
  function ensureRaceCardV31(){
    const race = document.getElementById('race');
    if(!race) return null;
    race.classList.add('ma-race-card-hidden');
    const parent = race.closest('.bio-item') || race.parentElement;
    if(!parent) return null;
    parent.classList.add('ma-race-card-wrap');
    const label = parent.querySelector('label');
    if(label) label.style.display = 'none';
    let card = document.getElementById('maRaceBuildCard');
    if(!card){
      card = document.createElement('button');
      card.type = 'button';
      card.id = 'maRaceBuildCard';
      card.className = 'ma-build-card ma-race-build-card';
      card.title = 'Edit race';
      parent.appendChild(card);
    }
    card.classList.add('ma-race-hydrated-v31');
    refreshRaceCardV31();
    return card;
  }
  function refreshRaceCardV31(){
    const card = document.getElementById('maRaceBuildCard') || ensureRaceCardV31();
    if(!card) return;
    const val = applyRaceToHiddenSelect(raceFromAnywhere()) || raceFromAnywhere();
    card.innerHTML = '<span class="ma-class-click-label">Race</span><span class="ma-class-slot-main"><strong id="maRaceBuildTitle" class="ma-build-card-title">'+esc(val || 'Choose Race')+'</strong><small id="maRaceBuildSub" class="ma-build-card-sub">'+esc(val ? 'Click to change ancestry' : 'Pick race traits and ancestry')+'</small></span><span class="ma-build-card-level">Edit</span>';
  }
  function raceNamesFromSelect(){
    const select = document.getElementById('race');
    return Array.from(select?.options || [])
      .map(opt => clean(opt.value || opt.textContent))
      .filter(Boolean);
  }
  function uniqueSorted(names){
    return Array.from(new Set((names || []).map(clean).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  }
  function preloadRaceNames(){
    if(raceNamesPromise) return raceNamesPromise;
    const immediate = uniqueSorted(raceNamesFromSelect());
    if(immediate.length > 1) raceNamesCache = immediate;
    raceNamesPromise = fetch(DATA_URL, {cache:'force-cache'})
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        const names = uniqueSorted((Array.isArray(json?.races) ? json.races : []).map(r => typeof r === 'string' ? r : (r?.name || r?.title || '')));
        if(names.length) raceNamesCache = names;
        return raceNamesCache || uniqueSorted(raceNamesFromSelect());
      })
      .catch(err => {
        console.warn('Race list preload failed', err);
        raceNamesCache = raceNamesCache || uniqueSorted(raceNamesFromSelect());
        return raceNamesCache;
      });
    return raceNamesPromise;
  }
  function optionHtml(names, current){
    const list = uniqueSorted([current].concat(names || []));
    return '<option value="">Choose race</option>' + list.map(name => '<option value="'+esc(name)+'" '+(name===current?'selected':'')+'>'+esc(name)+'</option>').join('');
  }
  function openRacePickerV31(){
    const race = document.getElementById('race');
    if(!race){ alert('Race field was not found on this sheet.'); return; }
    refreshRaceCardV31();
    const current = raceFromAnywhere();
    const knownNames = raceNamesCache || uniqueSorted(raceNamesFromSelect());
    const overlay = document.createElement('div');
    overlay.className = 'ffd20-modal-overlay show';
    overlay.style.zIndex = '7350';
    overlay.innerHTML = '<div class="ffd20-modal"><div class="ffd20-modal-head"><h3>Edit Race</h3><button class="btn-close" type="button" data-close>&times;</button></div><div class="ffd20-modal-body"><div class="ffd20-modal-grid"><label>Race<select id="maEditRaceV31">'+optionHtml(knownNames, current)+'</select></label></div><div id="maRacePickerStatusV31" class="ma-race-picker-v31-loading"><strong>Status:</strong> '+(knownNames.length > 1 ? 'Race list ready.' : 'Loading race list...')+'</div></div><div class="ffd20-modal-actions"><button class="ffd20-mini-btn" type="button" data-close>Cancel</button><button class="btn-save" type="button" data-confirm>Save Race</button></div></div>';
    document.body.appendChild(overlay);
    const picker = overlay.querySelector('#maEditRaceV31');
    const status = overlay.querySelector('#maRacePickerStatusV31');
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', close));
    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => {
      const next = clean(picker?.value || '');
      applyRaceToHiddenSelect(next);
      try { window.maSetCurrentRaceV31?.(next); } catch(e) {}
      race.dispatchEvent(new Event('input', {bubbles:true}));
      race.dispatchEvent(new Event('change', {bubbles:true}));
      try { window.maV30RaceAbilitySync?.({immediate:true, delay:40, save:true}); } catch(e) {}
      refreshRaceCardV31();
      setTimeout(refreshRaceCardV31, 60);
      setTimeout(refreshRaceCardV31, 300);
      close();
    });
    preloadRaceNames().then(names => {
      if(!document.body.contains(overlay)) return;
      const currentNow = clean(picker?.value || current || raceFromAnywhere());
      picker.innerHTML = optionHtml(names, currentNow);
      picker.value = currentNow;
      if(status) status.innerHTML = '<strong>Status:</strong> Race list ready.';
    });
  }
  // This runs before the older document-level capture handler, so the picker responds instantly.
  window.addEventListener('click', function(event){
    const card = event.target?.closest?.('#maRaceBuildCard');
    if(!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openRacePickerV31();
  }, true);
  const oldRefresh = window.maRefreshRaceCardV29;
  window.maRefreshRaceCardV29 = function(){
    try { if(typeof oldRefresh === 'function') oldRefresh(); } catch(e) {}
    refreshRaceCardV31();
  };
  window.maRefreshRaceCardV31 = refreshRaceCardV31;
  document.addEventListener('input', e => { if(e.target?.id === 'race') setTimeout(refreshRaceCardV31, 0); }, true);
  document.addEventListener('change', e => { if(e.target?.id === 'race') setTimeout(refreshRaceCardV31, 0); }, true);
  document.addEventListener('DOMContentLoaded', () => { ensureRaceCardV31(); preloadRaceNames(); });
  window.addEventListener('load', () => { ensureRaceCardV31(); preloadRaceNames(); });
  setTimeout(() => { ensureRaceCardV31(); preloadRaceNames(); }, 0);
  setTimeout(refreshRaceCardV31, 250);
  setTimeout(refreshRaceCardV31, 900);
  setInterval(refreshRaceCardV31, 1500);
})();
