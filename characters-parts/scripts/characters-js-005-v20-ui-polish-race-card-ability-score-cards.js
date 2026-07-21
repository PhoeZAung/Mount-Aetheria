
/* --- v20 UI polish: race card + ability score cards --- */
(function(){
  const STATS = ['str','dex','con','int','wis','cha'];
  const STAT_LABELS = {str:'STR',dex:'DEX',con:'CON',int:'INT',wis:'WIS',cha:'CHA'};
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function getData(){
    try { if (typeof maFfd20ActiveData === 'function') return maFfd20ActiveData() || {}; } catch(e) {}
    try { if (typeof getActiveData === 'function') return getActiveData() || {}; } catch(e) {}
    try { return window.fullData || {}; } catch(e) { return {}; }
  }
  function dispatchField(el){
    if(!el) return;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function saveNow(){
    try { if (typeof maFfd20SaveNow === 'function') return maFfd20SaveNow(); } catch(e) {}
    try { if (typeof save === 'function') return save(true); } catch(e) {}
  }
  function addOptionIfMissing(select, value, label){
    if(!select || !value) return;
    const str = String(value);
    if(!Array.from(select.options || []).some(opt => opt.value === str)){
      const opt = document.createElement('option');
      opt.value = str;
      opt.textContent = label || str;
      select.appendChild(opt);
    }
  }
  function raceValue(){
    const sel = document.getElementById('race');
    const d = getData();
    return String(sel?.value || d.race || '').trim();
  }
  function ensureRaceCard(){
    const race = document.getElementById('race');
    if(!race) return;
    race.classList.add('ma-race-card-hidden');
    const parent = race.closest('.bio-item') || race.parentElement;
    if(!parent) return;
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
      card.addEventListener('click', openRaceDialog);
    }
    refreshRaceCard();
  }
  function refreshRaceCard(){
    const card = document.getElementById('maRaceBuildCard');
    if(!card) return;
    const val = raceValue();
    card.innerHTML = '<span class="ma-class-click-label">Race</span><span class="ma-class-slot-main"><strong id="maRaceBuildTitle" class="ma-build-card-title">'+esc(val || 'Choose Race')+'</strong><small id="maRaceBuildSub" class="ma-build-card-sub">'+esc(val ? 'Click to change ancestry' : 'Pick race traits and ancestry')+'</small></span><span class="ma-build-card-level">Edit</span>';
  }
  async function openRaceDialog(){
    const current = raceValue();
    let optionsHtml = '';
    try {
      if(typeof maFfd20LoadLibrary === 'function'){
        const lib = await maFfd20LoadLibrary();
        const races = Array.isArray(lib?.races) ? lib.races : [];
        optionsHtml = '<option value="">Choose race</option>' + races.map(r => {
          const name = typeof r === 'string' ? r : (r?.name || r?.title || '');
          return name ? '<option value="'+esc(name)+'" '+(name===current?'selected':'')+'>'+esc(name)+'</option>' : '';
        }).join('');
      }
    } catch(e) { console.warn('Race library load failed', e); }
    if(!optionsHtml){
      const race = document.getElementById('race');
      optionsHtml = Array.from(race?.options || []).map(opt => '<option value="'+esc(opt.value)+'" '+(opt.value===current?'selected':'')+'>'+esc(opt.textContent || opt.value)+'</option>').join('');
    }
    const body = '<div class="ffd20-modal-grid"><label>Race<select id="maEditRace">'+optionsHtml+'</select></label></div><div class="ffd20-level-summary">Race traits will be generated under the <strong>Racial</strong> tab.</div>';
    let overlay = null;
    try { overlay = typeof maFfd20Dialog === 'function' ? await maFfd20Dialog('Edit Race', body, 'Save Race') : null; } catch(e) { console.warn(e); }
    if(!overlay) return;
    const newRace = overlay.querySelector('#maEditRace')?.value || '';
    const race = document.getElementById('race');
    if(race){
      addOptionIfMissing(race, newRace, newRace);
      race.value = newRace;
      getData().race = newRace;
      dispatchField(race);
    }
    try { if(typeof maFfd20ApplySheetChoices === 'function') await maFfd20ApplySheetChoices({silent:true}); } catch(e) { console.warn(e); }
    try { if(typeof maFfd20MoveRaceEffectsToRacial === 'function') maFfd20MoveRaceEffectsToRacial(getData()); } catch(e) {}
    try { if(typeof renderAbilities === 'function'){ renderAbilities('passive'); renderAbilities('racial'); } } catch(e) {}
    refreshRaceCard();
    saveNow();
  }
  function ensureAbilityCards(){
    const heading = Array.from(document.querySelectorAll('.ability-heading-row')).find(el => /Ability Scores/i.test(el.textContent || ''));
    if(!heading) return;
    let legacy = heading.nextElementSibling;
    if(legacy && legacy.querySelector && legacy.querySelector('#str')) legacy.classList.add('ma-ability-table-legacy');
    let grid = document.getElementById('maAbilityCardGrid');
    if(!grid){
      grid = document.createElement('div');
      grid.id = 'maAbilityCardGrid';
      grid.className = 'ma-ability-card-grid';
      heading.insertAdjacentElement('afterend', grid);
    }
    STATS.forEach(stat => {
      if(grid.querySelector('[data-ma-stat-card="'+stat+'"]')) return;
      const card = document.createElement('div');
      card.className = 'ma-ability-card';
      card.dataset.maStatCard = stat;
      card.innerHTML = '<button type="button" class="ma-ability-name" data-ma-roll-stat="'+stat+'">'+STAT_LABELS[stat]+'</button><input class="ma-ability-score-input" data-ma-stat-input="'+stat+'" type="number" inputmode="numeric"><div class="ma-ability-mod-pill" data-ma-stat-mod="'+stat+'">+0</div>';
      grid.appendChild(card);
      card.querySelector('[data-ma-roll-stat]')?.addEventListener('click', () => { try { if(typeof sendAbilityCheck === 'function') sendAbilityCheck(stat); } catch(e) {} });
      const mirror = card.querySelector('[data-ma-stat-input]');
      mirror?.addEventListener('input', () => {
        const original = document.getElementById(stat);
        if(original){
          original.value = mirror.value;
          getData()[stat] = mirror.value;
          dispatchField(original);
        }
        setTimeout(refreshAbilityCards,0);
      });
      mirror?.addEventListener('change', () => {
        const original = document.getElementById(stat);
        if(original){
          original.value = mirror.value;
          getData()[stat] = mirror.value;
          dispatchField(original);
        }
        saveNow();
        setTimeout(refreshAbilityCards,0);
      });
    });
    refreshAbilityCards();
  }
  function refreshAbilityCards(){
    STATS.forEach(stat => {
      const original = document.getElementById(stat);
      const mirror = document.querySelector('[data-ma-stat-input="'+stat+'"]');
      const mod = document.querySelector('[data-ma-stat-mod="'+stat+'"]');
      const modSource = document.getElementById('mod-' + stat);
      if(mirror && document.activeElement !== mirror){
        const d = getData();
        const loadedValue = (original && String(original.value ?? '').trim() !== '')
          ? original.value
          : (d[stat] !== undefined && d[stat] !== null && String(d[stat]).trim() !== '' ? d[stat] : 10);
        mirror.value = String(loadedValue);
      }
      if(mod) mod.textContent = modSource?.textContent || '+0';
    });
  }
  window.maCharacterRefreshAbilityScoreMirrors = refreshAbilityCards;
  function polishIdentity(){
    const grid = document.getElementById('ffd20ChoiceGrid');
    const identity = grid?.querySelector('.ffd20-bio-col:first-child');
    if(!identity || identity.dataset.v20Identity === '1') return;
    identity.dataset.v20Identity = '1';
    const alignment = identity.querySelector('#alignment')?.closest('.bio-item');
    const size = identity.querySelector('#size_category')?.closest('.bio-item');
    if(alignment && size && !identity.querySelector('.ma-identity-row-grid')){
      const wrap = document.createElement('div');
      wrap.className = 'ma-identity-row-grid';
      alignment.insertAdjacentElement('beforebegin', wrap);
      wrap.appendChild(alignment);
      wrap.appendChild(size);
    }
  }
  function refreshAllUi(){
    ensureRaceCard();
    ensureAbilityCards();
    polishIdentity();
    refreshRaceCard();
    refreshAbilityCards();
  }
  const oldBuild = window.maFfd20BuildChoiceGrid;
  if(typeof oldBuild === 'function' && oldBuild.dataset?.v20Wrapped !== '1'){
    const wrapped = function(){ const out = oldBuild.apply(this, arguments); setTimeout(refreshAllUi,0); return out; };
    wrapped.dataset = {v20Wrapped:'1'};
    window.maFfd20BuildChoiceGrid = wrapped;
  }
  const oldRefreshOptions = window.maFfd20RefreshOptions;
  if(typeof oldRefreshOptions === 'function' && oldRefreshOptions.dataset?.v20Wrapped !== '1'){
    const wrapped = async function(){ const out = await oldRefreshOptions.apply(this, arguments); setTimeout(refreshAllUi,0); return out; };
    wrapped.dataset = {v20Wrapped:'1'};
    window.maFfd20RefreshOptions = wrapped;
  }
  const oldLoad = window.loadCurrentSheet;
  if(typeof oldLoad === 'function' && oldLoad.dataset?.v20Wrapped !== '1'){
    const wrapped = function(){ const out = oldLoad.apply(this, arguments); setTimeout(refreshAllUi,0); setTimeout(refreshAllUi,250); return out; };
    wrapped.dataset = {v20Wrapped:'1'};
    window.loadCurrentSheet = wrapped;
  }
  document.addEventListener('input', e => { if(e.target && STATS.includes(e.target.id)) setTimeout(refreshAbilityCards,0); }, true);
  document.addEventListener('change', e => { if(e.target && (e.target.id === 'race' || STATS.includes(e.target.id))) setTimeout(refreshAllUi,0); }, true);
  document.addEventListener('DOMContentLoaded', refreshAllUi);
  setTimeout(refreshAllUi,0);
  setTimeout(refreshAllUi,250);
  setTimeout(refreshAllUi,1000);
})();
