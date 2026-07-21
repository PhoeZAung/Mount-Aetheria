
/* --- v41 automated skill-point hard lock ---
   Skill points are now always derived from class JSON + saved favored +1 skill choices - ranks spent.
   Legacy/manual stored skill-point pools are ignored and cleaned so old characters cannot keep inflated pools. */
(function(){
  const PATCH = 'v41-auto-skill-only';
  let libPromise = null;
  let writeLock = false;
  let saveLock = false;
  let lastComputed = null;
  let timer = null;

  function data(){
    try { if(typeof window.maFfd20ActiveData === 'function') return window.maFfd20ActiveData() || {}; } catch(e) {}
    try { if(typeof window.getActiveData === 'function') return window.getActiveData() || {}; } catch(e) {}
    try { if(window.fullData) return window.fullData; } catch(e) {}
    try { if(window.fullSheetData) return window.fullSheetData; } catch(e) {}
    return {};
  }
  function intVal(value, fallback=0){
    if(value === '' || value === null || value === undefined) return fallback;
    const m = String(value).match(/[+-]?\d+/);
    const n = m ? Number(m[0]) : Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }
  function norm(value){ return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function read(id, fallback=''){
    const el = document.getElementById(id);
    const d = data();
    const raw = (el && String(el.value ?? '').trim() !== '') ? el.value : d[id];
    return raw === undefined || raw === null || raw === '' ? fallback : raw;
  }
  function intMod(){ return Math.floor((intVal(read('int', data().int || 10), 10) - 10) / 2); }
  function levelOf(value, fallback=0){ return Math.max(0, intVal(value, fallback)); }
  function skillBase(cls){
    const raw = cls?.skillPoints ?? cls?.skill_points ?? cls?.skillRanks ?? cls?.skill_ranks ?? '';
    const m = String(raw).match(/\d+/);
    return m ? Number(m[0]) : 0;
  }
  async function fetchJson(path){
    const res = await fetch(path, { cache:'no-store' });
    if(!res.ok) throw new Error(path + ' failed');
    return res.json();
  }
  async function loadLib(){
    if(libPromise) return libPromise;
    libPromise = (async function(){
      try { if(window.maFfd20Library && (window.maFfd20Library.classes || window.maFfd20Library.prestigeClasses)) return window.maFfd20Library; } catch(e) {}
      try { if(typeof window.maFfd20LoadLibrary === 'function') return await window.maFfd20LoadLibrary(); } catch(e) {}
      try { if(window.FFD20_DATA) return window.FFD20_DATA; } catch(e) {}
      const paths = ['data/ffd20_data.json','ffd20_data.json','./data/ffd20_data.json','./ffd20_data.json'];
      let lastErr = null;
      for(const path of paths){
        try { const lib = await fetchJson(path); window.maFfd20Library = lib; return lib; }
        catch(e){ lastErr = e; }
      }
      throw lastErr || new Error('Could not load ffd20_data.json');
    })();
    return libPromise;
  }
  function findByName(list, name){
    const target = norm(name);
    if(!target) return null;
    const arr = Array.isArray(list) ? list : [];
    return arr.find(item => norm(item?.name || item?.className || item?.title) === target) || arr.find(item => norm(item?.name || item?.className || item?.title).includes(target)) || null;
  }
  function classRows(){
    const d = data();
    const rows = [];
    const mainName = read('class', d.class || d.className || '');
    const mainLevel = Math.max(1, levelOf(read('character_level', d.character_level || d.level || 1), 1));
    if(String(mainName || '').trim()) rows.push({ label:'Class', name:mainName, level:mainLevel, prestige:false });
    const mcs = Array.isArray(d.multiclasses) ? d.multiclasses : [];
    mcs.forEach((mc, i) => {
      const name = mc?.className || mc?.class || mc?.name || '';
      const lvl = levelOf(mc?.level || mc?.classLevel || 0, 0);
      if(name && lvl) rows.push({ label:'Class ' + (i+2), name, level:lvl, prestige:!!mc.prestige });
    });
    const prestigeName = read('prestige_class', d.prestige_class || '');
    const prestigeLevel = levelOf(read('prestige_level', d.prestige_level || 0), 0);
    if(prestigeName && prestigeLevel && !rows.some(r => norm(r.name) === norm(prestigeName))) rows.push({ label:'Prestige', name:prestigeName, level:prestigeLevel, prestige:true });
    return rows;
  }
  function totalLevel(rows = classRows()){
    return Math.max(1, rows.reduce((sum, row) => sum + Math.max(0, levelOf(row.level, 0)), 0));
  }
  function ranksSpent(){
    const inputs = Array.from(document.querySelectorAll('#skillsTableBody .skill-ranks'));
    if(inputs.length) return inputs.reduce((sum, input) => sum + Math.max(0, intVal(input.value,0)), 0);
    const skills = Array.isArray(data().skills) ? data().skills : [];
    return skills.reduce((sum, skill) => sum + Math.max(0, intVal(skill?.lvl ?? skill?.ranks ?? skill?.rank ?? 0, 0)), 0);
  }
  function favoredSkillCount(maxLevel){
    const d = data();
    const maps = [
      d.favoredClassBonuses,
      d.levelBonusChoicesV37,
      d.levelBonusChoicesV36,
      d.levelBonusChoicesV35,
      d.favored_bonuses,
      d.favoredBonuses
    ].filter(map => map && typeof map === 'object' && !Array.isArray(map));
    const seen = new Set();
    let count = 0;
    for(const map of maps){
      for(const [level, choice] of Object.entries(map)){
        const lvl = intVal(level, 0);
        if(lvl < 1 || lvl > maxLevel || seen.has(String(lvl))) continue;
        const normalized = String(choice || '').trim().toLowerCase();
        if(normalized === 'skill' || normalized === '+1 skill' || normalized === '+1 skill point') count++;
        if(normalized === 'skill' || normalized === 'hp' || normalized === '+1 hp' || normalized === '+1 skill' || normalized === '+1 skill point') seen.add(String(lvl));
      }
    }
    return count;
  }
  function clearLegacyManualFields(d){
    if(!d || typeof d !== 'object') return;
    [
      'manual_skill_points','skill_points_manual','skillPointAdjustment','skill_point_adjustment','skill_points_adjustment',
      'extra_skill_points','bonus_skill_points','skill_points_extra','skill_points_bonus','skill_points_added',
      'skillPoolBonus','skill_pool_bonus','skillPoolManual','skill_points_pool_manual','unspent_skill_points_manual',
      'skill_points_override','skillPointOverride','skill_points_legacy_bonus'
    ].forEach(key => { if(Object.prototype.hasOwnProperty.call(d, key)) delete d[key]; });
  }
  async function compute(){
    const lib = await loadLib();
    const rows = classRows();
    const mod = intMod();
    let classBudget = 0;
    const debugRows = [];
    rows.forEach((row, index) => {
      const cls = findByName(row.prestige ? (lib.prestigeClasses || lib.prestige_classes || lib.classes) : lib.classes, row.name) || findByName(lib.prestigeClasses || lib.prestige_classes, row.name) || {};
      const base = skillBase(cls);
      const perLevel = Math.max(1, base + mod);
      const lvlCount = Math.max(0, levelOf(row.level, 0));
      let subtotal = 0;
      for(let lvl=1; lvl<=lvlCount; lvl++) subtotal += perLevel;
      classBudget += subtotal;
      debugRows.push({ label:row.label, className:row.name, level:lvlCount, skillBase:base, intMod:mod, perLevel, total:subtotal });
    });
    const maxLevel = totalLevel(rows);
    const favoredSkill = favoredSkillCount(maxLevel);
    const ranks = ranksSpent();
    const totalBudget = classBudget + favoredSkill;
    return { unused: totalBudget - ranks, totalBudget, classBudget, favoredSkill, ranks, totalLevel:maxLevel, rows:debugRows };
  }
  function write(result){
    if(!result) return result;
    const d = data();
    clearLegacyManualFields(d);
    const value = String(intVal(result.unused, 0));
    const el = document.getElementById('skill_points');
    writeLock = true;
    try {
      if(el){
        el.value = value;
        el.readOnly = true;
        el.setAttribute('readonly','readonly');
        el.setAttribute('aria-readonly','true');
        el.removeAttribute('min');
        el.dataset.calculated = PATCH;
        el.title = 'Automatic only: unused skill points = class skill budget + saved +1 skill choices - ranks spent. Old manual/bonus skill pools are ignored.';
        el.classList.toggle('overspent', intVal(value,0) < 0);
      }
      d.skill_points = value;
      d.skill_points_total = String(result.totalBudget);
      d.total_skill_points = String(result.totalBudget);
      d.skill_points_total_earned = String(result.totalBudget);
      d.skill_points_class_budget = String(result.classBudget);
      d.skill_points_favored_bonus = String(result.favoredSkill);
      d.skill_ranks_spent = String(result.ranks);
      d.skill_points_formula = 'Automatic only: unused = class skill budget + favored +1 skill choices - ranks spent; manual skill pools ignored';
      d.skill_points_debug_rows = result.rows;
      d.skill_points_patch = PATCH;
      lastComputed = result;
    } finally {
      setTimeout(() => { writeLock = false; }, 0);
    }
    document.querySelectorAll('#skillsTableBody .skill-ranks').forEach(input => {
      input.setAttribute('min','0');
      input.setAttribute('max', String(Math.max(1, result.totalLevel || totalLevel())));
      input.dataset.prevValue = String(Math.max(0, intVal(input.value, 0)));
    });
    const editBtn = document.getElementById('skillPointsEditBtn');
    if(editBtn) editBtn.remove();
    return result;
  }
  async function recalc(options={}){
    try {
      const result = write(await compute());
      if(options.save) saveNow();
      return result;
    } catch(e){
      console.warn('[' + PATCH + '] skill budget recalc failed', e);
      return null;
    }
  }
  function schedule(options={}){
    clearTimeout(timer);
    timer = setTimeout(() => recalc(options), options.delay ?? 80);
  }
  function saveNow(){
    if(saveLock) return;
    saveLock = true;
    setTimeout(() => {
      try { if(typeof window.maFfd20SaveNow === 'function') window.maFfd20SaveNow(); else if(typeof window.save === 'function') window.save(true); }
      catch(e){ console.warn('[' + PATCH + '] save after skill recalc failed', e); }
      finally { saveLock = false; }
    }, 0);
  }

  window.maAutoSkillOnlyRecalc = recalc;
  window.maV41AutoSkillOnlyRecalc = recalc;
  window.toggleSkillPointEdit = function(){
    schedule({delay:0, save:true});
    alert('Unused Skill Points are automatic now. Change class levels, INT, favored +1 skill choices, or skill ranks instead. Old manual skill-point bonuses are ignored.');
  };
  window.setUnusedSkillPoints = function(){ schedule({delay:0, save:true}); };
  window.getUnusedSkillPoints = function(){ return lastComputed ? intVal(lastComputed.unused, 0) : intVal(document.getElementById('skill_points')?.value, 0); };
  window.applySkillRankChange = function(input){
    if(input){
      const cap = Math.max(1, lastComputed?.totalLevel || totalLevel());
      input.setAttribute('min','0'); input.setAttribute('max', String(cap));
      input.value = String(Math.max(0, Math.min(cap, intVal(input.value, 0))));
      input.dataset.prevValue = String(intVal(input.value, 0));
    }
    schedule({delay:0, save:true});
  };

  ['save','maFfd20SaveNow'].forEach(name => {
    const old = window[name];
    if(typeof old === 'function' && old.__maAutoSkillOnlyWrapped !== true){
      const wrapped = function(){
        if(!saveLock) schedule({delay:0, save:false});
        return old.apply(this, arguments);
      };
      wrapped.__maAutoSkillOnlyWrapped = true;
      try { window[name] = wrapped; } catch(e) {}
    }
  });
  ['populateSheet','loadCurrentSheet','updateCalcs','updateCalculations','computeDerivedStats','updateProgressionFields'].forEach(name => {
    const old = window[name];
    if(typeof old === 'function' && old.__maAutoSkillOnlyWrapped !== true){
      const wrapped = function(){
        const result = old.apply(this, arguments);
        Promise.resolve(result).finally(() => schedule({delay:120, save:name === 'updateProgressionFields'}));
        return result;
      };
      wrapped.__maAutoSkillOnlyWrapped = true;
      try { window[name] = wrapped; } catch(e) {}
    }
  });
  document.addEventListener('input', event => {
    const target = event.target;
    if(target?.matches?.('#skill_points')) { if(!writeLock) schedule({delay:0, save:true}); return; }
    if(target?.matches?.('#skillsTableBody .skill-ranks, #int, #character_level, #class, #archetype, [data-favored-level], .ma-multiclass-level, .ma-class-level')) schedule({delay:35, save:true});
  }, true);
  document.addEventListener('change', event => {
    const target = event.target;
    if(target?.matches?.('#skill_points')) { if(!writeLock) schedule({delay:0, save:true}); return; }
    if(target?.matches?.('#skillsTableBody .skill-ranks, #int, #character_level, #class, #archetype, [data-favored-level], select, input')) schedule({delay:70, save:true});
  }, true);
  document.addEventListener('click', event => {
    if(event.target?.closest?.('#maClassBuildCard,#maAddMulticlassBtn,.ma-multiclass-edit,.ma-levelup-confirm,.btn-save,#skillsExitEditBtn,#skillsEnterEditBtn,.ffd20-modal-actions button,.modal-footer button')){
      schedule({delay:180, save:true});
      setTimeout(() => recalc({save:true}), 650);
    }
  }, true);
  function boot(){
    schedule({delay:0, save:false});
    setTimeout(() => recalc({save:false}), 300);
    setTimeout(() => recalc({save:true}), 1400);
    const el = document.getElementById('skill_points');
    if(el && !el.__maAutoSkillOnlyObserved){
      el.__maAutoSkillOnlyObserved = true;
      new MutationObserver(() => { if(!writeLock) schedule({delay:0, save:true}); }).observe(el, { attributes:true, attributeFilter:['value','min','readonly'] });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('load', () => setTimeout(() => recalc({save:true}), 1200));
})();
