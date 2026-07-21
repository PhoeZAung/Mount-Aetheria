
/* --- FINAL prestige/base class dropdown repair v4
   Earlier non-module class-list patches could run after the real FFD20 module and replace the
   class dropdown with empty optgroups. This final bridge fetches the JSON directly, normalizes
   base + prestige classes once, and re-fills every class picker after any late render/dialog. */
(function(){
  if(window.maPrestigeClassDropdownFinalV4) return;
  window.maPrestigeClassDropdownFinalV4 = true;

  const DATA_URL = './data/ffd20_data.json';
  const CLASS_SELECT_IDS = new Set(['class','maEditClass','maCreateClass','ffd20ClassSelect','maMultiClass']);
  const PRESTIGE_ONLY_SELECT_IDS = new Set(['prestige_class','ffd20PrestigeSelect']);
  let cachedLib = null;
  let refreshTimer = null;

  function nameOf(item){
    if(typeof item === 'string') return item.trim();
    return String(item?.name || item?.title || item?.className || item?.class || item?.label || '').trim();
  }
  function norm(value){
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function cloneObj(item, keyName){
    if(typeof item === 'string') return { name:item };
    if(item && typeof item === 'object'){
      const out = Object.assign({}, item);
      if(!nameOf(out) && keyName && !/^\d+$/.test(String(keyName))) out.name = String(keyName).trim();
      return out;
    }
    return { name:String(item || keyName || '') };
  }
  function valuesAsItems(value){
    if(Array.isArray(value)) return value.map((item, index) => cloneObj(item, index));
    if(value && typeof value === 'object') return Object.entries(value).map(([key, item]) => cloneObj(item, key));
    return [];
  }
  function looksPrestige(item, path=''){
    const text = [
      path, item?.type, item?.category, item?.group, item?.classType, item?.sourceType,
      item?.tags, item?.section, item?.kind, item?.subtype, item?.source, item?.isPrestigeClass ? 'prestige' : ''
    ].map(v => Array.isArray(v) ? v.join(' ') : String(v || '')).join(' ').toLowerCase();
    return /\bprestige\b/.test(text);
  }
  function looksClassLike(item){
    if(!item || typeof item !== 'object' || !nameOf(item)) return false;
    return !!(
      Array.isArray(item.features) || Array.isArray(item.traits) || Array.isArray(item.abilities) ||
      Array.isArray(item.classFeatures) || Array.isArray(item.class_features) || Array.isArray(item.progression) ||
      Array.isArray(item.levels) || Array.isArray(item.archetypes) || item.hitDie || item.hit_die ||
      item.skillPoints || item.skill_points || item.skillRanks || item.skill_ranks || item.bab ||
      item.fort || item.ref || item.will || item.saves || item.hp || item.table
    );
  }
  function pushUnique(out, item, isPrestige){
    const obj = cloneObj(item);
    const name = nameOf(obj);
    if(!name) return;
    if(isPrestige) obj.isPrestigeClass = true;
    const key = norm(name);
    if(out._seen.has(key)) return;
    out._seen.add(key);
    out.items.push(obj);
  }
  function uniqueSorted(list){
    const box = { _seen:new Set(), items:[] };
    (Array.isArray(list) ? list : []).forEach(item => pushUnique(box, item, !!item?.isPrestigeClass));
    return box.items.sort((a,b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity:'base' }));
  }
  function addItemsTo(baseBox, prestigeBox, value, isPrestige, path=''){
    valuesAsItems(value).forEach(item => {
      if(!nameOf(item)) return;
      const prestige = isPrestige || looksPrestige(item, path);
      if(prestige) pushUnique(prestigeBox, item, true);
      else pushUnique(baseBox, item, false);
    });
  }
  function walkForPrestige(node, path, prestigeBox){
    if(!node || typeof node !== 'object') return;
    if(Array.isArray(node)){
      if(/\bprestige\b/i.test(path)) addItemsTo({ _seen:new Set(), items:[] }, prestigeBox, node, true, path);
      else node.forEach((item, index) => walkForPrestige(item, path + '[' + index + ']', prestigeBox));
      return;
    }
    Object.entries(node).forEach(([key, value]) => {
      const nextPath = path ? path + '.' + key : key;
      if(/\bprestige\b/i.test(nextPath)){
        if(Array.isArray(value) || (value && typeof value === 'object' && !looksClassLike(value))) addItemsTo({ _seen:new Set(), items:[] }, prestigeBox, value, true, nextPath);
        else if(looksClassLike(value)) pushUnique(prestigeBox, cloneObj(value, key), true);
      }
      if(value && typeof value === 'object') walkForPrestige(value, nextPath, prestigeBox);
    });
  }
  function normalizeLibrary(raw){
    const lib = raw && typeof raw === 'object' ? raw : {};
    const baseBox = { _seen:new Set(), items:[] };
    const prestigeBox = { _seen:new Set(), items:[] };

    ['baseCoreClasses','baseClasses','base_classes','coreClasses','core_classes','standardClasses','standard_classes'].forEach(key => addItemsTo(baseBox, prestigeBox, lib[key], false, key));
    ['classes','classList','class_list','jobs','jobClasses','job_classes'].forEach(key => addItemsTo(baseBox, prestigeBox, lib[key], false, key));
    ['prestigeClasses','prestige_classes','prestige','prestigeClass','prestige_class','prestige_classes_list'].forEach(key => addItemsTo(baseBox, prestigeBox, lib[key], true, key));
    walkForPrestige(lib, '', prestigeBox);

    const baseCoreClasses = uniqueSorted(baseBox.items.filter(item => !looksPrestige(item, 'baseCoreClasses')));
    const prestigeClasses = uniqueSorted(prestigeBox.items.map(item => Object.assign({}, item, { isPrestigeClass:true })));
    const classes = uniqueSorted(baseCoreClasses.concat(prestigeClasses));
    const races = uniqueSorted(valuesAsItems(lib.races || lib.raceList || lib.race_list || []));
    return Object.assign({}, lib, { baseCoreClasses, prestigeClasses, classes, races });
  }
  async function loadNormalizedLibrary(){
    if(cachedLib && cachedLib.classes && cachedLib.classes.length) return cachedLib;
    let raw = null;
    try {
      if(typeof window.maFfd20LoadLibrary === 'function') raw = await window.maFfd20LoadLibrary();
    } catch(e) { console.warn('[Mount Aetheria] module FFD20 load failed; trying JSON directly', e); }
    if(!raw || !normalizeLibrary(raw).classes.length){
      try {
        const response = await fetch(DATA_URL, { cache:'no-store' });
        if(response.ok) raw = await response.json();
      } catch(e) { console.warn('[Mount Aetheria] direct FFD20 JSON load failed', e); }
    }
    if(!raw && window.maFfd20Library) raw = window.maFfd20Library;
    cachedLib = normalizeLibrary(raw || {});
    try { window.maFfd20Library = cachedLib; } catch(e) {}
    return cachedLib;
  }
  function addOption(parent, value, text, disabled=false){
    const opt = document.createElement('option');
    opt.value = value || '';
    opt.textContent = text || value || '';
    if(disabled) opt.disabled = true;
    parent.appendChild(opt);
    return opt;
  }
  function currentValue(select, fallback=''){
    const raw = String(select?.value || fallback || '').trim();
    if(/^choose class$/i.test(raw) || /^loading classes/i.test(raw)) return '';
    return raw;
  }
  function fillClassSelect(select, lib, placeholder='Choose class', selectedValue=''){
    if(!select) return;
    const current = currentValue(select, selectedValue);
    const oldWidth = select.style.minWidth;
    select.innerHTML = '';
    addOption(select, '', placeholder || 'Choose class');
    const addGroup = (label, list) => {
      const group = document.createElement('optgroup');
      group.label = label;
      if(!Array.isArray(list) || !list.length){
        addOption(group, '', label === 'Prestige Classes' ? 'No prestige classes found' : 'No classes found', true);
      } else {
        list.forEach(item => {
          const n = nameOf(item);
          if(!n) return;
          const opt = addOption(group, n, n);
          if(item?.isPrestigeClass || label === 'Prestige Classes') opt.dataset.prestigeClass = 'true';
        });
      }
      select.appendChild(group);
    };
    addGroup('Base / Core Classes', lib.baseCoreClasses || []);
    addGroup('Prestige Classes', lib.prestigeClasses || []);
    if(current && !(lib.classes || []).some(item => norm(nameOf(item)) === norm(current))) addOption(select, current, current + ' (current)');
    select.value = current;
    if(!select.value && current){
      addOption(select, current, current + ' (current)');
      select.value = current;
    }
    select.dataset.maPrestigeFinalFilled = '1';
    if(oldWidth) select.style.minWidth = oldWidth;
  }
  function fillPrestigeOnlySelect(select, lib, placeholder='No prestige', selectedValue=''){
    if(!select) return;
    const current = currentValue(select, selectedValue);
    select.innerHTML = '';
    addOption(select, '', placeholder || 'No prestige');
    (lib.prestigeClasses || []).forEach(item => {
      const n = nameOf(item);
      if(n) addOption(select, n, n);
    });
    if(current && !(lib.prestigeClasses || []).some(item => norm(nameOf(item)) === norm(current))) addOption(select, current, current + ' (current)');
    select.value = current;
    select.dataset.maPrestigeFinalFilled = '1';
  }
  function isClassSelect(select){
    if(!select || select.tagName !== 'SELECT') return false;
    if(CLASS_SELECT_IDS.has(select.id)) return true;
    return /class/i.test(select.id || '') && !PRESTIGE_ONLY_SELECT_IDS.has(select.id) && !/archetype|subclass/i.test(select.id || '');
  }
  function fillAllClassSelects(lib){
    const data = (typeof window.maFfd20ActiveData === 'function' ? window.maFfd20ActiveData() : null) || {};
    document.querySelectorAll('select').forEach(select => {
      if(isClassSelect(select)) fillClassSelect(select, lib, 'Choose class', select.value || data.class || data.className || '');
      else if(PRESTIGE_ONLY_SELECT_IDS.has(select.id)) fillPrestigeOnlySelect(select, lib, 'No prestige', select.value || data.prestige_class || data.prestigeClass || '');
    });
  }
  function scheduleRefresh(delay=0){
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      try { fillAllClassSelects(await loadNormalizedLibrary()); }
      catch(e) { console.warn('[Mount Aetheria] final class dropdown refresh failed', e); }
    }, delay);
  }

  const oldLoadLibrary = window.maFfd20LoadLibrary;
  window.maFfd20LoadLibrary = async function(){
    let raw = null;
    try { if(typeof oldLoadLibrary === 'function') raw = await oldLoadLibrary.apply(this, arguments); } catch(e) { console.warn(e); }
    const fixed = normalizeLibrary(raw || window.maFfd20Library || {});
    if(fixed.classes.length) cachedLib = fixed;
    return fixed;
  };

  const oldFind = window.maFfd20Find;
  window.maFfd20Find = function(list, name){
    const target = norm(name);
    if(!target) return null;
    const candidates = [];
    if(Array.isArray(list)) candidates.push(...list);
    if(cachedLib) candidates.push(...(cachedLib.classes || []), ...(cachedLib.prestigeClasses || []), ...(cachedLib.baseCoreClasses || []));
    if(window.maFfd20Library){
      const lib = normalizeLibrary(window.maFfd20Library);
      candidates.push(...(lib.classes || []), ...(lib.prestigeClasses || []), ...(lib.baseCoreClasses || []));
    }
    const found = candidates.find(item => norm(nameOf(item)) === target);
    return found || (typeof oldFind === 'function' ? oldFind.apply(this, arguments) : null);
  };

  const oldFillSelect = window.maFfd20FillSelect;
  window.maFfd20FillSelect = function(select, list, placeholder, currentValue=''){
    if(select && isClassSelect(select)){
      const lib = cachedLib || normalizeLibrary(window.maFfd20Library || (Array.isArray(list) ? { classes:list } : {}));
      if(lib.classes.length) fillClassSelect(select, lib, placeholder || 'Choose class', currentValue || select.value);
      else scheduleRefresh(0);
      return;
    }
    if(select && PRESTIGE_ONLY_SELECT_IDS.has(select.id)){
      const lib = cachedLib || normalizeLibrary(window.maFfd20Library || (Array.isArray(list) ? { prestigeClasses:list } : {}));
      if(lib.prestigeClasses.length) fillPrestigeOnlySelect(select, lib, placeholder || 'No prestige', currentValue || select.value);
      else scheduleRefresh(0);
      return;
    }
    return typeof oldFillSelect === 'function' ? oldFillSelect.apply(this, arguments) : undefined;
  };

  const oldRefreshOptions = window.maFfd20RefreshOptions;
  window.maFfd20RefreshOptions = async function(){
    let oldResult = null;
    try { if(typeof oldRefreshOptions === 'function') oldResult = await oldRefreshOptions.apply(this, arguments); } catch(e) { console.warn(e); }
    const lib = normalizeLibrary(oldResult || cachedLib || window.maFfd20Library || {});
    if(lib.classes.length) cachedLib = lib;
    const finalLib = cachedLib && cachedLib.classes.length ? cachedLib : await loadNormalizedLibrary();
    fillAllClassSelects(finalLib);
    return finalLib;
  };

  const observer = new MutationObserver(() => scheduleRefresh(30));
  try { observer.observe(document.documentElement, { childList:true, subtree:true }); } catch(e) {}
  document.addEventListener('DOMContentLoaded', () => scheduleRefresh(0));
  window.addEventListener('load', () => scheduleRefresh(0));
  document.addEventListener('click', event => {
    if(event.target?.closest?.('#maClassBuildCard,#maAddMulticlassBtn,#maMulticlassList,.ffd20-modal,.ffd20-modal-actions')) scheduleRefresh(80);
  }, true);
  document.addEventListener('focusin', event => { if(isClassSelect(event.target) || PRESTIGE_ONLY_SELECT_IDS.has(event.target?.id)) scheduleRefresh(0); }, true);

  [0, 80, 250, 700, 1200, 1800, 3000].forEach(ms => setTimeout(() => scheduleRefresh(0), ms));
})();
