

/* --- Stock Spell Picker: generated from stock_spells.json, theme-aware --- */
const MA_STOCK_SPELL_JSON = 'data/stock_spell.json';
const MA_STOCK_SPELL_JSON_FALLBACKS = [
  'data/stock_spell.json',
  'data/stock_spells.json',
  './data/stock_spell.json',
  './data/stock_spells.json',
  'stock_spell.json',
  'stock_spells.json'
];
let maStockSpellData = null;
let maStockSpellLoadPromise = null;
let maStockState = { classKey: '', level: 'all', query: '' };
let maStockAddSpellBypass = false;
let maStockOriginalAddNewItem = null;

function maStockGetActiveDataSafe() {
  try {
    if (typeof window.getActiveData === 'function') return window.getActiveData() || {};
    if (typeof window.maFfd20ActiveData === 'function') return window.maFfd20ActiveData() || {};
    if (typeof getActiveData === 'function') return getActiveData() || {};
  } catch (error) {
    console.warn('Stock spell active data lookup failed', error);
  }
  return {};
}
function maStockSaveDataOnlySafe() {
  try {
    if (typeof window.saveDataOnly === 'function') return window.saveDataOnly();
    if (typeof saveDataOnly === 'function') return saveDataOnly();
  } catch (error) {
    console.warn('Stock spell save failed', error);
  }
}
function maStockRenderSpellsSafe() {
  try {
    if (typeof window.renderSpells === 'function') return window.renderSpells();
    if (typeof renderSpells === 'function') return renderSpells();
  } catch (error) {
    console.warn('Stock spell render failed', error);
  }
}
function maStockSpellLevelLabelSafe(levelNum) {
  try {
    if (typeof window.spellLevelLabel === 'function') return window.spellLevelLabel(levelNum);
    if (typeof spellLevelLabel === 'function') return spellLevelLabel(levelNum);
  } catch (error) {}
  const n = Math.max(0, Math.min(9, Math.trunc(Number(levelNum) || 0)));
  if (n <= 0) return 'Cantrip';
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
function maStockInstallAddSpellHook() {
  const current = window.addNewItem;
  if (current && current.__maStockSpellHook) return true;
  if (typeof current !== 'function') return false;
  maStockOriginalAddNewItem = current;
  function maStockHookedAddNewItem(type) {
    if (type === 'spell' && !maStockAddSpellBypass && typeof openSpellAddChoice === 'function') {
      openSpellAddChoice();
      return;
    }
    return maStockOriginalAddNewItem.apply(this, arguments);
  }
  maStockHookedAddNewItem.__maStockSpellHook = true;
  maStockHookedAddNewItem.__maStockOriginal = maStockOriginalAddNewItem;
  window.addNewItem = maStockHookedAddNewItem;
  return true;
}
function maStockQueueAddSpellHookInstall() {
  if (maStockInstallAddSpellHook()) return;
  setTimeout(maStockQueueAddSpellHookInstall, 100);
}
maStockQueueAddSpellHookInstall();
document.addEventListener('DOMContentLoaded', maStockQueueAddSpellHookInstall);
window.addEventListener('load', maStockQueueAddSpellHookInstall);
setTimeout(maStockQueueAddSpellHookInstall, 500);
setTimeout(maStockQueueAddSpellHookInstall, 1500);

function maStockEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function maStockNorm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(spells?|songs?|ninjutsus?)\b/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function maStockSlug(value) {
  return maStockNorm(value).replace(/\s+/g, '-');
}
function maStockLevelText(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n <= 0) return 'Cantrip';
  return maStockSpellLevelLabelSafe(Math.max(0, Math.min(9, Math.trunc(n))));
}
function maStockClassList(data = maStockSpellData) {
  const classes = data?.classes || {};
  return Object.entries(classes).map(([key, value]) => ({ key, ...(value || {}) }))
    .sort((a,b) => String(a.displayName || a.name || a.key).localeCompare(String(b.displayName || b.name || b.key)));
}
function maStockFindClassKey(name, data = maStockSpellData) {
  const wanted = maStockNorm(name);
  if (!wanted || !data?.classes) return '';
  const entries = maStockClassList(data);
  const direct = entries.find(c => maStockNorm(c.key) === wanted || maStockNorm(c.displayName || c.name) === wanted || maStockNorm(c.slug) === wanted);
  if (direct) return direct.key;
  const loose = entries.find(c => maStockNorm(c.displayName || c.name || c.key).includes(wanted) || wanted.includes(maStockNorm(c.displayName || c.name || c.key)));
  return loose?.key || '';
}
function maStockCurrentClassNames() {
  const data = maStockGetActiveDataSafe();
  const names = [];
  const push = value => {
    const text = String(value || '').trim();
    if (text && !names.some(n => maStockNorm(n) === maStockNorm(text))) names.push(text);
  };
  push(document.getElementById('class')?.value || data.class || data.className);
  (Array.isArray(data.multiclasses) ? data.multiclasses : []).forEach(mc => push(mc.className || mc.class || mc.name));
  return names;
}
function maStockCharacterClassKeys(data = maStockSpellData) {
  const keys = maStockCurrentClassNames().map(name => maStockFindClassKey(name, data)).filter(Boolean);
  return [...new Set(keys)];
}
function maStockEnsureModal() {
  let modal = document.getElementById('stockSpellModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'stockSpellModal';
  modal.className = 'ma-stock-spell-overlay';
  modal.innerHTML = `
    <div class="ma-stock-spell-shell" role="dialog" aria-modal="true" aria-labelledby="stockSpellTitle">
      <div class="ma-stock-spell-head">
        <div>
          <h3 id="stockSpellTitle">Add Spell</h3>
          <p id="stockSpellSubtitle">Choose a custom spell or add one from your class stock list.</p>
        </div>
        <button class="ma-stock-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div id="stockSpellBody" class="ma-stock-spell-body"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.ma-stock-close')?.addEventListener('click', closeSpellAddChoice);
  modal.addEventListener('click', event => { if (event.target === modal) closeSpellAddChoice(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('show')) closeSpellAddChoice(); });
  return modal;
}
function openSpellAddChoice() {
  const modal = maStockEnsureModal();
  const subtitle = modal.querySelector('#stockSpellSubtitle');
  if (subtitle) subtitle.textContent = 'Choose a custom spell or add one from your class stock list.';
  const body = modal.querySelector('#stockSpellBody');
  body.innerHTML = `
    <div class="ma-stock-choice-grid">
      <button class="ma-stock-choice-card" type="button" id="maStockAddSpellBtn">
        <span class="ma-stock-choice-icon">✧</span>
        <strong>Add Stock Spell</strong>
        <small>Pick from FFD20 stock spells filtered by your character class and spell level.</small>
      </button>
      <button class="ma-stock-choice-card" type="button" id="maCustomAddSpellBtn">
        <span class="ma-stock-choice-icon">✎</span>
        <strong>Add Custom Spell</strong>
        <small>Use the regular spell editor you already had.</small>
      </button>
    </div>`;
  body.querySelector('#maCustomAddSpellBtn')?.addEventListener('click', () => {
    closeSpellAddChoice();
    maStockAddSpellBypass = true;
    try { maStockOriginalAddNewItem('spell'); }
    finally { maStockAddSpellBypass = false; }
  });
  body.querySelector('#maStockAddSpellBtn')?.addEventListener('click', openStockSpellBrowser);
  modal.classList.add('show');
}
function closeSpellAddChoice() {
  document.getElementById('stockSpellModal')?.classList.remove('show');
}
async function maStockLoadSpellData() {
  if (window.MA_STOCK_SPELLS?.classes) {
    maStockSpellData = window.MA_STOCK_SPELLS;
    return maStockSpellData;
  }
  if (maStockSpellData) return maStockSpellData;
  if (!maStockSpellLoadPromise) {
    maStockSpellLoadPromise = (async () => {
      const paths = Array.isArray(MA_STOCK_SPELL_JSON_FALLBACKS) && MA_STOCK_SPELL_JSON_FALLBACKS.length
        ? MA_STOCK_SPELL_JSON_FALLBACKS
        : [MA_STOCK_SPELL_JSON];
      const errors = [];
      for (const path of paths) {
        try {
          const response = await fetch(path, { cache: 'no-cache' });
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const json = await response.json();
          maStockSpellData = json;
          window.maStockSpellLoadedFrom = path;
          return maStockSpellData;
        } catch (error) {
          errors.push(`${path}: ${error?.message || error}`);
        }
      }
      throw new Error(`Could not load stock spells from: ${errors.join(' | ')}`);
    })();
  }
  return maStockSpellLoadPromise;
}

function maStockIsFileProtocol() {
  return String(window.location.protocol || '').toLowerCase() === 'file:';
}
function maStockInstallLocalJsonPicker(body, subtitle, errorText = '') {
  if (subtitle) subtitle.textContent = 'Stock spell file could not be loaded automatically.';
  const fileHint = maStockIsFileProtocol()
    ? '<strong>Local file mode detected.</strong><br>Browsers often block <code>fetch()</code> from <code>file://</code> pages even when the JSON is in the correct folder. Either run a local server or choose the JSON below.'
    : 'The automatic fetch failed. Check the path, filename, and browser console.';
  body.innerHTML = `
    <div class="ma-stock-status ma-stock-error">
      ${fileHint}<br><br>
      Tried: <code>${maStockEsc((MA_STOCK_SPELL_JSON_FALLBACKS || [MA_STOCK_SPELL_JSON]).join('</code>, <code>'))}</code><br>
      Error: <code>${maStockEsc(errorText || 'unknown error')}</code><br><br>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:stretch;">
        <button type="button" class="ma-stock-add-btn" id="maStockRetryFetchBtn">Retry Fetch</button>
        <label style="display:block;text-align:left;color:#ddd;font-size:12px;">
          Load local JSON manually:
          <input id="maStockLocalJsonInput" type="file" accept=".json,application/json" style="margin-top:6px;">
        </label>
        <small style="color:#aaa;line-height:1.45;">Best local test: open a terminal in the site folder and run <code>python -m http.server 8000</code>, then open <code>http://localhost:8000/characters.html</code>.</small>
      </div>
    </div>`;
  body.querySelector('#maStockRetryFetchBtn')?.addEventListener('click', () => {
    maStockSpellLoadPromise = null;
    maStockSpellData = null;
    openStockSpellBrowser();
  });
  body.querySelector('#maStockLocalJsonInput')?.addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || '{}'));
        if (!json || !json.classes || !json.spells) throw new Error('JSON does not have expected classes/spells keys.');
        maStockSpellData = json;
        maStockSpellLoadPromise = Promise.resolve(json);
        window.maStockSpellLoadedFrom = `local file: ${file.name}`;
        const classKeys = maStockCharacterClassKeys(json);
        maStockState.classKey = classKeys[0] || maStockClassList(json)[0]?.key || '';
        maStockState.level = 'all';
        maStockState.query = '';
        renderStockSpellBrowser(`Loaded ${file.name}`);
      } catch (err) {
        console.error('Local stock spell JSON load failed', err);
        maStockInstallLocalJsonPicker(body, subtitle, err?.message || String(err));
      }
    };
    reader.onerror = () => maStockInstallLocalJsonPicker(body, subtitle, reader.error?.message || 'File read failed');
    reader.readAsText(file);
  });
}

async function openStockSpellBrowser() {
  const modal = maStockEnsureModal();
  const subtitle = modal.querySelector('#stockSpellSubtitle');
  const body = modal.querySelector('#stockSpellBody');
  if (subtitle) subtitle.textContent = 'Loading stock spell list...';
  body.innerHTML = `<div class="ma-stock-status">Loading stock spell JSON...</div>`;
  try {
    const data = await maStockLoadSpellData();
    const classKeys = maStockCharacterClassKeys(data);
    maStockState.classKey = classKeys[0] || maStockClassList(data)[0]?.key || '';
    maStockState.level = 'all';
    maStockState.query = '';
    renderStockSpellBrowser();
  } catch (error) {
    console.error('Stock spell load failed', error);
    maStockInstallLocalJsonPicker(body, subtitle, error?.message || String(error));
  }
}
function maStockSpellsForClassLevel(classKey, level) {
  const cls = maStockSpellData?.classes?.[classKey];
  if (!cls) return [];
  const levels = cls.levels || {};
  const rows = [];
  const levelKeys = level === 'all' ? Object.keys(levels).sort((a,b) => Number(a) - Number(b)) : [String(level)];
  levelKeys.forEach(lvl => (levels[lvl] || []).forEach(row => rows.push({ ...row, level: Number(row.level ?? lvl), classKey })));
  return rows;
}
function maStockSpellDetails(row) {
  const spells = maStockSpellData?.spells || {};
  const candidates = [row.slug, maStockSlug(row.name), maStockNorm(row.name), String(row.url || '').replace(/\/$/, '').split('/').pop()].filter(Boolean);
  for (const key of candidates) {
    if (spells[key]) return spells[key];
  }
  const byName = Object.values(spells).find(spell => maStockNorm(spell.name) === maStockNorm(row.name));
  return byName || {};
}
function renderStockSpellBrowser(message = '') {
  const modal = maStockEnsureModal();
  const subtitle = modal.querySelector('#stockSpellSubtitle');
  const body = modal.querySelector('#stockSpellBody');
  const classList = maStockClassList();
  const characterKeys = maStockCharacterClassKeys();
  const selectedClass = maStockSpellData?.classes?.[maStockState.classKey];
  const className = selectedClass?.displayName || selectedClass?.name || maStockState.classKey || 'Class';
  if (subtitle) subtitle.textContent = characterKeys.length ? `Showing spell lists for this character: ${maStockCurrentClassNames().join(', ') || className}` : 'No matching character spell class found; showing all stock classes.';
  const levels = ['all','0','1','2','3','4','5','6','7','8','9'];
  const classButtons = (characterKeys.length ? classList.filter(c => characterKeys.includes(c.key)) : classList).map(c => `
    <button type="button" class="ma-stock-class-chip ${c.key === maStockState.classKey ? 'active' : ''}" data-stock-class="${maStockEsc(c.key)}">${maStockEsc(c.displayName || c.name || c.key)}</button>`).join('');
  const levelButtons = levels.map(lvl => `
    <button type="button" class="ma-stock-level-chip ${String(lvl) === String(maStockState.level) ? 'active' : ''}" data-stock-level="${maStockEsc(lvl)}">${lvl === 'all' ? 'All' : maStockLevelText(lvl)}</button>`).join('');
  const rows = maStockSpellsForClassLevel(maStockState.classKey, maStockState.level)
    .filter(row => !maStockState.query || maStockNorm(`${row.name} ${row.summary || ''}`).includes(maStockNorm(maStockState.query)))
    .sort((a,b) => Number(a.level) - Number(b.level) || String(a.name).localeCompare(String(b.name)));
  body.innerHTML = `
    <div class="ma-stock-toolbar">
      <div class="ma-stock-chip-row">${classButtons || '<span class="ma-stock-muted">No class spell lists in JSON.</span>'}</div>
      <div class="ma-stock-chip-row">${levelButtons}</div>
      <input id="maStockSpellSearch" class="ma-stock-search" type="search" placeholder="Search ${maStockEsc(className)} spells..." value="${maStockEsc(maStockState.query)}">
      ${message ? `<div class="ma-stock-added-note">${maStockEsc(message)}</div>` : ''}
    </div>
    <div class="ma-stock-result-list">
      ${rows.length ? rows.map(row => maStockSpellRowHtml(row)).join('') : `<div class="ma-stock-status">No spells found for this filter.</div>`}
    </div>`;
  body.querySelectorAll('[data-stock-class]').forEach(btn => btn.addEventListener('click', () => { maStockState.classKey = btn.dataset.stockClass || ''; maStockState.level = 'all'; renderStockSpellBrowser(); }));
  body.querySelectorAll('[data-stock-level]').forEach(btn => btn.addEventListener('click', () => { maStockState.level = btn.dataset.stockLevel || 'all'; renderStockSpellBrowser(); }));
  body.querySelector('#maStockSpellSearch')?.addEventListener('input', event => { maStockState.query = event.target.value || ''; renderStockSpellBrowser(); setTimeout(() => { const search = document.getElementById('maStockSpellSearch'); if(search){ search.focus(); const end = search.value.length; try { search.setSelectionRange(end, end); } catch(e) {} } }, 0); });
  body.querySelectorAll('[data-add-stock-spell]').forEach(btn => btn.addEventListener('click', () => addStockSpellToCharacter(btn.dataset.addStockSpell, btn.dataset.addStockLevel, btn.dataset.addStockName)));
}
function maStockSpellRowHtml(row) {
  const details = maStockSpellDetails(row);
  const name = details.name || row.name || 'Unnamed Spell';
  const level = Number(row.level || 0);
  const already = maStockAlreadyHasSpell(name);
  const summary = row.summary || details.summary || details.shortDesc || '';
  const meta = [maStockLevelText(level), details.school || '', details.casting_time || details.castingTime || ''].filter(Boolean).join(' • ');
  return `
    <article class="ma-stock-spell-row">
      <div class="ma-stock-spell-copy">
        <strong>${maStockEsc(name)}</strong>
        <small>${maStockEsc(meta)}</small>
        <p>${maStockEsc(summary || details.desc || 'No short summary found.')}</p>
      </div>
      <button type="button" class="ma-stock-add-btn ${already ? 'added' : ''}" ${already ? 'disabled' : ''} data-add-stock-spell="${maStockEsc(row.slug || maStockSlug(name))}" data-add-stock-level="${level}" data-add-stock-name="${maStockEsc(name)}">${already ? 'Added ✓' : 'Add'}</button>
    </article>`;
}
function maStockAlreadyHasSpell(name) {
  return (maStockGetActiveDataSafe().spells || []).some(spell => maStockNorm(spell.name) === maStockNorm(name));
}
function maStockActionType(raw) {
  const text = String(raw || '').toLowerCase();
  if (text.includes('immediate')) return 'Immediate';
  if (text.includes('swift')) return 'Swift';
  if (text.includes('move')) return 'Move';
  if (text.includes('full')) return 'Full';
  if (text.includes('round')) return 'Round';
  if (text.includes('minute')) return 'Minute';
  if (text.includes('free')) return 'Free';
  return 'Standard';
}
function maStockSpellResistance(raw) {
  const text = String(raw || '').toLowerCase();
  if (!text || text.includes('no')) return 'No';
  if (text.includes('harmless')) return 'Yes Harmless';
  if (text.includes('object')) return 'Yes Object';
  return 'Yes';
}
function maStockAttackType(spell) {
  const text = `${spell.attack_type || ''} ${spell.desc || ''} ${spell.summary || ''}`.toLowerCase();
  if (text.includes('ranged touch')) return 'Ranged Touch';
  if (text.includes('touch attack')) return 'Touch';
  return 'None';
}
function maStockInferDamage(spell) {
  const text = `${spell.damage || ''} ${spell.summary || ''} ${spell.desc || ''}`;
  const explicit = String(spell.damage || '').trim();
  if (explicit) return explicit;
  const match = text.match(/\b\d+d\d+(?:\s*[+\-]\s*\d+)?(?:\s*(?:points? of)?\s*[a-z]+\s+damage)?/i);
  return match ? match[0].trim() : '';
}
function maStockBestDescription(spell, row) {
  const candidates = [spell?.description, spell?.full_description, spell?.fullText, spell?.desc]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || String(row?.summary || '').trim();
}
function maStockBuildDescription(spell, row, cls) {
  const full = maStockBestDescription(spell, row);
  const parts = [];
  if (full) parts.push(full);
  parts.push(`Source: FFD20 ${cls?.displayName || cls?.name || ''} stock spell list.`.trim());
  return parts.filter(Boolean).join('\n\n');
}
function addStockSpellToCharacter(slug, level, fallbackName) {
  const cls = maStockSpellData?.classes?.[maStockState.classKey] || {};
  const row = maStockSpellsForClassLevel(maStockState.classKey, String(level)).find(item => (item.slug || maStockSlug(item.name)) === slug || maStockNorm(item.name) === maStockNorm(fallbackName)) || { name: fallbackName, level };
  const details = maStockSpellDetails(row);
  const name = details.name || row.name || fallbackName || 'Stock Spell';
  if (maStockAlreadyHasSpell(name)) {
    renderStockSpellBrowser(`${name} is already on this character.`);
    return;
  }
  const sheetSpell = {
    name,
    lvl: maStockLevelText(row.level ?? level),
    type: maStockActionType(details.casting_time || details.castingTime || details.action || row.action),
    attack_type: maStockAttackType(details),
    spell_resist: maStockSpellResistance(details.spell_resist || details.spellResistance),
    saving_throw: details.saving_throw || details.savingThrow || '',
    school: details.school || '',
        target: details.target || details.targets || details.effect || details.area || '',
    range: details.range || '',
    duration: details.duration || '',
    damage: maStockInferDamage({ ...details, summary: row.summary }),
    at_higher_lvls: details.at_higher_lvls || details.atHigherLevels || '',
    desc: maStockBuildDescription(details, row, cls),
    link: details.url || row.url || '',
    sourceClass: cls.displayName || cls.name || maStockState.classKey || ''
  };
  const data = maStockGetActiveDataSafe();
  if (!Array.isArray(data.spells)) data.spells = [];
  data.spells.push(sheetSpell);
  maStockSaveDataOnlySafe();
  maStockRenderSpellsSafe();
  renderStockSpellBrowser(`${name} added to ${sheetSpell.lvl} spells.`);
}
window.openSpellAddChoice = openSpellAddChoice;
window.openStockSpellBrowser = openStockSpellBrowser;


/* --- Force Add Spell to use Stock/Custom choice menu after the main module is ready --- */
maStockQueueAddSpellHookInstall();
