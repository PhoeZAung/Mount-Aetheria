
/* --- v28 character circle toggle: no dependency on module-scoped characterSheets --- */
(function(){
  const STORAGE_KEY = 'mountAetheriaSummonFabVisibleV27';
  function readPref(){
    try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch(e) { return true; }
  }
  function writePref(value){
    try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch(e) {}
  }
  function updateButtonAndCircle(){
    const visible = readPref();
    const btn = document.getElementById('panelCharacterToggleBtn');
    const fab = document.getElementById('summonFab');
    if(btn){
      btn.textContent = visible ? '👥 Character Circle: On' : '👥 Character Circle: Off';
      btn.classList.toggle('is-on', visible);
      btn.classList.toggle('is-off', !visible);
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }
    if(fab){
      fab.classList.toggle('ma-fab-hidden-by-player', !visible);
      fab.classList.toggle('ma-fab-visible-by-player', visible);
      // Show/hide the round character switcher directly. Do not depend on module-scoped variables here.
      fab.style.display = visible ? 'flex' : 'none';
    }
  }
  window.getSummonFabVisibilityPreference = readPref;
  window.updateSummonFabToggleButton = updateButtonAndCircle;
  window.toggleSummonFabVisibility = function(){
    const next = !readPref();
    writePref(next);
    updateButtonAndCircle();
  };
  document.addEventListener('DOMContentLoaded', updateButtonAndCircle);
  window.addEventListener('load', updateButtonAndCircle);
  setTimeout(updateButtonAndCircle, 0);
  setTimeout(updateButtonAndCircle, 250);
})();


/* --- v32 seamless race/class lists + prestige class group --- */
const MA_V32_CLASS_RACE_PATCH = true;

function maV32Name(item){
  if(typeof item === 'string') return item.trim();
  return String(item?.name || item?.title || item?.className || item?.class || '').trim();
}

function maV32Norm(value){
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function maV32ToObject(item){
  if(typeof item === 'string') return { name:item };
  return item && typeof item === 'object' ? item : { name:String(item || '') };
}

function maV32IsPrestigeClass(item){
  const text = [
    item?.type,
    item?.category,
    item?.group,
    item?.classType,
    item?.sourceType,
    item?.tags,
    item?.name
  ].map(v => String(v || '').toLowerCase()).join(' ');
  return /\bprestige\b/.test(text);
}

function maV32UniqueSorted(list){
  const seen = new Set();
  return (list || [])
    .map(maV32ToObject)
    .filter(item => maV32Name(item))
    .filter(item => {
      const key = maV32Norm(maV32Name(item));
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b) => maV32Name(a).localeCompare(maV32Name(b), undefined, { sensitivity:'base' }));
}

function maV32Array(lib, keys){
  const out = [];
  keys.forEach(key => {
    if(Array.isArray(lib?.[key])) out.push(...lib[key]);
  });
  return out;
}

function maV32NormalizeLibrary(lib){
  if(!lib || typeof lib !== 'object') lib = {};

  const allClassSources = maV32Array(lib, [
    'classes',
    'baseClasses',
    'base_classes',
    'coreClasses',
    'core_classes'
  ]);

  const prestigeSources = maV32Array(lib, [
    'prestigeClasses',
    'prestige_classes',
    'prestige',
    'prestigeClass'
  ]);

  const baseCore = [];
  const prestige = [];

  allClassSources.forEach(item => {
    if(maV32IsPrestigeClass(item)) prestige.push(item);
    else baseCore.push(item);
  });

  prestige.push(...prestigeSources);

  lib.baseCoreClasses = maV32UniqueSorted(baseCore);
  lib.prestigeClasses = maV32UniqueSorted(prestige);

  // Important: calculations and ability imports use lib.classes,
  // so include prestige classes here too.
  lib.classes = maV32UniqueSorted([
    ...lib.baseCoreClasses,
    ...lib.prestigeClasses
  ]);

  lib.races = maV32UniqueSorted(lib.races || []);

  return lib;
}

const maV32OldLoadLibrary = maFfd20LoadLibrary;
maFfd20LoadLibrary = async function(){
  const lib = await maV32OldLoadLibrary();
  return maV32NormalizeLibrary(lib);
};

function maV32AddOption(select, value, text){
  const opt = document.createElement('option');
  opt.value = value || '';
  opt.textContent = text || value || '';
  select.appendChild(opt);
  return opt;
}

function maV32FillClassSelect(select, lib, placeholder='Choose class', currentValue=''){
  if(!select) return;

  const current = currentValue || select.value || '';
  select.innerHTML = '';
  maV32AddOption(select, '', placeholder);

  const addGroup = (label, list) => {
    if(!list || !list.length) return;
    const group = document.createElement('optgroup');
    group.label = label;
    list.forEach(item => {
      const name = maV32Name(item);
      if(!name) return;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      group.appendChild(opt);
    });
    select.appendChild(group);
  };

  addGroup('Base / Core Classes', lib.baseCoreClasses || []);
  addGroup('Prestige Classes', lib.prestigeClasses || []);

  const all = [...(lib.baseCoreClasses || []), ...(lib.prestigeClasses || [])];
  if(current && !all.some(item => maV32Name(item) === current)){
    maV32AddOption(select, current, `${current} (current)`);
  }

  select.value = current;
}

function maV32FillNameSelect(select, list, placeholder, currentValue=''){
  if(!select) return;
  const current = currentValue || select.value || '';
  select.innerHTML = '';
  maV32AddOption(select, '', placeholder);
  maV32UniqueSorted(list || []).forEach(item => {
    const name = maV32Name(item);
    if(name) maV32AddOption(select, name, name);
  });
  if(current && !Array.from(select.options).some(opt => opt.value === current)){
    maV32AddOption(select, current, `${current} (current)`);
  }
  select.value = current;
}

const maV32OldFillSelect = maFfd20FillSelect;
maFfd20FillSelect = function(select, list, placeholder, currentValue=''){
  if(select && (select.id === 'class' || select.id === 'maEditClass')){
    const lib = maV32NormalizeLibrary(maFfd20Library || { classes:list || [] });
    return maV32FillClassSelect(select, lib, placeholder || 'Choose class', currentValue);
  }
  if(select && select.id === 'race'){
    return maV32FillNameSelect(select, list, placeholder || 'Choose race', currentValue);
  }
  return maV32OldFillSelect.apply(this, arguments);
};

maFfd20RefreshOptions = async function(){
  maFfd20BuildChoiceGrid();

  let lib;
  try {
    lib = maV32NormalizeLibrary(await maFfd20LoadLibrary());
  } catch(e) {
    ['race','class','archetype','prestige_class'].forEach(id => {
      const el = document.getElementById(id);
      if(el && !el.options.length) maFfd20AddOption(el, '', e.message);
    });
    console.warn(e);
    return null;
  }

  maV32FillNameSelect(
    document.getElementById('race'),
    lib.races,
    'Choose race',
    document.getElementById('race')?.value || maFfd20ActiveData()?.race || ''
  );

  maV32FillClassSelect(
    document.getElementById('class'),
    lib,
    'Choose class',
    document.getElementById('class')?.value || maFfd20ActiveData()?.class || ''
  );

  await maFfd20RefreshArchetypes();

  try { maFfd20RenderMulticlasses(); } catch(e) {}

  setTimeout(() => {
    try { window.maRefreshRaceCardV31?.(); } catch(e) {}
    try { window.maRefreshRaceCardV29?.(); } catch(e) {}
  }, 80);

  return lib;
};

maFfd20RefreshArchetypes = async function(){
  let lib;
  try { lib = maV32NormalizeLibrary(await maFfd20LoadLibrary()); }
  catch(e) { return; }

  const className = document.getElementById('class')?.value || '';
  const cls = maFfd20Find(lib.classes, className);

  maFfd20FillSelect(
    document.getElementById('archetype'),
    cls?.archetypes || [],
    'No archetype',
    document.getElementById('archetype')?.value || maFfd20ActiveData()?.archetype || ''
  );
};

setTimeout(() => maFfd20RefreshOptions(), 0);
setTimeout(() => maFfd20RefreshOptions(), 250);
setTimeout(() => maFfd20RefreshOptions(), 1000);



/* --- v33 stronger prestige class discovery --- */
const MA_V33_PRESTIGE_DISCOVERY_PATCH = true;

function maV33Name(item){
  if(typeof item === 'string') return item.trim();
  return String(item?.name || item?.title || item?.className || item?.class || item?.label || '').trim();
}

function maV33Norm(value){
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function maV33Object(item){
  if(typeof item === 'string') return { name:item };
  return item && typeof item === 'object' ? item : { name:String(item || '') };
}

function maV33UniqueSorted(list){
  const seen = new Set();
  return (list || [])
    .map(maV33Object)
    .filter(item => maV33Name(item))
    .filter(item => {
      const key = maV33Norm(maV33Name(item));
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b) => maV33Name(a).localeCompare(maV33Name(b), undefined, { sensitivity:'base' }));
}

function maV33LooksPrestige(item, path=''){
  const text = [
    path,
    item?.type,
    item?.category,
    item?.group,
    item?.classType,
    item?.sourceType,
    item?.tags,
    item?.section,
    item?.kind
  ].map(v => String(v || '').toLowerCase()).join(' ');
  return /\bprestige\b/.test(text);
}

function maV33LooksClass(item){
  if(!item || typeof item !== 'object') return false;
  if(maV33Name(item) && (
    Array.isArray(item.features) ||
    Array.isArray(item.traits) ||
    Array.isArray(item.progression) ||
    Array.isArray(item.archetypes) ||
    item.hitDie || item.hit_die || item.skillRanks || item.skill_ranks || item.bab
  )) return true;
  return false;
}

function maV33WalkForPrestige(node, path='', out=[]){
  if(!node || typeof node !== 'object') return out;

  if(Array.isArray(node)){
    if(/\bprestige\b/i.test(path)){
      node.forEach(item => {
        if(maV33Name(item)) out.push(item);
      });
    } else {
      node.forEach((item, index) => maV33WalkForPrestige(item, `${path}[${index}]`, out));
    }
    return out;
  }

  Object.entries(node).forEach(([key, value]) => {
    const nextPath = path ? `${path}.${key}` : key;

    if(Array.isArray(value) && /\bprestige\b/i.test(nextPath)){
      value.forEach(item => {
        if(maV33Name(item)) out.push(item);
      });
      return;
    }

    if(maV33LooksPrestige(value, nextPath) && maV33LooksClass(value)){
      out.push(value);
      return;
    }

    if(value && typeof value === 'object') maV33WalkForPrestige(value, nextPath, out);
  });

  return out;
}

function maV33NormalizeLibrary(lib){
  if(!lib || typeof lib !== 'object') lib = {};

  const classSource = [];
  [
    'classes',
    'baseClasses',
    'base_classes',
    'coreClasses',
    'core_classes'
  ].forEach(key => {
    if(Array.isArray(lib[key])) classSource.push(...lib[key]);
  });

  const prestigeFound = maV33WalkForPrestige(lib);
  const baseCore = [];
  const prestige = [];

  classSource.forEach(item => {
    if(maV33LooksPrestige(item, 'classes')) prestige.push(item);
    else baseCore.push(item);
  });

  prestige.push(...prestigeFound);

  lib.baseCoreClasses = maV33UniqueSorted(baseCore);
  lib.prestigeClasses = maV33UniqueSorted(prestige);
  lib.classes = maV33UniqueSorted([...lib.baseCoreClasses, ...lib.prestigeClasses]);

  if(Array.isArray(lib.races)) lib.races = maV33UniqueSorted(lib.races);

  console.log('[Mount Aetheria] base/core classes:', lib.baseCoreClasses.length, 'prestige classes:', lib.prestigeClasses.length, lib.prestigeClasses.map(maV33Name));

  return lib;
}

function maV33FillClassSelect(select, lib, placeholder='Choose class', currentValue=''){
  if(!select) return;

  lib = maV33NormalizeLibrary(lib || maFfd20Library || {});
  const current = currentValue || select.value || '';

  select.innerHTML = '';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = placeholder;
  select.appendChild(empty);

  const addGroup = (label, list) => {
    const group = document.createElement('optgroup');
    group.label = label;

    if(!list || !list.length){
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = label === 'Prestige Classes'
        ? 'No prestige classes found in JSON'
        : 'No classes found';
      group.appendChild(opt);
    } else {
      list.forEach(item => {
        const name = maV33Name(item);
        if(!name) return;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        group.appendChild(opt);
      });
    }

    select.appendChild(group);
  };

  addGroup('Base / Core Classes', lib.baseCoreClasses || []);
  addGroup('Prestige Classes', lib.prestigeClasses || []);

  const all = [...(lib.baseCoreClasses || []), ...(lib.prestigeClasses || [])];
  if(current && !all.some(item => maV33Name(item) === current)){
    const opt = document.createElement('option');
    opt.value = current;
    opt.textContent = `${current} (current)`;
    select.appendChild(opt);
  }

  select.value = current;
}

const maV33OldLoadLibrary = maFfd20LoadLibrary;
maFfd20LoadLibrary = async function(){
  const lib = await maV33OldLoadLibrary();
  return maV33NormalizeLibrary(lib);
};

const maV33OldFillSelect = maFfd20FillSelect;
maFfd20FillSelect = function(select, list, placeholder, currentValue=''){
  if(select && (select.id === 'class' || select.id === 'maEditClass')){
    const lib = maV33NormalizeLibrary(maFfd20Library || { classes:list || [] });
    return maV33FillClassSelect(select, lib, placeholder || 'Choose class', currentValue);
  }
  return maV33OldFillSelect.apply(this, arguments);
};

const maV33OldRefreshOptions = maFfd20RefreshOptions;
maFfd20RefreshOptions = async function(){
  const lib = await maV33OldRefreshOptions();
  const fixedLib = maV33NormalizeLibrary(lib || maFfd20Library || {});
  maV33FillClassSelect(
    document.getElementById('class'),
    fixedLib,
    'Choose class',
    document.getElementById('class')?.value || maFfd20ActiveData()?.class || ''
  );
  await maFfd20RefreshArchetypes();
  return fixedLib;
};

setTimeout(() => maFfd20RefreshOptions(), 100);
setTimeout(() => maFfd20RefreshOptions(), 600);
setTimeout(() => maFfd20RefreshOptions(), 1500);

