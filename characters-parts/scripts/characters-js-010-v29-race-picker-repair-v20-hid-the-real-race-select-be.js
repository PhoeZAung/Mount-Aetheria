
/* --- v29 race picker repair ---
   v20 hid the real race select behind a pretty card, but the card's dialog used module-scoped helpers.
   This patch gives the race card its own standalone picker and then changes the real #race select,
   so the existing module listeners still regenerate racial traits and save normally. */
(function(){
  const DATA_URL = './data/ffd20_data.json';
  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function norm(value){ return String(value || '').trim(); }
  function ensureOption(select, value, label){
    if(!select || !value) return;
    const v = String(value);
    if(!Array.from(select.options || []).some(opt => opt.value === v)){
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = label || v;
      select.appendChild(opt);
    }
  }
  function currentRace(){
    const select = document.getElementById('race');
    return norm(select?.value || select?.getAttribute('value') || '');
  }
  function refreshRaceCardV29(){
    const card = document.getElementById('maRaceBuildCard');
    if(!card) return;
    const val = currentRace();
    card.innerHTML = '<span class="ma-class-click-label">Race</span><span class="ma-class-slot-main"><strong id="maRaceBuildTitle" class="ma-build-card-title">'+esc(val || 'Choose Race')+'</strong><small id="maRaceBuildSub" class="ma-build-card-sub">'+esc(val ? 'Click to change ancestry' : 'Pick race traits and ancestry')+'</small></span><span class="ma-build-card-level">Edit</span>';
  }
  function ensureRaceCardV29(){
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
    refreshRaceCardV29();
    return card;
  }
  async function getRaceNames(){
    const select = document.getElementById('race');
    const fromSelect = Array.from(select?.options || [])
      .map(opt => norm(opt.value || opt.textContent))
      .filter(v => v && !/^loading races/i.test(v) && !/^choose race/i.test(v));
    if(fromSelect.length > 1) return Array.from(new Set(fromSelect)).sort((a,b)=>a.localeCompare(b));
    try{
      const res = await fetch(DATA_URL, {cache:'no-store'});
      if(res.ok){
        const json = await res.json();
        const names = (Array.isArray(json?.races) ? json.races : [])
          .map(r => norm(typeof r === 'string' ? r : (r?.name || r?.title || '')))
          .filter(Boolean);
        if(names.length) return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b));
      }
    }catch(e){ console.warn('Race picker could not load JSON', e); }
    return fromSelect;
  }
  function openSimpleDialog(title, bodyHtml, confirmText){
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ffd20-modal-overlay show';
      overlay.style.zIndex = '7300';
      overlay.innerHTML = '<div class="ffd20-modal"><div class="ffd20-modal-head"><h3>'+esc(title)+'</h3><button class="btn-close" type="button" data-close>&times;</button></div><div class="ffd20-modal-body">'+bodyHtml+'</div><div class="ffd20-modal-actions"><button class="ffd20-mini-btn" type="button" data-close>Cancel</button><button class="btn-save" type="button" data-confirm>'+esc(confirmText || 'Save')+'</button></div></div>';
      document.body.appendChild(overlay);
      overlay.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => { overlay.remove(); resolve(null); }));
      overlay.querySelector('[data-confirm]')?.addEventListener('click', () => { resolve(overlay); overlay.remove(); });
    });
  }
  async function openRacePickerV29(){
    const race = document.getElementById('race');
    if(!race){ alert('Race field was not found on this sheet.'); return; }
    const current = currentRace();
    const names = await getRaceNames();
    const options = ['<option value="">Choose race</option>'].concat(names.map(name => '<option value="'+esc(name)+'" '+(name===current?'selected':'')+'>'+esc(name)+'</option>')).join('');
    const overlay = await openSimpleDialog('Edit Race', '<div class="ffd20-modal-grid"><label>Race<select id="maEditRaceV29">'+options+'</select></label></div><div class="ma-race-picker-v29-note">Race traits will generate under the <strong>Racial</strong> tab. Existing race traits in Passive are moved to Racial on load/render.</div>', 'Save Race');
    if(!overlay) return;
    const next = norm(overlay.querySelector('#maEditRaceV29')?.value || '');
    ensureOption(race, next, next);
    race.value = next;
    // Store a plain attribute too, so rebuilt cards can read the value before the module refreshes.
    if(next) race.setAttribute('value', next); else race.removeAttribute('value');
    // Fire the existing module listeners: apply race effects, recalc, and save.
    race.dispatchEvent(new Event('input', {bubbles:true}));
    race.dispatchEvent(new Event('change', {bubbles:true}));
    try { if(typeof window.maV30RaceAbilitySync === 'function') window.maV30RaceAbilitySync({immediate:true, delay:40, save:true}); } catch(e) {}
    refreshRaceCardV29();
    // Redraw abilities after the module has a chance to import/move race traits.
    setTimeout(() => {
      try { if(typeof renderAbilities === 'function'){ renderAbilities('passive'); renderAbilities('racial'); } } catch(e) {}
      try { if(typeof window.maV30RaceAbilitySync === 'function') window.maV30RaceAbilitySync({immediate:true, delay:40, save:true}); } catch(e) {}
      refreshRaceCardV29();
    }, 80);
    setTimeout(() => {
      try { if(typeof window.maV30RaceAbilitySync === 'function') window.maV30RaceAbilitySync({immediate:true, delay:0, save:true}); } catch(e) {}
      refreshRaceCardV29();
    }, 350);
  }
  // Capture click before the older v20 listener, which could fail when module helpers are unavailable.
  document.addEventListener('click', function(event){
    const card = event.target?.closest?.('#maRaceBuildCard');
    if(!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openRacePickerV29();
  }, true);
  document.addEventListener('change', function(event){
    if(event.target?.id === 'race') setTimeout(refreshRaceCardV29, 0);
  }, true);
  window.maRefreshRaceCardV29 = refreshRaceCardV29;
  document.addEventListener('DOMContentLoaded', ensureRaceCardV29);
  window.addEventListener('load', ensureRaceCardV29);
  setTimeout(ensureRaceCardV29, 0);
  setTimeout(ensureRaceCardV29, 250);
  setTimeout(ensureRaceCardV29, 1000);
})();
