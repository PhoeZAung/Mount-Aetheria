
(function(){
  const drawerStorageKey = document.title && document.title.includes('Admin')
    ? 'mountAetheriaAbilityDrawerAdmin'
    : 'mountAetheriaAbilityDrawerPlayer';

  function saveAbilityDrawerState(drawer){
    try {
      const raw = localStorage.getItem(drawerStorageKey);
      let cur = {};
      if (raw) cur = JSON.parse(raw) || {};
      const rect = drawer.getBoundingClientRect();
      localStorage.setItem(drawerStorageKey, JSON.stringify({
        ...cur,
        open: drawer.classList.contains('open'),
        left: parseFloat(drawer.style.left) || rect.left || 16,
        top: parseFloat(drawer.style.top) || rect.top || 86
      }));
    } catch(_err) {}
  }

  function clampAbilityDrawer(drawer, left, top){
    const width = drawer.offsetWidth || 320;
    const height = drawer.offsetHeight || 320;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(58, window.innerHeight - height - 8);
    return {
      left: Math.min(Math.max(8, Number.isFinite(left) ? left : maxLeft), maxLeft),
      top: Math.min(Math.max(58, Number.isFinite(top) ? top : 86), maxTop)
    };
  }

  function enableMouseTouchDrag(){
    const drawer = document.getElementById('abilityDrawer');
    const handle = document.getElementById('abilityDrawerHandle');
    if(!drawer || !handle || handle.dataset.dragPatchReady === '1') return;
    handle.dataset.dragPatchReady = '1';
    handle.style.touchAction = 'none';
    let dragging = false;
    let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;

    const start = (clientX, clientY) => {
      if(!drawer.classList.contains('open')) return;
      dragging = true;
      const rect = drawer.getBoundingClientRect();
      startX = clientX; startY = clientY;
      baseLeft = parseFloat(drawer.style.left) || rect.left;
      baseTop = parseFloat(drawer.style.top) || rect.top;
    };
    const move = (clientX, clientY) => {
      if(!dragging) return;
      const pos = clampAbilityDrawer(drawer, baseLeft + (clientX - startX), baseTop + (clientY - startY));
      drawer.style.left = pos.left + 'px';
      drawer.style.top = pos.top + 'px';
      drawer.style.right = 'auto';
      drawer.style.bottom = 'auto';
    };
    const end = () => {
      if(!dragging) return;
      dragging = false;
      saveAbilityDrawerState(drawer);
    };

    handle.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      if(e.target.closest('button,a,input,select,textarea')) return;
      start(e.clientX, e.clientY);
      if(dragging) e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), { passive: true });
    window.addEventListener('mouseup', end, { passive: true });

    handle.addEventListener('touchstart', (e) => {
      if(e.target.closest('button,a,input,select,textarea')) return;
      const t = e.touches && e.touches[0];
      if(!t) return;
      start(t.clientX, t.clientY);
      if(dragging) e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      const t = e.touches && e.touches[0];
      if(!t) return;
      move(t.clientX, t.clientY);
      if(dragging) e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });

    window.addEventListener('resize', () => {
      if(!drawer.classList.contains('open')) return;
      const pos = clampAbilityDrawer(drawer, parseFloat(drawer.style.left), parseFloat(drawer.style.top));
      drawer.style.left = pos.left + 'px';
      drawer.style.top = pos.top + 'px';
      saveAbilityDrawerState(drawer);
    }, { passive: true });
  }

  function removeInlineAbilityToggle(){
    const btn = document.getElementById('abilityDrawerToggle');
    if(btn) btn.remove();
  }

  function initAbilityDrawerPatch(){
    removeInlineAbilityToggle();
    enableMouseTouchDrag();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAbilityDrawerPatch, { once:true });
  } else {
    initAbilityDrawerPatch();
  }
})();


/* --- Spell tab visibility toggle --- */
const SPELL_TAB_VISIBILITY_KEY = 'mountAetheriaSpellsTabHidden';
function spellsTabIsHidden() {
  try { return localStorage.getItem(SPELL_TAB_VISIBILITY_KEY) === '1'; } catch (_err) { return false; }
}
function applySpellTabVisibility() {
  const wrapper = document.getElementById('spellsNavControl');
  const toggle = document.getElementById('spellsVisibilityToggle');
  const tab = document.getElementById('spellsSubBtn');
  const group = document.getElementById('c-spells');
  if (!wrapper || !toggle || !tab) return;
  const hidden = spellsTabIsHidden();
  wrapper.classList.toggle('spells-collapsed', hidden);
  toggle.textContent = hidden ? '›' : '‹';
  toggle.title = hidden ? 'Show Spells tab' : 'Hide Spells tab';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  if (hidden && group && (group.style.display === 'block' || group.classList.contains('active'))) {
    if (typeof switchSub === 'function') switchSub('c-general');
  }
}
window.toggleSpellTabVisibility = (event) => {
  event?.stopPropagation?.();
  const hidden = !spellsTabIsHidden();
  try { localStorage.setItem(SPELL_TAB_VISIBILITY_KEY, hidden ? '1' : '0'); } catch (_err) {}
  applySpellTabVisibility();
};
window.addEventListener('DOMContentLoaded', () => setTimeout(applySpellTabVisibility, 0));



/* --- FFD20 JSON importer / DnD-Beyond-style auto population patch --- */
const FFD20_DATA_URL = './data/ffd20_data.json';
let ffd20LibraryCache = null;

function ffd20Escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function ffd20NormalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function ffd20LevelNumber(value) {
    const n = Number(String(value || '').match(/\d+/)?.[0] || value || 0);
    return Number.isFinite(n) ? n : 0;
}
function ffd20AbilityBucket(entry) {
    const explicit = String(entry?.bucket || entry?.sheetBucket || '').toLowerCase();
    if(['active','passive','racial','feat','spell'].includes(explicit)) return explicit;
    const action = String(entry?.action || entry?.type || '').toLowerCase();
    if(/\b(standard|move|swift|immediate|free|full|full-round|round|reaction)\b/.test(action)) return 'active';
    const text = String(entry?.desc || entry?.description || '').toLowerCase();
    if(/\b(as an?|spend|use).{0,30}\b(standard|move|swift|immediate|free|full-round|full round|round|reaction)\s+action\b/.test(text)) return 'active';
    return entry?.originType === 'race' ? 'racial' : 'passive';
}
function ffd20EntryAutoKey(entry, sourcePrefix = '') {
    return [
        'ffd20',
        sourcePrefix || entry?.originType || 'source',
        entry?.originName || entry?.sourceName || '',
        entry?.level || 0,
        entry?.name || ''
    ].map(ffd20NormalizeName).filter(Boolean).join(':');
}
function ffd20ToSheetAbility(entry, sourcePrefix = '') {
    const bucket = ffd20AbilityBucket(entry);
    const ability = {
        name: entry.name || '',
        type: entry.type || entry.action || (bucket === 'active' ? 'Standard' : entry.originType === 'race' ? 'Racial' : ''),
        desc: entry.desc || entry.description || '',
        at_higher_lvls: entry.at_higher_lvls || '',
        link: entry.url || entry.sourceUrl || '',
        sourceUrl: entry.url || entry.sourceUrl || '',
        sourceKind: entry.originType || sourcePrefix || '',
        sourceName: entry.originName || entry.sourceName || '',
        sourceLevel: entry.level || 0,
        autoGenerated: true,
        autoKey: ffd20EntryAutoKey(entry, sourcePrefix),
        replaces: Array.isArray(entry.replaces) ? entry.replaces : []
    };
    if(bucket === 'active') {
        ability.u_curr = Number(entry.u_curr ?? 0);
        ability.u_max = Number(entry.u_max ?? 0);
        ability.attack_type = entry.attack_type || 'None';
        ability.damage = entry.damage || '';
        ability.restoreOnLongRest = !!entry.restoreOnLongRest;
    }
    return { bucket, ability };
}
async function ffd20LoadLibrary() {
    if(ffd20LibraryCache) return ffd20LibraryCache;
    const response = await fetch(FFD20_DATA_URL, { cache: 'no-store' });
    if(!response.ok) throw new Error(`Could not load ${FFD20_DATA_URL}`);
    ffd20LibraryCache = await response.json();
    return ffd20LibraryCache;
}
function ffd20GetCurrentLevel() {
    return ffd20LevelNumber(document.getElementById('character_level')?.value || 1);
}
function ffd20RemoveOldAutoForSources(data, sources) {
    const sourceSet = new Set(sources.map(s => String(s || '').toLowerCase()));
    ['activeAbilities','passiveAbilities','racialAbilities','feats','spells'].forEach(key => {
        if(!Array.isArray(data[key])) data[key] = [];
        data[key] = data[key].filter(item => {
            if(!item?.autoGenerated) return true;
            const source = String(item.sourceKind || item.originType || '').toLowerCase();
            return !sourceSet.has(source);
        });
    });
}
function ffd20ApplyReplacements(data, importedAbilities) {
    const replaceNames = importedAbilities.flatMap(x => Array.isArray(x.ability?.replaces) ? x.ability.replaces : [])
        .map(ffd20NormalizeName)
        .filter(Boolean);
    if(!replaceNames.length) return;
    ['activeAbilities','passiveAbilities','racialAbilities'].forEach(key => {
        if(!Array.isArray(data[key])) return;
        data[key] = data[key].filter(item => !replaceNames.includes(ffd20NormalizeName(item.name)));
    });
}
function ffd20CollectFeaturesByLevel(source, level, originType, originName) {
    const list = Array.isArray(source?.features) ? source.features : Array.isArray(source?.traits) ? source.traits : [];
    return list
      .filter(entry => ffd20LevelNumber(entry.level || 1) <= level)
      .map(entry => ({ ...entry, originType, originName, sourceUrl: entry.url || entry.sourceUrl || source.url }));
}
function ffd20FindByName(list, name) {
    const target = ffd20NormalizeName(name);
    return (list || []).find(item => ffd20NormalizeName(item.name) === target);
}
function ffd20BuildImportedAbilities(library, selection) {
    const imported = [];
    const level = ffd20LevelNumber(selection.level || ffd20GetCurrentLevel() || 1);
    const race = ffd20FindByName(library.races, selection.race);
    if(race) {
        ffd20CollectFeaturesByLevel(race, 1, 'race', race.name).forEach(entry => imported.push(ffd20ToSheetAbility(entry, 'race')));
    }
    const cls = ffd20FindByName(library.classes, selection.className);
    if(cls) {
        ffd20CollectFeaturesByLevel(cls, level, 'class', cls.name).forEach(entry => imported.push(ffd20ToSheetAbility(entry, 'class')));
        const arch = ffd20FindByName(cls.archetypes, selection.archetype);
        if(arch) {
            ffd20CollectFeaturesByLevel(arch, level, 'archetype', arch.name).forEach(entry => imported.push(ffd20ToSheetAbility(entry, 'archetype')));
        }
    }
    const prestige = ffd20FindByName(library.prestigeClasses, selection.prestigeClass);
    if(prestige) {
        const pLevel = ffd20LevelNumber(selection.prestigeLevel || 1);
        ffd20CollectFeaturesByLevel(prestige, pLevel, 'prestige', prestige.name).forEach(entry => imported.push(ffd20ToSheetAbility(entry, 'prestige')));
    }
    return imported;
}
function ffd20PushImportedAbilities(data, imported) {
    ffd20ApplyReplacements(data, imported);
    imported.forEach(({ bucket, ability }) => {
        const key = bucket === 'active' ? 'activeAbilities'
            : bucket === 'racial' ? 'racialAbilities'
            : bucket === 'feat' ? 'feats'
            : bucket === 'spell' ? 'spells'
            : 'passiveAbilities';
        if(!Array.isArray(data[key])) data[key] = [];
        if(!data[key].some(existing => existing.autoKey && existing.autoKey === ability.autoKey)) data[key].push(ability);
    });
}
async function ffd20ApplyBuilderSelection() {
    const race = document.getElementById('ffd20RaceSelect')?.value || '';
    const className = document.getElementById('ffd20ClassSelect')?.value || '';
    const archetype = document.getElementById('ffd20ArchetypeSelect')?.value || '';
    const prestigeClass = document.getElementById('ffd20PrestigeSelect')?.value || '';
    const prestigeLevel = document.getElementById('ffd20PrestigeLevel')?.value || '1';
    const level = document.getElementById('character_level')?.value || '1';
    const library = await ffd20LoadLibrary();
    const data = getActiveData();
    ffd20RemoveOldAutoForSources(data, ['race','class','archetype','prestige']);
    const imported = ffd20BuildImportedAbilities(library, { race, className, archetype, prestigeClass, prestigeLevel, level });
    ffd20PushImportedAbilities(data, imported);
    if(race) {
        const raceInput = document.getElementById('race');
        if(raceInput) raceInput.value = race;
    }
    if(className) {
        const classInput = document.getElementById('class');
        if(classInput) classInput.value = prestigeClass ? `${className} / ${prestigeClass}` : className;
    }
    if(typeof renderAbilities === 'function') {
        renderAbilities('active'); renderAbilities('passive'); renderAbilities('racial'); renderAbilities('feat');
    }
    if(typeof renderSpells === 'function') renderSpells();
    if(typeof triggerSave === 'function') triggerSave();
    else if(typeof saveDataOnly === 'function') saveDataOnly();
    alert(`Imported ${imported.length} FFD20 entries. Manual abilities were kept.`);
}
function ffd20FillSelect(select, list, placeholder) {
    if(!select) return;
    select.innerHTML = `<option value="">${ffd20Escape(placeholder)}</option>`;
    (list || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.name || '';
        opt.textContent = item.name || '';
        select.appendChild(opt);
    });
}
async function ffd20RefreshArchetypeSelect() {
    try {
        const library = await ffd20LoadLibrary();
        const cls = ffd20FindByName(library.classes, document.getElementById('ffd20ClassSelect')?.value);
        ffd20FillSelect(document.getElementById('ffd20ArchetypeSelect'), cls?.archetypes || [], 'No archetype');
    } catch(e) {
        console.warn(e);
    }
}
async function initFfd20BuilderPanel() {
    if(document.getElementById('ffd20BuilderPanel')) return;
    const levelRow = document.querySelector('.character-level-row');
    if(!levelRow) return;
    const panel = document.createElement('section');
    panel.id = 'ffd20BuilderPanel';
    panel.className = 'ffd20-builder-panel';
    panel.innerHTML = `
      <h3>FFD20 Auto Builder</h3>
      <div class="ffd20-builder-grid">
        <label>Race<select id="ffd20RaceSelect"><option value="">Load data first</option></select></label>
        <label>Class<select id="ffd20ClassSelect"><option value="">Load data first</option></select></label>
        <label>Archetype<select id="ffd20ArchetypeSelect"><option value="">No archetype</option></select></label>
        <label>Prestige Class<select id="ffd20PrestigeSelect"><option value="">No prestige</option></select></label>
        <label>Prestige Level<input id="ffd20PrestigeLevel" type="number" min="1" max="10" value="1"></label>
      </div>
      <div class="ffd20-builder-actions">
        <button class="btn-edit" type="button" id="ffd20LoadDataBtn">Load FFD20 Data</button>
        <button class="btn-save" type="button" id="ffd20ApplyBtn">Apply Auto Abilities</button>
      </div>
      <div class="ffd20-builder-note">Uses <code>data/ffd20_data.json</code>. Re-running replaces only auto-generated FFD20 entries and keeps anything you manually added.</div>
    `;
    levelRow.insertAdjacentElement('afterend', panel);
    document.getElementById('ffd20LoadDataBtn')?.addEventListener('click', async () => {
        try {
            const library = await ffd20LoadLibrary();
            ffd20FillSelect(document.getElementById('ffd20RaceSelect'), library.races || [], 'Choose race');
            ffd20FillSelect(document.getElementById('ffd20ClassSelect'), library.classes || [], 'Choose class');
            ffd20FillSelect(document.getElementById('ffd20PrestigeSelect'), library.prestigeClasses || [], 'No prestige');
            await ffd20RefreshArchetypeSelect();
            alert('FFD20 data loaded.');
        } catch(e) {
            alert(`Could not load data/ffd20_data.json. Run the scraper first and upload the JSON. ${e.message}`);
        }
    });
    document.getElementById('ffd20ClassSelect')?.addEventListener('change', ffd20RefreshArchetypeSelect);
    document.getElementById('ffd20ApplyBtn')?.addEventListener('click', () => ffd20ApplyBuilderSelection().catch(e => alert(e.message)));
}
// initFfd20BuilderPanel disabled: v2 uses normal character choices and creation/level-up flow.
window.ffd20ApplyBuilderSelection = ffd20ApplyBuilderSelection;

