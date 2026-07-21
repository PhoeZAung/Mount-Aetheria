
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, deleteDoc, getDocs, getDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBpoi5qvqUehnhcyhfB7d0gtelNUICIthw", authDomain: "mount-aetheria.firebaseapp.com", projectId: "mount-aetheria", storageBucket: "mount-aetheria.firebasestorage.app", messagingSenderId: "492855693446", appId: "1:492855693446:web:f99485569254a7220c38107", measurementId: "G-0PF84KDN7L" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let saveTimeout = null;
let isRemoteUpdate = false;
let fullData = { items: [], weapons: [], spells: [], activeAbilities: [], passiveAbilities: [], racialAbilities: [], feats: [], slot_cap: 20 };
let currentSummonId = null; // selected character id
const CHARACTER_SELECTION_STORAGE_KEY = 'mountAetheriaSelectedCharacterIdV26';
function rememberSelectedCharacterId(id) {
    if (!id) return;
    try { localStorage.setItem(CHARACTER_SELECTION_STORAGE_KEY, String(id)); } catch (e) {}
}
function getRememberedCharacterId() {
    try { return localStorage.getItem(CHARACTER_SELECTION_STORAGE_KEY) || ''; } catch (e) { return ''; }
}
let characterSheets = [];
let unsubscribeCharacters = null;

let blankSheetTemplate = null;
function clonePlain(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
}
function captureBlankSheetTemplate() {
    try { if (typeof initSkillsTable === 'function') initSkillsTable(); } catch (e) {}
    const data = {
        items: [],
        weapons: [],
        spells: [],
        activeAbilities: [],
        passiveAbilities: [],
        racialAbilities: [],
        feats: [],
        skills: [],
        slot_cap: 20
    };
    document.querySelectorAll('.save-field, .live-field').forEach(el => {
        if (!el.id) return;
        if (el.type === 'checkbox') data[el.id] = !!el.checked;
        else data[el.id] = el.value ?? '';
    });
    document.querySelectorAll('.skill-row-data').forEach(r => {
        const customInput = r.querySelector('.skill-custom-input');
        data.skills.push({
            skillKey: r.dataset.skillKey || '',
            name: r.dataset.skillName || '',
            stat: r.dataset.stat || '',
            cs: !!r.querySelector('.skill-cs')?.checked,
            temp: Number(r.querySelector('.skill-temp')?.value) || 0,
            lvl: Number(r.querySelector('.skill-ranks')?.value) || 0,
            subName: customInput ? (customInput.value || '') : ''
        });
    });
    if (data.slot_cap === '' || data.slot_cap === undefined || data.slot_cap === null) data.slot_cap = 20;
    return data;
}
function createBlankCharacterData(name = 'New Character') {
    const base = blankSheetTemplate ? clonePlain(blankSheetTemplate) : captureBlankSheetTemplate();
    base.charName = name;
    base.items = [];
    base.weapons = [];
    base.spells = [];
    base.activeAbilities = [];
    base.passiveAbilities = [];
    base.feats = [];
    base.skills = Array.isArray(base.skills) ? base.skills : [];
    base.slot_cap = (base.slot_cap === '' || base.slot_cap === undefined || base.slot_cap === null) ? 20 : (Number(base.slot_cap) || 20);
    base.createdAt = new Date();
    base.updatedAt = new Date();
    return base;
}
const ITEM_TAG_OPTIONS = ["Weapon", "Ammunition", "Armor", "Gear", "Machine", "Food", "Collection", "Alchemical Items", "Artifacts", "Magic Item", "Misc"];
function normalizeItemTagLabel(tag) {
    const rawParts = Array.isArray(tag) ? tag : String(tag || '').split(/[,|\n]+/);
    const candidates = rawParts.map(v => String(v || '').trim()).filter(Boolean);
    const ordered = [...candidates, String(tag || '').trim()].filter(Boolean);
    for (const t of ordered) {
        if(/^weapons?$/i.test(t) || /^ranged weapons?$/i.test(t) || /^ranged weapon$/i.test(t)) return 'Weapon';
        if(/^ammo$/i.test(t) || /^ammunition$/i.test(t)) return 'Ammunition';
        if(/^armou?r$/i.test(t)) return 'Armor';
        if(/^machines?$/i.test(t) || /^vehicle$/i.test(t) || /^vehicles$/i.test(t)) return 'Machine';
        if(/^gear$/i.test(t)) return 'Gear';
        if(/^food$/i.test(t) || /^consumables?$/i.test(t)) return 'Food';
        if(/^collections?$/i.test(t) || /^collectibles?$/i.test(t)) return 'Collection';
        if(/^alchemical items?$/i.test(t) || /^alchemy$/i.test(t) || /^potions?$/i.test(t)) return 'Alchemical Items';
        if(/^artifacts?$/i.test(t)) return 'Artifacts';
        if(/^magic items?$/i.test(t) || /^wondrous$/i.test(t) || /^enchantments?$/i.test(t)) return 'Magic Item';
        const exact = ITEM_TAG_OPTIONS.find(opt => opt.toLowerCase() === t.toLowerCase());
        if(exact) return exact;
    }
    return 'Misc';
}
function normalizeItemRarity(value) {
    const t = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    if(!t || t === 'none' || t === 'n/a' || t === 'na') return 'Common';
    if(t === 'un common' || t === 'uncommon') return 'Uncommon';
    if(t === 'very rare' || t === 'every rare' || t === 'veryrare' || t === 'epic') return 'Epic';
    if(t === 'legendary') return 'Legendary';
    if(t === 'rare') return 'Rare';
    if(t === 'common') return 'Common';
    return String(value || 'Common').trim();
}
function itemRarityClass(value) {
    const rarity = normalizeItemRarity(value);
    return 'rarity-' + rarity.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '');
}
function itemRarityMarkerHtml(item = {}) {
    const rarity = normalizeItemRarity(item.rarity || itemFirstValue(item, ['rarity']));
    return `<span class="rarity-marker ${itemEsc(itemRarityClass(rarity))}" title="${itemEsc(rarity)}"></span>`;
}


const ITEM_META_FIELD_LABELS = {
    type: 'Type',
    secondaryType: 'Subtype',
    filterTag: 'Subtype',
    proficiency: 'Proficiency',
    usageType: 'Usage',
    tier: 'Tier',
    lvl: 'Lvl',
    rarity: 'Rarity',
    cl: 'CL'
};
const ITEM_VISIBLE_TAG_FIELDS_BY_CATEGORY = {
    Weapons: ['rarity','lvl','proficiency','usageType','type','secondaryType'],
    Weapon: ['rarity','lvl','proficiency','usageType','type','secondaryType'],
    'Ranged Weapon': ['rarity','lvl','proficiency','usageType','type','secondaryType'],
    Ammunition: ['rarity','lvl','type'],
    Armor: ['rarity','lvl','type'],
    Gear: ['rarity','lvl','type','secondaryType'],
    Machine: ['rarity','lvl','cl','type'],
    Enchantment: ['rarity','lvl','cl','type','tier'],
    'Alchemical Items': ['rarity','lvl','tier','cl','type'],
    Artifacts: ['rarity','lvl','cl','type'],
    'Magic Items': ['rarity','lvl','cl','type'],
    'Magic Item': ['rarity','lvl','cl','type'],
    Food: ['rarity','type','secondaryType'],
    Collections: ['rarity','type'],
    Collection: ['rarity','type'],
    Misc: ['rarity','lvl','type','secondaryType']
};
const ITEM_DETAIL_FIELD_KEYS_BY_CATEGORY = {
    Weapons: [
        ['Proficiency', ['proficiency']],
        ['Usage', ['usageType','usage','use']],
        ['Dmg', ['dmg','damage','damageDice','damage_dice','dmgM','dmgS','attackDmg']],
        ['Crit', ['crit','critical','crit_range','critRange','crit range','crit_mult','crit mult']],
        ['Range', ['range','rangeIncrement','range_increment']]
    ],
    Weapon: [
        ['Proficiency', ['proficiency']],
        ['Usage', ['usageType','usage','use']],
        ['Dmg', ['dmg','damage','damageDice','damage_dice','dmgM','dmgS','attackDmg']],
        ['Crit', ['crit','critical','crit_range','critRange','crit range','crit_mult','crit mult']],
        ['Range', ['range','rangeIncrement','range_increment']]
    ],
    'Ranged Weapon': [
        ['Proficiency', ['proficiency']],
        ['Usage', ['usageType','usage','use']],
        ['Dmg', ['dmg','damage','damageDice','damage_dice','dmgM','dmgS','attackDmg']],
        ['Crit', ['crit','critical','crit_range','critRange','crit range','crit_mult','crit mult']],
        ['Range', ['range','rangeIncrement','range_increment']],
        ['Ammo', ['ammo','ammunition','capacity']]
    ],
    Armor: [
        ['AC bonus', ['acBonus','ac bonus','armorBonus','armor bonus','shieldBonus']],
        ['Max Dex', ['maxDex','max dex','maxDexBonus']],
        ['Check penalty', ['checkPenalty','check penalty','armorCheckPenalty']],
        ['Spell failure', ['spellFailure','spell failure','arcaneSpellFailure']],
        ['Speed', ['speed','speedPenalty','speed penalty','speed30Ft','speed20Ft']]
    ],
    Machine: [
        ['CL', ['cl','casterLevel','caster level']],
        ['Full speed', ['fullSpeed','full speed']],
        ['Passengers/Crew', ['passengersCrew','passengers/crew','passengers','crew']],
        ['Fuel', ['fuel']],
        ['Mileage', ['mileage']],
        ['AC/CMD', ['acCmd','ac/cmd','ac cmd']],
        ['HP', ['hp']],
        ['Hardness', ['hardness']],
        ['Attack/Dmg', ['attackDmg','attack/dmg','attack dmg']],
        ['Critical', ['critical','crit']],
        ['Range', ['range']],
        ['Damage Type', ['damageType','damage type']],
        ['Aim', ['aim']],
        ['Load', ['load']]
    ],
    'Alchemical Items': [
        ['Tier', ['tier']],
        ['CL', ['cl','casterLevel','caster level']],
        ['Range', ['range']],
        ['DC/Save', ['dcSave','dc/save','dc save','dc saves','dcSaves','saveDc','save DC']]
    ],
    Enchantment: [['CL', ['cl','casterLevel','caster level']]],
    Artifacts: [['CL', ['cl','casterLevel','caster level']]],
    'Magic Items': [['CL', ['cl','casterLevel','caster level']]],
    'Magic Item': [['CL', ['cl','casterLevel','caster level']]],
    Gear: [],
    Food: [],
    Collection: [],
    Ammunition: []
};
const ITEM_EDIT_EXTRA_FIELDS_BY_CATEGORY = {
    Weapon: [
        ['Proficiency', 'proficiency', ['proficiency']],
        ['Usage', 'usageType', ['usageType','usage','use']],
        ['Dmg', 'dmg', ['dmg','damage','damageDice','damage_dice','dmgM','dmgS','attackDmg']],
        ['Crit', 'crit', ['crit','critical','crit_range','critRange','crit range','crit_mult','crit mult']],
        ['Range', 'range', ['range','rangeIncrement','range_increment']]
    ],
    Armor: [
        ['AC Bonus', 'acBonus', ['acBonus','ac bonus','armorBonus','armor bonus','shieldBonus']],
        ['Max Dex', 'maxDex', ['maxDex','max dex','maxDexBonus']],
        ['Check Penalty', 'checkPenalty', ['checkPenalty','check penalty','armorCheckPenalty']],
        ['Spell Failure', 'spellFailure', ['spellFailure','spell failure','arcaneSpellFailure']],
        ['Speed', 'speed', ['speed','speedPenalty','speed penalty','speed30Ft','speed20Ft']]
    ],
    Machine: [
        ['CL', 'cl', ['cl','casterLevel','caster level']],
        ['Full Speed', 'fullSpeed', ['fullSpeed','full speed']],
        ['Passengers/Crew', 'passengersCrew', ['passengersCrew','passengers/crew','passengers','crew']],
        ['Fuel', 'fuel', ['fuel']],
        ['Mileage', 'mileage', ['mileage']],
        ['AC/CMD', 'acCmd', ['acCmd','ac/cmd','ac cmd']],
        ['HP', 'hp', ['hp']],
        ['Hardness', 'hardness', ['hardness']],
        ['Attack/Dmg', 'attackDmg', ['attackDmg','attack/dmg','attack dmg']],
        ['Critical', 'critical', ['critical','crit']],
        ['Range', 'range', ['range']],
        ['Damage Type', 'damageType', ['damageType','damage type']],
        ['Aim', 'aim', ['aim']],
        ['Load', 'load', ['load']]
    ],
    'Alchemical Items': [
        ['Tier', 'tier', ['tier']],
        ['CL', 'cl', ['cl','casterLevel','caster level']],
        ['Range', 'range', ['range']],
        ['DC/Save', 'dcSave', ['dcSave','dc/save','dc save','dc saves','dcSaves','saveDc','save DC']]
    ]
};
function itemEditAllowsSecondaryType(category) {
    return !['Weapon','Ammunition','Armor','Machine'].includes(normalizeItemTagLabel(category));
}
function itemEditAllowsCl(category) {
    return !['Weapon','Ammunition','Armor','Food'].includes(normalizeItemTagLabel(category));
}
function itemImageUrlValue(item = {}) {
    return itemFirstValue(item, ['img','image','imageUrl','imgUrl','icon','Image URL','Img URL','Image Url','Image']);
}
function itemFilteredExtraFieldsForEdit(category) {
    const fields = ITEM_EDIT_EXTRA_FIELDS_BY_CATEGORY[normalizeItemTagLabel(category)] || [];
    const commonKeys = new Set();
    if (itemEditAllowsCl(category)) commonKeys.add('cl');
    if (itemEditAllowsSecondaryType(category)) commonKeys.add('secondaryType');
    return fields.filter(([, key]) => !commonKeys.has(key));
}
const ITEM_NOISY_META_VALUES = new Set(['container','containers','gear','tool','tools','misc','miscellaneous','storage','stored','source','origin','origins','n/a','na','none','—','-']);
const ITEM_SKIP_DETAIL_LABELS = new Set(['weight','weightlb','weightlbs','bulk','location','storage','storedin','source','sourcesystem','sourceorigin','origin','origins','skilluse','skilluses','use skill','skill']);
function itemEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function itemCleanText(value) {
    return String(value ?? '').trim();
}
function itemNorm(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}
function itemNormKey(value) {
    return itemNorm(value).replace(/\s+/g, '');
}
function itemFirstValue(item, keys) {
    for (const key of keys) {
        const variants = [key, key.replace(/\s+/g,''), key.replace(/\s+/g,'_'), key.replace(/\s+/g,'-')];
        for (const vKey of variants) {
            if (item && Object.prototype.hasOwnProperty.call(item, vKey) && itemCleanText(item[vKey])) return item[vKey];
            if (item?.raw && Object.prototype.hasOwnProperty.call(item.raw, vKey) && itemCleanText(item.raw[vKey])) return item.raw[vKey];
        }
    }
    const wanted = new Set(keys.map(k => itemNormKey(k)));
    const scan = (obj) => {
        if(!obj || typeof obj !== 'object') return '';
        for (const [k, v] of Object.entries(obj)) {
            if(wanted.has(itemNormKey(k)) && itemCleanText(v)) return v;
        }
        return '';
    };
    return scan(item) || scan(item?.raw) || '';
}
function itemDisplayCost(item = {}) {
    if (itemCleanText(item.cost)) return item.cost;
    const purchased = Number(item.purchasedForGil || 0);
    if (purchased) return `${purchased.toLocaleString()} gil`;
    const unit = Number(item.unitPriceGil || item.priceGil || item.price || 0);
    if (unit) return `${unit.toLocaleString()} gil`;
    return '—';
}
function itemMainCategory(item = {}) {
    const direct = itemCleanText(item.sourceCategory || item.category);
    if (direct) return normalizeItemTagLabel(direct);
    return normalizeItemTagLabel(item.tags || 'Misc');
}
function itemTagListArray(item = {}) {
    const raw = Array.isArray(item.tagList) ? item.tagList : String(item.tagList || '').split(/[,|\n]+/);
    return raw.map(v => itemCleanText(v)).filter(Boolean);
}
function itemIsNoisyMetaValue(value) {
    const val = itemNorm(value);
    if (!val || ITEM_NOISY_META_VALUES.has(val)) return true;
    if (val.includes('source system') || val.includes('origin') || val.includes('storage')) return true;
    return false;
}
function addItemPill(list, label, value, cls = '') {
    const val = itemCleanText(value);
    if (!val || itemIsNoisyMetaValue(val)) return;
    const text = label ? `${label}: ${val}` : val;
    const sig = itemNorm(text);
    const valSig = itemNorm(val);
    if (list.some(p => p.sig === sig || p.valSig === valSig)) return;
    list.push({ text, cls, sig, valSig });
}
function itemSheetPills(item = {}) {
    const list = [];
    const main = itemMainCategory(item);
    addItemPill(list, '', main);
    const fields = ITEM_VISIBLE_TAG_FIELDS_BY_CATEGORY[main] || ITEM_VISIBLE_TAG_FIELDS_BY_CATEGORY.Misc;
    fields.forEach(key => {
        const rawVal = key === 'secondaryType' ? (item.secondaryType || item.filterTag) : item[key];
        const val = itemCleanText(rawVal);
        if (!val) return;
        if (itemNorm(val) === itemNorm(main) || itemNorm(val) === itemNorm(item.tags)) return;
        const cls = key === 'lvl' ? 'good' : key === 'rarity' ? 'warn' : '';
        addItemPill(list, ITEM_META_FIELD_LABELS[key] || key, val, cls);
    });
    return list;
}
function itemDetailLabelAllowed(item, label) {
    const key = itemNormKey(label);
    if (!key || ITEM_SKIP_DETAIL_LABELS.has(key)) return false;
    if (key.includes('weight') || key.includes('origin') || key.includes('source') || key.includes('location') || key.includes('storage') || key.includes('skilluse')) return false;
    const main = itemMainCategory(item);
    const allowed = new Set(['amount','slot','slotamount', ...(ITEM_DETAIL_FIELD_KEYS_BY_CATEGORY[main] || []).map(([l]) => itemNormKey(l))]);
    return allowed.has(key);
}
function itemDetailsRows(item = {}) {
    const rows = [];
    const seen = new Set();
    const push = (label, value) => {
        const val = itemCleanText(value);
        if (!val || !itemDetailLabelAllowed(item, label)) return;
        const sig = `${itemNormKey(label)}:${itemNorm(val)}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        rows.push([label, val]);
    };
    push('Amount', getItemAmount(item));
    const slotVal = getItemSlot(item);
    if (itemCleanText(slotVal) && String(slotVal) !== '0') push('Slot amount', slotVal);
    const main = itemMainCategory(item);
    (ITEM_DETAIL_FIELD_KEYS_BY_CATEGORY[main] || []).forEach(([label, keys]) => {
        if (label === 'Crit') {
            const direct = itemFirstValue(item, ['crit','critical']);
            const range = itemFirstValue(item, ['crit_range','critRange','crit range']);
            const mult = itemFirstValue(item, ['crit_mult','crit mult','critMultiplier','crit_multiplier']);
            push(label, direct || [range, mult].filter(Boolean).join(' / '));
        } else {
            push(label, itemFirstValue(item, keys));
        }
    });
    if (Array.isArray(item.details)) item.details.forEach(d => push(d.label || d.name || 'Detail', d.value ?? d.val ?? ''));
    return rows;
}
function itemDetailsHtmlForSheet(item = {}) {
    const rows = itemDetailsRows(item);
    if (!rows.length) return '';
    return `<h4>Details</h4><div class="item-detail-grid">${rows.map(([label,value]) => `<div class="item-detail-cell"><small>${itemEsc(label)}</small><span>${itemEsc(value)}</span></div>`).join('')}</div>`;
}
function itemCanEditWeaponStats(item = {}) {
    const main = normalizeItemTagLabel(itemMainCategory(item));
    return main === 'Weapon' || /weapon/i.test(String(item.tags || item.sourceCategory || item.category || item.shopGroup || item.filterTag || item.type || ''));
}
function updateItemTagListValue(value) {
    return String(value || '').split(/[,|\n]+/).map(t => t.trim()).filter(Boolean).filter((t, i, arr) => arr.indexOf(t) === i);
}

function sanitizeCharacterDoc(raw = {}, fallbackName = 'New Character') {
    const data = {
        items: [],
        weapons: [],
        spells: [],
        activeAbilities: [],
        passiveAbilities: [],
        racialAbilities: [],
        feats: [],
        slot_cap: 20,
        ...raw
    };
    delete data.summons;
    if (!Array.isArray(data.items)) data.items = [];
    data.items = data.items.map(item => ({ ...item, tags: normalizeItemTagLabel(item?.sourceCategory || item?.category || item?.tags), rarity: normalizeItemRarity(item?.rarity || item?.raw?.Rarity || 'Common') }));
    if (!Array.isArray(data.weapons)) data.weapons = [];
    data.weapons = data.weapons.map(weapon => normalizeWeaponData(weapon));
    if (!Array.isArray(data.spells)) data.spells = [];
    if (!Array.isArray(data.activeAbilities)) data.activeAbilities = [];
    if (!Array.isArray(data.passiveAbilities)) data.passiveAbilities = [];
    if (!Array.isArray(data.racialAbilities)) data.racialAbilities = [];
    if (!Array.isArray(data.feats)) data.feats = [];
    try { if (typeof maFfd20MoveRaceEffectsToRacial === 'function') maFfd20MoveRaceEffectsToRacial(data); } catch (e) {}
    if (!data.class && data.className) data.class = data.className;
    if (!data.className && data.class) data.className = data.class;
    if (!data.character_level && data.level) data.character_level = String(data.level);
    if (!data.level && data.character_level) data.level = data.character_level;
    if (!data.charName) data.charName = fallbackName;
    if (data.slot_cap === undefined || data.slot_cap === null || data.slot_cap === '') data.slot_cap = 20;
    return data;
}
function sortCharacterSheets(list) {
    return [...(list || [])].sort((a, b) => String(a.charName || '').localeCompare(String(b.charName || ''), undefined, { sensitivity: 'base' }));
}
async function ensureCharacterCollection() {
    const userRef = doc(db, 'users', currentUser.uid);
    const charsCol = collection(db, 'users', currentUser.uid, 'characters');
    const [userSnap, currentSnap] = await Promise.all([getDoc(userRef), getDocs(charsCol)]);
    const migrated = !!(userSnap.exists() && userSnap.data()?.charactersMigrated);

    if (!currentSnap.empty) {
        if (!migrated) {
            try { await setDoc(userRef, { charactersMigrated: true }, { merge: true }); } catch (e) { console.warn('Could not set charactersMigrated flag', e); }
        }
        return;
    }

    if (migrated) return;

    let created = false;
    try {
        const legacySnap = await getDoc(doc(db, 'users', currentUser.uid, 'sheet', 'character'));
        if (legacySnap.exists()) {
            const legacy = legacySnap.data() || {};
            const summons = Array.isArray(legacy.summons) ? legacy.summons : [];
            const { summons: _ignored, ...mainData } = legacy;
            await addDoc(charsCol, sanitizeCharacterDoc({ ...mainData, updatedAt: new Date(), createdAt: legacy.createdAt || new Date() }, mainData.charName || 'Main Character'));
            created = true;
            for (const oldChar of summons) {
                const { summons: _nestedIgnored, ...charData } = (oldChar || {});
                await addDoc(charsCol, sanitizeCharacterDoc({ ...charData, updatedAt: new Date(), createdAt: charData.createdAt || new Date() }, charData.charName || 'New Character'));
                created = true;
            }
        }
        if (created || !legacySnap.exists()) {
            await setDoc(userRef, { charactersMigrated: true }, { merge: true });
        }
    } catch (e) {
        console.error('Legacy character migration failed', e);
    }
}

window.switchTab = (id) => { 
    document.querySelectorAll('.main-tabs .tab-btn').forEach(b => b.classList.remove('active')); 
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); 
    const btn = document.getElementById('btn-' + id);
    if(btn) btn.classList.add('active');
    const target = document.getElementById(id);
    if(target) target.classList.add('active');
    if(id === 'other') {
        const saved = localStorage.getItem('activeOtherSub') || 'calendar';
        switchOtherTab(saved);
    }
};
window.switchSub = (id) => { 
    const container = document.getElementById('combatSubNav');
    if (!container) return;
    container.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = Array.from(container.querySelectorAll('.sub-btn')).find(b => String(b.getAttribute('onclick') || '').includes(id));
    if(targetBtn) targetBtn.classList.add('active');
    const combat = document.getElementById('combat');
    if (combat) combat.querySelectorAll('.sub-group').forEach(c => c.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'block';
    localStorage.setItem('activeCombatSub', id);
};
window.switchSubSub = (id) => {
    const container = document.getElementById('abilitiesSubSubNav');
    Array.from(container.children).forEach(b => b.classList.remove('active'));
    const targetBtn = Array.from(container.children).find(b => b.getAttribute('onclick').includes(id));
    if(targetBtn) targetBtn.classList.add('active');
    document.getElementById('c-abilities-main').querySelectorAll('.sub-sub-group').forEach(c => c.style.display = 'none');
    document.getElementById(id).style.display = 'block'; 
    localStorage.setItem('activeAbilSub', id);
};


const DEFAULT_FANTASY_MONTHS = Array.from({ length: 12 }, (_, index) => `Month ${index + 1}`);
let playerCalendarGroups = [];
let selectedPlayerCalendarId = null;
let playerCalendarLoadPromise = null;
let playerCalendarLoadTagKey = '';
let playerCalendarLoadedAt = 0;
const PLAYER_CALENDAR_CACHE_MS = 30000;
const PLAYER_CALENDAR_TIMEOUT_MS = 10000;
function calendarEscape(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function playerGroupTags() { return Array.isArray(fullData?.group_tags) ? fullData.group_tags.filter(Boolean) : []; }
function calendarMonthNames(group) {
    const saved = Array.isArray(group?.calendarMonthNames) ? group.calendarMonthNames : [];
    return DEFAULT_FANTASY_MONTHS.map((fallback, index) => String(saved[index] || fallback).trim() || fallback);
}
function calendarDisplayYear(group) {
    return Math.max(1, Number(group?.calendarCurrentDay?.year ?? group?.calendarCurrentYear) || 1);
}
function normalizeFantasyDate(value = {}, fallbackYear = 1) {
    const year = Math.max(1, Number(value.year) || Number(fallbackYear) || 1);
    const month = Math.max(1, Math.min(12, Number(value.month) || 1));
    const day = Math.max(1, Math.min(35, Number(value.day) || 1));
    return { year, month, day };
}
function eventsForFantasyDay(group, year, month, day) {
    const groupYear = calendarDisplayYear(group);
    return (Array.isArray(group?.calendarEvents) ? group.calendarEvents : []).filter(event => {
        const eventYear = Math.max(1, Number(event.year) || groupYear);
        return eventYear === year && Number(event.month) === month && Number(event.day) === day;
    });
}
window.switchOtherTab = (name) => {
    const valid = ['calendar','notes','shop'].includes(name) ? name : 'calendar';
    document.querySelectorAll('.other-sub-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.other-sub-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById('other-tab-' + valid)?.classList.add('active');
    document.getElementById('other-' + valid)?.classList.add('active');
    localStorage.setItem('activeOtherSub', valid);
    if(valid === 'calendar') loadPlayerCalendars();
};
async function loadPlayerCalendars(options = {}) {
    const status = document.getElementById('playerCalendarStatus');
    const normalizedTags = playerGroupTags()
        .map(tag => String(tag || '').trim().toLowerCase())
        .filter(Boolean);
    const tagKey = [...new Set(normalizedTags)].sort().join('|');
    const force = options?.force === true;

    if(!tagKey) {
        playerCalendarGroups = [];
        selectedPlayerCalendarId = null;
        playerCalendarLoadTagKey = '';
        playerCalendarLoadedAt = 0;
        renderPlayerCalendar();
        if(status) {
            status.textContent = 'This character is not assigned to a calendar group yet.';
            status.classList.remove('hidden');
        }
        return;
    }

    const cacheFresh =
        !force &&
        playerCalendarLoadTagKey === tagKey &&
        playerCalendarLoadedAt > 0 &&
        (Date.now() - playerCalendarLoadedAt) < PLAYER_CALENDAR_CACHE_MS;

    if(cacheFresh) {
        renderPlayerCalendar();
        return;
    }

    if(playerCalendarLoadPromise && playerCalendarLoadTagKey === tagKey) {
        return playerCalendarLoadPromise;
    }

    playerCalendarLoadTagKey = tagKey;
    if(status && !playerCalendarGroups.length) {
        status.textContent = 'Loading calendar...';
        status.classList.remove('hidden');
    }

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Calendar request timed out.')), PLAYER_CALENDAR_TIMEOUT_MS);
    });

    playerCalendarLoadPromise = (async () => {
        try {
            const snap = await Promise.race([
                getDocs(collection(db, 'adminCharacterGroups')),
                timeoutPromise
            ]);
            const requestedTagKey = tagKey;
            if(playerCalendarLoadTagKey !== requestedTagKey) return;

            playerCalendarGroups = snap.docs
                .map(d => ({ id:d.id, ...(d.data() || {}) }))
                .filter(group => normalizedTags.includes(String(group.name || '').trim().toLowerCase()))
                .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));

            playerCalendarLoadedAt = Date.now();
            if(!playerCalendarGroups.some(group => group.id === selectedPlayerCalendarId)) {
                selectedPlayerCalendarId = playerCalendarGroups[0]?.id || null;
            }
            renderPlayerCalendar();

            if(!playerCalendarGroups.length && status) {
                status.textContent = 'No calendar group matches this character’s group tags.';
                status.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Unable to load group calendar', error);
            if(!playerCalendarGroups.length) {
                selectedPlayerCalendarId = null;
                renderPlayerCalendar();
            }
            if(status) {
                status.textContent = error?.message === 'Calendar request timed out.'
                    ? 'Calendar took too long to load. Close and reopen the Calendar tab to retry.'
                    : 'Calendar could not load. Check Firestore access and try again.';
                status.classList.remove('hidden');
            }
        } finally {
            playerCalendarLoadPromise = null;
        }
    })();

    return playerCalendarLoadPromise;
}
window.selectPlayerCalendar = (groupId) => { selectedPlayerCalendarId = groupId; renderPlayerCalendar(); };
window.openPlayerCalendarDay = (month, day) => {
    const group = playerCalendarGroups.find(item => item.id === selectedPlayerCalendarId);
    const box = document.getElementById('playerCalendarEventDetails');
    if(!group || !box) return;
    const year = calendarDisplayYear(group);
    const names = calendarMonthNames(group);
    const items = eventsForFantasyDay(group, year, month, day);
    box.classList.add('show');
    box.innerHTML = `<h3>${calendarEscape(group.name)} — ${calendarEscape(names[month-1])} ${day}, Year ${year}</h3>` + (items.length ? items.map(event => `<div class="calendar-event-row"><strong>${calendarEscape(event.title || 'Event')}</strong>${event.description ? `<br>${calendarEscape(event.description)}` : ''}</div>`).join('') : '<div class="calendar-event-row">No events on this day.</div>');
};
function renderPlayerCalendar() {
    const tabs = document.getElementById('playerCalendarGroupTabs');
    const status = document.getElementById('playerCalendarStatus');
    const months = document.getElementById('playerCalendarMonths');
    const pill = document.getElementById('playerCalendarCurrentDay');
    const details = document.getElementById('playerCalendarEventDetails');
    if(!tabs || !status || !months || !pill || !details) return;
    details.classList.remove('show'); details.innerHTML = '';
    tabs.innerHTML = playerCalendarGroups.map(group => `<button type="button" class="calendar-group-btn ${group.id === selectedPlayerCalendarId ? 'active' : ''}" onclick="selectPlayerCalendar('${calendarEscape(group.id)}')">${calendarEscape(group.name)}</button>`).join('');
    const group = playerCalendarGroups.find(item => item.id === selectedPlayerCalendarId);
    if(!group) { months.innerHTML = ''; pill.textContent = 'No group calendar selected'; if(!status.textContent) status.textContent = 'No group calendar available.'; status.classList.remove('hidden'); return; }
    status.classList.add('hidden');
    const current = normalizeFantasyDate(group.calendarCurrentDay || {}, calendarDisplayYear(group));
    const names = calendarMonthNames(group);
    pill.textContent = `${group.name}: ${names[current.month - 1]} ${current.day}, Year ${current.year}`;
    months.innerHTML = names.map((monthName, monthIndex) => {
        const month = monthIndex + 1;
        const days = Array.from({length:35}, (_, index) => {
            const day = index + 1;
            const classes = ['calendar-day'];
            if(current.month === month && current.day === day) classes.push('current');
            if(eventsForFantasyDay(group, current.year, month, day).length) classes.push('has-event');
            return `<button type="button" class="${classes.join(' ')}" onclick="openPlayerCalendarDay(${month},${day})" title="${calendarEscape(monthName)} ${day}, Year ${current.year}">${day}</button>`;
        }).join('');
        return `<section class="calendar-month"><h3>${calendarEscape(monthName)}</h3><div class="calendar-days">${days}</div></section>`;
    }).join('');
}

onAuthStateChanged(auth, (user) => {
    if(user){
        currentUser = user;
        document.getElementById('uidDisplay').textContent = user.email;
        document.getElementById('authLink').textContent = "My Account"; document.getElementById('authLink').href = "account.html";
        document.getElementById('mobileAuthLink').textContent = "My Account"; document.getElementById('mobileAuthLink').href = "account.html";
        initSkills();
        startSync();
        subscribeGlobalChat();
    } else { window.location.href = "signin.html"; }
});


function showNoCharacterState(show) {
    document.body.classList.toggle('no-character-mode', !!show);
    const deleteBtn = document.getElementById('btnDeleteSummon');
    const createBtn = document.getElementById('btnCreateFirstCharacter');
    const addBtn = document.getElementById('btnAddSummon');
    const title = document.getElementById('sheetTitle');
    if (title && show) title.textContent = 'Identity & Build';
    if (deleteBtn) deleteBtn.style.display = show ? 'none' : 'block';
    if (createBtn) createBtn.onclick = createNewSummon;
    if (addBtn) {
        addBtn.style.display = show ? 'none' : 'block';
        addBtn.textContent = show ? '+ Create New Character' : '+ Add Character';
    }
}

async function startSync() {
    if (unsubscribeCharacters) unsubscribeCharacters();
    await ensureCharacterCollection();

    const charsRef = collection(db, 'users', currentUser.uid, 'characters');
    unsubscribeCharacters = onSnapshot(charsRef, (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        characterSheets = sortCharacterSheets(snap.docs.map(d => ({ ...sanitizeCharacterDoc(d.data(), 'New Character'), id: d.id })));
        if (!characterSheets.length) {
            currentSummonId = null;
            fullData = sanitizeCharacterDoc(createBlankCharacterData('New Character'), 'New Character');
            document.getElementById('statusDot').classList.add('live');
            document.getElementById('statusText').textContent = "No Characters";
            isRemoteUpdate = true;
            loadCurrentSheet();
            updateSummonMenu();
            showNoCharacterState(true);
            isRemoteUpdate = false;
            return;
        }

        showNoCharacterState(false);
        if (!currentSummonId || !characterSheets.some(c => c.id === currentSummonId)) {
            const rememberedId = getRememberedCharacterId();
            currentSummonId = characterSheets.some(c => c.id === rememberedId) ? rememberedId : characterSheets[0].id;
        }
        rememberSelectedCharacterId(currentSummonId);
        const remote = characterSheets.find(c => c.id === currentSummonId) || characterSheets[0];
        document.getElementById('statusDot').classList.add('live');
        document.getElementById('statusText').textContent = "Live Sync";
        fullData = sanitizeCharacterDoc(remote, remote?.charName || 'New Character');
        isRemoteUpdate = true;
        loadCurrentSheet();
        setTimeout(refreshCombatUi, 50);
        updateSummonMenu();
        isRemoteUpdate = false;
    });
}

function getActiveData() { return fullData; }

function stripLimitBreakAbilityEntries(target) {
    // Kept for compatibility with older sheets. Limit Break abilities are now user-managed and must be preserved.
    return target;
}
function normalizeSkillInt(value, fallback = 0) {
    if(value === '' || value === null || value === undefined) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function getSkillPointsEl() { return document.getElementById('skill_points'); }
function getUnusedSkillPoints() { return normalizeSkillInt(getSkillPointsEl()?.value, 0); }
function setUnusedSkillPoints(value) {
    const el = getSkillPointsEl();
    if(el) el.value = String(Math.max(0, normalizeSkillInt(value, 0)));
}
function getSkillRankCap() {
    return Math.max(1, Math.min(20, normalizeSkillInt(document.getElementById('character_level')?.value, 1)));
}
function sanitizeSkillPoolUi() {
    const el = getSkillPointsEl();
    if(!el) return;
    el.readOnly = true;
    el.setAttribute('aria-readonly', 'true');
    el.title = 'Skill points are calculated from class levels and spent by adding skill ranks.';
    const btn = document.getElementById('skillPointsEditBtn');
    if(btn) {
        btn.remove();
    }
}
window.toggleSkillPointEdit = () => {
    sanitizeSkillPoolUi();
    alert('Unused skill points are calculated from class level-ups. Spend them by adding skill ranks; old manual pools are ignored.');
};
function syncSkillRankCap(refundReducedRanks = false) {
    const cap = getSkillRankCap();
    let refunded = 0;
    let changed = false;
    document.querySelectorAll('#skillsTableBody .skill-ranks').forEach(input => {
        input.setAttribute('min', '0');
        input.setAttribute('max', String(cap));
        const prior = Math.max(0, normalizeSkillInt(input.value, 0));
        const next = Math.min(prior, cap);
        if(next !== prior) {
            input.value = String(next);
            refunded += prior - next;
            changed = true;
        }
        input.dataset.prevValue = String(next);
    });
    if(refundReducedRanks && refunded > 0) {
        setUnusedSkillPoints(getUnusedSkillPoints() + refunded);
    }
    return changed;
}
function applySkillRankChange(input) {
    if(!input) return;
    const cap = getSkillRankCap();
    input.setAttribute('max', String(cap));
    const prev = Math.min(cap, Math.max(0, normalizeSkillInt(input.dataset.prevValue, normalizeSkillInt(input.value, 0))));
    let next = Math.max(0, Math.min(cap, normalizeSkillInt(input.value, prev)));
    let unused = getUnusedSkillPoints();
    const wantedDiff = next - prev;

    if(wantedDiff > 0) {
        if(unused <= 0) {
            next = prev;
        } else if(wantedDiff > unused) {
            next = prev + unused;
        }
    }

    const actualDiff = next - prev;
    unused -= actualDiff;
    if(unused < 0) unused = 0;

    input.value = String(next);
    input.dataset.prevValue = String(next);
    setUnusedSkillPoints(unused);
}
function applySkillEditMode(next) {
    document.body.classList.toggle('skill-edit-mode', !!next);
    document.body.classList.remove('skill-points-unlocked');
    sanitizeSkillPoolUi();
    document.querySelectorAll('#skillsTableBody .skill-custom-input').forEach(input => {
        input.readOnly = !next;
        input.setAttribute('aria-readonly', next ? 'false' : 'true');
        input.tabIndex = next ? 0 : -1;
    });
}
window.toggleSkillEditMode = (force) => {
    const next = (typeof force === 'boolean') ? force : !document.body.classList.contains('skill-edit-mode');
    applySkillEditMode(next);
};
function bindSkillRowEvents(row) {
    if(!row) return;
    const rankInput = row.querySelector('.skill-ranks');
    const tempInput = row.querySelector('.skill-temp');
    const csInput = row.querySelector('.skill-cs');
    const customInput = row.querySelector('.skill-custom-input');

    if(rankInput && rankInput.dataset.bound !== '1') {
        rankInput.dataset.bound = '1';
        rankInput.setAttribute('min', '0');
        rankInput.setAttribute('max', String(getSkillRankCap()));
        rankInput.addEventListener('focus', () => {
            rankInput.dataset.prevValue = String(normalizeSkillInt(rankInput.value, 0));
        });
        const handleRank = () => {
            applySkillRankChange(rankInput);
            updateCalcs();
            save();
        };
        rankInput.addEventListener('input', handleRank);
        rankInput.addEventListener('change', handleRank);
        rankInput.addEventListener('blur', handleRank);
    }
    if(tempInput && tempInput.dataset.bound !== '1') {
        tempInput.dataset.bound = '1';
        const handleTemp = () => { updateCalcs(); save(); };
        tempInput.addEventListener('input', handleTemp);
        tempInput.addEventListener('change', handleTemp);
        tempInput.addEventListener('blur', handleTemp);
    }
    if(csInput && csInput.dataset.bound !== '1') {
        csInput.dataset.bound = '1';
        const handleCs = () => { updateCalcs(); save(); };
        csInput.addEventListener('input', handleCs);
        csInput.addEventListener('change', handleCs);
    }
    if(customInput && customInput.dataset.bound !== '1') {
        customInput.dataset.bound = '1';
        const handleCustom = () => { updateCalcs(); save(); };
        customInput.addEventListener('input', handleCustom);
        customInput.addEventListener('change', handleCustom);
        customInput.addEventListener('blur', handleCustom);
    }
}
function syncSkillStateAfterLoad() {
    sanitizeSkillPoolUi();
    document.querySelectorAll('#skillsTableBody .skill-ranks').forEach(input => {
        if(input.value === '') input.value = '0';
    });
    document.querySelectorAll('#skillsTableBody .skill-temp').forEach(input => {
        if(input.value === '') input.value = '0';
    });
    const skillPoolEl = getSkillPointsEl();
    if(skillPoolEl && skillPoolEl.value === '') skillPoolEl.value = '0';
    if(skillPoolEl && skillPoolEl.dataset.skillPoolBound !== '1') {
        skillPoolEl.dataset.skillPoolBound = '1';
        const normalizePool = () => setUnusedSkillPoints(getUnusedSkillPoints());
        skillPoolEl.addEventListener('input', normalizePool);
        skillPoolEl.addEventListener('change', normalizePool);
        skillPoolEl.addEventListener('blur', () => { normalizePool(); window.toggleSkillPointEdit(false); });
    }
    const ranksChanged = syncSkillRankCap(true);
    applySkillEditMode(false);
    if(ranksChanged && currentSummonId && !isRemoteUpdate) save(true);
}
function refreshCombatUi() {
    syncSizeFields();
    computeDerivedStats();
    renderSelectedCombatDisplays();
}

function loadCurrentSheet() {
    const data = getActiveData();
    stripLimitBreakAbilityEntries(data);

    document.getElementById('sheetTitle').textContent = "Character Sheet";
    document.getElementById('btnAddSummon').style.display = 'block';
    document.getElementById('btnAddSummon').textContent = '+ Add Character';
    document.getElementById('btnAddSummon').onclick = createNewSummon;
    document.getElementById('btnDeleteSummon').style.display = currentSummonId ? 'block' : 'none';
    document.getElementById('btnDeleteSummon').textContent = 'Delete Character';
    document.getElementById('btnDeleteSummon').onclick = deleteCurrentSummon;
    document.querySelectorAll('.tab-btn').forEach(b => b.style.display = '');
    document.getElementById('spellsSubBtn').style.display = 'block';
    document.getElementById('btn-sub-passive').style.display = 'block';
    
    switchSub(localStorage.getItem('activeCombatSub') || 'c-general');
    switchSubSub(localStorage.getItem('activeAbilSub') || 'a-active');

    document.querySelectorAll('.live-field').forEach(el => { el.value = (data[el.id] !== undefined) ? data[el.id] : ""; });
    if(!document.getElementById('character_level').value) document.getElementById('character_level').value = '1';

    if(data.hp !== undefined && !document.getElementById('hp_curr').value) document.getElementById('hp_curr').value = data.hp;
    if(data.init !== undefined && !document.getElementById('init_temp').value) document.getElementById('init_temp').value = data.init;
    if(!document.getElementById('size_category').value) document.getElementById('size_category').value = data.size || data.size_category || 'Medium';
    if(!document.getElementById('ar_melee_ability').value) document.getElementById('ar_melee_ability').value = 'str';
    if(!document.getElementById('ar_ranged_ability').value) document.getElementById('ar_ranged_ability').value = 'dex';
    if(!document.getElementById('ar_touch_ability').value) document.getElementById('ar_touch_ability').value = 'str';
    if(!document.getElementById('ar_ranged_touch_ability').value) document.getElementById('ar_ranged_touch_ability').value = 'dex';
    document.querySelectorAll('textarea.live-field').forEach(tx => {
        autoExpand(tx);
        if (tx.dataset.autoExpandBound !== '1') {
            tx.dataset.autoExpandBound = '1';
            tx.addEventListener('input', () => autoExpand(tx));
        }
    });

    try { if (typeof maFfd20MoveRaceEffectsToRacial === 'function') maFfd20MoveRaceEffectsToRacial(data); } catch (e) {}
    renderWeapons(); renderSpells(); renderAbilities('active'); renderAbilities('passive'); renderAbilities('racial'); renderAbilities('feat'); renderItems();
    if (typeof refreshMpDisplays === 'function') refreshMpDisplays();
    refreshCombatUi();
    
    if(data.skills) {
        const rows = document.querySelectorAll('#skillsTableBody tr');
        rows.forEach(r => { r.querySelector('.skill-cs').checked = false; r.querySelector('.skill-temp').value = ""; r.querySelector('.skill-ranks').value = ""; if(r.querySelector('.skill-custom-input')) r.querySelector('.skill-custom-input').value = ""; });
        const rowsBySkillKey = new Map(Array.from(rows).map(row => [row.dataset.skillKey || '', row]));
        data.skills.forEach((s, i) => {
            const savedKey = String(s?.skillKey || s?.key || '');
            const row = (savedKey && rowsBySkillKey.get(savedKey)) || rows[i];
            if(row) {
                row.querySelector('.skill-cs').checked = !!s.cs;
                row.querySelector('.skill-temp').value = (s.temp ?? 0);
                row.querySelector('.skill-ranks').value = (s.lvl ?? s.ranks ?? 0);
                if(row.querySelector('.skill-custom-input')) row.querySelector('.skill-custom-input').value = s.subName || '';
            }
        });
    }
    if(!document.getElementById('ac_view_mode')?.value) document.getElementById('ac_view_mode').value = 'ac';
    if(!document.getElementById('ar_view_mode')?.value) document.getElementById('ar_view_mode').value = 'melee';
    syncSkillStateAfterLoad();
    if (typeof updateCalcs === 'function') updateCalcs();
    refreshCombatUi();
    setTimeout(refreshCombatUi, 40);
    setTimeout(refreshCombatUi, 200);
    renderNotesList();
    bindCriticalFieldPersistence();
    initAbilityDrawerDrag();
    updateSlotUsageDisplay();
    if(
        document.getElementById('other')?.classList.contains('active') &&
        document.getElementById('other-calendar')?.classList.contains('active')
    ) loadPlayerCalendars();
    try { window.maCharacterRefreshAbilityScoreMirrors?.('load-current-sheet'); } catch(e) {}
}

function autoExpand(el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight + 5) + 'px'; }

const listContainerIds = { weapon: 'weaponList', spell: 'spellList', active: 'activeList', passive: 'passiveList', racial: 'racialList', feat: 'featList', item: 'itemList' };
function abilityCollectionKey(type) {
    if(type === 'active') return 'activeAbilities';
    if(type === 'passive') return 'passiveAbilities';
    if(type === 'racial') return 'racialAbilities';
    if(type === 'feat') return 'feats';
    return type + 's';
}
function abilityCollectionLabel(type) {
    if(type === 'active') return 'Active Ability';
    if(type === 'passive') return 'Passive Ability';
    if(type === 'racial') return 'Racial Ability';
    if(type === 'feat') return 'Feat';
    return type;
}

let currentItemView = 'storage';


const ABILITY_DRAWER_STORAGE_KEY = 'mountAetheriaAbilityDrawerPlayer';
function getAbilityDrawerState() {
  try {
    const raw = localStorage.getItem(ABILITY_DRAWER_STORAGE_KEY);
    if(!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}
function setAbilityDrawerState(nextState) {
  try { localStorage.setItem(ABILITY_DRAWER_STORAGE_KEY, JSON.stringify(nextState)); } catch (e) {}
}
function clampAbilityDrawerPosition(left, top) {
  const drawer = document.getElementById('abilityDrawer');
  const width = drawer?.offsetWidth || Math.min(window.innerWidth - 16, 320);
  const height = drawer?.offsetHeight || Math.min(window.innerHeight - 100, 320);
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(58, window.innerHeight - height - 8);
  return {
    left: Math.min(Math.max(8, Number.isFinite(left) ? left : maxLeft), maxLeft),
    top: Math.min(Math.max(58, Number.isFinite(top) ? top : 86), maxTop)
  };
}
function defaultAbilityDrawerState() {
  const drawer = document.getElementById('abilityDrawer');
  const width = drawer?.offsetWidth || Math.min(window.innerWidth - 16, 320);
  const defaultLeft = window.innerWidth <= 700 ? 8 : Math.max(8, window.innerWidth - width - 18);
  const defaultTop = window.innerWidth <= 700 ? 76 : 86;
  return clampAbilityDrawerPosition(defaultLeft, defaultTop);
}
function applyAbilityDrawerState(state = {}) {
  const drawer = document.getElementById('abilityDrawer');
  const button = document.getElementById('abilityDrawerToggle');
  if(!drawer) return;
  const isOpen = !!state.open;
  if(isOpen) {
    const pos = (Number.isFinite(state.left) && Number.isFinite(state.top))
      ? clampAbilityDrawerPosition(Number(state.left), Number(state.top))
      : defaultAbilityDrawerState();
    drawer.style.left = pos.left + 'px';
    drawer.style.top = pos.top + 'px';
    drawer.style.right = 'auto';
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if(button) button.classList.add('active');
  } else {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if(button) button.classList.remove('active');
  }
}
function ensureAbilityDrawerInit() {
  const drawer = document.getElementById('abilityDrawer');
  const handle = document.getElementById('abilityDrawerHandle');
  if(!drawer || !handle || drawer.dataset.drawerReady === '1') return;
  drawer.dataset.drawerReady = '1';
  applyAbilityDrawerState(getAbilityDrawerState());

  let dragging = false;
  let pointerId = null;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  const onPointerMove = (e) => {
    if(!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    const next = clampAbilityDrawerPosition(startLeft + (e.clientX - startX), startTop + (e.clientY - startY));
    drawer.style.left = next.left + 'px';
    drawer.style.top = next.top + 'px';
    drawer.style.right = 'auto';
  };
  const endDrag = (e) => {
    if(!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    dragging = false;
    try { handle.releasePointerCapture?.(pointerId); } catch (err) {}
    pointerId = null;
    const saved = getAbilityDrawerState();
    const next = clampAbilityDrawerPosition(parseFloat(drawer.style.left), parseFloat(drawer.style.top));
    setAbilityDrawerState({ ...saved, open: drawer.classList.contains('open'), left: next.left, top: next.top });
  };

  handle.addEventListener('pointerdown', (e) => {
    if(e.button !== undefined && e.button !== 0) return;
    if(e.target.closest('.ability-drawer-close')) return;
    if(!drawer.classList.contains('open')) return;
    dragging = true;
    pointerId = e.pointerId ?? null;
    startX = e.clientX;
    startY = e.clientY;
    const rect = drawer.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    try { handle.setPointerCapture?.(pointerId); } catch (err) {}
    e.preventDefault();
  });

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', endDrag, { passive: true });
  window.addEventListener('pointercancel', endDrag, { passive: true });
  window.addEventListener('resize', () => {
    const current = getAbilityDrawerState();
    if(!current.open) return;
    const pos = clampAbilityDrawerPosition(parseFloat(drawer.style.left), parseFloat(drawer.style.top));
    const next = { ...current, left: pos.left, top: pos.top };
    setAbilityDrawerState(next);
    applyAbilityDrawerState(next);
  }, { passive: true });
}
window.toggleAbilityDrawer = (force) => {
  ensureAbilityDrawerInit();
  renderAbilityDrawerScores();
  const current = getAbilityDrawerState();
  const shouldOpen = (typeof force === 'boolean') ? force : !document.getElementById('abilityDrawer')?.classList.contains('open');
  const next = { ...current, open: shouldOpen };
  if(shouldOpen && (!Number.isFinite(next.left) || !Number.isFinite(next.top))) {
    const pos = defaultAbilityDrawerState();
    next.left = pos.left;
    next.top = pos.top;
  }
  setAbilityDrawerState(next);
  applyAbilityDrawerState(next);
};

function initAbilityDrawerDrag() { ensureAbilityDrawerInit(); }

function renderAbilityDrawerScores() {
  ensureAbilityDrawerInit();
  const body = document.getElementById('abilityDrawerBody');
  if(!body) return;
  const stats = ['str','dex','con','int','wis','cha'];
  body.innerHTML = stats.map(stat => {
    const scoreEl = document.getElementById(stat);
    const modEl = document.getElementById('mod-' + stat);
    const score = scoreEl && scoreEl.value !== '' ? scoreEl.value : '0';
    const mod = modEl ? modEl.textContent : '+0';
    return `<tr><td class="drawer-stat">${stat}</td><td>${score}</td><td>${mod}</td></tr>`;
  }).join('');
}

window.setItemView = (view) => {
    currentItemView = view;
    ['storage','equipped'].forEach(v => {
        const btn = document.getElementById('itemView-' + v);
        if(btn) btn.classList.toggle('active', v === view);
    });
    renderItems();
};

function getItemAmount(item) {
    const amt = Number(item?.amount);
    return Number.isFinite(amt) && amt > 0 ? amt : 1;
}
function getItemSlot(item) {
    const val = Number(item?.slot);
    return Number.isFinite(val) && val >= 0 ? val : 1;
}
function getSlotCap() {
    const data = (typeof getActiveData === 'function') ? getActiveData() : {};
    const raw = document.getElementById('slot_cap')?.value || data.slot_cap || 20;
    const cap = Number(raw);
    return Number.isFinite(cap) && cap > 0 ? cap : 20;
}
function formatSlotNumber(value) {
    const num = Number(value);
    if(!Number.isFinite(num)) return '0';
    const rounded = Math.round(num * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
function updateSlotUsageDisplay() {
    const data = getActiveData();
    const items = data.items || [];
    const used = items.filter(i => !i.equipped).reduce((sum, item) => sum + (getItemAmount(item) * getItemSlot(item)), 0);
    const cap = getSlotCap();
    const display = document.getElementById('slotUsageDisplay');
    if(display) {
        display.textContent = `${formatSlotNumber(used)}/${formatSlotNumber(cap)}`;
        display.classList.toggle('over', used > cap);
    }
}
window.toggleItemEquipped = (idx, checked) => {
    const items = getActiveData().items || [];
    if(!items[idx]) return;
    items[idx].equipped = !!checked;
    refreshList('item');
    if (typeof triggerSave === 'function') triggerSave(); else saveDataOnly();
};

function ensureItemImagePreviewPanel() {
    let panel = document.getElementById('itemImagePreviewPanel');
    if(panel) return panel;
    panel = document.createElement('aside');
    panel.id = 'itemImagePreviewPanel';
    panel.className = 'item-image-preview-panel';
    document.body.appendChild(panel);
    return panel;
}
function hideItemImagePreview() {
    const panel = document.getElementById('itemImagePreviewPanel');
    if(panel) {
        panel.classList.remove('show');
        panel.innerHTML = '';
    }
}
function positionItemImagePreviewPanel() {
    const panel = document.getElementById('itemImagePreviewPanel');
    const viewModal = document.getElementById('viewModal');
    const modalContent = viewModal ? viewModal.querySelector('.modal-content') : null;
    if(!panel || !panel.classList.contains('show') || !modalContent) return;
    const gap = 16;
    const margin = 14;
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
    const rect = modalContent.getBoundingClientRect();
    const roomRight = viewportW - rect.right - gap - margin;
    const roomLeft = rect.left - gap - margin;
    const desiredWidth = Math.min(320, Math.max(220, Math.floor(viewportW * 0.26)));

    let width = desiredWidth;
    let left;
    if(roomRight >= 220 || roomRight >= roomLeft) {
        width = Math.max(180, Math.min(desiredWidth, roomRight));
        left = rect.right + gap;
    } else {
        width = Math.max(180, Math.min(desiredWidth, roomLeft));
        left = rect.left - gap - width;
    }
    panel.style.width = `${width}px`;

    // Measure after width is set so the image panel can be centered beside the item overlay.
    const panelRect = panel.getBoundingClientRect();
    left = Math.min(Math.max(margin, left), Math.max(margin, viewportW - panelRect.width - margin));
    const top = Math.min(
        Math.max(margin, rect.top + (rect.height - panelRect.height) / 2),
        Math.max(margin, viewportH - panelRect.height - margin)
    );
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

function showItemImagePreviewForView(item = {}) {
    const img = itemCleanText(itemImageUrlValue(item));
    if(!img || !window.matchMedia || !window.matchMedia('(min-width: 901px)').matches) {
        hideItemImagePreview();
        return;
    }

    const panel = ensureItemImagePreviewPanel();

    // Hide until the image has loaded, so the first position uses the real image height.
    panel.style.visibility = 'hidden';
    panel.innerHTML = `
        <div class="item-image-preview-title">${itemEsc(item.name || 'Item Image')}</div>
        <img src="${itemEsc(img)}" alt="${itemEsc(item.name || 'Item image')}">
    `;

    panel.classList.add('show');

    const imgEl = panel.querySelector('img');

    const revealCentered = () => {
        requestAnimationFrame(() => {
            positionItemImagePreviewPanel();
            panel.style.visibility = 'visible';
        });
    };

    imgEl?.addEventListener('load', revealCentered, { once: true });
    imgEl?.addEventListener('error', () => {
        panel.classList.remove('show');
        panel.style.visibility = 'visible';
    }, { once: true });

    // Handles cached images that are already loaded.
    if(imgEl?.complete && imgEl.naturalWidth > 0) {
        revealCentered();
    }
}
window.addEventListener('resize', positionItemImagePreviewPanel);
window.closeViewModal = () => {
    const viewModal = document.getElementById('viewModal');
    if(viewModal) viewModal.style.display = 'none';
    hideItemImagePreview();
};

window.openView = (type, index) => {
    // Prevent view from opening if we are dragging
    if(isDragging) return;
    const data = getActiveData();
    let col = ['active','passive','racial','feat'].includes(type) ? abilityCollectionKey(type) : type + 's';
    currentViewContext = { type, index, col };
    populateViewModal(type, data[col][index], index);
};

window.openEditor = (type, index) => {
    const data = getActiveData();
    let col = ['active','passive','racial','feat'].includes(type) ? abilityCollectionKey(type) : type + 's';
    populateEditorModal(type, data[col][index], index, col);
};

function normalizeWeaponData(item = {}) {
    const attrs = Array.isArray(item.attrs) ? item.attrs : [];
    const attrMap = {};
    attrs.forEach(entry => {
        const key = String(entry?.name || '').trim().toLowerCase();
        if (!key) return;
        attrMap[key] = entry?.val ?? '';
    });
    const pickAttr = (...keys) => {
        for (const key of keys) {
            const hit = attrMap[String(key).trim().toLowerCase()];
            if (hit !== undefined && hit !== null && String(hit).trim() !== '') return hit;
        }
        return '';
    };
    const normalized = {
        ...item,
        name: item.name || '',
        ability_mod: item.ability_mod || item.mod || pickAttr('ability modifier', 'modifier', 'mod') || 'STR',
        attack_misc: item.attack_misc ?? pickAttr('attack misc', 'misc', 'attack bonus', 'attack'),
        damage: item.damage ?? pickAttr('damage', 'dmg'),
        type: item.type ?? pickAttr('type'),
        crit_range: item.crit_range || pickAttr('crit range', 'critical range') || '20',
        crit_mult: item.crit_mult || item.crit_dmg || pickAttr('crit dmg', 'crit mult', 'crit multiplier') || 'x2',
        range: item.range ?? pickAttr('range'),
        ammo: item.ammo ?? pickAttr('ammo')
    };
    normalized.mod = normalized.ability_mod;
    return normalized;
}

function signedNumberText(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return '+0';
    return num > 0 ? `+${num}` : `${num}`;
}

function shouldShowWeaponAmmo(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function renderWeapons() {
    const data = getActiveData().weapons || [];
    const list = document.getElementById('weaponList');
    if (!list) return;
    list.innerHTML = '';
    data.forEach((w, i) => {
        const weapon = normalizeWeaponData(w);
        Object.assign(w, weapon);
        const div = document.createElement('div');
        div.className = 'list-row';
        const typeMeta = weapon.type ? `<span class="weapon-meta-chip">${chatEscapeHtml(weapon.type)}</span>` : '';
        const dmgMeta = weapon.damage ? `<span class="weapon-meta-chip">${chatEscapeHtml(weapon.damage)}</span>` : '';
        const rangeMeta = weapon.range ? `<span class="weapon-meta-chip">Range ${chatEscapeHtml(String(weapon.range))}</span>` : '';
        const ammoHtml = shouldShowWeaponAmmo(weapon.ammo)
          ? `<label class="weapon-ammo-inline" title="Current ammo"><span>Ammo</span><input type="number" value="${chatEscapeHtml(String(weapon.ammo))}" onchange="event.stopPropagation(); updateWeaponAmmo(${i}, this.value)" onclick="event.stopPropagation()"></label>`
          : '';
        div.innerHTML = `
          <div class="row-content" onclick="openView('weapon',${i})">
            <span class="list-row-title">${chatEscapeHtml(weapon.name || 'New Weapon')}</span>
            <span class="weapon-meta-line">${typeMeta}${dmgMeta}${rangeMeta}</span>
          </div>
          <div class="row-actions weapon-row-actions">
            <button class="roll-icon-btn" type="button" onclick="event.stopPropagation(); rollWeaponAttack(${i})" title="Roll weapon attack and damage">🎲</button>
            <button class="chat-icon-btn" type="button" onclick="event.stopPropagation(); sendWeaponCard(${i})" title="Send weapon to chat">💬</button>
            ${ammoHtml}
            <button class="btn-edit" onclick="event.stopPropagation(); openEditor('weapon',${i})">Edit</button>
          </div>`;
        list.appendChild(div);
    });
}


function spellLevelToNumber(level){
    const map = { "Cantrip":0, "0":0, "1st":1, "2nd":2, "3rd":3, "4th":4, "5th":5, "6th":6, "7th":7, "8th":8, "9th":9 };
    if(level in map) return map[level];
    const n = Number(level);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}
function spellLevelLabel(levelNum){
    if(levelNum === 0) return 'Cantrip';
    return `${levelNum}${levelNum === 1 ? 'st' : levelNum === 2 ? 'nd' : levelNum === 3 ? 'rd' : 'th'}`;
}

const MP_BONUS_TABLE = [
  { min:-Infinity, max:9, values:null },
  { min:10, max:11, values:[0,0,0,0,0,0,0,0,0] },
  { min:12, max:13, values:[1,1,1,1,1,1,1,1,1] },
  { min:14, max:15, values:[1,3,3,3,3,3,3,3,3] },
  { min:16, max:17, values:[1,3,6,6,6,6,6,6,6] },
  { min:18, max:19, values:[1,3,6,10,10,10,10,10,10] },
  { min:20, max:21, values:[2,4,7,11,16,16,16,16,16] },
  { min:22, max:23, values:[2,6,9,13,18,24,24,24,24] },
  { min:24, max:25, values:[2,6,12,16,21,27,34,34,34] },
  { min:26, max:27, values:[2,6,12,20,25,31,38,46,46] },
  { min:28, max:29, values:[3,7,13,21,31,37,44,52,61] },
  { min:30, max:31, values:[3,9,15,23,33,45,52,60,69] },
  { min:32, max:33, values:[3,9,18,26,36,48,62,70,79] },
  { min:34, max:35, values:[3,9,18,30,40,52,66,82,91] },
  { min:36, max:37, values:[4,10,19,31,46,58,72,88,106] },
  { min:38, max:39, values:[4,12,21,33,48,66,80,96,114] },
  { min:40, max:41, values:[4,12,24,36,51,69,90,106,124] },
  { min:42, max:43, values:[4,12,24,40,55,73,94,118,136] },
  { min:44, max:Infinity, values:[5,13,25,41,61,79,100,124,151] }
];
let maMpLibraryLoadRequested = false;
let maMpInitializedForCharacter = '';
function maMpNumber(value, fallback = 0){
    if(value === '' || value === null || value === undefined) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function getSpellBaseKey(){
    const raw = String(document.getElementById('spell_dc_base')?.value || getActiveData()?.spell_dc_base || 'int').trim().toLowerCase();
    return ['str','dex','con','int','wis','cha'].includes(raw) ? raw : 'int';
}
function getSpellBaseScore(){
    const key = getSpellBaseKey();
    const raw = document.getElementById(key)?.value || getActiveData()?.[key] || 10;
    const score = Number(raw);
    return Number.isFinite(score) ? score : 10;
}
function maMpBonusFor(score, maxSpellLevel){
    const lvl = Math.max(0, Math.min(9, Math.trunc(Number(maxSpellLevel) || 0)));
    if(lvl <= 0) return 0;
    const row = MP_BONUS_TABLE.find(r => score >= r.min && score <= r.max);
    if(!row || !row.values) return 0;
    return Number(row.values[lvl - 1] || 0) || 0;
}
function maMpParseProgressionSpecial(special){
    const text = String(special || '');
    const re = /(\d+)\s+(1st|2nd|3rd|4th|5th|6th|7th|8th|9th)\b/ig;
    let match, last = null;
    while((match = re.exec(text))) last = { mp:Number(match[1]) || 0, maxSpellLevel:spellLevelToNumber(match[2]) };
    return last || { mp:0, maxSpellLevel:0 };
}
function maMpClassProgress(cls, level){
    const lvl = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
    const rows = Array.isArray(cls?.progression) ? cls.progression : [];
    const exact = rows.find(r => Number(r?.level) === lvl) || [...rows].reverse().find(r => Number(r?.level) <= lvl);
    if(!exact) return { mp:0, maxSpellLevel:0 };
    if(exact.mp !== undefined || exact.classMp !== undefined || exact.magicPoints !== undefined) {
        return { mp:maMpNumber(exact.mp ?? exact.classMp ?? exact.magicPoints, 0), maxSpellLevel:maMpNumber(exact.maxSpellLevel ?? exact.spellLevel ?? 0, 0) };
    }
    return maMpParseProgressionSpecial(exact.special);
}
function maMpAutoClassInfo(){
    const lib = maFfd20Library;
    const data = getActiveData() || {};
    if(!lib || !Array.isArray(lib.classes)) {
        if(!maMpLibraryLoadRequested && typeof maFfd20LoadLibrary === 'function') {
            maMpLibraryLoadRequested = true;
            maFfd20LoadLibrary().then(() => { maMpLibraryLoadRequested = false; computeDerivedStats(); save(); }).catch(() => { maMpLibraryLoadRequested = false; });
        }
        return { classMp:maMpNumber(document.getElementById('mp_class')?.value || data.mp_class, 0), maxSpellLevel:maMpNumber(document.getElementById('mp_max_spell_level')?.value || data.mp_max_spell_level, 0) };
    }
    const sources = [];
    const primaryName = document.getElementById('class')?.value || data.class || data.className || '';
    const primaryLevel = document.getElementById('character_level')?.value || data.character_level || data.level || 1;
    if(primaryName) sources.push({ name:primaryName, level:primaryLevel });
    (Array.isArray(data.multiclasses) ? data.multiclasses : []).forEach(mc => {
        const name = mc?.className || mc?.class || mc?.name || '';
        if(name) sources.push({ name, level:mc?.level || 1 });
    });
    let classMp = 0;
    let maxSpellLevel = 0;
    sources.forEach(source => {
        const cls = maFfd20Find(lib.classes, source.name);
        if(!cls) return;
        const info = maMpClassProgress(cls, source.level);
        classMp += Number(info.mp || 0) || 0;
        maxSpellLevel = Math.max(maxSpellLevel, Number(info.maxSpellLevel || 0) || 0);
    });
    return { classMp, maxSpellLevel };
}
function maMpApplyAutoValues(){
    const data = getActiveData() || {};
    const info = maMpAutoClassInfo();
    const classMp = Math.max(0, Math.trunc(info.classMp || 0));
    const maxSpellLevel = Math.max(0, Math.min(9, Math.trunc(info.maxSpellLevel || 0)));
    const score = getSpellBaseScore();
    const bonusMp = maMpBonusFor(score, maxSpellLevel);
    setVal('mp_class', classMp);
    setVal('mp_bonus', bonusMp);
    setVal('mp_max_spell_level', maxSpellLevel);
    const maxTempEl = document.getElementById('mp_max_temp');
    const maxTemp = maMpNumber(maxTempEl ? maxTempEl.value : data.mp_max_temp, 0);
    const totalMax = Math.max(0, classMp + bonusMp + maxTemp);
    const charKey = currentSummonId || data.id || data.charName || 'active';
    const currentMpEl = document.getElementById('mp');
    const tempMpEl = document.getElementById('mp_temp');
    const hasSavedMp = data.mp !== undefined && data.mp !== null && String(data.mp).trim() !== '';
    const hasSavedTemp = data.mp_temp !== undefined && data.mp_temp !== null && String(data.mp_temp).trim() !== '';
    const shouldInit = currentMpEl && !hasSavedMp && !hasSavedTemp && totalMax > 0 && maMpInitializedForCharacter !== charKey;
    if(shouldInit) {
        currentMpEl.value = String(totalMax);
        if(tempMpEl && !tempMpEl.value) tempMpEl.value = '0';
        maMpInitializedForCharacter = charKey;
    }
    const current = maMpNumber(currentMpEl ? currentMpEl.value : data.mp, 0) + maMpNumber(tempMpEl ? tempMpEl.value : data.mp_temp, 0);
    setVal('mp_curr', current);
    setVal('mp_total_max', totalMax);
    return { current, totalMax, classMp, bonusMp, maxTemp, maxSpellLevel, score };
}
function maMpRenderDisplays(info){
    const m = info || maMpApplyAutoValues();
    const plain = (value) => String(Math.trunc(Number(value) || 0));
    [['mpDisplayCurrent',m.current],['spellMpDisplayCurrent',m.current],['mpDisplayMax',m.totalMax],['spellMpDisplayMax',m.totalMax]].forEach(([id,value]) => { const el=document.getElementById(id); if(el) el.textContent = plain(value); });
    const breakdown = document.getElementById('spellMpBreakdown');
    if(breakdown) breakdown.textContent = `Class ${plain(m.classMp)} + Bonus ${plain(m.bonusMp)}${m.maxTemp ? ` + Temp Max ${plain(m.maxTemp)}` : ''}`;
}
function refreshMpDisplays(){
    try { maMpRenderDisplays(maMpApplyAutoValues()); } catch(e) { console.warn('MP refresh failed', e); }
}
window.refreshMpDisplays = refreshMpDisplays;

function maSpellMpCost(spell){
    return Math.max(0, Math.min(9, spellLevelToNumber(spell?.lvl)));
}
function maSpellCurrentMp(){
    const data = getActiveData() || {};
    const mpEl = document.getElementById('mp');
    const tempEl = document.getElementById('mp_temp');
    return Math.max(0, Math.trunc(maMpNumber(mpEl ? mpEl.value : data.mp, 0) + maMpNumber(tempEl ? tempEl.value : data.mp_temp, 0)));
}
function maSpellCanUse(spell){
    return maSpellCurrentMp() >= maSpellMpCost(spell);
}
function maSpellSpendMp(cost){
    const spend = Math.max(0, Math.trunc(Number(cost) || 0));
    if(spend <= 0) return true;
    const mpEl = document.getElementById('mp');
    const tempEl = document.getElementById('mp_temp');
    const data = getActiveData() || {};
    let base = Math.max(0, maMpNumber(mpEl ? mpEl.value : data.mp, 0));
    let temp = Math.max(0, maMpNumber(tempEl ? tempEl.value : data.mp_temp, 0));
    if(base + temp < spend) return false;
    const fromTemp = Math.min(temp, spend);
    temp -= fromTemp;
    base = Math.max(0, base - (spend - fromTemp));
    if(tempEl) tempEl.value = String(Math.trunc(temp));
    if(mpEl) mpEl.value = String(Math.trunc(base));
    if(data){ data.mp_temp = Math.trunc(temp); data.mp = Math.trunc(base); }
    refreshMpDisplays();
    return true;
}
function useSpellByIndex(index){
    const list = getActiveData().spells || [];
    const spell = list[index];
    if(!spell) return;
    const cost = maSpellMpCost(spell);
    if(!maSpellCanUse(spell)) {
        renderSpells();
        if(typeof showUsageOverlay === 'function') showUsageOverlay(spell.name || 'Spell', `Need ${cost} MP`);
        return;
    }
    maSpellSpendMp(cost);
    if(typeof save === 'function') save(true);
    else if(typeof saveDataOnly === 'function') saveDataOnly();
    else if(typeof triggerSave === 'function') triggerSave();
    renderSpells();
    const hasDiceRoll = String(spell?.damage || '').trim() !== '';
    if(hasDiceRoll && typeof rollSpellAction === 'function') {
        rollSpellAction(index);
    } else {
        if(typeof sendSpellCard === 'function') sendSpellCard(index);
        if(typeof showUsageOverlay === 'function') showUsageOverlay(spell.name || 'Spell', cost > 0 ? `${cost} MP Used` : 'Spell Used');
    }
}
window.useSpellByIndex = useSpellByIndex;
function getSpellDcBaseValue(){
    const raw = String(document.getElementById('spell_dc_base')?.value || 'int').trim().toLowerCase();
    if(['str','dex','con','int','wis','cha'].includes(raw)) return getMod(raw);
    const parsed = Number(raw.replace(/[^0-9+\-\.]/g, ''));
    return Number.isFinite(parsed) ? parsed : getMod('int');
}
function spellDcDisplayValue(spell){
    return 10 + getSpellDcBaseValue() + spellLevelToNumber(spell?.lvl);
}
function spellHeaderFormula(levelNum){
    return `DC ${10 + getSpellDcBaseValue() + levelNum}`;
}
function normalizeAttackModeValue(value){
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}
function attackFormulaPartsForMode(mode){
    const babTotal = numVal('bab') + numVal('bab_temp');
    const sizeMod = numVal('size_mod');
    const sizeSpecial = numVal('size_special');
    if(mode === 'melee') {
        const ability = getAttackAbility('ar_melee_ability', 'str');
        return [
            { label: 'BAB', value: babTotal },
            { label: abilityModLabel(ability), value: modFor(ability) },
            { label: 'Size', value: sizeMod },
            { label: 'Temp', value: numVal('ar_melee_temp') }
        ];
    }
    if(mode === 'ranged') {
        const ability = getAttackAbility('ar_ranged_ability', 'dex');
        return [
            { label: 'BAB', value: babTotal },
            { label: abilityModLabel(ability), value: modFor(ability) },
            { label: 'Size', value: sizeMod },
            { label: 'Temp', value: numVal('ar_ranged_temp') }
        ];
    }
    if(mode === 'touch') {
        const ability = getAttackAbility('ar_touch_ability', 'str');
        return [
            { label: 'BAB', value: babTotal },
            { label: abilityModLabel(ability), value: modFor(ability) },
            { label: 'Size', value: sizeMod },
            { label: 'Temp', value: numVal('ar_touch_temp') }
        ];
    }
    if(mode === 'ranged_touch') {
        const ability = getAttackAbility('ar_ranged_touch_ability', 'dex');
        return [
            { label: 'BAB', value: babTotal },
            { label: abilityModLabel(ability), value: modFor(ability) },
            { label: 'Size', value: sizeMod },
            { label: 'Temp', value: numVal('ar_ranged_touch_temp') }
        ];
    }
    if(mode === 'cmb') {
        return [
            { label: 'BAB', value: babTotal },
            { label: 'STR Mod', value: modFor('str') },
            { label: 'DEX Mod', value: modFor('dex') },
            { label: 'Size Special', value: sizeSpecial },
            { label: 'Temp', value: numVal('cmb_temp') }
        ];
    }
    return [];
}
function attackConfigFromMode(mode){
    const map = {
        melee: { label: 'Melee', id: 'ar_total' },
        ranged: { label: 'Ranged', id: 'ar_ranged_total' },
        touch: { label: 'Touch', id: 'ar_touch_total' },
        ranged_touch: { label: 'Ranged Touch', id: 'ar_ranged_touch_total' },
        cmb: { label: 'CMB', id: 'cmb' }
    };
    const cfg = map[mode];
    if(!cfg) return null;
    const parts = attackFormulaPartsForMode(mode);
    const computedTotal = calcPartList(parts).reduce((sum, part) => sum + calcNumber(part.value), 0);
    const fallbackTotal = readNumericValue(cfg.id, 0);
    return { mode, label: cfg.label, total: Number.isFinite(computedTotal) ? computedTotal : fallbackTotal, parts };
}
function spellAttackMode(spell){
    const raw = normalizeAttackModeValue(spell?.attack_type);
    if(raw === 'touch') return 'touch';
    if(raw === 'ranged_touch') return 'ranged_touch';
    return null;
}
function spellIsRollable(spell){
    return !!spellAttackMode(spell) || String(spell?.damage || '').trim() !== '';
}
function spellAttackConfig(spell){
    return attackConfigFromMode(spellAttackMode(spell));
}
function abilityAttackMode(item){
    const raw = normalizeAttackModeValue(item?.attack_type);
    if(['melee','ranged','touch','ranged_touch','cmb'].includes(raw)) return raw;
    return null;
}
function abilityIsRollable(item){
    return !!abilityAttackMode(item) || String(item?.damage || '').trim() !== '';
}
function abilityAttackConfig(item){
    return attackConfigFromMode(abilityAttackMode(item));
}


function isSpellGroupOpen(levelNum){
    const key = `spellGroupOpen:${levelNum}`;
    const saved = localStorage.getItem(key);
    return saved === null ? true : saved === '1';
}
function toggleSpellGroup(levelNum){
    const next = !isSpellGroupOpen(levelNum);
    localStorage.setItem(`spellGroupOpen:${levelNum}`, next ? '1' : '0');
    const head = document.querySelector(`.spell-level-head[data-spell-level="${levelNum}"]`);
    const group = head ? head.closest('.spell-level-group') : null;
    const body = group ? group.querySelector('.spell-level-body') : null;
    const icon = head ? head.querySelector('.spell-level-toggle') : null;
    if(head) head.setAttribute('aria-expanded', next ? 'true' : 'false');
    if(icon) icon.textContent = next ? '▾' : '▸';
    if(body) body.hidden = !next;
    else renderSpells();
}
window.toggleSpellGroup = toggleSpellGroup;


const SPELL_LEVEL_TAB_KEY = 'mountAetheriaSelectedSpellLevel';
function selectedSpellLevel() {
    let saved = 0;
    try { saved = Number(localStorage.getItem(SPELL_LEVEL_TAB_KEY)); } catch (_err) { saved = 0; }
    if (!Number.isFinite(saved)) saved = 0;
    return Math.max(0, Math.min(9, Math.trunc(saved)));
}
function setSelectedSpellLevel(levelNum) {
    const next = Math.max(0, Math.min(9, Math.trunc(Number(levelNum) || 0)));
    try { localStorage.setItem(SPELL_LEVEL_TAB_KEY, String(next)); } catch (_err) {}
    renderSpells();
}
window.setSelectedSpellLevel = setSelectedSpellLevel;
function renderSpellLevelTabs(data) {
    const tabs = document.getElementById('spellLevelTabs');
    if (!tabs) return;
    const selected = selectedSpellLevel();
    tabs.innerHTML = '';
    for (let levelNum = 0; levelNum <= 9; levelNum++) {
        const count = data.filter(spell => spellLevelToNumber(spell?.lvl) === levelNum).length;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `spell-level-tab${levelNum === selected ? ' active' : ''}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', levelNum === selected ? 'true' : 'false');
        button.onclick = () => setSelectedSpellLevel(levelNum);
        button.innerHTML = `
          <span class="spell-level-tab-name">${spellLevelLabel(levelNum)}</span>
          <span class="spell-level-tab-dc">${spellHeaderFormula(levelNum)}</span>
          <span class="spell-level-tab-count" aria-label="${count} spells">${count}</span>
        `;
        tabs.appendChild(button);
    }
}


const MA_ACTION_TYPE_OPTIONS = ["Standard","Move","Swift","Full Round","Free","Immediate","Other"];
function maNormalizeActionType(value) {
    const raw = String(value ?? '').trim();
    const text = raw.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    if(!text) return 'Standard';
    if(text.includes('immediate') || text.includes('imed')) return 'Immediate';
    if(text.includes('swift')) return 'Swift';
    if(text.includes('move')) return 'Move';
    if(text.includes('full') || text === 'round' || text.includes(' round')) return 'Full Round';
    if(text.includes('free')) return 'Free';
    if(text.includes('standard')) return 'Standard';
    return 'Other';
}
function maActionTypeKey(value) {
    return maNormalizeActionType(value).toLowerCase().replace(/\s+/g, '-');
}
function maActionTypeSymbol(value) {
    switch(maNormalizeActionType(value)) {
        case 'Standard': return '●';
        case 'Swift': return '▲';
        case 'Full Round': return '◆';
        case 'Move': return '▶';
        case 'Free': return '○';
        case 'Immediate': return 'ϟ';
        default: return '■';
    }
}
function maActionEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function maActionTypeBadgeHtml(value) {
    const label = maNormalizeActionType(value);
    const key = maActionTypeKey(label);
    return `<span class="action-type-badge action-${key}" title="${maActionEsc(label)} Action" aria-label="${maActionEsc(label)} Action">${maActionEsc(maActionTypeSymbol(label))}</span>`;
}
function maActionTypePillHtml(value) {
    const label = maNormalizeActionType(value);
    return `<span class="ability-meta-pill action-meta-pill">${maActionEsc(label)}</span>`;
}

function renderSpells() {
    const data = getActiveData().spells || [];
    const container = document.getElementById('spellList');
    if(!container) return;
    container.innerHTML = '';
    renderSpellLevelTabs(data);

    const levelNum = selectedSpellLevel();
    const items = data
        .filter(spell => spellLevelToNumber(spell?.lvl) === levelNum)
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

    const levelName = spellLevelLabel(levelNum);
    const wrap = document.createElement('div');
    wrap.className = 'spell-level-group spell-level-selected';
    wrap.innerHTML = `
      <div class="spell-level-selected-head">
        <h4>${levelName} Spells</h4>
        <span>${spellHeaderFormula(levelNum)}</span>
      </div>
      <div class="spell-level-body"></div>
    `;
    const bodyEl = wrap.querySelector('.spell-level-body');

    if(!items.length) {
        const empty = document.createElement('div');
        empty.className = 'spell-level-empty';
        empty.textContent = `No ${levelName} spells yet.`;
        bodyEl.appendChild(empty);
    }

    items.forEach((s) => {
        const idx = data.indexOf(s);
        const div = document.createElement('div');
        div.className = 'list-row spell-row ability-fancy-row';
        const linkHtml = s.link ? `<a class="spell-link-btn" href="${s.link}" target="_blank" onclick="event.stopPropagation()">Link</a>` : '';
        const cost = maSpellMpCost(s);
        const canUse = maSpellCanUse(s);
        const useHtml = `<button class="spell-use-btn ability-use-chip ${canUse ? '' : 'unavailable'}" type="button" onclick="event.stopPropagation(); useSpellByIndex(${idx})" ${canUse ? '' : 'disabled'} title="${canUse ? `Use spell for ${cost} MP` : `Need ${cost} MP`}">Use</button>`;
        const sendHtml = `<button class="chat-icon-btn" type="button" onclick="event.stopPropagation(); sendSpellCard(${idx})" title="Send spell to chat without casting">💬</button>`;
        const rollHtml = String(s.damage || '').trim() ? `<button class="roll-icon-btn" type="button" onclick="event.stopPropagation(); rollSpellAction(${idx})" title="Roll spell dice">🎲</button>` : '';
        const actionType = maNormalizeActionType(s.type || 'Standard');
        const attackType = String(s.attack_type || '').trim();
        const diceRoll = String(s.damage || '').trim();
        const spellMetaHtml = [
            maActionTypePillHtml(actionType),
            attackType && attackType.toLowerCase() !== 'none' ? `<span class="ability-meta-pill">Attack Type ${chatEscapeHtml(attackType)}</span>` : '',
            diceRoll ? `<span class="ability-meta-pill roll">Dice Roll ${chatEscapeHtml(diceRoll)}</span>` : ''
        ].filter(Boolean).join('');
        div.innerHTML = `
          <div class="row-content" onclick="openView('spell',${idx})">
              <div class="ability-main-line spell-row-primary">
                ${useHtml}
                ${maActionTypeBadgeHtml(actionType)}
                <span class="ability-name-line spell-name-line">${chatEscapeHtml(s.name||'New Spell')}</span>
              </div>
              <div class="ability-meta-line spell-meta-line">
                ${spellMetaHtml}
              </div>
          </div>
          <div class="row-actions">${rollHtml}${sendHtml}${linkHtml}<button type="button" class="btn-edit" onclick="event.stopPropagation(); openEditor('spell',${idx})">Edit</button></div>`;
        bodyEl.appendChild(div);
    });

    container.appendChild(wrap);
}
window.renderSpells = renderSpells;


// DRAG AND DROP LOGIC
let dragSrcIndex = null;
let dragType = null;
let isDragging = false;
let touchTimer = null;
let touchDragItem = null;
let touchStartCoords = {x:0, y:0};

function isLimitBreakAbility(ability) {
    if(!ability) return false;
    const labels = [ability.name, ability.type].map(v => String(v || '')).join(' ');
    return /\blimit\s+breaks?(?:\s*\(\s*su\s*\))?\b/i.test(labels);
}
function getLimitBreakHpState() {
    const hp = Math.max(0, Number(document.getElementById('hp_curr')?.value) || 0);
    const maxHp = Math.max(0, Number(document.getElementById('hp_max')?.value) || 0);
    return { hp, maxHp, ready: maxHp > 0 && hp <= maxHp * 0.5 };
}
function getActiveAbilityUseState(ability) {
    const maxUses = Math.max(0, Number(ability?.u_max) || 0);
    const currUses = Math.max(0, Number(ability?.u_curr) || 0);
    const hasTrackedUses = maxUses > 0;
    const hasUsesLeft = currUses > 0;
    const hasDiceRoll = String(ability?.damage || '').trim() !== '';
    const isLimitBreak = isLimitBreakAbility(ability);
    const hpState = getLimitBreakHpState();
    const isReady = hasTrackedUses ? (hasUsesLeft && (!isLimitBreak || hpState.ready)) : true;
    let title = hasTrackedUses ? 'Use ability, roll any configured dice, and send to Discord' : (hasDiceRoll ? 'Roll this ability\'s dice' : 'Use ability');
    if(hasTrackedUses && !hasUsesLeft) title = 'No uses remaining';
    else if(hasTrackedUses && isLimitBreak && !hpState.ready) title = 'Limit Break can only be used at 50% HP or lower';
    return { hasTrackedUses, hasUsesLeft, hasDiceRoll, isLimitBreak, isReady, hpState, title };
}


function renderAbilities(subType) {
    let prop = abilityCollectionKey(subType);
    const data = getActiveData()[prop] || [];
    const container = document.getElementById(listContainerIds[subType]);
    if(!container) return;
    container.innerHTML = '';
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const typeLabels = { active:'Active', passive:'Passive', racial:'Racial', feat:'Feat' };

    data.forEach((a, i) => {
        const div = document.createElement('div');
        div.className = 'list-row ability-fancy-row ability-fancy-' + subType;
        const activeUseState = subType === 'active' ? getActiveAbilityUseState(a) : null;
        if(activeUseState?.isLimitBreak) {
            div.classList.add('limit-break-row', activeUseState.isReady ? 'limit-break-ready' : 'limit-break-locked');
        }

        div.draggable = true;
        div.dataset.index = i;
        div.dataset.type = subType;

        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);

        div.addEventListener('touchstart', handleTouchStart, {passive: false});
        div.addEventListener('touchmove', handleTouchMove, {passive: false});
        div.addEventListener('touchend', handleTouchEnd);

        const hasTrackedUses = subType === 'active' && Number(a.u_max || 0) > 0;
        const hasDiceRoll = String(a.damage || '').trim() !== '';
        const showUse = subType === 'active' ? true : hasDiceRoll;
        const ready = subType === 'active' ? (activeUseState?.isReady ?? false) : hasDiceRoll;
        const title = subType === 'active' ? (activeUseState?.title || 'Use ability') : 'Roll this dice roll';
        const useBtn = showUse ? `<button class="ability-use-chip ${ready ? 'is-ready' : 'is-locked'}" type="button" onclick="event.stopPropagation(); useAbilityByType('${subType}',${i})" ${ready ? '' : 'disabled'} title="${esc(title)}">Use</button>` : '';

        let metaHtml = '';
        const actionType = subType === 'active' ? maNormalizeActionType(a.type || 'Standard') : '';
        if(subType === 'active') {
            const attackType = String(a.attack_type || '').trim();
            metaHtml = [
                maActionTypePillHtml(actionType),
                attackType && attackType.toLowerCase() !== 'none' ? `<span class="ability-meta-pill">${esc(attackType)}</span>` : '',
                hasDiceRoll ? `<span class="ability-meta-pill roll">Dice Roll ${esc(a.damage)}</span>` : ''
            ].filter(Boolean).join('');
        } else {
            const metaParts = [];
            metaParts.push(typeLabels[subType] || abilityCollectionLabel(subType));
            if(a.type && subType !== 'feat') metaParts.push(a.type);
            metaHtml = metaParts.map(part => `<span class="ability-meta-pill">${esc(part)}</span>`).join('') + (hasDiceRoll ? `<span class="ability-meta-pill roll">Dice Roll ${esc(a.damage)}</span>` : '');
        }
        const name = a.name || `New ${abilityCollectionLabel(subType)}`;

        const cDiv = document.createElement('div');
        cDiv.className = 'row-content ability-card-content';
        cDiv.innerHTML = `<div class="ability-main-line">${useBtn}${subType === 'active' ? maActionTypeBadgeHtml(actionType) : ''}<span class="ability-name-line">${esc(name)}</span></div><div class="ability-meta-line">${metaHtml}</div>`;
        cDiv.onclick = () => { if(!isDragging) openView(subType, i); };

        let inputsHtml = '';
        if(hasTrackedUses) {
            inputsHtml = `<div class="inline-input-group" title="Type current uses. Max uses are edited from the Edit window."><span class="uses-caption">Uses</span><input class="ability-use-current-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(a.u_curr||0)}" onchange="updateAbilityUse(${i},'u_curr',this.value)" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"><span>/</span><span class="max-use-static">${esc(a.u_max||0)}</span></div>`;
        }

        let linkHtml = '';
        if(subType === 'feat' && a.link) {
            linkHtml = `<a class="btn-link-small" href="${esc(a.link)}" target="_blank" onclick="event.stopPropagation()">Link</a>`;
        }

        const aDiv = document.createElement('div');
        aDiv.className = 'row-actions';
        const sendBtnHtml = `<button class="chat-icon-btn ${subType === 'active' ? 'active-chat-action' : ''}" type="button" onclick="event.stopPropagation(); sendAbilityCard('${subType}',${i})" title="Send to Discord chat without using a charge or rolling">💬</button>`;
        const editBtnHtml = (subType === 'active' && a.isLimitBreak) ? '' : `<button class="btn-edit" onclick="event.stopPropagation(); openEditor('${subType}',${i})">Edit</button>`;
        aDiv.innerHTML = `${inputsHtml}${sendBtnHtml}${linkHtml}${editBtnHtml}`;

        div.appendChild(cDiv);
        div.appendChild(aDiv);
        container.appendChild(div);
    });
}


// Desktop Drag Handlers
function handleDragStart(e) {
    dragSrcIndex = Number(this.dataset.index);
    dragType = this.dataset.type;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIndex);
    this.classList.add('dragging');
    isDragging = true;
}
function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    return false;
}
function handleDrop(e) {
    e.stopPropagation();
    const target = e.currentTarget;
    const targetIndex = Number(target.dataset.index);
    const targetType = target.dataset.type;
    
    if (dragType !== targetType) return false;
    if (dragSrcIndex === targetIndex) return false;

    // Swap Data
    const data = getActiveData();
    let col = abilityCollectionKey(dragType);
    const arr = data[col];
    
    const item = arr[dragSrcIndex];
    arr.splice(dragSrcIndex, 1);
    arr.splice(targetIndex, 0, item);
    
    saveDataOnly();
    renderAbilities(dragType);
    return false;
}
function handleDragEnd(e) {
    this.classList.remove('dragging');
    isDragging = false;
    dragSrcIndex = null;
    dragType = null;
}

// Mobile Touch Handlers
function handleTouchStart(e) {
    if(e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    const el = e.currentTarget;
    touchStartCoords = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchDragItem = el;
    
    touchTimer = setTimeout(() => {
        isDragging = true;
        el.classList.add('dragging');
        navigator.vibrate(50); // Haptic feedback
        // Create ghost
        const ghost = document.getElementById('dragGhost');
        ghost.textContent = "Moving: " + (el.querySelector('.list-row-title, .active-name')?.textContent || "Item");
        ghost.style.display = 'block';
        ghost.style.left = (e.touches[0].clientX + 15) + 'px';
        ghost.style.top = (e.touches[0].clientY + 15) + 'px';
    }, 500); // 500ms hold
}
function handleTouchMove(e) {
    if(!isDragging) {
        // If moved significantly before timer, cancel timer
        const dx = Math.abs(e.touches[0].clientX - touchStartCoords.x);
        const dy = Math.abs(e.touches[0].clientY - touchStartCoords.y);
        if(dx > 10 || dy > 10) clearTimeout(touchTimer);
        return;
    }
    e.preventDefault(); // Prevent scroll
    const ghost = document.getElementById('dragGhost');
    ghost.style.left = (e.touches[0].clientX + 15) + 'px';
    ghost.style.top = (e.touches[0].clientY + 15) + 'px';
    
    // Highlight potential drop target
    const target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const row = target?.closest('.list-row');
    document.querySelectorAll('.list-row').forEach(r => r.classList.remove('drag-over'));
    if(row && row !== touchDragItem && row.dataset.type === touchDragItem.dataset.type) {
        row.classList.add('drag-over');
    }
}
function handleTouchEnd(e) {
    clearTimeout(touchTimer);
    document.getElementById('dragGhost').style.display = 'none';
    document.querySelectorAll('.list-row').forEach(r => {
        r.classList.remove('dragging');
        r.classList.remove('drag-over');
    });
    
    if(isDragging) {
        // Find drop target
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetRow = target?.closest('.list-row');
        
        if(targetRow && targetRow !== touchDragItem) {
            const srcIdx = Number(touchDragItem.dataset.index);
            const tgtIdx = Number(targetRow.dataset.index);
            const type = touchDragItem.dataset.type;
            
            if(type === targetRow.dataset.type) {
                const data = getActiveData();
                let col = abilityCollectionKey(type);
                const arr = data[col];
                const item = arr[srcIdx];
                arr.splice(srcIdx, 1);
                arr.splice(tgtIdx, 0, item);
                saveDataOnly();
                renderAbilities(type);
            }
        }
        isDragging = false;
    }
}

window.updateAbilityUse = (idx, key, val) => {
    const d = getActiveData().activeAbilities[idx];
    if(!d) return;
    const parsed = Math.max(0, Number(val) || 0);
    d[key] = key === 'u_curr' && Number.isFinite(Number(d.u_max)) ? Math.min(parsed, Math.max(0, Number(d.u_max) || 0)) : parsed;
    saveDataOnly();
    renderAbilities('active');
};

window.useActiveAbility = (idx) => {
    const list = getActiveData().activeAbilities || [];
    const ability = list[idx];
    if(!ability) return;
    const state = getActiveAbilityUseState(ability);
    if(!state.isReady) {
        renderAbilities('active');
        return;
    }
    if(state.hasTrackedUses) {
        const remaining = Math.max(0, Number(ability.u_curr) || 0);
        ability.u_curr = Math.max(0, remaining - 1);
        saveDataOnly();
        renderAbilities('active');
    }
    if(abilityIsRollable(ability)) rollAbilityAction(idx, { includeCard: true });
    else {
        sendAbilityCard('active', idx);
        if (typeof showUsageOverlay === 'function') showUsageOverlay(ability.name || 'Active Ability', 'Ability Used');
    }
};


function getItemTagFilterValue() {
    const el = document.getElementById('itemFilterTag');
    return el ? (el.value || 'All') : 'All';
}

function itemMatchesTagFilter(itemTag, tagFilter) {
    if(tagFilter === 'All') return true;
    return normalizeItemTagLabel(itemTag) === normalizeItemTagLabel(tagFilter);
}

window.setItemTagFilter = (tag) => {
    const el = document.getElementById('itemFilterTag');
    if(el) el.value = tag || 'All';
    syncItemTagTabs();
    renderItems();
};

window.syncItemTagTabs = () => {
    const tag = getItemTagFilterValue();
    document.querySelectorAll('#itemCategoryTabs .item-cat-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.tag || 'All') === tag);
    });
};

window.renderItems = () => {
    const data = getActiveData().items || [];
    const container = document.getElementById('itemList'); container.innerHTML = '';
    const tagFilter = getItemTagFilterValue();
    syncItemTagTabs();
    const sortType = document.getElementById('itemSort').value;
    let filtered = data.filter(i => {
        const itemTag = itemMainCategory(i);
        const matchesTag = itemMatchesTagFilter(itemTag, tagFilter);
        const equipped = !!i.equipped;
        const matchesView = currentItemView === 'equipped' ? equipped : !equipped;
        return matchesTag && matchesView;
    });
    if(sortType === "abc") filtered.sort((a,b) => (a.name||"").localeCompare(b.name||"")); else filtered = [...filtered].reverse();

    filtered.forEach(item => {
        const idx = data.indexOf(item);
        const div = document.createElement('div'); div.className = 'list-row';
        const amount = getItemAmount(item);
        const slot = getItemSlot(item);
        const normalizedTag = itemMainCategory(item);
        const imgUrl = itemImageUrlValue(item);
        let extraBtn = imgUrl ? `<button class="btn-save" style="font-size:10px; padding:4px 8px;" data-img="${itemEsc(imgUrl)}" onclick="event.stopPropagation();viewCollection(this.dataset.img)">IMG</button>` : '';
        const displayCost = itemDisplayCost(item);
        const itemTitle = `${amount}x ${item.name || 'New Item'}`;
        div.innerHTML = `<div class="item-toggle-wrap">
            <input type="checkbox" class="item-equip-check" ${item.equipped ? 'checked' : ''} onchange="event.stopPropagation();toggleItemEquipped(${idx}, this.checked)">
            <div class="row-content">
                <button type="button" class="item-name-link sheet-item-name" onclick="event.stopPropagation();openView('item',${idx})">${itemRarityMarkerHtml(item)}<span class="item-title-text">${itemEsc(itemTitle)}</span></button>
                <span class="item-meta-line"><span>Slot ${itemEsc(slot)}</span>${displayCost && displayCost !== '—' ? `<span>Cost ${itemEsc(displayCost)}</span>` : ''}</span>
            </div>
        </div><div class="row-actions" style="display:flex; gap:5px">${extraBtn}<button class="btn-edit" onclick="openEditor('item',${idx})">Edit</button></div>`;
        container.appendChild(div);
    });
    updateSlotUsageDisplay();
};


function populateViewModal(type, item, index = -1) {
    const viewTitleEl = document.getElementById('viewTitle');
    viewTitleEl.className = '';
    viewTitleEl.textContent = item.name || "Unnamed";
    const body = document.getElementById('viewBody'); body.innerHTML = '';
    document.getElementById('viewModal').style.display = 'flex';
    hideItemImagePreview();
    const add = (l, t) => { if(t !== undefined && t !== null && String(t).trim() !== ''){ body.innerHTML += `<div class="view-label">${l}</div><div class="view-text">${t}</div>`; } };

    if(type === 'weapon') {
        const weapon = normalizeWeaponData(item);
        const esc = (value) => chatEscapeHtml(String(value ?? '—'));
        const show = (value, fallback = '—') => {
            const text = String(value ?? '').trim();
            return text ? text : fallback;
        };
        body.innerHTML = `
          <div class="weapon-view-grid">
            <div class="weapon-view-card">
              <h4>Core</h4>
              <div class="weapon-view-stat"><span>Type</span><span>${esc(show(weapon.type))}</span></div>
              <div class="weapon-view-stat"><span>Ability Modifier</span><span>${esc(show(String(weapon.ability_mod || 'STR').toUpperCase()))}</span></div>
              <div class="weapon-view-stat"><span>Attack Misc</span><span>${esc(signedNumberText(Number(weapon.attack_misc || 0)))}</span></div>
              <div class="weapon-view-stat"><span>Damage</span><span>${esc(show(weapon.damage))}</span></div>
            </div>
            <div class="weapon-view-card">
              <h4>Combat</h4>
              <div class="weapon-view-stat"><span>Crit Range</span><span>${esc(show(weapon.crit_range, '20'))}</span></div>
              <div class="weapon-view-stat"><span>Crit Dmg</span><span>${esc(show(weapon.crit_mult, 'x2'))}</span></div>
              <div class="weapon-view-stat"><span>Range</span><span>${esc(show(weapon.range))}</span></div>
              ${shouldShowWeaponAmmo(weapon.ammo) ? `<div class="weapon-view-stat"><span>Ammo</span><span>${esc(String(weapon.ammo))}</span></div>` : ''}
            </div>
          </div>`;
        add("Description", weapon.desc);
        return;
    }
    if(type === 'spell') {
        const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const nl2br = (value) => esc(value).replace(/\n/g, '<br>');
        const asText = (value, fallback = '—') => {
            const text = String(value ?? '').trim();
            return text ? text : fallback;
        };
        const dcValue = spellDcDisplayValue(item);
        const tag = (label, value) => `<div class="spell-view-tag"><span class="spell-tag-label">${esc(label)}</span><span class="spell-tag-value">${esc(asText(value))}</span></div>`;
        const canRoll = spellIsRollable(item);
        body.innerHTML = `
          <div class="spell-view-shell">
            <div class="spell-view-top">
              <div class="spell-view-titlebar">
                <div class="spell-view-titleline">
                  <h3>${esc(asText(item.name, 'Unnamed Spell'))}</h3>
                </div>
                <div class="spell-view-actions">
                  ${index > -1 ? `<button class="spell-use-btn ability-use-chip ${maSpellCanUse(item) ? '' : 'unavailable'}" type="button" onclick="useSpellByIndex(${index})" ${maSpellCanUse(item) ? '' : 'disabled'} title="${maSpellCanUse(item) ? `Use spell for ${maSpellMpCost(item)} MP` : `Need ${maSpellMpCost(item)} MP`}">Use</button>` : ''}
                  ${String(item.damage || '').trim() && index > -1 ? `<button class="roll-icon-btn" type="button" onclick="rollSpellAction(${index})" title="Roll spell dice">🎲</button>` : ''}
                  ${index > -1 ? `<button class="chat-icon-btn" type="button" onclick="sendSpellCard(${index})" title="Send spell to chat without casting">💬</button>` : ''}
                  ${item.link ? `<a class="spell-link-btn" href="${esc(item.link)}" target="_blank">Open Link</a>` : ''}
                </div>
              </div>
              <div class="spell-view-subtitle">
                ${maActionTypePillHtml(item.type || 'Standard')}
                ${String(item.attack_type || '').trim() && String(item.attack_type || '').toLowerCase() !== 'none' ? `<span class="spell-action-chip">Attack Type ${esc(item.attack_type)}</span>` : ''}
                ${String(item.damage || '').trim() ? `<span class="spell-action-chip">Dice Roll ${esc(item.damage)}</span>` : ''}
              </div>
            </div>
            <div class="spell-view-section-grid">
              <div class="spell-view-section">
                <h4>Core</h4>
                <div class="spell-view-tag-grid">
                  ${tag('Level', item.lvl || 'Cantrip')}
                  ${tag('Action Type', item.type || 'Standard')}
                  ${tag('School', item.school)}
                </div>
              </div>
              <div class="spell-view-section">
                <h4>Targeting</h4>
                <div class="spell-view-tag-grid">
                  ${tag('Range', item.range)}
                  ${tag('Target', item.target)}
                  ${tag('Duration', item.duration)}
                </div>
              </div>
              <div class="spell-view-section">
                <h4>Combat</h4>
                <div class="spell-view-tag-grid">
                  ${tag('Attack Type', item.attack_type)}
                  ${tag('Dice Roll', item.damage)}
                  ${tag('Saving Throw', item.saving_throw)}
                  ${tag('Spell Resistance', item.spell_resist)}
                </div>
              </div>
              <div class="spell-view-section">
                <h4>Extra</h4>
                <div class="spell-view-tag-grid">
                  ${tag('DC', dcValue)}
                  ${tag('Link', item.link ? 'Available' : '')}
                </div>
              </div>
              ${String(item.desc ?? '').trim() ? `<div class="spell-view-section spell-view-wide"><h4>Description</h4><div class="spell-view-copy">${nl2br(item.desc)}</div></div>` : ''}
              ${String(item.at_higher_lvls ?? item.at_higher ?? '').trim() ? `<div class="spell-view-section spell-view-wide"><h4>At Higher Levels</h4><div class="spell-view-copy">${nl2br(item.at_higher_lvls ?? item.at_higher)}</div></div>` : ''}
              ${String(item.gm_notes ?? '').trim() ? `<div class="spell-view-section spell-view-wide"><h4 style="color:#ff8e8e;">GM Notes</h4><div class="spell-view-copy">${nl2br(item.gm_notes)}</div></div>` : ''}
            </div>
          </div>`;
        return;
    }
    if(type === 'active') {
        const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const nl2br = (value) => esc(value).replace(/\n/g, '<br>');
        const asText = (value, fallback = '—') => {
            const text = String(value ?? '').trim();
            return text ? text : fallback;
        };
        const tag = (label, value) => `<div class="spell-view-tag"><span class="spell-tag-label">${esc(label)}</span><span class="spell-tag-value">${esc(asText(value))}</span></div>`;
        const canRoll = abilityIsRollable(item);
        body.innerHTML = `
          <div class="spell-view-shell">
            <div class="spell-view-top">
              <div class="spell-view-titlebar">
                <div class="spell-view-titleline">
                  <h3>${esc(asText(item.name, 'Unnamed Ability'))}</h3>
                </div>
                <div class="spell-view-actions">
                  ${canRoll && index > -1 ? `<button class="roll-icon-btn" type="button" onclick="rollAbilityAction(${index})" title="Roll active ability attack and damage">🎲</button>` : ''}
                  ${index > -1 ? `<button class="chat-icon-btn" type="button" onclick="sendAbilityCard('active',${index})" title="Send active ability to chat">💬</button>` : ''}
                </div>
              </div>
              <div class="spell-view-subtitle">
                ${maActionTypePillHtml(item.type || 'Standard')}
                ${String(item.attack_type || '').trim() && String(item.attack_type || '').toLowerCase() !== 'none' ? `<span class="spell-action-chip">${esc(item.attack_type)}</span>` : ''}
                ${String(item.damage || '').trim() ? `<span class="spell-action-chip">Dice Roll ${esc(item.damage)}</span>` : ''}
              </div>
            </div>
            <div class="spell-view-section-grid">
              <div class="spell-view-section">
                <h4>Core</h4>
                <div class="spell-view-tag-grid">
                  ${tag('Type', item.type || 'Standard')}
                  ${tag('Uses', `${item.u_curr ?? 0}/${item.u_max ?? 0}`)}
                </div>
              </div>
              <div class="spell-view-section">
                <h4>Combat</h4>
                <div class="spell-view-tag-grid">
                  ${tag('Attack Type', item.attack_type)}
                  ${tag('Dice Roll', item.damage)}
                </div>
              </div>
              ${String(item.desc ?? '').trim() ? `<div class="spell-view-section spell-view-wide"><h4>Description</h4><div class="spell-view-copy">${nl2br(item.desc)}</div></div>` : `<div class="spell-view-section spell-view-wide"><h4>Description</h4><div class="spell-view-copy">—</div></div>`}
              ${String(item.at_higher_lvls ?? item.at_higher ?? '').trim() ? `<div class="spell-view-section spell-view-wide"><h4>At Higher Levels</h4><div class="spell-view-copy">${nl2br(item.at_higher_lvls ?? item.at_higher)}</div></div>` : ''}
            </div>
          </div>`;
        return;
    }
    if(type === 'passive' || type === 'racial' || type === 'feat') {
        const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const nl2br = (value) => esc(value).replace(/\n/g, '<br>');
        const show = (value, fallback = '—') => {
            const text = String(value ?? '').trim();
            return text ? text : fallback;
        };
        body.innerHTML = `
          <div class="spell-view-shell">
            <div class="spell-view-top">
              <div class="spell-view-titlebar">
                <div class="spell-view-titleline"><h3>${esc(show(item.name, abilityCollectionLabel(type)))}</h3></div>
                <div class="spell-view-actions">
                  ${String(item.damage || '').trim() && index > -1 ? `<button class="spell-use-btn available" type="button" onclick="useAbilityByType('${type}',${index})" title="Roll dice">Use</button>` : ''}
                  ${index > -1 ? `<button class="chat-icon-btn" type="button" onclick="sendAbilityCard('${type}',${index})" title="Send to chat">💬</button>` : ''}
                </div>
              </div>
              <div class="spell-view-subtitle"><span class="spell-action-chip">${esc(abilityCollectionLabel(type))}</span>${String(item.damage || '').trim() ? `<span class="spell-action-chip">Dice Roll ${esc(item.damage)}</span>` : ''}</div>
            </div>
            <div class="spell-view-section-grid">
              ${String(item.damage || '').trim() ? `<div class="spell-view-section spell-view-wide"><h4>Dice Roll</h4><div class="spell-view-copy">${esc(item.damage)}</div></div>` : ''}
              ${String(item.desc ?? '').trim() ? `<div class="spell-view-section spell-view-wide"><h4>Description</h4><div class="spell-view-copy">${nl2br(item.desc)}</div></div>` : `<div class="spell-view-section spell-view-wide"><h4>Description</h4><div class="spell-view-copy">${esc(show('', '—'))}</div></div>`}
              ${String(item.at_higher_lvls ?? item.at_higher ?? '').trim() ? `<div class="spell-view-section spell-view-wide"><h4>At Higher Levels</h4><div class="spell-view-copy">${nl2br(item.at_higher_lvls ?? item.at_higher)}</div></div>` : ''}
            </div>
          </div>`;
        return;
    }

    if(type === 'item') {
        const titleEl = document.getElementById('viewTitle');
        titleEl.className = 'item-modal-title-row';
        titleEl.innerHTML = `${itemRarityMarkerHtml(item)}<span>${itemEsc(item.name || 'Item')}</span>`;
        const pills = itemSheetPills(item);
        const desc = itemCleanText(item.desc);
        const special = itemCleanText(item.special);
        body.innerHTML = `<div class="item-view-shell">
            <div class="price-badge modal-price">${itemEsc(itemDisplayCost(item))}</div>
            <div class="item-meta modal-meta">${pills.map(p => `<span class="tag-pill ${itemEsc(p.cls)}">${itemEsc(p.text)}</span>`).join('')}</div>
            ${itemDetailsHtmlForSheet(item)}
            ${desc ? `<h4>Description</h4><p>${itemEsc(desc)}</p>` : ''}
            ${special && special !== desc ? `<h4>Special</h4><p>${itemEsc(special)}</p>` : ''}
        </div>`;
        showItemImagePreviewForView(item);
        return;
    }
    document.getElementById('viewTitle').className = '';
    add("Description", item.desc);
}

let currentEditContext = null;
let currentViewContext = null;


const simpleConfirmModal = document.getElementById('simpleConfirmModal');
const simpleConfirmText = document.getElementById('simpleConfirmText');
const simpleConfirmTitle = document.getElementById('simpleConfirmTitle');
const simpleConfirmOk = document.getElementById('simpleConfirmOk');
const simpleConfirmCancel = document.getElementById('simpleConfirmCancel');
const simpleConfirmClose = document.getElementById('simpleConfirmClose');
let simpleConfirmResolver = null;
function closeSimpleConfirm(result = false) {
  if (simpleConfirmResolver) {
    const resolve = simpleConfirmResolver;
    simpleConfirmResolver = null;
    simpleConfirmModal.style.display = 'none';
    resolve(result);
  } else {
    simpleConfirmModal.style.display = 'none';
  }
}
function openSimpleConfirm(message, okLabel = 'Delete', title = 'Confirm') {
  simpleConfirmTitle.textContent = title;
  simpleConfirmText.textContent = message;
  simpleConfirmOk.textContent = okLabel;
  simpleConfirmModal.style.display = 'flex';
  return new Promise(resolve => { simpleConfirmResolver = resolve; });
}
simpleConfirmOk.onclick = () => closeSimpleConfirm(true);
simpleConfirmCancel.onclick = () => closeSimpleConfirm(false);
simpleConfirmClose.onclick = () => closeSimpleConfirm(false);
simpleConfirmModal.addEventListener('click', (e) => { if (e.target === simpleConfirmModal) closeSimpleConfirm(false); });

const modal = document.getElementById('editorModal');
const modalBody = document.getElementById('modalBody');

function populateEditorModal(type, item, index, col) {
    currentEditContext = { type, index, col };
    const prettyTypeNames = { weapon:'Weapon', spell:'Spell', active:'Active Ability', passive:'Passive Ability', racial:'Racial Ability', feat:'Feat', item:'Item' };
    const editorIcons = { weapon:'⚔️', spell:'✧', active:'✹', passive:'◆', racial:'✥', feat:'★', item:'🎒' };
    modal.classList.add('ma-editor-overlay');
    modal.dataset.editType = type;
    const modalContent = modal.querySelector('.modal-content');
    if(modalContent) modalContent.classList.add('ma-editor-content');
    const modalHeader = modal.querySelector('.modal-header');
    if(modalHeader) modalHeader.setAttribute('data-editor-icon', editorIcons[type] || '✦');
    document.getElementById('modalTitle').textContent = "Edit " + (prettyTypeNames[type] || type);
    modalBody.innerHTML = '';
    modalBody.classList.add('ma-editor-body');
    const linkBtn = document.getElementById('modalLinkBtn');
    linkBtn.textContent = 'Open Link';
    linkBtn.style.display = (type !== 'item' && item.link) ? 'inline-block' : 'none'; linkBtn.href = (type !== 'item' && item.link) ? item.link : '#';

    createInput('Name', item.name, 'name');
    if(type === 'weapon') {
        const weapon = normalizeWeaponData(item);
        Object.assign(item, weapon);
        createEditorSection('Core');
        createInput('Type', weapon.type, 'type');
        createSelect('Ability Modifier', weapon.ability_mod, 'ability_mod', ['STR','DEX','CON','INT','WIS','CHA']);
        createInput('Attack Misc', weapon.attack_misc, 'attack_misc');
        createEditorSection('Combat');
        createInput('Damage', weapon.damage, 'damage');
        createSelect('Crit Range', weapon.crit_range, 'crit_range', ['20','19-20','18-20','17-20','16-20','15-20','14-20','13-20','12-20','11-20','10-20','9-20','8-20','7-20','6-20','5-20','4-20','3-20','2-20']);
        createSelect('Crit Dmg', weapon.crit_mult, 'crit_mult', ['x2','x3','x4']);
        createInput('Range', weapon.range, 'range');
        createInput('Ammo', weapon.ammo, 'ammo');
    }
    if(type === 'spell') {
        createEditorSection('Core');
        createSelect('Level', item.lvl || 'Cantrip', 'lvl', ["Cantrip","1st","2nd","3rd","4th","5th","6th","7th","8th","9th"]);
        createSelect('Action Type', maNormalizeActionType(item.type || 'Standard'), 'type', MA_ACTION_TYPE_OPTIONS);
        createInput('School', item.school, 'school');

        createEditorSection('Combat');
        createSelect('Attack Type', item.attack_type || 'None', 'attack_type', ["None","Touch","Ranged Touch"]);
        createInput('Dice Roll', item.damage, 'damage');
        createInput('Saving Throw', item.saving_throw, 'saving_throw');
        createSelect('Spell Resistance', item.spell_resist || 'No', 'spell_resist', ["No","Yes","Yes Harmless","Yes Object"]);

        createEditorSection('Targeting');
        createInput('Range', item.range, 'range');
        createInput('Target', item.target, 'target');
        createInput('Duration', item.duration, 'duration');

        createEditorSection('Extra');
        createInput('Link URL', item.link, 'link');
    }
    if(type === 'active') {
        createEditorSection('Core');
        createSelect('Type', maNormalizeActionType(item.type || 'Standard'), 'type', MA_ACTION_TYPE_OPTIONS);
        const usesField = document.createElement('div');
        usesField.className = 'ma-edit-field ma-edit-uses-field';
        const usesLabel = document.createElement('label'); usesLabel.textContent = 'Uses';
        const d = document.createElement('div'); d.className = 'ma-edit-uses-grid';
        const cWrap = document.createElement('div'); cWrap.className = 'ma-edit-field';
        const cLabel = document.createElement('label'); cLabel.textContent = 'Current';
        const c = document.createElement('input'); c.type='number'; c.placeholder='Cur'; c.value=item.u_curr||0; c.oninput=e=>updateCurrentItem('u_curr',e.target.value);
        cWrap.appendChild(cLabel); cWrap.appendChild(c);
        const mWrap = document.createElement('div'); mWrap.className = 'ma-edit-field';
        const mLabel = document.createElement('label'); mLabel.textContent = 'Max';
        const m = document.createElement('input'); m.type='number'; m.placeholder='Max'; m.value=item.u_max||0; m.oninput=e=>updateCurrentItem('u_max',e.target.value);
        mWrap.appendChild(mLabel); mWrap.appendChild(m);
        d.appendChild(cWrap); d.appendChild(mWrap); usesField.appendChild(usesLabel); usesField.appendChild(d); modalBody.appendChild(usesField);
        createCheckbox('Restore Uses on Long Rest', !!item.restoreOnLongRest, 'restoreOnLongRest');
        createEditorSection('Combat');
        createSelect('Attack Type', item.attack_type || 'None', 'attack_type', ["None","Melee","Ranged","Touch","Ranged Touch","CMB"]);
        createInput('Dice Roll', item.damage, 'damage');
    }

    if(['passive','racial','feat'].includes(type)) {
        createEditorSection('Roll');
        createInput('Dice Roll', item.damage, 'damage');
    }

    if(type === 'feat') createInput('Link URL', item.link, 'link');
    if(type === 'item') {
        const itemCategory = itemMainCategory(item);
        createEditorSection('Item Details');
        createSelect('Tag', itemCategory, 'tags', ITEM_TAG_OPTIONS);
        createInput('Type', itemFirstValue(item, ['type']), 'type');
        if (itemEditAllowsSecondaryType(itemCategory)) {
            createInput('Secondary Type', itemFirstValue(item, ['secondaryType','secondary type','filterTag']), 'secondaryType');
        }
        createInput('Image URL', itemImageUrlValue(item), 'img');
        createInput('Amount', getItemAmount(item), 'amount');
        createInput('Cost', item.cost, 'cost');
        createInput('Slot Amount', getItemSlot(item), 'slot');
        if (itemEditAllowsCl(itemCategory)) {
            createInput('CL', itemFirstValue(item, ['cl','casterLevel','caster level']), 'cl');
        }
        createSelect('Rarity', normalizeItemRarity(item.rarity || itemFirstValue(item, ['rarity'])), 'rarity', ['Common','Uncommon','Rare','Epic','Legendary']);

        const extraFields = itemFilteredExtraFieldsForEdit(itemCategory);
        if (extraFields.length) {
            createEditorSection(itemCategory + ' Stats');
            extraFields.forEach(([label, key, keys]) => createItemInput(label, item, key, keys));
        }
    }
    if(type === 'spell') {
        createEditorSection('Description');
        createTextArea('Description', item.desc, 'desc');
        createEditorSection('At Higher Levels');
        createTextArea('At Higher Levels', item.at_higher_lvls || item.at_higher, 'at_higher_lvls');
    } else if(['active','passive','racial','feat'].includes(type)) {
        createEditorSection('Description');
        createTextArea('Description', item.desc, 'desc');
        createEditorSection('At Higher Levels');
        createTextArea('At Higher Levels', item.at_higher_lvls || item.at_higher, 'at_higher_lvls');
    } else if(type === 'item') {
        createEditorSection('Description');
        createTextArea('Description', item.desc, 'desc');
        createEditorSection('Special');
        createTextArea('Special', item.special, 'special');
    } else {
        createEditorSection('Description');
        createTextArea('Description', item.desc, 'desc');
    }

    const deleteBtn = document.getElementById('modalDeleteBtn');
    if(type === 'active' && item.isLimitBreak) { deleteBtn.style.display='none'; } else { deleteBtn.style.display='block'; }
    deleteBtn.onclick = () => { getActiveData()[col].splice(index, 1); saveDataOnly(); closeModal(); };
    maFfd20AddAutoResetButton(type, item, index, col);
    modal.style.display = 'flex';
}

function createEditField(labelText, element, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'ma-edit-field' + (opts.long ? ' ma-edit-long' : '') + (opts.checkbox ? ' ma-edit-checkbox' : '');
    const lb = document.createElement('label');
    lb.textContent = labelText;
    wrap.appendChild(lb);
    wrap.appendChild(element);
    modalBody.appendChild(wrap);
    return { wrap, label: lb, element };
}
function createInput(l, v, k) {
    const i = document.createElement('input');
    i.value = v || '';
    i.oninput = e => updateCurrentItem(k, e.target.value);
    createEditField(l, i);
}
function createItemInput(label, item, key, keys) {
    const value = itemFirstValue(item, keys || [key]);
    createInput(label, value, key);
}
function prepareScrollableTextarea(t, opts = {}) {
    if(!t) return t;
    t.classList.add('scrollable-textarea');
    if(opts.longDesc) t.classList.add('ffd20-long-desc');
    if(opts.borderColor) t.style.borderColor = opts.borderColor;
    t.setAttribute('rows', String(opts.rows || 6));
    const stopBubble = (e) => e.stopPropagation();
    t.addEventListener('pointerdown', stopBubble);
    t.addEventListener('mousedown', stopBubble);
    t.addEventListener('touchstart', stopBubble, { passive: true });
    t.addEventListener('touchmove', stopBubble, { passive: true });
    setTimeout(() => autoExpand(t), 0);
    return t;
}
function createTextArea(l, v, k) {
    const t = document.createElement('textarea');
    t.value = v || '';
    const isLong = k === 'desc' || k === 'special' || k === 'at_higher_lvls';
    prepareScrollableTextarea(t, { longDesc: isLong });
    t.oninput = e => { autoExpand(t); updateCurrentItem(k, e.target.value); };
    createEditField(l, t, { long: isLong });
}
function createSelect(l, v, k, ops) {
    const s = document.createElement('select');
    ops.forEach(o => { const op=document.createElement('option'); op.text=o; op.value=o; if(o===v) op.selected=true; s.appendChild(op); });
    s.onchange = e => { updateCurrentItem(k,e.target.value); if(currentEditContext && currentEditContext.type === 'item') populateEditorModal('item', getActiveData().items[currentEditContext.index], currentEditContext.index, 'items'); };
    createEditField(l, s);
}
function createCheckbox(l, v, k) {
    const w = document.createElement('div');
    w.className = 'ma-edit-check-wrap';
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = !!v;
    i.onchange = e => updateCurrentItem(k, e.target.checked);
    const span = document.createElement('span');
    span.textContent = v ? 'Enabled' : 'Disabled';
    i.onchange = e => { span.textContent = e.target.checked ? 'Enabled' : 'Disabled'; updateCurrentItem(k, e.target.checked); };
    w.appendChild(i);
    w.appendChild(span);
    createEditField(l, w, { checkbox: true });
}
function createEditorSection(title) {
    const div = document.createElement('div');
    div.className = 'editor-section-title';
    div.textContent = title;
    modalBody.appendChild(div);
}
function addAttrRow(c, d, i) {
    const r=document.createElement('div'); r.className='attr-row';
    const n=document.createElement('input'); n.placeholder="Attr"; n.value=d.name||''; n.oninput=e=>{d.name=e.target.value; saveDataOnly()};
    const v=document.createElement('input'); v.placeholder="Val"; v.value=d.val||''; v.oninput=e=>{d.val=e.target.value; saveDataOnly()};
    const b=document.createElement('button'); b.className='btn-del'; b.textContent='x'; b.onclick=()=>{getActiveData().weapons[currentEditContext.index].attrs.splice(i,1); r.remove(); saveDataOnly()};
    r.appendChild(n); r.appendChild(v); r.appendChild(b); c.appendChild(r);
}

function updateCurrentItem(k, v) {
    const item = getActiveData()[currentEditContext.col][currentEditContext.index];
    if(k === 'tags') { item[k] = normalizeItemTagLabel(v); item.category = item[k]; item.sourceCategory = item[k]; }
    else if(k === 'rarity') item[k] = normalizeItemRarity(v);
    else if(k === 'tagList') item[k] = updateItemTagListValue(v);
    else {
        item[k] = v;
        if(k === 'link') item.sourceUrl = v;
        if(k === 'sourceCategory') item.category = v;
        if(k === 'secondaryType') item.filterTag = v;
        if(k === 'slot') item.slotAmount = v;
        if(k === 'dmg') item.damage = v;
        if(k === 'critical') item.crit = v;
    }
    if(k==='link') { const b=document.getElementById('modalLinkBtn'); b.href=v; b.style.display=v?'inline-block':'none'; }
    if(currentEditContext?.type === 'weapon' && k === 'ability_mod') item.mod = v;
    try {
        if(['active','passive','racial','feat','spell'].includes(currentEditContext?.type)) {
            maFfd20CaptureAutoOverride(getActiveData(), item);
        }
    } catch(e) { console.warn('Could not save auto FFD20 override', e); }
    if(['name','lvl','tags','tagList','sourceCategory','category','shopGroup','secondaryType','filterTag','proficiency','usageType','tier','sourceSystem','rarity','sourceShopName','type','attack_type','saving_throw','spell_resist','school','target','duration','u_curr','u_max','amount','cost','slot','slotAmount','equipped','img','image','imageUrl','ability_mod','attack_misc','damage','dmg','crit','critical','crit_range','crit_mult','range','ammo','cl','acBonus','maxDex','checkPenalty','spellFailure','speed','fullSpeed','passengersCrew','fuel','mileage','acCmd','hp','hardness','attackDmg','damageType','aim','load','dcSave','special','link','sourceUrl'].includes(k)) refreshList(currentEditContext.type);
    saveDataOnly();
}
window.closeModal = () => { modal.style.display='none'; if(currentEditContext) refreshList(currentEditContext.type); };
function refreshList(t) { if(t==='weapon') renderWeapons(); else if(t==='spell') renderSpells(); else if(t==='item') renderItems(); else renderAbilities(t); }

window.addNewItem = (t) => {
    const d = getActiveData();
    let n={name:''}, c='';
    if(t==='weapon'){c='weapons';n.mod='STR';n.ability_mod='STR';n.attack_misc='';n.damage='';n.type='';n.crit_range='20';n.crit_mult='x2';n.range='';n.ammo='';n.attrs=[];} else if(t==='spell'){c='spells';n.lvl='Cantrip';n.type='Standard';n.attack_type='None';n.spell_resist='No';n.saving_throw='';n.school='';n.target='';n.range='';n.duration='';n.damage='';n.at_higher_lvls='';} else if(t==='active'){c='activeAbilities';n.type='Standard';n.u_curr=0;n.u_max=0;n.attack_type='None';n.damage='';n.at_higher_lvls='';n.restoreOnLongRest=true;} else if(t==='passive'){c='passiveAbilities';n.damage='';n.at_higher_lvls='';} else if(t==='racial'){c='racialAbilities';n.type='Racial';n.damage='';n.at_higher_lvls='';} else if(t==='feat'){c='feats';n.damage='';n.at_higher_lvls='';} else if(t==='item'){c='items';n.tags='Misc';n.category='Misc';n.amount=1;n.slot=1;n.rarity='Common';n.equipped=false;}
    if(!d[c]) d[c]=[]; d[c].push(n);
    saveDataOnly(); refreshList(t); openEditor(t, d[c].length-1);
};

function scrapeCurrentSheet() {
    const p = {};
    const current = getActiveData() || {};
    document.querySelectorAll('.live-field').forEach(el => {
        if(!el.id) return;
        p[el.id] = el.value;
    });

    // Keep hidden build fields from being accidentally overwritten by empty DOM values
    // while the class/race option lists are still rebuilding.
    const preserve = (id, ...fallbacks) => {
        const currentVal = p[id];
        if(currentVal !== undefined && currentVal !== null && String(currentVal).trim() !== '') return;
        for(const fb of fallbacks) {
            if(fb !== undefined && fb !== null && String(fb).trim() !== '') {
                p[id] = String(fb);
                return;
            }
        }
    };
    preserve('race', current.race);
    preserve('class', current.class, current.className);
    preserve('archetype', current.archetype);
    preserve('character_level', current.character_level, current.level, '1');
    preserve('size_category', current.size_category, current.size, 'Medium');
    p.className = p.class || current.className || '';
    p.level = p.character_level || current.level || '1';

    p.skills = [];
    document.querySelectorAll('#skillsTableBody tr').forEach(r => {
        const sub = r.querySelector('.skill-custom-input') ? r.querySelector('.skill-custom-input').value : null;
        p.skills.push({
            skillKey: r.dataset.skillKey || '',
            name: r.dataset.skillName || '',
            stat: r.dataset.stat || '',
            cs: r.querySelector('.skill-cs').checked,
            temp: Number(r.querySelector('.skill-temp').value)||0,
            lvl: Number(r.querySelector('.skill-ranks').value)||0,
            subName: sub
        });
    });
    const m = current;
    try { if (typeof maFfd20MoveRaceEffectsToRacial === 'function') maFfd20MoveRaceEffectsToRacial(m); } catch (e) {}
    try { if (typeof maFfd20CaptureAllAutoOverrides === 'function') maFfd20CaptureAllAutoOverrides(m); } catch (e) {}
    p.weapons = m.weapons || [];
    p.spells = m.spells || [];
    p.activeAbilities = m.activeAbilities || [];
    p.passiveAbilities = m.passiveAbilities || [];
    p.racialAbilities = m.racialAbilities || [];
    p.feats = m.feats || [];
    p.items = m.items || [];
    p.multiclasses = Array.isArray(m.multiclasses) ? m.multiclasses : [];
    p.slot_cap = fullData.slot_cap || 20;
    return p;
}

function saveDataOnly() { save(); }
function save(force=false) {
    if (isRemoteUpdate && !force) return;
    if (!currentSummonId) return;
    document.getElementById('statusDot').className = 'status-dot';
    clearTimeout(saveTimeout);

    const commit = async () => {
        const cur = sanitizeCharacterDoc({ ...fullData, ...scrapeCurrentSheet(), updatedAt: new Date() }, fullData.charName || 'New Character');
        fullData = cur;
        await setDoc(doc(db, 'users', currentUser.uid, 'characters', currentSummonId), cur);
        document.getElementById('statusDot').classList.add('live');
        updateSummonMenu();
    };

    if(force) {
        commit().catch(err => {
            console.error('Save failed', err);
            document.getElementById('statusText').textContent = 'Save failed';
        });
        return;
    }

    saveTimeout = setTimeout(() => {
        commit().catch(err => {
            console.error('Save failed', err);
            document.getElementById('statusText').textContent = 'Save failed';
        });
    }, 1000);
}

window.createNewSummon = async () => {
    if (!currentUser) return;
    const nextIndex = (characterSheets?.length || 0) + 1;
    const newName = `New Character ${nextIndex}`;
    try {
        const newData = createBlankCharacterData(newName);
        const ref = await addDoc(collection(db, 'users', currentUser.uid, 'characters'), newData);
        try { await setDoc(doc(db, 'users', currentUser.uid), { charactersMigrated: true }, { merge: true }); } catch (e) { console.warn('Could not set charactersMigrated flag', e); }
        currentSummonId = ref.id;
        rememberSelectedCharacterId(currentSummonId);
        fullData = sanitizeCharacterDoc({ id: ref.id, ...newData }, newName);
        showNoCharacterState(false);
        loadCurrentSheet();
        updateSummonMenu();
        document.getElementById('summonMenu').classList.remove('show');
    } catch (err) {
        console.error('Error adding character', err);
        alert('Error adding character: ' + (err?.message || err));
    }
}
window.deleteCurrentSummon = async () => {
    if (!currentSummonId) return;
    const currentName = fullData.charName || 'this character';
    if (!(await openSimpleConfirm(`Delete "${currentName}"?`, 'Delete', 'Delete Character'))) return;
    const deleteId = currentSummonId;
    const remaining = characterSheets.filter(s => s.id !== deleteId);
    currentSummonId = remaining[0]?.id || null;
    if (currentSummonId) rememberSelectedCharacterId(currentSummonId);
    await setDoc(doc(db, 'users', currentUser.uid), { charactersMigrated: true }, { merge: true });
    await deleteDoc(doc(db, 'users', currentUser.uid, 'characters', deleteId));
    if (!remaining.length) {
        showNoCharacterState(true);
    }
    document.getElementById('summonMenu').classList.remove('show');
}
function characterButtonLabel(char) {
    const name = char?.charName || 'Unnamed Character';
    const cls = char?.class || char?.className || '';
    const lvl = char?.character_level || char?.level || '';
    const meta = [cls, lvl ? `Lv ${lvl}` : ''].filter(Boolean).join(' • ');
    return { name, meta };
}
function createCharacterPickerButton(char, closePanelOnPick = true) {
    const b = document.createElement('button');
    const isActive = String(currentSummonId || '') === String(char.id || '');
    const info = characterButtonLabel(char);
    b.className = `summon-opt panel-character-option ${isActive ? 'active selected' : ''}`;
    b.type = 'button';
    b.setAttribute('aria-current', isActive ? 'true' : 'false');
    b.innerHTML = `<span class="panel-character-name">${chatEscapeHtml(info.name)}</span>${info.meta ? `<small>${chatEscapeHtml(info.meta)}</small>` : ''}`;
    b.onclick = () => {
        currentSummonId = char.id;
        rememberSelectedCharacterId(currentSummonId);
        fullData = sanitizeCharacterDoc(char, char.charName || 'New Character');
        showNoCharacterState(false);
        loadCurrentSheet();
        updateSummonMenu();
        document.getElementById('summonMenu')?.classList.remove('show');
        if (closePanelOnPick) togglePanelMenu(false);
    };
    return b;
}
window.togglePanelCharacterList = (force) => {
    const list = document.getElementById('panelCharacterList');
    if(!list) return;
    const shouldShow = (typeof force === 'boolean') ? force : list.hidden;
    list.hidden = !shouldShow;
    if(shouldShow) updateSummonMenu();
};
function updateSummonMenu() {
    const fab = document.getElementById('summonFab');
    const m = document.getElementById('summonMenu');
    const panelList = document.getElementById('panelCharacterList');
    const deleteBtn = document.getElementById('btnDeleteSummon');
    const list = sortCharacterSheets(characterSheets);
    if (fab) {
        const fabVisible = (typeof getSummonFabVisibilityPreference === 'function') ? getSummonFabVisibilityPreference() : true;
        fab.style.display = (list.length && fabVisible) ? 'flex' : 'none';
    }
    if (typeof updateSummonFabToggleButton === 'function') updateSummonFabToggleButton();
    if (deleteBtn) deleteBtn.style.display = list.length ? 'block' : 'none';
    if (currentSummonId && list.some(c => c.id === currentSummonId)) rememberSelectedCharacterId(currentSummonId);
    if (!list.length) {
        m?.classList.remove('show');
        if (m) m.innerHTML = '';
        if (panelList) panelList.innerHTML = '<div class="panel-character-empty">No characters yet.</div>';
        return;
    }
    if (m) {
        m.innerHTML = '';
        list.forEach(char => m.appendChild(createCharacterPickerButton(char, false)));
    }
    if (panelList) {
        panelList.innerHTML = '';
        list.forEach(char => panelList.appendChild(createCharacterPickerButton(char, false)));
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'summon-opt panel-character-option panel-character-add';
        add.innerHTML = '<span class="panel-character-name">＋ Add Character</span>';
        add.onclick = () => { togglePanelMenu(false); createNewSummon(); };
        panelList.appendChild(add);
    }
}

const fab = document.getElementById('summonFab'); const menu = document.getElementById('summonMenu');
const addCharacterBtn = document.getElementById('btnAddSummon'); if(addCharacterBtn) addCharacterBtn.textContent = '+ Add Character';
const createFirstCharacterBtn = document.getElementById('btnCreateFirstCharacter'); if(createFirstCharacterBtn) createFirstCharacterBtn.onclick = createNewSummon;
const deleteCharacterBtn = document.getElementById('btnDeleteSummon'); if(deleteCharacterBtn) deleteCharacterBtn.textContent = 'Delete Character';
fab.onclick = (e) => {
    if(fab.dataset.dragging === "true") return;
    const r = fab.getBoundingClientRect();
    menu.style.bottom='auto'; menu.style.top='auto'; menu.style.left='auto'; menu.style.right='auto';
    if(window.innerHeight-r.bottom >= 250) menu.style.top=(r.bottom+10)+'px'; else menu.style.bottom=(window.innerHeight-r.top+10)+'px';
    if(window.innerWidth-r.right >= 200) menu.style.left=r.left+'px'; else menu.style.right=(window.innerWidth-r.right)+'px';
    menu.classList.toggle('show');
};
let isD=false, dof={x:0,y:0};
fab.addEventListener('mousedown', sD); fab.addEventListener('touchstart', sD, {passive:false});
function sD(e) { isD=true; fab.dataset.dragging="false"; const c=e.touches?e.touches[0]:e; const r=fab.getBoundingClientRect(); dof.x=c.clientX-r.left; dof.y=c.clientY-r.top; document.addEventListener('mousemove', oD); document.addEventListener('touchmove', oD, {passive:false}); document.addEventListener('mouseup', eD); document.addEventListener('touchend', eD); }
function oD(e) { if(!isD)return; e.preventDefault(); fab.dataset.dragging="true"; const c=e.touches?e.touches[0]:e; fab.style.left=Math.max(0,Math.min(window.innerWidth-fab.offsetWidth,c.clientX-dof.x))+'px'; fab.style.top=Math.max(0,Math.min(window.innerHeight-fab.offsetHeight,c.clientY-dof.y))+'px'; }
function eD() { isD=false; document.removeEventListener('mousemove', oD); document.removeEventListener('touchmove', oD); document.removeEventListener('mouseup', eD); document.removeEventListener('touchend', eD); }

// In characters.html
const SKILLS_DB = [
    {n:"Acrobatics",s:"dex"}, {n:"Appraise",s:"int"}, {n:"Bluff",s:"cha"}, {n:"Climb",s:"str"},
    {n:"Craft",s:"int", custom:true}, {n:"Craft",s:"int", custom:true}, {n:"Craft",s:"int", custom:true},
    {n:"Diplomacy",s:"cha"}, {n:"Disable Device",s:"dex"}, {n:"Disguise",s:"cha"}, {n:"Drive",s:"dex"}, 
    {n:"Escape Artist",s:"dex"}, {n:"Fly",s:"dex"}, {n:"Handle Animal",s:"cha"}, {n:"Heal",s:"wis"}, 
    {n:"Intimidate",s:"cha"}, {n:"Knw: Arcana",s:"int"}, {n:"Knw: Dungeoneering",s:"int"}, {n:"Knw: Engineering",s:"int"}, 
    {n:"Knw: Geography",s:"int"}, {n:"Knw: History",s:"int"}, {n:"Knw: Local",s:"int"}, {n:"Knw: Nature",s:"int"}, 
    {n:"Knw: Nobility",s:"int"}, {n:"Knw: Planes",s:"int"}, {n:"Knw: Religion",s:"int"}, {n:"Knw: Technology",s:"int"}, 
    {n:"Linguistics",s:"int"}, {n:"Navigate",s:"int"}, {n:"Perception",s:"wis"}, 
    {n:"Perform",s:"cha", custom:true}, {n:"Perform",s:"cha", custom:true}, {n:"Perform",s:"cha", custom:true},
    {n:"Pilot",s:"dex"},
    {n:"Profession",s:"wis", custom:true}, {n:"Profession",s:"wis", custom:true}, {n:"Profession",s:"wis", custom:true}, 
    {n:"Repair",s:"int"},
    {n:"Ride",s:"dex"}, {n:"Sense Motive",s:"wis"}, {n:"Sleight of Hand",s:"dex"}, {n:"Spellcraft",s:"int"}, 
    {n:"Stealth",s:"dex"}, {n:"Survival",s:"wis"}, {n:"Swim",s:"str"}, {n:"Use Magic Device",s:"cha"}
];
// In characters.html
const TRAINED_ONLY = ["Disable Device", "Handle Animal", "Knw: Arcana", "Knw: Dungeoneering", "Knw: Engineering", "Knw: Geography", "Knw: History", "Knw: Local", "Knw: Nature", "Knw: Nobility", "Knw: Planes", "Knw: Religion", "Knw: Technology", "Linguistics", "Profession", "Use Magic Device"];
function getSkillBonus(row) {
    if(!row) return { mod:0, temp:0, ranks:0, cs:false, classBonus:0, total:0 };
    const mod = getMod(row.dataset.stat);
    const temp = Number(row.querySelector('.skill-temp')?.value) || 0;
    const ranks = Number(row.querySelector('.skill-ranks')?.value) || 0;
    const cs = !!row.querySelector('.skill-cs')?.checked;
    const classBonus = (cs && ranks >= 1) ? 3 : 0;
    return { mod, temp, ranks, cs, classBonus, total: mod + temp + ranks + classBonus };
}
function initSkills() {
    const cont = document.getElementById('skillsTableBody'); cont.innerHTML = '';
    const skillKeyCounts = Object.create(null);
    SKILLS_DB.forEach(s => {
        const keyBase = `${s.n}::${s.s}`;
        skillKeyCounts[keyBase] = (skillKeyCounts[keyBase] || 0) + 1;
        const tr = document.createElement('tr');
        tr.className = 'skill-row-data';
        tr.dataset.stat = s.s;
        tr.dataset.skillName = s.n;
        tr.dataset.skillKey = `${keyBase}::${skillKeyCounts[keyBase]}`;
        let nameHtml = s.n;
        if(s.custom) nameHtml += ` <input class="skill-custom-input" placeholder="Type">`;
        nameHtml += ` <small class="skill-stat-tag">(${s.s})</small>`;

        tr.innerHTML = `<td><input type="checkbox" class="skill-cs" aria-label="Class skill"></td><td style="text-align:left; font-weight:bold;" class="skill-name-cell" tabindex="0">${nameHtml}</td><td class="skill-mod">0</td><td><input type="number" class="skill-temp" value="0" style="width:40px; text-align:center; background:var(--input-bg); border:1px solid var(--border); padding:4px; border-radius:3px;"></td><td><input type="number" class="skill-ranks" value="0" min="0" max="${getSkillRankCap()}" style="width:40px; text-align:center; background:var(--input-bg); border:1px solid var(--border); padding:4px; border-radius:3px;"></td><td class="skill-total" style="color:var(--accent); font-weight:bold;">0</td>`;
        cont.appendChild(tr);
        bindSkillRowEvents(tr);
    });
    syncSkillStateAfterLoad();
    if (typeof bindSkillRollTargets === 'function') bindSkillRollTargets(cont);
}
function getMod(id) { const v = document.getElementById(id).value; return v ? Math.floor((v-10)/2) : 0; }
function updateCalcs() {
    ['str','dex','con','int','wis','cha'].forEach(s => { const m = getMod(s); document.getElementById('mod-'+s).textContent = (m>=0?'+':'')+m; });
    const con = getMod('con'), dex = getMod('dex'), wis = getMod('wis');
    const f = (Number(document.getElementById('fort_bonus').value)||0) + con;
    const r = (Number(document.getElementById('ref_bonus').value)||0) + dex;
    const w = (Number(document.getElementById('will_bonus').value)||0) + wis;
    const fortEl=document.getElementById('fort_total'); const refEl=document.getElementById('ref_total'); const willEl=document.getElementById('will_total'); if(fortEl) fortEl.textContent=(f>=0?'+':'')+f; if(refEl) refEl.textContent=(r>=0?'+':'')+r; if(willEl) willEl.textContent=(w>=0?'+':'')+w;
    
    document.querySelectorAll('#skillsTableBody tr').forEach(row => {
        const { mod, temp, ranks, classBonus, total } = getSkillBonus(row);
        row.querySelector('.skill-mod').textContent = mod;
        const totalEl = row.querySelector('.skill-total');
        totalEl.textContent = (total>=0?'+':'')+total;
        totalEl.dataset.classBonus = String(classBonus);
        totalEl.title = `Ability ${mod} + Ranks ${ranks} + Temp ${temp} + Class ${classBonus} = ${total}`;
        
        const cell = row.querySelector('.skill-name-cell');
        if (typeof syncSkillRollAvailability === 'function') syncSkillRollAvailability(row);
        // Handle "Trained Only" logic simply by checking base name
        let baseName = cell.innerText.split(' ')[0].trim();
        if(cell.querySelector('input')) baseName = cell.firstChild.textContent.trim();

        if(TRAINED_ONLY.some(t => cell.innerText.includes(t))) {
            if(ranks < 1) { cell.classList.add('trained-untrained'); cell.classList.remove('trained-trained'); } 
            else { cell.classList.remove('trained-untrained'); cell.classList.add('trained-trained'); }
        }
    });
    computeDerivedStats();
    renderAbilityDrawerScores();
    updateSlotUsageDisplay();
    renderNotesList();
    if (typeof updateLimitBreakState === 'function') updateLimitBreakState();
}

function queueCriticalSave() {
  if (typeof save === 'function') save(true);
  else if (typeof saveDataOnly === 'function') saveDataOnly();
  else if (typeof triggerSave === 'function') triggerSave();
}
const CRITICAL_SYNC_FIELDS = [
  'hp_curr','hp_temp','hp_max','hp_max_temp','hp_effective_max',
  'mp','mp_temp','mp_class','mp_bonus','mp_max_temp','mp_curr','mp_total_max','mp_max_spell_level',
  'spell_dc_base','class','archetype','character_level','str','dex','con','int','wis','cha',
  'init_temp','bab','bab_temp','speed','speed_temp',
  'ac_armor','ac_natural','ac_deflect','ac_dodge','ac_temp','touch_temp','flat_temp','cmd_temp',
  'ar_melee_ability','ar_ranged_ability','ar_touch_ability','ar_ranged_touch_ability','ar_melee_temp','ar_ranged_temp','ar_touch_temp','ar_ranged_touch_temp','cmb_temp',
  'fort_base','fort_enhance','fort_temp','ref_base','ref_enhance','ref_temp','will_base','will_enhance','will_temp'
];
function bindCriticalFieldPersistence() {
  CRITICAL_SYNC_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.persistBound === '1') return;
    el.dataset.persistBound = '1';
    const runRefresh = () => {
      if (typeof updateCalculations === 'function') updateCalculations();
      if (typeof updateCalcs === 'function') updateCalcs();
      if (typeof computeDerivedStats === 'function') computeDerivedStats();
      if (typeof renderSelectedCombatDisplays === 'function') renderSelectedCombatDisplays();
      if (typeof renderAbilityDrawerScores === 'function') renderAbilityDrawerScores();
      if (typeof updateLimitBreakState === 'function') updateLimitBreakState();
    };
    el.addEventListener('input', () => {
      runRefresh();
      queueCriticalSave();
    });
    el.addEventListener('change', () => {
      runRefresh();
      queueCriticalSave();
    });
    el.addEventListener('blur', () => {
      runRefresh();
      queueCriticalSave();
    });
  });
}

const SPELL_DC_TRIGGER_FIELDS = new Set(['spell_dc_base','str','dex','con','int','wis','cha','character_level','class','archetype','mp','mp_temp','mp_max_temp']);
function refreshSpellDcDisplays(fieldId) {
  if (!SPELL_DC_TRIGGER_FIELDS.has(fieldId)) return;
  if (typeof renderSpells === 'function') renderSpells();
  if (typeof refreshMpDisplays === 'function') refreshMpDisplays();
}

window.toggleHeartStats = () => document.getElementById('heartModalContainer').classList.toggle('active-heart-modal');
window.viewCollection = (url) => { document.getElementById('modalImg').src = url; document.getElementById('imageModal').style.display = 'flex'; };
document.body.addEventListener('input', e => { if(e.target.classList.contains('live-field')) { updateCalcs(); computeDerivedStats(); renderSelectedCombatDisplays(); renderAbilityDrawerScores(); refreshSpellDcDisplays(e.target.id); save(); } });
document.body.addEventListener('change', e => { if(e.target.classList.contains('live-field')) { updateCalcs(); computeDerivedStats(); renderSelectedCombatDisplays(); renderAbilityDrawerScores(); refreshSpellDcDisplays(e.target.id); save(true); } });
document.body.addEventListener('focusout', e => { if(e.target.classList.contains('live-field')) { updateCalcs(); computeDerivedStats(); renderSelectedCombatDisplays(); renderAbilityDrawerScores(); refreshSpellDcDisplays(e.target.id); save(true); } });
const skillLevelField = document.getElementById('character_level');
if(skillLevelField && skillLevelField.dataset.skillCapBound !== '1') {
  skillLevelField.dataset.skillCapBound = '1';
  const enforceLevelSkillCap = () => {
    const changed = syncSkillRankCap(true);
    updateCalcs();
    if(changed) save(true);
  };
  skillLevelField.addEventListener('input', enforceLevelSkillCap);
  skillLevelField.addEventListener('change', enforceLevelSkillCap);
}
const skillsBodyEl = document.getElementById('skillsTableBody');
if(skillsBodyEl && skillsBodyEl.dataset.delegateBound !== '1') {
  skillsBodyEl.dataset.delegateBound = '1';
  const runSkillRefresh = () => { updateCalcs(); save(); };
  skillsBodyEl.addEventListener('input', e => {
    if(e.target.closest('tr') && (e.target.classList.contains('skill-cs') || e.target.classList.contains('skill-temp') || e.target.classList.contains('skill-ranks') || e.target.classList.contains('skill-custom-input'))) {
      updateCalcs();
    }
  });
  skillsBodyEl.addEventListener('change', e => {
    if(e.target.closest('tr') && (e.target.classList.contains('skill-cs') || e.target.classList.contains('skill-temp') || e.target.classList.contains('skill-ranks') || e.target.classList.contains('skill-custom-input'))) {
      runSkillRefresh();
    }
  });
}

window.addEventListener('beforeunload', () => { try { if(typeof save === 'function') save(true); } catch(e) {} });
window.addEventListener('load', () => { if(typeof refreshCombatUi === 'function') { setTimeout(() => { refreshCombatUi(); renderAbilityDrawerScores(); }, 150); } else { setTimeout(renderAbilityDrawerScores, 150); } });


const SIZE_OPTIONS = [{name:'Fine', ac:8, cmd:-8},{name:'Diminutive', ac:4, cmd:-4},{name:'Tiny', ac:2, cmd:-2},{name:'Small', ac:1, cmd:-1},{name:'Medium', ac:0, cmd:0},{name:'Large', ac:-1, cmd:1},{name:'Huge', ac:-2, cmd:2},{name:'Gargantuan', ac:-4, cmd:4},{name:'Colossal', ac:-8, cmd:8}];
function numVal(id) { return Number(document.getElementById(id)?.value || 0) || 0; }
function setVal(id, value) { const el = document.getElementById(id); if(el) el.value = value; }
function modFor(statId) { return getMod ? getMod(statId) : Math.floor((Number(document.getElementById(statId)?.value||0)-10)/2); }
function syncSizeFields() {
  const select = document.getElementById('size_category');
  if(!select) return;
  let current = select.value || document.getElementById('size')?.value || 'Medium';
  const found = SIZE_OPTIONS.find(s => s.name === current) || SIZE_OPTIONS.find(s => s.name.toLowerCase() === String(current).toLowerCase()) || SIZE_OPTIONS[4];
  setVal('size_category', found.name); setVal('size_mod', found.ac); setVal('size_special', found.cmd);
  const main = document.getElementById('sizeDisplayMain'); if(main) main.textContent = `${found.name}`;
  const bio = document.getElementById('size'); if(bio) bio.value = found.name;
}
function renderSelectedCombatDisplays() {
  const acMap = { ac: numVal('ac_total'), touch: numVal('touch_ac_total'), flat: numVal('flat_ac_total'), cmd: numVal('cmd_total') };
  const arMap = { melee: numVal('ar_total'), ranged: numVal('ar_ranged_total'), touch: numVal('ar_touch_total'), ranged_touch: numVal('ar_ranged_touch_total'), cmb: numVal('cmb') };
  const setPlainText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
  const setSignedText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value >= 0 ? `+${value}` : `${value}`; };
  setPlainText('acDisplayMain', acMap.ac ?? 10);
  setPlainText('acDisplayTouch', acMap.touch ?? 10);
  setPlainText('acDisplayFlat', acMap.flat ?? 10);
  setPlainText('acDisplayCmd', acMap.cmd ?? 10);
  setSignedText('arDisplayMain', arMap.melee ?? 0);
  setSignedText('arDisplayRanged', arMap.ranged ?? 0);
  setSignedText('arDisplayTouch', arMap.touch ?? 0);
  setSignedText('arDisplayRangedTouch', arMap.ranged_touch ?? 0);
  setSignedText('arDisplayCmb', arMap.cmb ?? 0);
  if (typeof refreshMpDisplays === 'function') refreshMpDisplays();
}

function handleDisplayModeChange() { renderSelectedCombatDisplays(); if (typeof triggerSave === 'function') triggerSave(); else save(); }
function performLongRest() {
  const level = Math.max(1, Math.min(20, Number(document.getElementById('character_level')?.value) || 1));
  const hpBefore = numVal('hp_curr');
  const hpMax = numVal('hp_max');
  const hpEffectiveMax = Math.max(0, hpMax + numVal('hp_max_temp'));
  const hpAfter = hpEffectiveMax > 0 ? Math.min(hpEffectiveMax, hpBefore + level) : hpBefore + level;
  setVal('hp_curr', hpAfter);
  let mpRestored = 0;
  try {
    const mpInfo = typeof maMpApplyAutoValues === 'function' ? maMpApplyAutoValues() : null;
    const beforeMp = numVal('mp') + numVal('mp_temp');
    if(mpInfo && Number.isFinite(Number(mpInfo.totalMax))) {
      setVal('mp', Math.max(0, Math.trunc(Number(mpInfo.totalMax) || 0)));
      setVal('mp_temp', 0);
      mpRestored = Math.max(0, (Math.trunc(Number(mpInfo.totalMax) || 0)) - beforeMp);
    }
  } catch(e) { console.warn('Could not restore MP on long rest', e); }
  let restoredAbilities = 0;
  (getActiveData().activeAbilities || []).forEach(ability => {
    const maxUses = Math.max(0, Number(ability?.u_max) || 0);
    if(ability && maxUses > 0) {
      ability.u_curr = maxUses;
      ability.restoreOnLongRest = true;
      restoredAbilities += 1;
    }
  });
  renderAbilities('active');
  if(typeof renderSpells === 'function') renderSpells();
  updateCalcs();
  computeDerivedStats();
  save(true);
  routeChatEntry({
    kind: 'info',
    title: 'Long Rest',
    subtitle: currentChatSheetLabel(),
    lines: [`> HP healed: ${Math.max(0, hpAfter - hpBefore)} (Level ${level})`, `> MP restored: ${mpRestored}`, `> Ability uses restored: ${restoredAbilities}`],
    results: []
  });
}
window.performLongRest = performLongRest;

function computeDerivedStats() {
  syncSizeFields();
  const dex = modFor('dex'), str = modFor('str'), con = modFor('con'), wis = modFor('wis');
  const sizeMod = numVal('size_mod'), sizeSpecial = numVal('size_special');
  const hpBase = numVal('hp_curr'), hpTemp = numVal('hp_temp'), hpMax = numVal('hp_max'), hpMaxTemp = numVal('hp_max_temp');
  const hpTotalMax = Math.max(0, hpMax + hpMaxTemp);
  const init = dex + numVal('init_temp');
  const babTotal = numVal('bab') + numVal('bab_temp');
  const speedTotal = numVal('speed');
  const ac = 10 + dex + sizeMod + numVal('ac_armor') + numVal('ac_natural') + numVal('ac_deflect') + numVal('ac_dodge') + numVal('ac_temp');
  const touch = 10 + dex + sizeMod + numVal('ac_deflect') + numVal('ac_dodge') + numVal('touch_temp');
  const flat = 10 + sizeMod + numVal('ac_armor') + numVal('ac_natural') + numVal('ac_deflect') + numVal('flat_temp');
  const meleeAbility = attackAbilityMod('ar_melee_ability', 'str');
  const rangedAbility = attackAbilityMod('ar_ranged_ability', 'dex');
  const touchAbility = attackAbilityMod('ar_touch_ability', 'str');
  const rangedTouchAbility = attackAbilityMod('ar_ranged_touch_ability', 'dex');
  const cmd = 10 + str + dex + sizeSpecial + numVal('cmd_temp');
  const melee = babTotal + meleeAbility + sizeMod + numVal('ar_melee_temp');
  const ranged = babTotal + rangedAbility + sizeMod + numVal('ar_ranged_temp');
  const touchAttack = babTotal + touchAbility + sizeMod + numVal('ar_touch_temp');
  const rangedTouchAttack = babTotal + rangedTouchAbility + sizeMod + numVal('ar_ranged_touch_temp');
  const cmb = babTotal + str + dex + sizeSpecial + numVal('cmb_temp');
  const fort = con + numVal('fort_base') + numVal('fort_enhance') + numVal('fort_temp');
  const ref = dex + numVal('ref_base') + numVal('ref_enhance') + numVal('ref_temp');
  const will = wis + numVal('will_base') + numVal('will_enhance') + numVal('will_temp');
  const setText = (id,val,plus=true) => { const el = document.getElementById(id); if(!el) return; const out = plus ? (val>=0?`+${val}`:`${val}`) : String(val); if('value' in el) el.value = out; else el.textContent = out; };
  const setPlain = (id,val) => { const el = document.getElementById(id); if(!el) return; const out = String(val); if('value' in el) el.value = out; else el.textContent = out; };
  setPlain('hpBaseDisplay', hpBase); setPlain('hpTempDisplay', hpTemp); setPlain('hpMaxDisplay', hpTotalMax); setPlain('hp_effective_max', hpTotalMax);
  if (typeof refreshMpDisplays === 'function') refreshMpDisplays();
  setText('initDisplayMain', init); setText('babDisplayMain', babTotal); setPlain('speedDisplayMain', speedTotal);
  setVal('ac_total', ac); setVal('cmd_total', cmd); setVal('ar_total', melee); setVal('cmb', cmb); setVal('touch_ac_total', touch); setVal('flat_ac_total', flat); setVal('ar_ranged_total', ranged); setVal('ar_touch_total', touchAttack); setVal('ar_ranged_touch_total', rangedTouchAttack);
  setVal('fort_bonus', fort); setVal('ref_bonus', ref); setVal('will_bonus', will);
  renderSelectedCombatDisplays();
  setText('fortDisplayMain', fort); setText('refDisplayMain', ref); setText('willDisplayMain', will);
  updateLimitBreakState();
}
function statField(label,id, opts={}) {
  const value = document.getElementById(id)?.value || opts.defaultValue || '';
  const readonly = opts.readonly ? 'readonly' : '';
  const cls = opts.readonly ? 'graybase' : '';
  return `<div class="mini-field"><label>${label}</label><input class="${cls}" ${readonly} data-stat-field="${id}" type="number" value="${value}"></div>`;
}
function selectField(label,id, options) {
  const current = document.getElementById(id)?.value || options[0]?.name || options[0] || '';
  const opts = options.map(opt => { const value = typeof opt === 'string' ? opt : opt.name; return `<option value="${value}" ${value===current?'selected':''}>${value}</option>`; }).join('');
  return `<div class="mini-field" style="min-width:140px;"><label>${label}</label><select data-stat-field="${id}">${opts}</select></div>`;
}

function getAttackAbility(id, fallback='str') {
  const raw = String(document.getElementById(id)?.value || '').toLowerCase();
  return (raw === 'str' || raw === 'dex') ? raw : fallback;
}
function attackAbilityMod(id, fallback='str') {
  return modFor(getAttackAbility(id, fallback));
}
function attackAbilityField(label, id, fallback='str') {
  const current = getAttackAbility(id, fallback);
  return `<div class="mini-field" style="min-width:120px;"><label>${label}</label><select data-stat-field="${id}"><option value="str" ${current==='str'?'selected':''}>STR</option><option value="dex" ${current==='dex'?'selected':''}>DEX</option></select></div>`;
}
function signedAttackTotal(val) {
  return val >= 0 ? `+${val}` : `${val}`;
}
window.openStatEdit = (section) => {
  const body = document.getElementById('statEditBody'); const title = document.getElementById('statEditTitle'); if(!body) return;
  let html = '';
  if(section === 'hp') {
    const hpTotalMax = Math.max(0, numVal('hp_max') + numVal('hp_max_temp'));
    title.textContent = 'Edit HP';
    html = `<div class="formula-line"><div class="formula-parts">${statField('Current','hp_curr')}${statField('Temp HP','hp_temp')}${statField('Base','hp_max', {readonly:true})}${statField('Max Temp','hp_max_temp')}<div class="mini-field"><label>Total Max</label><input class="graybase" readonly type="number" value="${hpTotalMax}"></div></div></div>`;
  }
  if(section === 'mp') {
    const mpInfo = (typeof maMpApplyAutoValues === 'function') ? maMpApplyAutoValues() : { current:0, totalMax:0, classMp:0, bonusMp:0, maxTemp:0, maxSpellLevel:0, score:10 };
    title.textContent = 'Edit MP';
    html = `
      <div class="formula-line"><div class="mp-formula-title"><span>Temp MP + MP = Current MP</span><span class="mp-total-readout">${Math.trunc(Number(mpInfo.current)||0)}</span></div><div class="formula-parts">${statField('Temp MP','mp_temp')}${statField('MP','mp')}<div class="mini-field"><label>Current MP</label><input class="graybase" readonly type="number" value="${Math.trunc(Number(mpInfo.current)||0)}"></div></div></div>
      <div class="formula-line"><div class="mp-formula-title"><span>Class MP + Bonus MP + Max Temp = Total Max</span><span class="mp-total-readout">${Math.trunc(Number(mpInfo.totalMax)||0)}</span></div><div class="formula-parts">${statField('Class MP','mp_class', {readonly:true})}${statField('Bonus MP','mp_bonus', {readonly:true})}${statField('Max Temp','mp_max_temp')}<div class="mini-field"><label>Spell Level</label><input class="graybase" readonly type="number" value="${Math.trunc(Number(mpInfo.maxSpellLevel)||0)}"></div><div class="mini-field"><label>Spell Base Score</label><input class="graybase" readonly type="number" value="${Math.trunc(Number(mpInfo.score)||0)}"></div><div class="mini-field"><label>Total Max</label><input class="graybase" readonly type="number" value="${Math.trunc(Number(mpInfo.totalMax)||0)}"></div></div></div>`;
  }
  if(section === 'general') { title.textContent = 'Edit Base Combat Stats'; html = `<div class="formula-line"><div class="formula-parts">${statField('Initiative Temp','init_temp')}${statField('BAB Base','bab', {readonly:true})}${statField('BAB Temp','bab_temp')}${statField('Speed','speed')}</div></div>`; }
  if(section === 'ac') { title.textContent = 'Edit Defense'; html = `
    <div class="formula-line"><strong>Armor Class</strong><div class="formula-parts"><div class="mini-field"><label>Base</label><input value="10" readonly class="graybase"></div><div class="mini-field"><label>DEX</label><input value="${modFor('dex')}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${document.getElementById('size_mod')?.value||0}" readonly class="graybase"></div>${statField('Armor','ac_armor')}${statField('Natural','ac_natural')}${statField('Deflect','ac_deflect')}${statField('Dodge','ac_dodge')}${statField('Temp','ac_temp')}<div class="total-pill">${document.getElementById('ac_total')?.value||10}</div></div></div>
    <div class="formula-line"><strong>Touch AC</strong><div class="formula-parts"><div class="mini-field"><label>Base</label><input value="10" readonly class="graybase"></div><div class="mini-field"><label>DEX</label><input value="${modFor('dex')}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${document.getElementById('size_mod')?.value||0}" readonly class="graybase"></div>${statField('Deflect','ac_deflect')}${statField('Dodge','ac_dodge')}${statField('Temp','touch_temp')}<div class="total-pill">${10 + modFor('dex') + numVal('size_mod') + numVal('ac_deflect') + numVal('ac_dodge') + numVal('touch_temp')}</div></div></div>
    <div class="formula-line"><strong>Flat-Footed</strong><div class="formula-parts"><div class="mini-field"><label>Base</label><input value="10" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${document.getElementById('size_mod')?.value||0}" readonly class="graybase"></div>${statField('Armor','ac_armor')}${statField('Natural','ac_natural')}${statField('Deflect','ac_deflect')}${statField('Temp','flat_temp')}<div class="total-pill">${10 + numVal('size_mod') + numVal('ac_armor') + numVal('ac_natural') + numVal('ac_deflect') + numVal('flat_temp')}</div></div></div>
    <div class="formula-line"><strong>CMD</strong><div class="formula-parts"><div class="mini-field"><label>Base</label><input value="10" readonly class="graybase"></div><div class="mini-field"><label>STR</label><input value="${modFor('str')}" readonly class="graybase"></div><div class="mini-field"><label>DEX</label><input value="${modFor('dex')}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${document.getElementById('size_special')?.value||0}" readonly class="graybase"></div>${statField('Temp','cmd_temp')}<div class="total-pill">${document.getElementById('cmd_total')?.value||10}</div></div></div>`; }
  if(section === 'ar') { 
    title.textContent = 'Edit Attack'; 
    const babShown = numVal('bab') + numVal('bab_temp');
    const sizeShown = numVal('size_mod');
    const meleeAbilityKey = getAttackAbility('ar_melee_ability', 'str');
    const rangedAbilityKey = getAttackAbility('ar_ranged_ability', 'dex');
    const touchAbilityKey = getAttackAbility('ar_touch_ability', 'str');
    const rangedTouchAbilityKey = getAttackAbility('ar_ranged_touch_ability', 'dex');
    const meleeTotal = babShown + modFor(meleeAbilityKey) + sizeShown + numVal('ar_melee_temp');
    const rangedTotal = babShown + modFor(rangedAbilityKey) + sizeShown + numVal('ar_ranged_temp');
    const touchTotal = babShown + modFor(touchAbilityKey) + sizeShown + numVal('ar_touch_temp');
    const rangedTouchTotal = babShown + modFor(rangedTouchAbilityKey) + sizeShown + numVal('ar_ranged_touch_temp');
    const cmbTotal = babShown + modFor('str') + modFor('dex') + numVal('size_special') + numVal('cmb_temp');
    html = `
    <div class="formula-line"><strong>Melee</strong><div class="formula-parts"><div class="mini-field"><label>BAB</label><input value="${babShown}" readonly class="graybase"></div>${attackAbilityField('Ability','ar_melee_ability','str')}<div class="mini-field"><label>Ability Mod</label><input value="${modFor(meleeAbilityKey)}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${sizeShown}" readonly class="graybase"></div>${statField('Temp','ar_melee_temp')}<div class="total-pill">${signedAttackTotal(meleeTotal)}</div></div></div>
    <div class="formula-line"><strong>Ranged</strong><div class="formula-parts"><div class="mini-field"><label>BAB</label><input value="${babShown}" readonly class="graybase"></div>${attackAbilityField('Ability','ar_ranged_ability','dex')}<div class="mini-field"><label>Ability Mod</label><input value="${modFor(rangedAbilityKey)}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${sizeShown}" readonly class="graybase"></div>${statField('Temp','ar_ranged_temp')}<div class="total-pill">${signedAttackTotal(rangedTotal)}</div></div></div>
    <div class="formula-line"><strong>Touch</strong><div class="formula-parts"><div class="mini-field"><label>BAB</label><input value="${babShown}" readonly class="graybase"></div>${attackAbilityField('Ability','ar_touch_ability','str')}<div class="mini-field"><label>Ability Mod</label><input value="${modFor(touchAbilityKey)}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${sizeShown}" readonly class="graybase"></div>${statField('Temp','ar_touch_temp')}<div class="total-pill">${signedAttackTotal(touchTotal)}</div></div></div>
    <div class="formula-line"><strong>Ranged Touch</strong><div class="formula-parts"><div class="mini-field"><label>BAB</label><input value="${babShown}" readonly class="graybase"></div>${attackAbilityField('Ability','ar_ranged_touch_ability','dex')}<div class="mini-field"><label>Ability Mod</label><input value="${modFor(rangedTouchAbilityKey)}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${sizeShown}" readonly class="graybase"></div>${statField('Temp','ar_ranged_touch_temp')}<div class="total-pill">${signedAttackTotal(rangedTouchTotal)}</div></div></div>
    <div class="formula-line"><strong>CMB</strong><div class="formula-parts"><div class="mini-field"><label>BAB</label><input value="${babShown}" readonly class="graybase"></div><div class="mini-field"><label>STR</label><input value="${modFor('str')}" readonly class="graybase"></div><div class="mini-field"><label>DEX</label><input value="${modFor('dex')}" readonly class="graybase"></div><div class="mini-field"><label>Size</label><input value="${document.getElementById('size_special')?.value||0}" readonly class="graybase"></div>${statField('Temp','cmb_temp')}<div class="total-pill">${signedAttackTotal(cmbTotal)}</div></div></div>`; 
  }
  if(section === 'saves') { title.textContent = 'Edit Saves'; html = `
    <div class="formula-line"><strong>Fortitude</strong><div class="formula-parts"><div class="mini-field"><label>CON</label><input value="${modFor('con')}" readonly class="graybase"></div>${statField('Base','fort_base', {readonly:true})}${statField('Enhance','fort_enhance')}${statField('Temp','fort_temp')}<div class="total-pill">${document.getElementById('fort_bonus')?.value>=0?`+${document.getElementById('fort_bonus').value}`:`${document.getElementById('fort_bonus').value||0}`}</div></div></div>
    <div class="formula-line"><strong>Reflex</strong><div class="formula-parts"><div class="mini-field"><label>DEX</label><input value="${modFor('dex')}" readonly class="graybase"></div>${statField('Base','ref_base', {readonly:true})}${statField('Enhance','ref_enhance')}${statField('Temp','ref_temp')}<div class="total-pill">${document.getElementById('ref_bonus')?.value>=0?`+${document.getElementById('ref_bonus').value}`:`${document.getElementById('ref_bonus').value||0}`}</div></div></div>
    <div class="formula-line"><strong>Will</strong><div class="formula-parts"><div class="mini-field"><label>WIS</label><input value="${modFor('wis')}" readonly class="graybase"></div>${statField('Base','will_base', {readonly:true})}${statField('Enhance','will_enhance')}${statField('Temp','will_temp')}<div class="total-pill">${document.getElementById('will_bonus')?.value>=0?`+${document.getElementById('will_bonus').value}`:`${document.getElementById('will_bonus').value||0}`}</div></div></div>`; }
  body.innerHTML = html;
  body.querySelectorAll('[data-stat-field]').forEach(el => {
    const applyStatField = () => {
      const id = el.dataset.statField;
      setVal(id, el.value);
      if(id === 'size_category') syncSizeFields();
      computeDerivedStats();
      save();
      if(section === 'ar' || section === 'ac' || section === 'saves' || section === 'general' || section === 'mp' || id === 'size_category' || id === 'init_temp' || id === 'bab' || id === 'bab_temp' || id === 'speed' || id === 'speed_temp' || /_ability$/.test(id) || /_(base|enhance|temp)$/.test(id) || /^mp/.test(id)) {
        openStatEdit(section);
      }
    };
    el.addEventListener('input', applyStatField);
    el.addEventListener('change', applyStatField);
  });
  document.getElementById('statEditOverlay').style.display = 'flex';
};
window.closeStatEdit = () => { const o = document.getElementById('statEditOverlay'); if(o) o.style.display = 'none'; };
function getNotesData() { return document.getElementById('notesArea')?.value || ''; }
function renderNotesList() { return; }
function saveNotesData(notes) { const el = document.getElementById('notesArea'); if(el) el.value = String(notes || ''); if (typeof triggerSave === 'function') triggerSave(); else if (typeof save === 'function') save(); }
window.addNoteCard = () => {};
function ensureLimitBreak() { return; }
function updateLimitBreakState() {
  if(document.getElementById('activeList')) renderAbilities('active');
}



/* --- Chat + Roll Pass 1 --- */
const CHAT_TARGET_STORAGE_KEY = 'mountAetheriaChatTarget';
const CHAT_LOG_STORAGE_PREFIX = 'mountAetheriaChatLog';
let localChatMessages = [];
let activeChatStorageKey = '';

const CHAT_VIEW_STORAGE_KEY = 'mountAetheriaChatView';
const GLOBAL_CHAT_COLLECTION = 'globalRollFeed';
const CHAT_PANEL_STORAGE_KEY = 'mountAetheriaChatPanelState';
let currentChatView = 'local';
const rollOverlayEnabled = true;
let globalChatMessages = [];
let unsubscribeGlobalChat = null;
function persistChatView(){ try { localStorage.setItem(CHAT_VIEW_STORAGE_KEY, currentChatView); } catch(_err) {} }
function getPanelState(key){ try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch(_err) { return {}; } }
function setPanelState(key, state){ try { localStorage.setItem(key, JSON.stringify(state || {})); } catch(_err) {} }
function clampFloatingPosition(panel, left, top, minTop = 58){
  const width = panel?.offsetWidth || 340;
  const height = panel?.offsetHeight || 420;
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(minTop, window.innerHeight - height - 8);
  return { left: Math.min(Math.max(8, Number.isFinite(left) ? left : maxLeft), maxLeft), top: Math.min(Math.max(minTop, Number.isFinite(top) ? top : minTop + 20), maxTop) };
}
function initDraggableFloatingPanel(panelId, handleId, storageKey, defaultFactory){
  const panel = document.getElementById(panelId);
  const handle = document.getElementById(handleId);
  if(!panel || !handle || panel.dataset.dragReady === '1') return;
  panel.dataset.dragReady = '1';
  let dragging = false, pointerId = null, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  const move = (e) => {
    if(!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    const pos = clampFloatingPosition(panel, startLeft + (e.clientX - startX), startTop + (e.clientY - startY), panelId === 'localChatPanel' ? 72 : 58);
    panel.style.left = pos.left + 'px';
    panel.style.top = pos.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  };
  const end = (e) => {
    if(!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    dragging = false;
    try { handle.releasePointerCapture?.(pointerId); } catch(_err) {}
    pointerId = null;
    const state = getPanelState(storageKey);
    const pos = clampFloatingPosition(panel, parseFloat(panel.style.left), parseFloat(panel.style.top), panelId === 'localChatPanel' ? 72 : 58);
    setPanelState(storageKey, { ...state, open: panel.classList.contains('open'), left: pos.left, top: pos.top });
  };
  handle.addEventListener('pointerdown', (e) => {
    if(e.button !== undefined && e.button !== 0) return;
    if(e.target.closest('button,select,input,textarea,a')) return;
    if(!panel.classList.contains('open')) return;
    dragging = true;
    pointerId = e.pointerId ?? null;
    startX = e.clientX; startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    try { handle.setPointerCapture?.(pointerId); } catch(_err) {}
    e.preventDefault();
  });
  window.addEventListener('pointermove', move, { passive:true });
  window.addEventListener('pointerup', end, { passive:true });
  window.addEventListener('pointercancel', end, { passive:true });
  window.addEventListener('resize', () => {
    const state = getPanelState(storageKey);
    if(!state.open) return;
    const pos = clampFloatingPosition(panel, parseFloat(panel.style.left), parseFloat(panel.style.top), panelId === 'localChatPanel' ? 72 : 58);
    setPanelState(storageKey, { ...state, left: pos.left, top: pos.top });
    applyFloatingPanelState(panelId, storageKey, defaultFactory);
  }, { passive:true });
}
function applyFloatingPanelState(panelId, storageKey, defaultFactory){
  const panel = document.getElementById(panelId);
  if(!panel) return;
  const state = getPanelState(storageKey);
  const isOpen = !!state.open;
  if(isOpen){
    const base = (Number.isFinite(state.left) && Number.isFinite(state.top)) ? { left:Number(state.left), top:Number(state.top) } : defaultFactory();
    const pos = clampFloatingPosition(panel, base.left, base.top, panelId === 'localChatPanel' ? 72 : 58);
    panel.style.left = pos.left + 'px';
    panel.style.top = pos.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  panel.classList.toggle('open', isOpen);
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}
function toggleFloatingPanel(panelId, storageKey, force, defaultFactory, onOpen){
  initDraggableFloatingPanel(panelId, 'localChatHeader', storageKey, defaultFactory);
  const state = getPanelState(storageKey);
  const shouldOpen = (typeof force === 'boolean') ? force : !document.getElementById(panelId)?.classList.contains('open');
  const next = { ...state, open: shouldOpen };
  if(shouldOpen && (!Number.isFinite(next.left) || !Number.isFinite(next.top))){
    const pos = defaultFactory();
    next.left = pos.left; next.top = pos.top;
  }
  setPanelState(storageKey, next);
  applyFloatingPanelState(panelId, storageKey, defaultFactory);
  if(shouldOpen && typeof onOpen === 'function') onOpen();
}
function defaultChatPanelPosition(){
  const panel = document.getElementById('localChatPanel');
  const width = panel?.offsetWidth || 380;
  const height = panel?.offsetHeight || 520;
  const left = window.innerWidth <= 700 ? 8 : Math.max(8, window.innerWidth - width - 16);
  const top = window.innerWidth <= 700 ? Math.max(72, window.innerHeight - height - 8) : 146;
  return clampFloatingPosition(panel, left, top, 72);
}
function setChatView(_view){
  currentChatView = 'local';
  persistChatView();
  renderChatViewControls();
  renderLocalChat();
}
function renderChatViewControls(){
  currentChatView = 'local';
  const localBtn = document.getElementById('chatViewLocalBtn');
  const globalBtn = document.getElementById('chatViewGlobalBtn');
  if(localBtn) localBtn.classList.add('active');
  if(globalBtn) globalBtn.classList.remove('active');
  const clearBtn = document.getElementById('localChatClearBtn');
  if(clearBtn) clearBtn.disabled = false;
}
function subscribeGlobalChat(){
  if(typeof collection !== 'function' || typeof onSnapshot !== 'function' || !db) return;
  try { if (unsubscribeGlobalChat) unsubscribeGlobalChat(); } catch(_err) {}
  try {
    unsubscribeGlobalChat = onSnapshot(collection(db, GLOBAL_CHAT_COLLECTION), (snap) => {
      globalChatMessages = snap.docs.map(docSnap => {
        const data = docSnap.data() || {};
        let createdMs = 0;
        const createdAt = data.createdAt;
        if (createdAt && typeof createdAt.toMillis === 'function') createdMs = createdAt.toMillis();
        else if (createdAt && typeof createdAt.seconds === 'number') createdMs = createdAt.seconds * 1000;
        else if (typeof data.clientTs === 'number') createdMs = data.clientTs;
        const stamp = data.stamp || (createdMs ? new Date(createdMs).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : '');
        return {
          kind: data.kind || 'roll',
          title: data.title || 'Entry',
          subtitle: data.subtitle || data.sheet || '',
          lines: Array.isArray(data.lines) ? data.lines : [],
          results: Array.isArray(data.results) ? data.results : [],
          stamp,
          _sortTs: createdMs || 0,
          author: data.author || ''
        };
      }).sort((a,b) => (a._sortTs || 0) - (b._sortTs || 0)).slice(-120);
      if (currentChatView === 'global') renderLocalChat();
    }, (err) => console.warn('Global chat subscription failed', err));
  } catch (err) {
    console.warn('Global chat setup failed', err);
  }
}
async function sendGlobalEntry(entry){
  if(typeof addDoc !== 'function' || typeof collection !== 'function' || !db) throw new Error('Global feed is not available in this build.');
  await addDoc(collection(db, GLOBAL_CHAT_COLLECTION), {
    kind: entry?.kind || 'roll',
    title: entry?.title || 'Entry',
    subtitle: entry?.subtitle || '',
    lines: Array.isArray(entry?.lines) ? entry.lines : [],
    results: Array.isArray(entry?.results) ? entry.results : [],
    stamp: entry?.stamp || chatStamp(),
    author: (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : ((typeof currentParentUid !== 'undefined' && currentParentUid) ? currentParentUid : 'Unknown'),
    sheet: currentChatSheetLabel(),
    source: location.pathname.split('/').pop() || '',
    clientTs: Date.now(),
    createdAt: new Date()
  });
}
function togglePanelMenu(force){
  const pop = document.getElementById('panelMenuPopover');
  if(!pop) return;
  const next = (typeof force === 'boolean') ? force : !pop.classList.contains('open');
  pop.classList.toggle('open', next);
  pop.setAttribute('aria-hidden', next ? 'false' : 'true');
}
window.togglePanelMenu = togglePanelMenu;


function chatEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] || ch));
}
function signedChatNumber(value) {
  const num = Number(value) || 0;
  return num >= 0 ? `+${num}` : `${num}`;
}
function readNumericValue(id, fallback = 0) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const raw = ('value' in el && el.value !== undefined && el.value !== '') ? el.value : (el.textContent || '');
  const match = String(raw).match(/[-+]?\d+/);
  const parsed = match ? Number(match[0]) : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function currentChatSheetLabel() {
  const data = (typeof getActiveData === 'function') ? (getActiveData() || {}) : {};
  const name = String(data.charName || document.getElementById('charName')?.value || document.getElementById('sheetTitle')?.textContent || 'Character').trim();
  return name || 'Character';
}
function currentChatStorageKey() {
  const data = (typeof getActiveData === 'function') ? (getActiveData() || {}) : {};
  const owner = (typeof currentUser !== 'undefined' && currentUser?.uid) ? currentUser.uid : ((typeof currentParentUid !== 'undefined' && currentParentUid) ? currentParentUid : 'local');
  const characterId = (typeof currentSummonId !== 'undefined' && currentSummonId) ? currentSummonId : String(data.charName || document.getElementById('charName')?.value || 'sheet');
  return `${CHAT_LOG_STORAGE_PREFIX}:${owner}:${characterId}`;
}
function ensureChatStateLoaded() {
  const key = currentChatStorageKey();
  if (key === activeChatStorageKey) return;
  activeChatStorageKey = key;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    localChatMessages = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Could not load local chat history', err);
    localChatMessages = [];
  }
  renderLocalChat();
}
function persistLocalChat() {
  try { localStorage.setItem(activeChatStorageKey || currentChatStorageKey(), JSON.stringify(localChatMessages.slice(-80))); }
  catch (err) { console.warn('Could not persist local chat history', err); }
}
function persistChatTarget() {
  const el = document.getElementById('chatTargetSelect');
  if (!el) return;
  if (el.value !== 'discord') el.value = 'discord';
  try { localStorage.setItem(CHAT_TARGET_STORAGE_KEY, 'discord'); } catch(_err) {}
}
function setChatSubtitle() {
  const sub = document.getElementById('localChatSubtitle');
  if (sub) sub.textContent = currentChatSheetLabel();
}
function renderLocalChat() {
  setChatSubtitle();
  renderChatViewControls();
  const log = document.getElementById('localChatLog');
  if (!log) return;
  const useGlobal = currentChatView === 'global';
  const messages = useGlobal ? globalChatMessages : localChatMessages;
  if (!messages.length) {
    log.innerHTML = useGlobal
      ? '<div class="local-chat-empty">Website chat is local to this sheet.</div>'
      : '<div class="local-chat-empty">Use roll and send actions to post Initiative, Saves, Skills, Ability checks, spells, weapons, and abilities here and to Discord.</div>';
    return;
  }
  log.innerHTML = messages.map(entry => {
    const title = chatEscapeHtml(entry.title || 'Entry');
    const stamp = chatEscapeHtml(entry.stamp || '');
    const subtitleParts = [];
    if (entry.subtitle) subtitleParts.push(chatEscapeHtml(entry.subtitle));
    if (useGlobal && entry.author) subtitleParts.push(chatEscapeHtml(entry.author));
    const subtitle = subtitleParts.length ? `<div class="chat-entry-subtitle">${subtitleParts.join(' • ')}</div>` : '';
    const lines = (entry.lines || []).map(line => `<div class="chat-entry-line quote">${chatEscapeHtml(line)}</div>`).join('');
    const results = (entry.results || []).map(line => `<div class="chat-entry-result">${line}</div>`).join('');
    const extraClass = entry.kind === 'system' ? ' system' : '';
    return `<div class="chat-entry${extraClass}"><div class="chat-entry-top"><div class="chat-entry-title"># ${title}</div><div class="chat-entry-stamp">${stamp}</div></div>${subtitle}${lines ? `<div class="chat-entry-lines">${lines}</div>` : ''}${results ? `<div class="chat-entry-results">${results}</div>` : ''}</div>`;
  }).join('');
  log.scrollTop = log.scrollHeight;
}
function toggleLocalChat(force) {
  ensureChatStateLoaded();
  toggleFloatingPanel('localChatPanel', CHAT_PANEL_STORAGE_KEY, force, defaultChatPanelPosition, renderLocalChat);
}
function initChatPanelDrag(){ initDraggableFloatingPanel('localChatPanel', 'localChatHeader', CHAT_PANEL_STORAGE_KEY, defaultChatPanelPosition); applyFloatingPanelState('localChatPanel', CHAT_PANEL_STORAGE_KEY, defaultChatPanelPosition); }
function clearLocalChat() {
  currentChatView = 'local';
  ensureChatStateLoaded();
  localChatMessages = [];
  persistLocalChat();
  renderLocalChat();
}
function closeAllRollMenus() {
  document.querySelectorAll('.roll-menu.show').forEach(menu => menu.classList.remove('show'));
}
function toggleSaveRollMenu(event) {
  const menu = document.getElementById('saveRollMenu');
  if (!menu) return;
  const next = !menu.classList.contains('show');
  closeAllRollMenus();
  if (!next) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 170, Math.max(12, rect.left));
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.min(window.innerHeight - 170, rect.bottom + 8)}px`;
  menu.classList.add('show');
}
function toggleAttackRollMenu(event) {
  const menu = document.getElementById('attackRollMenu');
  if (!menu) return;
  const next = !menu.classList.contains('show');
  closeAllRollMenus();
  if (!next) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 170, Math.max(12, rect.left));
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.min(window.innerHeight - 220, rect.bottom + 8)}px`;
  menu.classList.add('show');
}
function rollAttackCheck(kind) {
  closeAllRollMenus();
  const cfg = attackConfigFromMode(kind);
  if (!cfg) return;
  const roll = rollD20WithModifier(cfg.total);
  const outcome = d20OutcomeMeta(roll);
  routeChatEntry({
    kind: 'roll',
    title: cfg.mode === 'cmb' ? 'CMB' : `${cfg.label} Attack`,
    subtitle: currentChatSheetLabel(),
    lines: [rollCalcLine(roll, cfg.parts)],
    results: simpleRollResultLines(roll),
    ...d20EntryExtra(outcome)
  });
}

function chatStamp() {
  try {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}
function postChatEntry(entry, options = {}) {
  ensureChatStateLoaded();
  localChatMessages.push({ ...entry, stamp: entry.stamp || chatStamp(), _sortTs: Date.now() });
  localChatMessages = localChatMessages.slice(-80);
  persistLocalChat();
  if (currentChatView !== 'global') renderLocalChat();
  if (options.open) {
    currentChatView = 'local';
    persistChatView();
    toggleLocalChat(true);
  }
}

function stripChatHtml(value = ''){
  const holder = document.createElement('div');
  holder.innerHTML = String(value || '').replace(/<br\s*\/?>/gi, ' ');
  return (holder.textContent || holder.innerText || '').replace(/\s+/g, ' ').trim();
}
function extractRollOverlayTotals(entry){
  if(!entry || entry.kind !== 'roll') return [];
  const results = Array.isArray(entry.results) ? entry.results : [];
  const totals = [];
  for(const html of results){
    const text = stripChatHtml(html);
    if(!text || /natural\s+(?:1|20)/i.test(text)) continue;
    const lower = text.toLowerCase();
    if(/crit\s*!/i.test(text) && !/attack\s*roll/i.test(text)) continue;
    const labelMatch = text.match(/^([^:]{1,40}):/);
    const rawLabel = labelMatch ? labelMatch[1].trim() : 'Roll';
    const label = /dmg|damage|dice\s*roll/i.test(rawLabel) ? 'Dice Roll' : (/attack/i.test(rawLabel) ? 'Attack' : rawLabel);
    const afterColon = text.match(/:\s*(-?\d+)/);
    const firstNumber = text.match(/-?\d+/);
    const total = afterColon ? afterColon[1] : (firstNumber ? firstNumber[0] : '');
    if(total !== '') totals.push({ label, total });
    if(totals.length >= 2) break;
  }
  return totals;
}
function rollSpecialChoice(kind){
  const success = ['golden-confetti-burst','dragon-roar','treasure-explosion','magic-circle','lightning-strike'];
  const fail = ['dice-cracks','slime-drop','goblin-laugh','smoke-puff','falling-piano'];
  const list = kind === 'fail' ? fail : success;
  return list[secureRandomInt(list.length)];
}
function specialPieceStyle(i, total, spread = 280){
  const angle = (Math.PI * 2 * i / Math.max(1,total)) + (secureRandomInt(36) * Math.PI / 180);
  const dist = Math.round(spread * (.45 + secureRandomInt(70) / 100));
  const tx = Math.round(Math.cos(angle) * dist);
  const ty = Math.round(Math.sin(angle) * dist);
  const rot = secureRandomInt(720) - 360;
  return `--tx:${tx}px;--ty:${ty}px;--r:${rot}deg;--h:${secureRandomInt(60)+32};--x:${secureRandomInt(96)+2}%;`;
}
function rollSpecialAnimationHtml(animation, kind){
  const anim = String(animation || '').trim();
  if(kind === 'success') {
    if(anim === 'golden-confetti-burst') {
      return `<div class="roll-special-layer">${Array.from({length:34}, (_,i)=>`<span class="roll-special-piece confetti" style="${specialPieceStyle(i,34,310)}"></span>`).join('')}</div>`;
    }
    if(anim === 'dragon-roar') {
      return `<div class="roll-special-layer"><span class="roll-special-piece dragon">🐉</span>${Array.from({length:9},(_,i)=>`<span class="roll-special-piece fire" style="${specialPieceStyle(i,9,220)}">🔥</span>`).join('')}</div>`;
    }
    if(anim === 'treasure-explosion') {
      return `<div class="roll-special-layer">${Array.from({length:24},(_,i)=>`<span class="roll-special-piece ${i%4===0?'gem':'coin'}" style="${specialPieceStyle(i,24,290)}">${i%4===0?'💎':'🪙'}</span>`).join('')}</div>`;
    }
    if(anim === 'magic-circle') {
      return `<div class="roll-special-layer"><span class="roll-special-piece rune"></span><span class="roll-special-piece rune" style="animation-delay:.12s;transform:translate(-50%,-50%) scale(.7)"></span></div>`;
    }
    return `<div class="roll-special-layer"><span class="roll-special-piece lightning">⚡</span></div>`;
  }
  if(anim === 'dice-cracks') return `<div class="roll-special-layer"><span class="roll-special-piece crack"></span></div>`;
  if(anim === 'slime-drop') return `<div class="roll-special-layer">${Array.from({length:10},(_,i)=>`<span class="roll-special-piece slime" style="--x:${6+i*10+secureRandomInt(6)}%;animation-delay:${(i%5)*.08}s">🟢</span>`).join('')}</div>`;
  if(anim === 'goblin-laugh') return `<div class="roll-special-layer"><span class="roll-special-piece goblin">👺</span><span class="roll-special-piece goblin-text">HEH HEH!</span></div>`;
  if(anim === 'smoke-puff') return `<div class="roll-special-layer">${Array.from({length:12},(_,i)=>`<span class="roll-special-piece smoke" style="${specialPieceStyle(i,12,210)}">💨</span>`).join('')}</div>`;
  return `<div class="roll-special-layer"><span class="roll-special-piece piano">🎹</span></div>`;
}
function rollOutcomeKind(outcome){
  const key = String(outcome?.kind || '').toLowerCase();
  if(key === 'nat1' || key === 'critical-fail') return 'fail';
  if(key === 'nat20' || key === 'critical-hit' || key === 'critical-success') return 'success';
  return '';
}
function rollOutcomeStatusText(outcome){
  const key = String(outcome?.kind || '').toLowerCase();
  if(key === 'nat1' || key === 'critical-fail') return 'NAT 1!';
  if(key === 'nat20') return 'NAT 20!';
  if(key === 'critical-hit') return 'CRIT!';
  if(key === 'critical-success') return 'CRITICAL SUCCESS!';
  return '';
}
function rollOutcomeDetailText(outcome){
  if(!outcome) return '';
  const die = Number(outcome.die);
  const range = String(outcome.critRange || '').trim();
  const key = String(outcome.kind || '').toLowerCase();
  if(key === 'nat1' || key === 'critical-fail') return die === 1 ? 'Rolled a natural 1 — critical failure.' : 'Critical failure.';
  if(key === 'nat20') return 'Rolled a natural 20 — critical success.';
  if(key === 'critical-hit') return `Rolled ${Number.isFinite(die) ? die : 'within range'}${range ? ` in crit range ${range}` : ''} — critical hit.`;
  if(key === 'critical-success') return Number.isFinite(die) ? `Rolled ${die} — critical success.` : 'Critical success.';
  return '';
}
function inferRollOutcomeFromEntry(entry){
  if(entry?.d20Outcome) return entry.d20Outcome;
  const chunks = [];
  ['results','discordResults','lines','discordLines','discordOnly'].forEach(key => {
    const arr = Array.isArray(entry?.[key]) ? entry[key] : [];
    arr.forEach(v => chunks.push(stripChatHtml(v)));
  });
  const text = chunks.join(' | ');
  if(/natural\s*1|nat\s*1|critical\s*fail/i.test(text)) return { kind:'nat1', die:1 };
  if(/natural\s*20|nat\s*20/i.test(text)) return { kind:'nat20', die:20 };
  if(/crit\s*!|critical\s*hit|critical\s*success/i.test(text)) return { kind:'critical-hit' };
  return null;
}
function showRollOverlay(entry){
  if(!entry || entry.kind !== 'roll') return;
  const overlay = document.getElementById('rollResultOverlay');
  if(!overlay) return;
  const totals = extractRollOverlayTotals(entry);
  if(!totals.length) return;
  const outcome = inferRollOutcomeFromEntry(entry);
  const outcomeKind = rollOutcomeKind(outcome);
  const animation = outcomeKind ? (outcome.animation || rollSpecialChoice(outcomeKind)) : '';
  const title = chatEscapeHtml(entry.title || 'Roll');
  const diceHtml = totals.map(item => {
    const safeTotal = chatEscapeHtml(item.total);
    const safeLabel = chatEscapeHtml(item.label || 'Roll');
    return `<div class="roll-overlay-die-wrap">
      <div class="roll-dice-face" role="img" aria-label="${safeLabel} dice roll total ${safeTotal}">
        <span class="roll-dice-pip p1"></span><span class="roll-dice-pip p2"></span><span class="roll-dice-pip p3"></span><span class="roll-dice-pip p4"></span>
        <span class="roll-overlay-total">${safeTotal}</span>
      </div>
      <div class="roll-overlay-mini-label">${safeLabel}</div>
    </div>`;
  }).join('');
  const status = outcomeKind ? `<div class="roll-special-status">${chatEscapeHtml(rollOutcomeStatusText(outcome))}</div><div class="roll-special-detail">${chatEscapeHtml(rollOutcomeDetailText(outcome))}</div>` : '';
  const specialLayer = outcomeKind ? rollSpecialAnimationHtml(animation, outcomeKind) : '';
  overlay.innerHTML = `<div class="roll-overlay-card">
    ${specialLayer}
    <div class="roll-overlay-dice-row">${diceHtml}</div>
    ${status}
    <div class="roll-overlay-label">${title}</div>
  </div>`;
  overlay.className = `roll-result-overlay${outcomeKind === 'success' ? ' crit-success' : ''}${outcomeKind === 'fail' ? ' crit-fail' : ''}${animation ? ` anim-${animation}` : ''}`;
  void overlay.offsetWidth;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  clearTimeout(window.__mountAetheriaRollOverlayTimer);
  window.__mountAetheriaRollOverlayTimer = setTimeout(() => {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }, outcomeKind ? 2400 : 1650);
}
function showUsageOverlay(titleText, labelText = 'Used'){
  const overlay = document.getElementById('rollResultOverlay');
  if(!overlay) return;
  const title = chatEscapeHtml(titleText || 'Used');
  const label = chatEscapeHtml(labelText || 'Used');
  overlay.innerHTML = `<div class="roll-overlay-card usage-overlay-card">
    <div class="usage-overlay-kicker">${label}</div>
    <div class="usage-overlay-title">${title}</div>
  </div>`;
  overlay.classList.remove('show');
  void overlay.offsetWidth;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  if(typeof scheduleMountAetheriaRollOverlayHide==='function'){
    scheduleMountAetheriaRollOverlayHide(overlay,1450);
  }else{
    clearTimeout(window.__mountAetheriaRollOverlayTimer);
    window.__mountAetheriaRollOverlayTimer=setTimeout(()=>overlay.classList.remove('show'),1450);
  }
}
window.showUsageOverlay = showUsageOverlay;


const DISCORD_WORKER_URL = "https://weathered-term-1e39.phoeaung2076.workers.dev";
const DISCORD_CLIENT_COOLDOWN_MS = 2000;
const DISCORD_COOLDOWN_STORAGE_KEY = 'mountAetheriaDiscordCooldownUntil';

function entryHtmlToDiscordText(htmlValue = '') {
  const holder = document.createElement('div');
  holder.innerHTML = String(htmlValue || '')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<br\s*\/?>/gi, '\n');
  return (holder.textContent || holder.innerText || '')
    .replace(/\u2212/g, '-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function discordTitleLine(entry){
  const rawTitle = String(entry?.title || 'Entry').trim();
  const rawName = String(entry?.subtitle || '').trim();
  if(rawName && rawTitle) return `# ${rawName}: ${rawTitle}`;
  return `# ${rawTitle || rawName || 'Entry'}`;
}
function formatDiscordEntryContent(entry) {
  const parts = [];
  const titleLine = discordTitleLine(entry);
  if (titleLine) parts.push(titleLine);
  const discordLines = Array.isArray(entry?.discordLines) ? entry.discordLines : (entry?.lines || []);
  discordLines.forEach(line => {
    const text = String(line || '').trim();
    if (text) parts.push(text);
  });
  const discordResults = Array.isArray(entry?.discordResults) ? entry.discordResults : (entry?.results || []);
  discordResults.forEach(line => {
    const text = entryHtmlToDiscordText(line);
    if (text) parts.push(text);
  });
  (entry?.discordOnly || []).forEach(line => {
    const raw = String(line || '').trim();
    if (!raw) return;
    const text = /<[^>]+>/.test(raw) ? entryHtmlToDiscordText(raw) : raw;
    if (text) parts.push(text);
  });
  return parts.join('\n').trim();
}
function splitDiscordContent(content, maxLen = 1800) {
  const text = String(content || '').trim();
  if (!text) return [];
  if (text.length <= maxLen) return [text];
  const rawLines = text.split('\n');
  const chunks = [];
  let current = '';
  rawLines.forEach(line => {
    const safeLine = String(line);
    if (!current) {
      if (safeLine.length <= maxLen) {
        current = safeLine;
      } else {
        for (let i = 0; i < safeLine.length; i += maxLen) chunks.push(safeLine.slice(i, i + maxLen));
      }
      return;
    }
    const next = `${current}\n${safeLine}`;
    if (next.length <= maxLen) {
      current = next;
    } else {
      chunks.push(current);
      if (safeLine.length <= maxLen) {
        current = safeLine;
      } else {
        for (let i = 0; i < safeLine.length; i += maxLen) chunks.push(safeLine.slice(i, i + maxLen));
        current = '';
      }
    }
  });
  if (current) chunks.push(current);
  return chunks;
}
function getDiscordCooldownRemaining() {
  const until = Number(localStorage.getItem(DISCORD_COOLDOWN_STORAGE_KEY) || 0);
  return Math.max(0, until - Date.now());
}
function markDiscordCooldown() {
  localStorage.setItem(DISCORD_COOLDOWN_STORAGE_KEY, String(Date.now() + DISCORD_CLIENT_COOLDOWN_MS));
}
async function sendDiscordEntry(entry) {
  if (!DISCORD_WORKER_URL) throw new Error('Discord worker URL is missing.');
  const remaining = getDiscordCooldownRemaining();
  if (remaining > 0) {
    throw new Error(`Please wait ${(remaining / 1000).toFixed(1)}s before sending another Discord message.`);
  }
  const content = formatDiscordEntryContent(entry);
  if (!content) throw new Error('Nothing to send.');
  const chunks = splitDiscordContent(content, 1800);
  for (const chunk of chunks) {
    markDiscordCooldown();
    const response = await fetch(DISCORD_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: chunk
      })
    });
    if (!response.ok) {
      let message = `Discord relay returned ${response.status}`;
      try {
        const text = await response.text();
        if (text) message += `: ${text.slice(0, 220)}`;
      } catch (_err) {}
      throw new Error(message);
    }
  }
}
function routeChatEntry(entry) {
  if (entry?.kind === 'roll') showRollOverlay(entry);
  postChatEntry(entry);
  const targetSelect = document.getElementById('chatTargetSelect');
  if (targetSelect) targetSelect.value = 'discord';
  try { localStorage.setItem(CHAT_TARGET_STORAGE_KEY, 'discord'); } catch(_err) {}
  if (entry?.kind === 'system') return;
  sendDiscordEntry(entry).catch(err => {
    console.error('Discord send failed', err);
    postChatEntry({
      kind: 'system',
      title: 'Discord send failed',
      subtitle: 'Website chat saved',
      lines: [String(err?.message || 'Could not reach the Discord relay.')],
      results: []
    });
  });
}

function secureRandomInt(maxExclusive) {
  const max = Number(maxExclusive);
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    const maxUint = 0x100000000;
    const limit = Math.floor(maxUint / max) * max;
    const buffer = new Uint32Array(1);
    let value = 0;
    do {
      window.crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % max;
  }
  return Math.floor(Math.random() * max);
}
function rollD20WithModifier(modifier) {
  const die = secureRandomInt(20) + 1;
  const mod = Number(modifier) || 0;
  return { die, modifier: mod, total: die + mod };
}
function makeRollResultHtml(roll) {
  return `<strong>Total: ${roll.total}</strong> <span style="color:#9e9e9e;">(d20 ${roll.die} ${roll.modifier >= 0 ? '+' : '−'} ${Math.abs(roll.modifier)})</span>`;
}
function naturalRollNoteHtml(roll) {
  if (!roll) return '';
  if (roll.die === 20) return '<strong>Natural 20 — Critical Success</strong>';
  if (roll.die === 1) return '<strong>Natural 1 — Critical Failure</strong>';
  return '';
}
function d20OutcomeMeta(roll, options = {}) {
  if (!roll || !Number.isFinite(Number(roll.die))) return null;
  const die = Number(roll.die);
  const critRangeMin = Number(options.critRangeMin || 20) || 20;
  const critRange = String(options.critRange || (critRangeMin <= 20 ? (critRangeMin === 20 ? '20' : `${critRangeMin}-20`) : '')).trim();
  if (die === 1) return { kind:'nat1', die, critRange, label:'Natural 1 — Critical Failure', animation: rollSpecialChoice('fail') };
  if (die === 20) return { kind:'nat20', die, critRange, label:'Natural 20 — Critical Success', animation: rollSpecialChoice('success') };
  if (options.canCrit && die >= critRangeMin) return { kind:'critical-hit', die, critRange, label:`Critical Hit${critRange ? ` (${critRange})` : ''}`, animation: rollSpecialChoice('success') };
  if (options.forceSuccess) return { kind:'critical-success', die, critRange, label:'Critical Success', animation: rollSpecialChoice('success') };
  return null;
}
function d20OutcomeHtml(outcome) {
  if (!outcome) return '';
  if (outcome.kind === 'nat1') return '<strong>Natural 1 — Critical Failure</strong>';
  if (outcome.kind === 'nat20') return '<strong>Natural 20 — Critical Success</strong>';
  if (outcome.kind === 'critical-hit') return `<strong>Critical Hit${outcome.critRange ? ` (${chatEscapeHtml(outcome.critRange)})` : ''}</strong>`;
  if (outcome.kind === 'critical-success') return '<strong>Critical Success</strong>';
  return '';
}
function d20OutcomeDiscordLine(outcome) {
  if (!outcome) return '';
  if (outcome.kind === 'nat1') return '> D20 Outcome: Natural 1 — Critical Failure';
  if (outcome.kind === 'nat20') return '> D20 Outcome: Natural 20 — Critical Success';
  if (outcome.kind === 'critical-hit') return `> D20 Outcome: Critical Hit${outcome.critRange ? ` (${outcome.critRange})` : ''}${Number.isFinite(Number(outcome.die)) ? ` on ${outcome.die}` : ''}`;
  if (outcome.kind === 'critical-success') return '> D20 Outcome: Critical Success';
  return '';
}
function pushD20OutcomeResult(results, outcome) {
  const html = d20OutcomeHtml(outcome);
  if (html) results.push(html);
  return results;
}
function d20EntryExtra(outcome) {
  const extra = {};
  if (outcome) {
    extra.d20Outcome = outcome;
    const discordLine = d20OutcomeDiscordLine(outcome);
    if (discordLine) extra.discordOnly = [discordLine];
  }
  return extra;
}
function simpleRollResultLines(roll, label = 'Rolled Total') {
  const out = [`<strong>${chatEscapeHtml(label)}:</strong> ${chatEscapeHtml(String(roll?.total ?? 0))}`];
  pushD20OutcomeResult(out, d20OutcomeMeta(roll));
  return out;
}
function calcNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function calcPart(label, value) {
  const num = calcNumber(value);
  if (!num) return null;
  return { label: String(label || '').trim(), value: num };
}
function calcPartList(parts = []) {
  return (parts || []).map(part => calcPart(part?.label, part?.value)).filter(Boolean);
}
function shortCalcLabel(label) {
  const raw = String(label || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const statMatch = lower.match(/^(str|dex|con|int|wis|cha)(?:\s+mod)?$/);
  if (statMatch) return statMatch[1];
  const map = {
    'attack misc': 'misc',
    'misc bonus': 'misc',
    'initiative temp': 'temp',
    'class skill': 'class',
    'ability mod': 'ability',
    'bab': 'bab',
    'base': 'base',
    'enhance': 'enh',
    'temp': 'temp',
    'ranks': 'ranks',
    'size': 'size'
  };
  if (map[lower]) return map[lower];
  return raw.replace(/\bmod\b/ig, '').trim().toLowerCase();
}
function signedCalcTerm(part) {
  const value = calcNumber(part?.value);
  if (!value) return '';
  const sign = value > 0 ? '+' : '-';
  const label = shortCalcLabel(part?.label);
  return `${sign}${Math.abs(value)}${label ? ` ${label}` : ''}`;
}
function rollCalcLine(roll, parts = [], label = 'Calc') {
  const die = roll?.die ?? '?';
  const formula = [`d20 (${die})`].concat(calcPartList(parts).map(signedCalcTerm).filter(Boolean)).join(' ');
  return `> ${label}: ${formula}`;
}
function abilityModLabel(stat) {
  const key = String(stat || '').trim().toUpperCase();
  return key ? `${key} Mod` : 'Ability Mod';
}
function damageCalcLine(result, label = 'Dmg Calc', multiplier = 1) {
  if (!result || !Array.isArray(result.breakdown) || !result.breakdown.length) return '';
  const pieces = result.breakdown.map(part => String(part?.text || '').trim()).filter(Boolean);
  if (!pieces.length) return '';
  const mult = Number(multiplier || 1) || 1;
  return `> ${label}: ${pieces.join(' | ')}${mult > 1 ? ` × ${mult}` : ''}`;
}
function saveFormulaConfig(kind) {
  const map = {
    fort: { label: 'Fortitude Save', stat: 'con', statLabel: 'CON Mod', base: 'fort_base', enhance: 'fort_enhance', temp: 'fort_temp' },
    ref: { label: 'Reflex Save', stat: 'dex', statLabel: 'DEX Mod', base: 'ref_base', enhance: 'ref_enhance', temp: 'ref_temp' },
    will: { label: 'Will Save', stat: 'wis', statLabel: 'WIS Mod', base: 'will_base', enhance: 'will_enhance', temp: 'will_temp' }
  };
  const cfg = map[kind];
  if (!cfg) return null;
  const statMod = (typeof getMod === 'function') ? getMod(cfg.stat) : 0;
  const base = numVal(cfg.base);
  const enhance = numVal(cfg.enhance);
  const temp = numVal(cfg.temp);
  return {
    label: cfg.label,
    total: statMod + base + enhance + temp,
    parts: [
      { label: cfg.statLabel, value: statMod },
      { label: 'Base', value: base },
      { label: 'Enhance', value: enhance },
      { label: 'Temp', value: temp }
    ]
  };
}
function initiativeFormulaConfig() {
  const dexMod = (typeof getMod === 'function') ? getMod('dex') : 0;
  const temp = numVal('init_temp');
  return {
    total: dexMod + temp,
    parts: [
      { label: 'DEX Mod', value: dexMod },
      { label: 'Initiative Temp', value: temp }
    ]
  };
}
function normalizeAbilityKey(value, fallback = 'STR') {
  const raw = String(value || fallback || 'STR').trim();
  return raw ? raw.toLowerCase() : String(fallback || 'STR').toLowerCase();
}
function readWeaponAbilityModifier(weapon) {
  const ability = normalizeAbilityKey(weapon?.ability_mod || weapon?.mod || 'STR', 'STR');
  return (typeof modFor === 'function') ? modFor(ability) : getMod(ability);
}
function readWeaponAttackBonus(weapon) {
  const bab = readNumericValue('bab', 0) + readNumericValue('bab_temp', 0);
  const misc = Number(weapon?.attack_misc || 0) || 0;
  const size = readNumericValue('size_mod', 0);
  const abilityKey = normalizeAbilityKey(weapon?.ability_mod || weapon?.mod || 'STR', 'STR');
  const abilityMod = (typeof modFor === 'function') ? modFor(abilityKey) : getMod(abilityKey);
  return { bab, misc, size, abilityKey, abilityMod, total: bab + misc + size + abilityMod };
}
function parseCritRangeMin(value) {
  const raw = String(value || '20').trim();
  const match = raw.match(/(\d+)\s*-\s*20$/);
  if (match) return Number(match[1]) || 20;
  const single = Number(raw);
  return Number.isFinite(single) ? single : 20;
}
function parseCritMultiplier(value) {
  const raw = String(value || 'x2').trim().toLowerCase();
  const match = raw.match(/x(\d+)/);
  const mult = match ? Number(match[1]) : 2;
  return Number.isFinite(mult) && mult > 1 ? mult : 2;
}
function splitDamageSegments(expr) {
  return String(expr || '')
    .replace(/−/g, '-')
    .split('+')
    .map(part => part.trim())
    .filter(Boolean);
}
function rollDiceCount(count, sides) {
  const rolls = [];
  for (let i = 0; i < count; i += 1) rolls.push(secureRandomInt(sides) + 1);
  return rolls;
}
function rollDamageExpression(expr) {
  const segments = splitDamageSegments(expr);
  const breakdown = [];
  const typedTotals = {};
  const typedLabels = {};
  const typeOrder = [];
  let untypedTotal = 0;
  let total = 0;
  segments.forEach(segment => {
    let match = segment.match(/^(\d*)d(\d+)(?:\s+([A-Za-z][A-Za-z0-9\s\/-]*))?$/i);
    if (match) {
      const count = Number(match[1] || 1);
      const sides = Number(match[2] || 0);
      const damageType = String(match[3] || '').trim();
      if (!count || !sides) return;
      const rolls = rollDiceCount(count, sides);
      const subtotal = rolls.reduce((sum, value) => sum + value, 0);
      total += subtotal;
      if (damageType) {
        const key = damageType.toLowerCase();
        if (!(key in typedTotals)) {
          typedTotals[key] = 0;
          typedLabels[key] = damageType;
          typeOrder.push(key);
        }
        typedTotals[key] += subtotal;
      } else {
        untypedTotal += subtotal;
      }
      breakdown.push({
        text: `${count}d${sides}${damageType ? ` ${damageType}` : ''}: [${rolls.join(', ')}] = ${subtotal}`,
        total: subtotal
      });
      return;
    }
    match = segment.match(/^([-+]?\d+)(?:\s+([A-Za-z][A-Za-z0-9\s\/-]*))?$/);
    if (match) {
      const flat = Number(match[1] || 0);
      const damageType = String(match[2] || '').trim();
      total += flat;
      if (damageType) {
        const key = damageType.toLowerCase();
        if (!(key in typedTotals)) {
          typedTotals[key] = 0;
          typedLabels[key] = damageType;
          typeOrder.push(key);
        }
        typedTotals[key] += flat;
      } else {
        untypedTotal += flat;
      }
      breakdown.push({
        text: `${flat >= 0 ? '+' : ''}${flat}${damageType ? ` ${damageType}` : ''}`,
        total: flat
      });
      return;
    }
    breakdown.push({ text: segment, total: 0 });
  });
  return { formula: String(expr || '').trim(), total, untypedTotal, breakdown, typedTotals, typedLabels, typeOrder };
}
function formatDamageTotalText(result) {
  if (!result || !result.formula) return '—';
  const parts = [];
  if (result.untypedTotal) parts.push(String(result.untypedTotal));
  (result.typeOrder || []).forEach(key => {
    const value = Number(result.typedTotals?.[key] || 0);
    if (!value) return;
    const label = String(result.typedLabels?.[key] || key).trim();
    parts.push(`${value} ${label}`.trim());
  });
  const hasTyped = (result.typeOrder || []).some(key => Number(result.typedTotals?.[key] || 0));
  const needsBreakdown = hasTyped || parts.length > 1;
  return `${result.total}${needsBreakdown ? ` (${parts.join(' + ')})` : ''}`;
}
function scaleDamageResult(result, multiplier) {
  if (!result) return null;
  const mult = Number(multiplier || 1) || 1;
  const typedTotals = {};
  Object.keys(result.typedTotals || {}).forEach(key => {
    typedTotals[key] = (Number(result.typedTotals[key] || 0) || 0) * mult;
  });
  return {
    ...result,
    total: (Number(result.total || 0) || 0) * mult,
    untypedTotal: (Number(result.untypedTotal || 0) || 0) * mult,
    typedTotals
  };
}
function formatDamageRollHtml(result) {
  if (!result || !result.formula) return '<strong>—</strong>';
  return `<strong>Total: ${chatEscapeHtml(formatDamageTotalText(result))}</strong>`;
}
function buildDiscordCritBundle({ isCrit, attack, attackParts, baseDamageResult, damageExpr, multiplier = 2, attackLabel = 'Attack' } = {}) {
  if (!isCrit || !attack) return { calcLines: [], resultLines: [] };
  const calcLines = [];
  const resultLines = [];
  const confirmRoll = rollD20WithModifier(attack.total);
  calcLines.push(rollCalcLine(confirmRoll, attackParts || attack.parts || [], 'Crit AR Calc'));
  resultLines.push(`<strong>Crit AR${attackLabel ? ` (${chatEscapeHtml(attackLabel)})` : ''}:</strong> ${chatEscapeHtml(String(confirmRoll.total))}`);
  const dmgText = String(damageExpr || '').trim();
  const normalDamage = baseDamageResult || (dmgText ? rollDamageExpression(dmgText) : null);
  if (normalDamage) {
    const mult = parseCritMultiplier(`x${Number(multiplier || 2) || 2}`);
    calcLines.push(`> Crit Dmg Calc: Dmg x${mult}`);
    const critDamage = scaleDamageResult(normalDamage, mult);
    resultLines.push(`<strong>Crit Dmg:</strong> ${chatEscapeHtml(formatDamageTotalText(critDamage))}`);
  }
  return { calcLines, resultLines };
}
function buildDiscordCritConfirmLines(options = {}) {
  const bundle = buildDiscordCritBundle(options);
  return [...bundle.calcLines, ...bundle.resultLines];
}
function updateWeaponAmmo(index, value) {
  const list = getActiveData().weapons || [];
  if (!list[index]) return;
  if (value === '') {
    list[index].ammo = '';
  } else {
    const parsed = Number(value);
    list[index].ammo = Number.isFinite(parsed) ? String(parsed) : String(value);
  }
  if (typeof triggerSave === 'function') triggerSave(); else if (typeof saveDataOnly === 'function') saveDataOnly(); else if (typeof save === 'function') save();
  renderWeapons();
}
function weaponAttackTitle(weapon) {
  return `${weapon?.name || 'Weapon'} Attack`;
}
function sendWeaponCard(index) {
  const list = getActiveData().weapons || [];
  const source = list[index];
  if (!source) return;
  const weapon = normalizeWeaponData(source);
  Object.assign(source, weapon);
  const attack = readWeaponAttackBonus(weapon);
  routeChatEntry({
    kind: 'info',
    title: weapon.name || 'Weapon',
    subtitle: currentChatSheetLabel(),
    lines: [
      `> Type: ${weapon.type || '—'}`,
      `> Attack Roll: d20 + BAB + attack misc + ${String(weapon.ability_mod || 'STR').toUpperCase()} + size`,
      `> Attack Total: ${signedChatNumber(attack.total)} (${signedChatNumber(attack.bab)} BAB, ${signedChatNumber(attack.misc)} misc, ${signedChatNumber(attack.abilityMod)} ${String(weapon.ability_mod || 'STR').toUpperCase()}, ${signedChatNumber(attack.size)} size)`,
      `> Damage: ${weapon.damage || '—'}`,
      `> Crit: ${weapon.crit_range || '20'} / ${weapon.crit_mult || 'x2'}`,
      `> Range: ${weapon.range || '—'}${shouldShowWeaponAmmo(weapon.ammo) ? ` | Ammo: ${weapon.ammo}` : ''}`
    ],
    results: []
  });
}
function rollWeaponAttack(index) {
  const list = getActiveData().weapons || [];
  const source = list[index];
  if (!source) return;
  const weapon = normalizeWeaponData(source);
  Object.assign(source, weapon);
  const attack = readWeaponAttackBonus(weapon);
  const attackParts = [
    { label: 'BAB', value: attack.bab },
    { label: abilityModLabel(attack.abilityKey || weapon.ability_mod || weapon.mod || 'STR'), value: attack.abilityMod },
    { label: 'Size', value: attack.size },
    { label: 'Attack Misc', value: attack.misc }
  ];
  const attackRoll = rollD20WithModifier(attack.total);
  const critMin = parseCritRangeMin(weapon.crit_range);
  const isCrit = attackRoll.die !== 1 && attackRoll.die >= critMin;
  const outcome = d20OutcomeMeta(attackRoll, { canCrit: true, critRangeMin: critMin, critRange: weapon.crit_range || (critMin === 20 ? '20' : `${critMin}-20`) });
  const calcLines = [rollCalcLine(attackRoll, attackParts, 'AR Calc')];
  const results = [`<strong>Attack Roll:</strong> ${chatEscapeHtml(String(attackRoll.total))}${isCrit ? ' <strong>Crit !!!</strong>' : ''}`];
  pushD20OutcomeResult(results, outcome);
  const damageExpr = String(weapon.damage || '').trim();
  let damageResult = null;
  if (damageExpr) {
    damageResult = rollDamageExpression(damageExpr);
    const dmgLine = damageCalcLine(damageResult, 'Dice Roll Calc');
    if (dmgLine) calcLines.push(dmgLine);
    results.push(`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(damageResult))}`);
  }
  const lines = calcLines.slice();
  lines.push(`> Range: ${weapon.range || '—'}${shouldShowWeaponAmmo(weapon.ammo) ? ` | Ammo: ${weapon.ammo}` : ''}`);
  const critBundle = buildDiscordCritBundle({
    isCrit,
    attack,
    attackParts,
    baseDamageResult: damageResult,
    damageExpr,
    multiplier: parseCritMultiplier(weapon.crit_mult || 'x2'),
    attackLabel: 'Attack Roll'
  });
  const discordLines = calcLines.concat(critBundle.calcLines);
  const discordResults = results.concat(critBundle.resultLines);
  routeChatEntry({ kind: 'roll', title: `${weapon.name || 'Weapon'}${isCrit ? ' — Crit!' : ''}`, subtitle: currentChatSheetLabel(), lines, results, discordLines, discordResults, ...d20EntryExtra(outcome) });
}
function rollWeaponDamage(index) {
  const list = getActiveData().weapons || [];
  const source = list[index];
  if (!source) return;
  const weapon = normalizeWeaponData(source);
  Object.assign(source, weapon);
  const damageExpr = String(weapon.damage || '').trim();
  if (!damageExpr) return;
  const damageResult = rollDamageExpression(damageExpr);
  const dmgLine = damageCalcLine(damageResult, 'Dice Roll Calc');
  routeChatEntry({
    kind: 'roll',
    title: `${weapon.name || 'Weapon'} Damage`,
    subtitle: currentChatSheetLabel(),
    lines: dmgLine ? [dmgLine] : [],
    results: [`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(damageResult))}`]
  });
}
window.sendWeaponCard = sendWeaponCard;
window.rollWeaponAttack = rollWeaponAttack;
window.rollWeaponDamage = rollWeaponDamage;
window.updateWeaponAmmo = updateWeaponAmmo;
function skillRowName(row) {
  const cell = row?.querySelector('.skill-name-cell');
  if (!cell) return 'Skill Check';
  const customInput = cell.querySelector('input');
  if (customInput && customInput.value.trim()) return customInput.value.trim();
  const clone = cell.cloneNode(true);
  clone.querySelectorAll('small,input').forEach(el => el.remove());
  const name = clone.textContent.replace(/\s+/g, ' ').trim();
  return name || 'Skill Check';
}
function spellChatTitle(spell) {
  return `${spell?.name || 'Spell'}`;
}
function spellSendLines(spell) {
  const lines = [
    `> Level: ${spell?.lvl || 'Cantrip'} | Action: ${maNormalizeActionType(spell?.type || 'Standard')}`,
    `> Range: ${spell?.range || '—'} | Target: ${spell?.target || '—'} | Duration: ${spell?.duration || '—'}`,
    `> Attack Type: ${spell?.attack_type || '—'} | Dice Roll: ${spell?.damage || '—'}`,
    `> Save: ${spell?.saving_throw || '—'} | DC: ${spellDcDisplayValue(spell)} | SR: ${spell?.spell_resist || '—'}`
  ];
  if (String(spell?.desc || '').trim()) lines.push(`> Description: ${String(spell.desc).trim()}`);
  if (String(spell?.at_higher_lvls || spell?.at_higher || '').trim()) lines.push(`> At Higher Levels: ${String(spell.at_higher_lvls || spell.at_higher).trim()}`);
  return lines;
}
function sendSpellCard(index) {
  const list = getActiveData().spells || [];
  const spell = list[index];
  if (!spell) return;
  routeChatEntry({
    kind: 'info',
    title: spellChatTitle(spell),
    subtitle: currentChatSheetLabel(),
    lines: spellSendLines(spell),
    results: []
  });
}
function rollSpellAction(index) {
  const list = getActiveData().spells || [];
  const spell = list[index];
  if (!spell) return;
  const attack = spellAttackConfig(spell);
  if (!attack) { rollSpellDamage(index); return; }
  const attackRoll = rollD20WithModifier(attack.total);
  const isCrit = attackRoll.die === 20;
  const outcome = d20OutcomeMeta(attackRoll, { canCrit: true, critRangeMin: 20, critRange: '20' });
  const calcLines = [rollCalcLine(attackRoll, attack.parts, 'AR Calc')];
  const results = [`<strong>Attack Roll (${chatEscapeHtml(attack.label)}):</strong> ${chatEscapeHtml(String(attackRoll.total))}${isCrit ? ' <strong>Crit !!!</strong>' : ''}`];
  pushD20OutcomeResult(results, outcome);
  const damageExpr = String(spell?.damage || '').trim();
  let damageResult = null;
  if (damageExpr) {
    damageResult = rollDamageExpression(damageExpr);
    const dmgLine = damageCalcLine(damageResult, 'Dice Roll Calc');
    if (dmgLine) calcLines.push(dmgLine);
    results.push(`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(damageResult))}`);
  }
  const critBundle = buildDiscordCritBundle({
    isCrit,
    attack,
    attackParts: attack.parts,
    baseDamageResult: damageResult,
    damageExpr,
    multiplier: 2,
    attackLabel: attack.label
  });
  const discordLines = calcLines.concat(critBundle.calcLines);
  const discordResults = results.concat(critBundle.resultLines);
  routeChatEntry({ kind: 'roll', title: `${spellChatTitle(spell)}${isCrit ? ' — Crit!' : ''}`, subtitle: currentChatSheetLabel(), lines: calcLines, results, discordLines, discordResults, ...d20EntryExtra(outcome) });
}
function rollSpellDamage(index) {
  const list = getActiveData().spells || [];
  const spell = list[index];
  if (!spell) return;
  const damageExpr = String(spell?.damage || '').trim();
  if (!damageExpr) return;
  const damageResult = rollDamageExpression(damageExpr);
  const dmgLine = damageCalcLine(damageResult, 'Dice Roll Calc');
  const calcLines = dmgLine ? [dmgLine] : [];
  const results = [`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(damageResult))}`];
  routeChatEntry({
    kind: 'roll',
    title: `${spellChatTitle(spell)} Dice Roll`,
    subtitle: currentChatSheetLabel(),
    lines: calcLines,
    discordLines: calcLines,
    results,
    discordResults: results
  });
}
window.sendSpellCard = sendSpellCard;
window.rollSpellAction = rollSpellAction;
window.rollSpellDamage = rollSpellDamage;
function sendInitiativeRoll() {
  const init = initiativeFormulaConfig();
  const roll = rollD20WithModifier(init.total);
  const outcome = d20OutcomeMeta(roll);
  routeChatEntry({
    kind: 'roll',
    title: 'Initiative',
    subtitle: currentChatSheetLabel(),
    lines: [rollCalcLine(roll, init.parts)],
    results: simpleRollResultLines(roll, 'Total'),
    ...d20EntryExtra(outcome)
  });
}
function sendSavesOverview() {
  routeChatEntry({
    kind: 'info',
    title: 'Saves',
    subtitle: currentChatSheetLabel(),
    lines: [
      `> Fortitude: ${signedChatNumber(readNumericValue('fortDisplayMain', 0))}`,
      `> Reflex: ${signedChatNumber(readNumericValue('refDisplayMain', 0))}`,
      `> Will: ${signedChatNumber(readNumericValue('willDisplayMain', 0))}`
    ],
    results: []
  });
}
function rollSaveCheck(kind) {
  closeAllRollMenus();
  const cfg = saveFormulaConfig(kind);
  if (!cfg) return;
  const roll = rollD20WithModifier(cfg.total);
  const outcome = d20OutcomeMeta(roll);
  routeChatEntry({
    kind: 'roll',
    title: cfg.label,
    subtitle: currentChatSheetLabel(),
    lines: [rollCalcLine(roll, cfg.parts)],
    results: simpleRollResultLines(roll),
    ...d20EntryExtra(outcome)
  });
}
function sendSkillCheck(row) {
  if (!row || !syncSkillRollAvailability(row)) return;
  const name = skillRowName(row);
  const bonus = getSkillBonus(row);
  const statLabel = abilityModLabel(row.dataset.stat || '');
  const roll = rollD20WithModifier(bonus.total);
  const outcome = d20OutcomeMeta(roll);
  routeChatEntry({
    kind: 'roll',
    title: name,
    subtitle: currentChatSheetLabel(),
    lines: [rollCalcLine(roll, [
      { label: statLabel, value: bonus.mod },
      { label: 'Ranks', value: bonus.ranks },
      { label: 'Class Skill', value: bonus.classBonus },
      { label: 'Temp', value: bonus.temp }
    ])],
    results: simpleRollResultLines(roll, 'Total'),
    ...d20EntryExtra(outcome)
  });
}
function readNumericValueFromElement(el, fallback = 0) {
  if (!el) return fallback;
  const raw = ('value' in el && el.value !== undefined && el.value !== '') ? el.value : (el.textContent || '');
  const match = String(raw).match(/[-+]?\d+/);
  const parsed = match ? Number(match[0]) : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function getAbilityChatBundle(subType) {
  if (subType === 'active') return { key: 'activeAbilities', label: 'Active Ability' };
  if (subType === 'passive') return { key: 'passiveAbilities', label: 'Passive Ability' };
  if (subType === 'racial') return { key: 'racialAbilities', label: 'Racial Ability' };
  if (subType === 'feat') return { key: 'feats', label: 'Feat' };
  return { key: abilityCollectionKey(subType), label: abilityCollectionLabel(subType) };
}

function abilityCardLines(item, label = 'Active Ability') {
  const lines = [`> Category: ${label}`];
  lines.push(`> Type: ${maNormalizeActionType(item.type || 'Standard')}`);
  lines.push(`> Uses: ${item.u_curr ?? 0}/${item.u_max ?? 0}`);
  lines.push(`> Attack Type: ${item.attack_type || '—'} | Dice Roll: ${item.damage || '—'}`);
  if (item.link) lines.push(`> Link: ${item.link}`);
  if (String(item.desc || '').trim()) lines.push(`> Description: ${String(item.desc).trim()}`);
  if (String(item.at_higher_lvls || item.at_higher || '').trim()) lines.push(`> At Higher Levels: ${String(item.at_higher_lvls || item.at_higher).trim()}`);
  return lines;
}
function sendAbilityCard(subType, index) {
  const bundle = getAbilityChatBundle(subType);
  const list = getActiveData()[bundle.key] || [];
  const item = list[index];
  if (!item) return;
  const lines = subType === 'active' ? abilityCardLines(item, bundle.label) : [`> Category: ${bundle.label}`];
  if (subType !== 'active') {
    if (item.type) lines.push(`> Type: ${item.type}`);
    if (item.damage) lines.push(`> Dice Roll: ${item.damage}`);
    if (item.link) lines.push(`> Link: ${item.link}`);
    if (String(item.desc || '').trim()) lines.push(`> Description: ${String(item.desc).trim()}`);
    if (String(item.at_higher_lvls || item.at_higher || '').trim()) lines.push(`> At Higher Levels: ${String(item.at_higher_lvls || item.at_higher).trim()}`);
  }
  routeChatEntry({
    kind: 'info',
    title: item.name || bundle.label,
    subtitle: currentChatSheetLabel(),
    lines,
    results: []
  });
}
function rollAbilityAction(index, options = {}) {
  const list = getActiveData().activeAbilities || [];
  const item = list[index];
  if (!item) return;
  const attack = abilityAttackConfig(item);
  if (!attack) { rollAbilityDamage(index, options); return; }
  const attackRoll = rollD20WithModifier(attack.total);
  const isCrit = attackRoll.die === 20 && attack.mode !== 'cmb';
  const outcome = d20OutcomeMeta(attackRoll, { canCrit: attack.mode !== 'cmb', critRangeMin: 20, critRange: '20' });
  const calcLines = [rollCalcLine(attackRoll, attack.parts, 'AR Calc')];
  const results = [`<strong>Attack Roll (${chatEscapeHtml(attack.label)}):</strong> ${chatEscapeHtml(String(attackRoll.total))}${isCrit ? ' <strong>Crit !!!</strong>' : ''}`];
  pushD20OutcomeResult(results, outcome);
  const damageExpr = String(item?.damage || '').trim();
  let damageResult = null;
  if (damageExpr) {
    damageResult = rollDamageExpression(damageExpr);
    const dmgLine = damageCalcLine(damageResult, 'Dice Roll Calc');
    if (dmgLine) calcLines.push(dmgLine);
    results.push(`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(damageResult))}`);
  }
  const critBundle = buildDiscordCritBundle({
    isCrit,
    attack,
    attackParts: attack.parts,
    baseDamageResult: damageResult,
    damageExpr,
    multiplier: 2,
    attackLabel: attack.label
  });
  const cardLines = options.includeCard ? abilityCardLines(item) : [];
  const displayLines = cardLines.concat(calcLines);
  const discordLines = cardLines.concat(calcLines, critBundle.calcLines);
  const discordResults = results.concat(critBundle.resultLines);
  routeChatEntry({ kind: 'roll', title: `${item.name || 'Active Ability'}${isCrit ? ' — Crit!' : ''}`, subtitle: currentChatSheetLabel(), lines: displayLines, results, discordLines, discordResults, ...d20EntryExtra(outcome) });
}
function rollAbilityDamage(index, options = {}) {
  const list = getActiveData().activeAbilities || [];
  const item = list[index];
  if (!item) return;
  const damageExpr = String(item?.damage || '').trim();
  if (!damageExpr) return;
  const damageResult = rollDamageExpression(damageExpr);
  const dmgLine = damageCalcLine(damageResult, 'Dice Roll Calc');
  const calcLines = dmgLine ? [dmgLine] : [];
  const cardLines = options.includeCard ? abilityCardLines(item) : [];
  routeChatEntry({
    kind: 'roll',
    title: `${item.name || 'Active Ability'} Dice Roll`,
    subtitle: currentChatSheetLabel(),
    lines: cardLines.concat(calcLines),
    discordLines: cardLines.concat(calcLines),
    results: [`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(damageResult))}`]
  });
}


window.useAbilityByType = (subType, index) => {
  if (subType === 'active') return window.useActiveAbility(index);
  const bundle = getAbilityChatBundle(subType);
  const list = getActiveData()[bundle.key] || [];
  const item = list[index];
  if (!item) return;
  const diceExpr = String(item.damage || '').trim();
  if (!diceExpr) return;
  const result = rollDamageExpression(diceExpr);
  const calcLine = damageCalcLine(result, 'Dice Roll Calc');
  const lines = [`> Category: ${bundle.label}`, `> Dice Roll: ${diceExpr}`];
  if (String(item.desc || '').trim()) lines.push(`> Description: ${String(item.desc).trim()}`);
  if (calcLine) lines.push(calcLine);
  routeChatEntry({
    kind: 'roll',
    title: `${item.name || bundle.label} Dice Roll`,
    subtitle: currentChatSheetLabel(),
    lines,
    discordLines: lines,
    results: [`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(result))}`]
  });
};

function sendAbilityCheck(stat) {
  const upper = String(stat || '').toUpperCase();
  const mod = (typeof getMod === 'function') ? getMod(stat) : readNumericValue(`mod-${stat}`, 0);
  const roll = rollD20WithModifier(mod);
  const outcome = d20OutcomeMeta(roll);
  routeChatEntry({
    kind: 'roll',
    title: upper,
    subtitle: currentChatSheetLabel(),
    lines: [rollCalcLine(roll, [{ label: `${upper} Mod`, value: mod }])],
    results: simpleRollResultLines(roll, 'Total'),
    ...d20EntryExtra(outcome)
  });
}
function isTrainedOnlySkillRow(row) {
  const cell = row?.querySelector('.skill-name-cell');
  if (!cell) return false;
  const skillLabel = String(cell.textContent || '');
  return TRAINED_ONLY.some(name => skillLabel.includes(name));
}
function syncSkillRollAvailability(row) {
  if (!row) return false;
  const cell = row.querySelector('.skill-name-cell');
  const ranks = Number(row.querySelector('.skill-ranks')?.value) || 0;
  const trainedOnly = isTrainedOnlySkillRow(row);
  const missingRequiredRank = trainedOnly && ranks < 1;
  const canRoll = !missingRequiredRank;
  if (!cell) return canRoll;
  cell.classList.toggle('trained-untrained', missingRequiredRank);
  cell.classList.toggle('trained-trained', trainedOnly && !missingRequiredRank);
  cell.classList.toggle('rollable', canRoll);
  cell.classList.toggle('skill-roll-disabled', !canRoll);
  cell.tabIndex = canRoll ? 0 : -1;
  cell.setAttribute('aria-disabled', canRoll ? 'false' : 'true');
  cell.title = canRoll ? 'Click to roll this skill to Discord chat' : 'Requires at least 1 rank to roll';
  return canRoll;
}
function bindSkillRollTargets(scope = document) {
  scope.querySelectorAll('#skillsTableBody .skill-name-cell').forEach(cell => {
    const row = cell.closest('tr');
    syncSkillRollAvailability(row);
    if (cell.dataset.rollBound === '1') return;
    cell.dataset.rollBound = '1';
    cell.addEventListener('click', event => {
      if (event.target.closest('button,textarea,select')) return;
      if (event.target.closest('input') && document.body.classList.contains('skill-edit-mode')) return;
      if (!syncSkillRollAvailability(row)) return;
      sendSkillCheck(row);
    });
    cell.addEventListener('keydown', event => {
      if (!document.body.classList.contains('skill-edit-mode') && (event.key === 'Enter' || event.key === ' ')) {
        if (!syncSkillRollAvailability(row)) return;
        event.preventDefault();
        sendSkillCheck(row);
      }
    });
  });
}
function refreshAbilityRollTargets() {
  document.querySelectorAll('.ability-roll-link').forEach(cell => {
    const stat = cell.dataset.stat;
    cell.title = stat ? `Click to roll ${String(stat).toUpperCase()} to chat` : 'Click to roll';
  });
}
window.sendInitiativeRoll = sendInitiativeRoll;
window.sendSavesOverview = sendSavesOverview;
window.rollSaveCheck = rollSaveCheck;
window.sendAbilityCheck = sendAbilityCheck;
window.sendAbilityCard = sendAbilityCard;
window.rollAbilityAction = rollAbilityAction;
window.rollAbilityDamage = rollAbilityDamage;
window.toggleSaveRollMenu = toggleSaveRollMenu;
window.toggleAttackRollMenu = toggleAttackRollMenu;
window.rollAttackCheck = rollAttackCheck;
window.toggleLocalChat = toggleLocalChat;
window.clearLocalChat = clearLocalChat;
window.persistChatTarget = persistChatTarget;
window.setChatView = setChatView;
window.togglePanelMenu = togglePanelMenu;

window.addEventListener('click', event => {
  if (!event.target.closest('.roll-menu') && !event.target.closest('#saveRollMenuBtn') && !event.target.closest('#attackRollMenuBtn')) closeAllRollMenus();
  if (!event.target.closest('#panelMenuShell')) togglePanelMenu(false);
});

document.addEventListener('DOMContentLoaded', () => {
  const targetSelect = document.getElementById('chatTargetSelect');
  if (targetSelect) { targetSelect.value = 'discord'; try { localStorage.setItem(CHAT_TARGET_STORAGE_KEY, 'discord'); } catch(_err) {} }
  const chatPanelState = getPanelState(CHAT_PANEL_STORAGE_KEY);
  setPanelState(CHAT_PANEL_STORAGE_KEY, { ...chatPanelState, open:false });
  ensureChatStateLoaded();
  bindSkillRollTargets();
  applySkillEditMode(false);
  refreshAbilityRollTargets();
  renderChatViewControls();
  initChatPanelDrag();
  applyFloatingPanelState('localChatPanel', CHAT_PANEL_STORAGE_KEY, defaultChatPanelPosition);
});

window.toggleEditMode = (force) => {
    const next = (typeof force === 'boolean') ? force : !document.body.classList.contains('edit-mode-active');
    document.body.classList.toggle('edit-mode-active', next);
    const buttons = [document.getElementById('editModeToggle'), document.getElementById('editModeToggleCombat')].filter(Boolean);
    buttons.forEach(btn => {
      btn.classList.toggle('active', next);
      btn.innerHTML = '✏️';
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('editModeToggle');
    if(btn) btn.innerHTML = '✏️';
    const btn2 = document.getElementById('editModeToggleCombat');
    if(btn2) btn2.innerHTML = '✏️';
    const abilityBtn = document.getElementById('abilityDrawerCombatBtn');
    if(abilityBtn) abilityBtn.innerHTML = '🎲';
    syncSizeFields(); computeDerivedStats(); renderSelectedCombatDisplays(); renderNotesList(); bindCriticalFieldPersistence(); ensureChatStateLoaded(); bindSkillRollTargets(); refreshAbilityRollTargets();
});


/* --- v16 Player calendar month view + character-bound shop frame --- */
let playerCalendarModeV16 = 'month';
let playerCalendarBrowseYearV16 = null;
let playerCalendarBrowseMonthV16 = null;
function clampCalendarYearV16(value, fallback = 1) {
    const parsed = Number(value);
    const year = Number.isFinite(parsed) ? Math.trunc(parsed) : Math.trunc(Number(fallback) || 1);
    return Math.max(-1000, Math.min(5000, year));
}
function groupCurrentDateV16(group) {
    const raw = group?.calendarCurrentDay || {};
    return { year:clampCalendarYearV16(raw.year ?? group?.calendarCurrentYear, 1), month:Math.max(1, Math.min(12, Number(raw.month) || 1)), day:Math.max(1, Math.min(35, Number(raw.day) || 1)) };
}
function resetPlayerCalendarBrowseV16(group) {
    const current = groupCurrentDateV16(group);
    playerCalendarBrowseYearV16 = current.year;
    playerCalendarBrowseMonthV16 = current.month;
    playerCalendarModeV16 = 'month';
}
function playerCalendarEventsV16(group, year, month, day) {
    const fallback = groupCurrentDateV16(group).year;
    return (Array.isArray(group?.calendarEvents) ? group.calendarEvents : []).filter(event => clampCalendarYearV16(event.year, fallback) === year && Number(event.month) === month && Number(event.day) === day);
}
function playerCalendarDayHtmlV16(group, year, month, day, rich) {
    const current = groupCurrentDateV16(group);
    const events = playerCalendarEventsV16(group, year, month, day);
    const cls = ['calendar-day'];
    if(current.year===year && current.month===month && current.day===day) cls.push('current');
    if(events.length) cls.push('has-event');
    if(!rich) return `<button type="button" class="${cls.join(' ')}" onclick="openPlayerCalendarDay(${month},${day},${year})">${day}</button>`;
    const chips = events.slice(0,2).map((event,index) => `<button class="calendar-event-chip" type="button" onclick="event.stopPropagation();openPlayerCalendarEventV16('${calendarEscape(String(event.id || index))}',${month},${day},${year})">${calendarEscape(event.title || 'Event')}</button>`).join('');
    const more = events.length > 2 ? `<span class="calendar-more-events">+${events.length-2} more</span>` : '';
    return `<div role="button" tabindex="0" class="${cls.join(' ')}" onclick="openPlayerCalendarDay(${month},${day},${year})" onkeydown="if(event.key==='Enter')openPlayerCalendarDay(${month},${day},${year})"><span class="calendar-day-number">${day}</span>${chips}${more}</div>`;
}
function syncPlayerCalendarControlsV16(group) {
    const names = calendarMonthNames(group);
    const monthSelect = document.getElementById('playerCalendarBrowseMonth');
    const yearInput = document.getElementById('playerCalendarBrowseYear');
    if(monthSelect) monthSelect.innerHTML = names.map((name, index) => `<option value="${index+1}" ${Number(playerCalendarBrowseMonthV16)===index+1?'selected':''}>${calendarEscape(name)}</option>`).join('');
    if(yearInput) yearInput.value = String(playerCalendarBrowseYearV16);
    document.getElementById('playerCalendarMonthMode')?.classList.toggle('active', playerCalendarModeV16 === 'month');
    document.getElementById('playerCalendarYearMode')?.classList.toggle('active', playerCalendarModeV16 === 'year');
}
window.setPlayerCalendarView = mode => { playerCalendarModeV16 = mode === 'year' ? 'year' : 'month'; renderPlayerCalendar(); };
window.setPlayerCalendarMonth = value => { playerCalendarBrowseMonthV16 = Math.max(1, Math.min(12, Number(value) || 1)); playerCalendarModeV16='month'; renderPlayerCalendar(); };
window.setPlayerCalendarYear = value => { playerCalendarBrowseYearV16 = clampCalendarYearV16(value, playerCalendarBrowseYearV16); renderPlayerCalendar(); };
window.stepPlayerCalendarMonth = delta => {
    let month = Number(playerCalendarBrowseMonthV16) || 1;
    let year = clampCalendarYearV16(playerCalendarBrowseYearV16, 1);
    month += Number(delta) || 0;
    while(month < 1) { month += 12; year -= 1; }
    while(month > 12) { month -= 12; year += 1; }
    playerCalendarBrowseYearV16 = clampCalendarYearV16(year, playerCalendarBrowseYearV16);
    playerCalendarBrowseMonthV16 = month;
    playerCalendarModeV16='month';
    renderPlayerCalendar();
};
window.selectPlayerCalendar = groupId => { selectedPlayerCalendarId = groupId; const group=playerCalendarGroups.find(item=>item.id===groupId); resetPlayerCalendarBrowseV16(group); renderPlayerCalendar(); };
window.openPlayerCalendarDay = (month, day, year = playerCalendarBrowseYearV16) => {
    const group = playerCalendarGroups.find(item => item.id === selectedPlayerCalendarId);
    const box = document.getElementById('playerCalendarEventDetails');
    if(!group || !box) return;
    const names = calendarMonthNames(group);
    const chosenYear = clampCalendarYearV16(year, groupCurrentDateV16(group).year);
    const items = playerCalendarEventsV16(group, chosenYear, month, day);
    box.classList.add('show');
    box.innerHTML = `<h3>${calendarEscape(group.name)} — ${calendarEscape(names[month-1])} ${day}, Year ${chosenYear}</h3>` + (items.length ? items.map(event => `<div class="calendar-event-row"><strong>${calendarEscape(event.title || 'Event')}</strong>${event.description ? `<br>${calendarEscape(event.description)}` : ''}</div>`).join('') : '<div class="calendar-event-row">No events on this day.</div>');
};
window.openPlayerCalendarEventV16 = (eventId, month, day, year) => {
    const group=playerCalendarGroups.find(item=>item.id===selectedPlayerCalendarId);
    const box=document.getElementById('playerCalendarEventDetails');
    if(!group || !box) return;
    const names=calendarMonthNames(group);
    const items=playerCalendarEventsV16(group, clampCalendarYearV16(year), month, day);
    const chosen=items.find(item=>String(item.id)===String(eventId)) || items[0];
    if(!chosen) return openPlayerCalendarDay(month,day,year);
    box.classList.add('show');
    box.innerHTML=`<h3>${calendarEscape(chosen.title || 'Event')}</h3><div class="calendar-event-row"><strong>${calendarEscape(names[month-1])} ${day}, Year ${clampCalendarYearV16(year)}</strong>${chosen.description ? `<br>${calendarEscape(chosen.description)}` : ''}</div>`;
};
renderPlayerCalendar = function() {
    const tabs=document.getElementById('playerCalendarGroupTabs'), status=document.getElementById('playerCalendarStatus'), months=document.getElementById('playerCalendarMonths'), pill=document.getElementById('playerCalendarCurrentDay'), details=document.getElementById('playerCalendarEventDetails');
    if(!tabs || !status || !months || !pill || !details) return;
    tabs.innerHTML=playerCalendarGroups.map(group=>`<button type="button" class="calendar-group-btn ${group.id===selectedPlayerCalendarId?'active':''}" onclick="selectPlayerCalendar('${calendarEscape(group.id)}')">${calendarEscape(group.name)}</button>`).join('');
    const group=playerCalendarGroups.find(item=>item.id===selectedPlayerCalendarId);
    if(!group) {
        months.innerHTML='';
        pill.textContent='No group calendar selected';
        if(!status.textContent || status.textContent === 'Loading calendar...') {
            status.textContent = 'No calendar group is available for this character.';
        }
        status.classList.remove('hidden');
        return;
    }
    if(playerCalendarBrowseYearV16===null || playerCalendarBrowseMonthV16===null) resetPlayerCalendarBrowseV16(group);
    const current=groupCurrentDateV16(group), names=calendarMonthNames(group);
    status.classList.add('hidden'); pill.textContent=`${group.name}: ${names[current.month-1]} ${current.day}, Year ${current.year}`;
    syncPlayerCalendarControlsV16(group);
    details.classList.remove('show'); details.innerHTML='';
    if(playerCalendarModeV16==='month') {
        const month=playerCalendarBrowseMonthV16;
        const days=Array.from({length:35},(_,i)=>playerCalendarDayHtmlV16(group,playerCalendarBrowseYearV16,month,i+1,true)).join('');
        months.className='fantasy-calendar-grid month-only';
        months.innerHTML=`<section class="calendar-month"><h3>${calendarEscape(names[month-1])} — Year ${playerCalendarBrowseYearV16}</h3><div class="calendar-days">${days}</div></section>`;
    } else {
        months.className='fantasy-calendar-grid';
        months.innerHTML=names.map((name,index)=>`<section class="calendar-month"><h3>${calendarEscape(name)} — Year ${playerCalendarBrowseYearV16}</h3><div class="calendar-days">${Array.from({length:35},(_,i)=>playerCalendarDayHtmlV16(group,playerCalendarBrowseYearV16,index+1,i+1,false)).join('')}</div></section>`).join('');
    }
};
// Fast shop preload: the old lazy iframe loaded only when the hidden Shop panel became visible.
// This keeps the shop iframe warm in the background after the character sheet settles.
let lastShopCharacterV16 = '';
let shopPreloadTimerV39 = null;
let shopOpenedOnceV39 = false;
function shopWantedSrcV39() {
    const base = document.getElementById('playerShopFrame')?.dataset?.shopBaseSrc || 'tools.html?embed=shop';
    return currentSummonId ? `${base}&character=${encodeURIComponent(currentSummonId)}` : base;
}
function markShopFrameLoadingV39() {
    const frame = document.getElementById('playerShopFrame');
    const warmup = document.getElementById('playerShopWarmup');
    if(frame) frame.classList.remove('shop-ready');
    if(warmup) warmup.classList.remove('hidden');
}
function markShopFrameReadyV39() {
    const frame = document.getElementById('playerShopFrame');
    const warmup = document.getElementById('playerShopWarmup');
    if(frame && frame.getAttribute('src') !== 'about:blank') frame.classList.add('shop-ready');
    if(warmup) warmup.classList.add('hidden');
}
function syncEmbeddedShopCharacterV16(force = false) {
    const frame = document.getElementById('playerShopFrame');
    if(!frame) return;
    const wanted = shopWantedSrcV39();
    const current = frame.getAttribute('src') || '';
    if(!force && current === wanted && frame.dataset.loadedFor === String(currentSummonId || 'default')) return;
    frame.dataset.loadedFor = String(currentSummonId || 'default');
    markShopFrameLoadingV39();
    frame.setAttribute('src', wanted);
}
function scheduleShopPreloadV39(delay = 900) {
    window.clearTimeout(shopPreloadTimerV39);
    shopPreloadTimerV39 = window.setTimeout(() => {
        // Wait briefly for the selected character id so we avoid loading generic shop then reloading it.
        if(!currentSummonId && !shopOpenedOnceV39) { scheduleShopPreloadV39(700); return; }
        syncEmbeddedShopCharacterV16(false);
    }, delay);
}
const switchOtherTabV15 = window.switchOtherTab;
window.switchOtherTab = name => {
    switchOtherTabV15(name);
    if(name === 'shop') { shopOpenedOnceV39 = true; syncEmbeddedShopCharacterV16(false); }
    else scheduleShopPreloadV39(1100);
};
document.addEventListener('DOMContentLoaded', () => {
    const frame = document.getElementById('playerShopFrame');
    if(frame) frame.addEventListener('load', markShopFrameReadyV39);
    scheduleShopPreloadV39(1400);
});
window.addEventListener('load', () => scheduleShopPreloadV39(500));
window.setInterval(() => {
    const id = String(currentSummonId || '');
    if(id && id !== lastShopCharacterV16) {
        lastShopCharacterV16 = id;
        scheduleShopPreloadV39(shopOpenedOnceV39 ? 0 : 600);
    }
}, 1000);



// --- v25: live rolls shared between characters in the same admin Group ---
const GROUP_ROLL_COLLECTION_V25 = 'groupRollFeed';
// A runtime-only page id prevents duplicated/open sheets from hiding each other's rolls.
const GROUP_ROLL_PAGE_ID_V27 = `page_${Date.now()}_${Math.random().toString(36).slice(2,11)}`;
const GROUP_ROLL_CLIENT_ID_V25 = GROUP_ROLL_PAGE_ID_V27;
let unsubscribeGroupRollsV25 = null;
let groupRollSubscriptionKeyV25 = '';
let groupRollSubscribedAtV25 = 0;
const seenGroupRollDocsV25 = new Set();
const seenGroupRollOrderV27 = [];
let lastGroupRollPublishAtV27 = 0;
const GROUP_ROLL_MIN_PUBLISH_MS_V27 = 140;
function rememberGroupRollDocV27(id) {
  if(seenGroupRollDocsV25.has(id)) return false;
  seenGroupRollDocsV25.add(id); seenGroupRollOrderV27.push(id);
  while(seenGroupRollOrderV27.length > 100) seenGroupRollDocsV25.delete(seenGroupRollOrderV27.shift());
  return true;
}
function playerRollGroupTagsV25() {
  return Array.from(new Set((Array.isArray(fullData?.group_tags) ? fullData.group_tags : []).map(tag => String(tag || '').trim()).filter(Boolean))).sort();
}
function groupRollCreatedMsV25(value) {
  if(value && typeof value.toMillis === 'function') return value.toMillis();
  if(value && typeof value.seconds === 'number') return value.seconds * 1000;
  return Number(value || 0) || 0;
}
function removeGroupRollToastV25(node, fast = false) {
  if(!node || node.dataset.removing === '1') return;
  node.dataset.removing = '1'; node.classList.add('removing');
  window.setTimeout(() => node.remove(), fast ? 115 : 235);
}
function showStackedRollV25(entry, sourceLine = '') {
  if(!entry || entry.kind !== 'roll') return;
  const stack = document.getElementById('groupRollStackV26');
  const totals = extractRollOverlayTotals(entry);
  if(!stack || !totals.length) return;
  stack.classList.add('group-roll-stack');
  const toast = document.createElement('div');
  toast.className = 'group-roll-toast';
  const diceHtml = totals.map(item => `<div class="roll-overlay-die-wrap"><div class="roll-dice-face" role="img" aria-label="${chatEscapeHtml(item.label || 'Roll')} roll total ${chatEscapeHtml(item.total)}"><span class="roll-dice-pip p1"></span><span class="roll-dice-pip p2"></span><span class="roll-dice-pip p3"></span><span class="roll-dice-pip p4"></span><span class="roll-overlay-total">${chatEscapeHtml(item.total)}</span></div><div class="roll-overlay-mini-label">${chatEscapeHtml(item.label || 'Roll')}</div></div>`).join('');
  const outcome = inferRollOutcomeFromEntry(entry);
  const outcomeText = outcome ? `<div class="group-roll-source">${chatEscapeHtml(rollOutcomeStatusText(outcome) || rollOutcomeDetailText(outcome))}</div>` : '';
  toast.innerHTML = `<div class="roll-overlay-dice-row">${diceHtml}</div><div class="group-roll-copy"><div class="roll-overlay-label">${chatEscapeHtml(entry.title || 'Roll')}</div><div class="group-roll-source">${chatEscapeHtml(sourceLine || entry.subtitle || currentChatSheetLabel())}</div>${outcomeText}</div>`;
  stack.prepend(toast);
  // Keep only three remote rolls. Remove overflow immediately so the loop cannot
  // stall while an animated dismissal is still waiting to detach its element.
  while(stack.childElementCount > 3) {
    const oldest = stack.lastElementChild;
    if(!oldest) break;
    oldest.remove();
  }
  window.setTimeout(() => removeGroupRollToastV25(toast), 4700);
}
// The originating sheet uses showRollOverlay() and therefore retains the original centered square animation.
async function publishGroupRollV25(entry) {
  if(!entry || entry.kind !== 'roll' || typeof addDoc !== 'function') return;
  const now = Date.now();
  if(now - lastGroupRollPublishAtV27 < GROUP_ROLL_MIN_PUBLISH_MS_V27) return;
  lastGroupRollPublishAtV27 = now;
  const tags = playerRollGroupTagsV25();
  if(!tags.length || !currentUser || !currentSummonId) return;
  const payload = {
    kind:'roll', title:String(entry.title || 'Roll'), subtitle:String(entry.subtitle || ''),
    results:Array.isArray(entry.results) ? entry.results.slice(0,4) : [],
    d20Outcome: entry.d20Outcome || null,
    sheet:currentChatSheetLabel(), sourcePageId:GROUP_ROLL_PAGE_ID_V27,
    ownerUid:currentUser.uid, characterId:currentSummonId, clientTs:now, createdAt:new Date(now)
  };
  try { await Promise.all(tags.map(groupTag => addDoc(collection(db, GROUP_ROLL_COLLECTION_V25), { ...payload, groupTag }))); }
  catch(err) { console.warn('Group roll broadcast failed', err); }
}
function refreshGroupRollSubscriptionV25() {
  const tags = playerRollGroupTagsV25();
  const normalizedTags = new Set(tags.map(tag => tag.toLowerCase()));
  const key = `${currentSummonId || ''}|${tags.join('|')}`;
  if(key === groupRollSubscriptionKeyV25) return;
  groupRollSubscriptionKeyV25 = key;
  if(unsubscribeGroupRollsV25) { unsubscribeGroupRollsV25(); unsubscribeGroupRollsV25 = null; }
  seenGroupRollDocsV25.clear(); seenGroupRollOrderV27.length = 0; groupRollSubscribedAtV25 = Date.now();
  if(!tags.length) return;
  unsubscribeGroupRollsV25 = onSnapshot(query(collection(db, GROUP_ROLL_COLLECTION_V25), orderBy('clientTs', 'desc'), limit(40)), snap => {
    snap.docChanges().forEach(change => {
      if(change.type !== 'added' || !rememberGroupRollDocV27(change.doc.id)) return;
      const data = change.doc.data() || {};
      if(!normalizedTags.has(String(data.groupTag || '').trim().toLowerCase())) return;
      if(data.sourcePageId === GROUP_ROLL_PAGE_ID_V27) return;
      const created = Number(data.clientTs || 0) || groupRollCreatedMsV25(data.createdAt);
      if(!created || created < groupRollSubscribedAtV25 - 1200 || Date.now() - created > 12000) return;
      showStackedRollV25({ kind:'roll', title:data.title || 'Roll', subtitle:data.subtitle || '', results:Array.isArray(data.results) ? data.results : [], d20Outcome:data.d20Outcome || null }, `${data.sheet || 'Group member'} · ${data.groupTag}`);
    });
  }, err => console.warn('Group roll listener failed', err));
}
const routeChatEntryV25Original = routeChatEntry;
routeChatEntry = function(entry) { routeChatEntryV25Original(entry); if(entry?.kind === 'roll') publishGroupRollV25(entry); };
window.setInterval(refreshGroupRollSubscriptionV25, 500);
window.addEventListener('beforeunload', () => { try { if(unsubscribeGroupRollsV25) unsubscribeGroupRollsV25(); } catch(_err) {} });



/* --- FFD20 v2: normal character choices, creation wizard, level-up helper --- */
const MA_FFD20_IS_ADMIN = false;
const MA_FFD20_DATA_URL = './data/ffd20_data.json';
let maFfd20Library = null;
let maFfd20ApplyingChoice = false;
let maFfd20ChoiceUiReady = false;

const MA_ALIGNMENTS = [
  'Lawful Good','Neutral Good','Chaotic Good',
  'Lawful Neutral','True Neutral','Chaotic Neutral',
  'Lawful Evil','Neutral Evil','Chaotic Evil'
];
const MA_SIZES = ['Fine','Diminutive','Tiny','Small','Medium','Large','Huge','Gargantuan','Colossal'];
const MA_STATS = ['str','dex','con','int','wis','cha'];

function maFfd20Esc(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function maFfd20Norm(value){ return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function maFfd20Level(value){ const n = Number(String(value || '').match(/\d+/)?.[0] || value || 0); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0; }
function maFfd20FieldClass(){ return MA_FFD20_IS_ADMIN ? 'save-field' : 'live-field'; }
function maFfd20ActiveData(){ return typeof getActiveData === 'function' ? getActiveData() : (MA_FFD20_IS_ADMIN ? fullSheetData : fullData); }
function maFfd20SaveNow(){
  if(MA_FFD20_IS_ADMIN){ if(typeof triggerSave === 'function') triggerSave(); else if(typeof saveData === 'function') saveData(); }
  else { if(typeof save === 'function') save(true); else if(typeof saveDataOnly === 'function') saveDataOnly(); }
}
function maFfd20RenderAll(){
  try { if(typeof renderAbilities === 'function'){ renderAbilities('active'); renderAbilities('passive'); renderAbilities('racial'); renderAbilities('feat'); } } catch(e){ console.warn(e); }
  try { if(typeof renderSpells === 'function') renderSpells(); } catch(e){ console.warn(e); }
  try { if(typeof updateCalculations === 'function') updateCalculations(); } catch(e){ console.warn(e); }
  try { if(typeof updateCalcs === 'function') updateCalcs(); } catch(e){ console.warn(e); }
  try { if(typeof computeDerivedStats === 'function') computeDerivedStats(); } catch(e){ console.warn(e); }
  try { if(typeof renderSelectedCombatDisplays === 'function') renderSelectedCombatDisplays(); } catch(e){ console.warn(e); }
  try { if(typeof renderAbilityDrawerScores === 'function') renderAbilityDrawerScores(); } catch(e){ console.warn(e); }
  try { if(typeof refreshMpDisplays === 'function') refreshMpDisplays(); } catch(e){ console.warn(e); }
}
async function maFfd20LoadLibrary(){
  if(maFfd20Library) return maFfd20Library;
  try {
    const response = await fetch(MA_FFD20_DATA_URL, { cache:'no-store' });
    if(!response.ok) throw new Error(`Missing ${MA_FFD20_DATA_URL}. Run the scraper and upload the JSON first.`);
    const raw = await response.text();
    if(!raw.trim()) throw new Error(`${MA_FFD20_DATA_URL} is empty. Run the scraper and upload the JSON first.`);
    maFfd20Library = JSON.parse(raw);
  } catch(e) {
    console.warn(e);
    maFfd20Library = { classes:[], races:[], prestigeClasses:[], loadError:String(e?.message || e) };
  }
  if(!Array.isArray(maFfd20Library.classes)) maFfd20Library.classes = [];
  if(!Array.isArray(maFfd20Library.races)) maFfd20Library.races = [];
  if(!Array.isArray(maFfd20Library.prestigeClasses)) maFfd20Library.prestigeClasses = [];
  return maFfd20Library;
}
function maFfd20Find(list, name){ const target = maFfd20Norm(name); return (list || []).find(item => maFfd20Norm(item.name) === target); }
function maFfd20AddOption(select, value, text){ const opt = document.createElement('option'); opt.value = value || ''; opt.textContent = text || value || ''; select.appendChild(opt); }
function maFfd20FillSelect(select, list, placeholder, currentValue=''){
  if(!select) return;
  const current = (arguments.length >= 4) ? (currentValue || '') : (select.value || '');
  select.innerHTML = '';
  maFfd20AddOption(select, '', placeholder);
  (list || []).forEach(item => maFfd20AddOption(select, item.name || '', item.name || ''));
  if(current && !(list || []).some(item => item.name === current)) maFfd20AddOption(select, current, `${current} (current)`);
  select.value = current;
}
function maFfd20FillSimple(select, values, placeholder, currentValue=''){
  if(!select) return;
  const current = (arguments.length >= 4) ? (currentValue || '') : (select.value || '');
  select.innerHTML = '';
  maFfd20AddOption(select, '', placeholder);
  values.forEach(v => maFfd20AddOption(select, v, v));
  if(current && !values.includes(current)) maFfd20AddOption(select, current, `${current} (current)`);
  select.value = current;
}
function maFfd20LevelOptions(current='1'){
  return Array.from({length:20}, (_,i)=>`<option value="${i+1}" ${String(current)==String(i+1)?'selected':''}>${i+1}</option>`).join('');
}
function maFfd20CaptureBioValues(){
  const ids = ['charName','bio','race','class','archetype','character_level','alignment','size_category','size','languages','senses','shop_tags','prestige_class','prestige_level'];
  const out = {};
  ids.forEach(id => { const el = document.getElementById(id); if(el) out[id] = el.value; });
  return out;
}
function maFfd20BuildChoiceGrid(){
  const character = document.getElementById('character');
  const oldGrid = character?.querySelector('.bio-grid');
  if(!character || !oldGrid || document.getElementById('ffd20ChoiceGrid')) return;
  const values = maFfd20CaptureBioValues();
  const fieldClass = maFfd20FieldClass();
  const prestigeBlock = MA_FFD20_IS_ADMIN ? `
      <div class="bio-item"><label>Prestige Class</label><select id="prestige_class" class="${fieldClass} ma-ffd20-prestige"><option value="">No prestige</option></select></div>
      <div class="bio-item"><label>Prestige Level</label><select id="prestige_level" class="${fieldClass}">${maFfd20LevelOptions(values.prestige_level || '1')}</select></div>` : '';
  const shopTags = MA_FFD20_IS_ADMIN ? `<div class="bio-item"><label>Shop Access Tags</label><input id="shop_tags" class="${fieldClass}" placeholder="starter, magic_shop, blacksmith, potion_shop" value="${maFfd20Esc(values.shop_tags || '')}"></div>` : '';
  const grid = document.createElement('section');
  grid.id = 'ffd20ChoiceGrid';
  grid.className = 'ffd20-bio-three-col';
  grid.innerHTML = `
    <div class="ffd20-bio-col">
      <h3>Identity</h3>
      <div class="bio-item"><label>Name</label><input id="charName" class="${fieldClass}" value="${maFfd20Esc(values.charName || '')}"></div>
      <div class="bio-item"><label>Alignment</label><select id="alignment" class="${fieldClass}"></select></div>
      <div class="bio-item"><label>Size</label><select id="size_category" class="${fieldClass}" aria-label="Character Size"></select><input id="size" class="${fieldClass}" type="hidden" value="${maFfd20Esc(values.size || values.size_category || '')}"></div>
      <div class="bio-item"><label>Languages</label><input id="languages" class="${fieldClass}" value="${maFfd20Esc(values.languages || '')}"></div>
      <div class="bio-item"><label>Senses</label><input id="senses" class="${fieldClass}" value="${maFfd20Esc(values.senses || '')}"></div>
    </div>
    <div class="ffd20-bio-col">
      <h3>Build</h3>
      <div class="bio-item"><label>Race</label><select id="race" class="${fieldClass} ma-ffd20-race"><option value="${maFfd20Esc(values.race || '')}">${maFfd20Esc(values.race || 'Loading races...')}</option></select></div>
      <div class="bio-item"><label>Class</label><select id="class" class="${fieldClass} ma-ffd20-class"><option value="${maFfd20Esc(values.class || '')}">${maFfd20Esc(values.class || 'Loading classes...')}</option></select></div>
      <div class="bio-item"><label>Archetype</label><select id="archetype" class="${fieldClass} ma-ffd20-archetype"><option value="${maFfd20Esc(values.archetype || '')}">${maFfd20Esc(values.archetype || 'No archetype')}</option></select></div>
      <div class="bio-item"><label>Level</label><select id="character_level" class="${fieldClass} ma-ffd20-level" aria-label="Character Level">${maFfd20LevelOptions(values.character_level || '1')}</select></div>
      <div id="maMulticlassList" class="ffd20-multiclass-list"></div>
      <div class="bio-item ma-add-multiclass-wrap"><button class="ffd20-mini-btn" type="button" id="maAddMulticlassBtn">+ Add Multiclass</button></div>
      ${prestigeBlock}
      <div class="ffd20-choice-note">Auto abilities update from <code>data/ffd20_data.json</code>. Manual abilities stay untouched.</div>
    </div>`;
  oldGrid.replaceWith(grid);
  document.querySelector('.character-level-row')?.remove();
  maFfd20FillSimple(document.getElementById('alignment'), MA_ALIGNMENTS, 'Choose alignment', values.alignment || '');
  maFfd20FillSimple(document.getElementById('size_category'), MA_SIZES, 'Select Size', values.size_category || values.size || 'Medium');
  const sizeEl = document.getElementById('size');
  if(sizeEl && !sizeEl.value) sizeEl.value = document.getElementById('size_category')?.value || 'Medium';
  document.getElementById('maAddMulticlassBtn')?.addEventListener('click', () => maFfd20OpenMulticlassDialog());
  document.getElementById('class')?.addEventListener('change', async () => { await maFfd20RefreshArchetypes(); await maFfd20ApplySheetChoices({silent:true}); if(typeof refreshMpDisplays === 'function') refreshMpDisplays(); });
  document.getElementById('race')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  document.getElementById('archetype')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  document.getElementById('prestige_class')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  document.getElementById('prestige_level')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  document.getElementById('size_category')?.addEventListener('change', () => { const h=document.getElementById('size'); if(h) h.value=document.getElementById('size_category').value; try{ syncSizeFields(); }catch(e){} });
  document.getElementById('character_level')?.addEventListener('change', maFfd20HandleLevelChanged);
  setTimeout(() => { try { if(typeof refreshMpDisplays === 'function') refreshMpDisplays(); } catch(e){} }, 0);
}
async function maFfd20RefreshOptions(){
  maFfd20BuildChoiceGrid();
  let lib;
  try { lib = await maFfd20LoadLibrary(); }
  catch(e){
    ['race','class','archetype','prestige_class'].forEach(id => { const el=document.getElementById(id); if(el && !el.options.length) maFfd20AddOption(el, '', e.message); });
    console.warn(e); return null;
  }
  maFfd20FillSelect(document.getElementById('race'), lib.races, 'Choose race', document.getElementById('race')?.value || maFfd20ActiveData()?.race || '');
  maFfd20FillSelect(document.getElementById('class'), lib.classes, 'Choose class', document.getElementById('class')?.value || maFfd20ActiveData()?.class || '');
  if(MA_FFD20_IS_ADMIN) maFfd20FillSelect(document.getElementById('prestige_class'), lib.prestigeClasses, 'No prestige', document.getElementById('prestige_class')?.value || maFfd20ActiveData()?.prestige_class || '');
  await maFfd20RefreshArchetypes();
  maFfd20RenderMulticlasses();
  return lib;
}
async function maFfd20RefreshArchetypes(){
  let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ return; }
  const className = document.getElementById('class')?.value || '';
  const cls = maFfd20Find(lib.classes, className);
  maFfd20FillSelect(document.getElementById('archetype'), cls?.archetypes || [], 'No archetype', document.getElementById('archetype')?.value || maFfd20ActiveData()?.archetype || '');
}
function maFfd20ReadSelection(){
  const data = maFfd20ActiveData() || {};
  return {
    race: document.getElementById('race')?.value || data.race || '',
    className: document.getElementById('class')?.value || data.class || '',
    archetype: document.getElementById('archetype')?.value || data.archetype || '',
    level: maFfd20Level(document.getElementById('character_level')?.value || data.character_level || 1),
    prestigeClass: MA_FFD20_IS_ADMIN ? (document.getElementById('prestige_class')?.value || data.prestige_class || '') : (data.prestige_class || ''),
    prestigeLevel: MA_FFD20_IS_ADMIN ? maFfd20Level(document.getElementById('prestige_level')?.value || data.prestige_level || 1) : maFfd20Level(data.prestige_level || 1),
    multiclasses: Array.isArray(data.multiclasses) ? data.multiclasses : []
  };
}
function maFfd20IsRaceSourceValue(value){
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'race' || raw === 'racial' || raw === 'races' || raw === 'racial trait' || raw === 'racial traits';
}
function maFfd20IsRaceTraitName(value){
  const name = String(value || '').trim().toLowerCase();
  if(!name) return false;
  if(/racial\s+traits?/.test(name)) return true;
  return /^(ability scores?|ability score modifiers?|size|type|base speed|speed|languages?|senses?|vision|darkvision|low-light vision|low light vision|age|height and weight|defense traits?|defensive traits?|offense traits?|offensive traits?|magical traits?|skill traits?|feat traits?|weaknesses?)$/.test(name);
}
function maFfd20SelectedRaceNames(data){
  const names = [];
  try { if(data?.race) names.push(data.race); } catch(e) {}
  try { const domRace = document.getElementById('race')?.value; if(domRace) names.push(domRace); } catch(e) {}
  return names.map(maFfd20Norm).filter(Boolean);
}
function maFfd20IsRaceEffect(item, data=null){
  if(!item) return false;
  if(maFfd20IsRaceSourceValue(item.originType) || maFfd20IsRaceSourceValue(item.sourceKind) || maFfd20IsRaceSourceValue(item.sourceType) || maFfd20IsRaceSourceValue(item.originCategory) || maFfd20IsRaceSourceValue(item.category)) return true;
  const autoKey = String(item.autoKey || '').toLowerCase();
  if(autoKey.startsWith('ffd20:race:') || autoKey.includes(':race:')) return true;
  const bucket = String(item.bucket || item.sheetBucket || '').trim().toLowerCase();
  if(bucket === 'racial') return true;
  const sourceNameNorm = maFfd20Norm(item.originName || item.sourceName || item.race || '');
  if(sourceNameNorm && maFfd20SelectedRaceNames(data).includes(sourceNameNorm)) return true;
  const type = String(item.type || item.action || '').trim().toLowerCase();
  if(type === 'racial') return true;
  if(item.autoGenerated && maFfd20IsRaceTraitName(item.name)) return true;
  const desc = String(item.desc || item.description || '').toLowerCase();
  if(/\bracial traits?\b/.test(desc) && /\b(size|type|base speed|speed|languages?|senses?|ability scores?)\b/.test(desc)) return true;
  return false;
}
function maFfd20MoveRaceEffectsToRacial(data){
  if(!data || typeof data !== 'object') return data;
  if(!Array.isArray(data.racialAbilities)) data.racialAbilities = [];
  const seen = new Set(data.racialAbilities.map(item => String(item?.autoKey || item?.name || '').trim().toLowerCase()).filter(Boolean));
  ['activeAbilities','passiveAbilities','feats','spells'].forEach(key => {
    if(!Array.isArray(data[key])) data[key] = [];
    const keep = [];
    data[key].forEach(item => {
      if(maFfd20IsRaceEffect(item, data)){
        item.sourceKind = 'race';
        item.originType = 'race';
        item.bucket = 'racial';
        item.type = 'Racial';
        const sig = String(item.autoKey || item.name || '').trim().toLowerCase();
        if(!sig || !seen.has(sig)){
          data.racialAbilities.push(item);
          if(sig) seen.add(sig);
        }
      } else {
        keep.push(item);
      }
    });
    data[key] = keep;
  });
  data.racialAbilities.forEach(item => {
    if(!item) return;
    if(maFfd20IsRaceEffect(item, data)){
      item.sourceKind = 'race';
      item.originType = 'race';
    }
    item.bucket = 'racial';
    item.type = item.type || 'Racial';
  });
  return data;
}
function maFfd20Bucket(entry, sourcePrefix=''){
  if(sourcePrefix === 'race' || maFfd20IsRaceEffect(entry)) return 'racial';
  const explicit = String(entry?.bucket || entry?.sheetBucket || '').toLowerCase();
  if(['active','passive','racial','feat','spell'].includes(explicit)) return explicit;
  const action = String(entry?.action || entry?.type || '').toLowerCase();
  if(/\b(standard|move|swift|immediate|free|full|full-round|round|reaction)\b/.test(action)) return 'active';
  const text = String(entry?.desc || entry?.description || '').toLowerCase();
  if(/\b(as an?|spend|use).{0,40}\b(standard|move|swift|immediate|free|full-round|full round|round|reaction)\s+action\b/.test(text)) return 'active';
  return entry?.originType === 'race' ? 'racial' : 'passive';
}
function maFfd20AutoKey(entry, sourcePrefix=''){
  return ['ffd20', sourcePrefix || entry?.originType || 'source', entry?.originName || entry?.sourceName || '', entry?.level || 0, entry?.name || ''].map(maFfd20Norm).filter(Boolean).join(':');
}


/* --- Auto FFD20 override persistence helpers ---
   Stores player-edited fields for JSON-imported abilities/spells before the
   level/class rebuild removes them, then reapplies those edits when the same
   auto entry is earned again. */
const MA_FFD20_AUTO_OVERRIDE_STORE = 'ffd20AutoOverrides';
const MA_FFD20_LEGACY_DESC_OVERRIDE_STORE = 'autoAbilityDescOverrides';
const MA_FFD20_AUTO_COLLECTIONS = ['activeAbilities','passiveAbilities','racialAbilities','feats','spells'];
const MA_FFD20_AUTO_EDIT_FIELDS = [
  'name','type','desc','description','at_higher_lvls','at_higher','link','sourceUrl',
  'u_curr','u_max','restoreOnLongRest','attack_type','damage','lvl','school',
  'saving_throw','spell_resist','target','range','duration','attrs','tags','tagList','details'
];
function maFfd20CloneValue(value){
  if(value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value)); } catch(e) { return value; }
}
function maFfd20AutoStableString(value){
  try { return JSON.stringify(value, Object.keys(value || {}).sort()); } catch(e) { return String(value); }
}
function maFfd20AutoSnapshotsEqual(a, b){
  return maFfd20AutoStableString(a || {}) === maFfd20AutoStableString(b || {});
}
function maFfd20IsImportedAutoItem(item){
  if(!item || typeof item !== 'object') return false;
  const sourceKind = String(item.sourceKind || item.originType || item.sourceType || item.originCategory || '').trim().toLowerCase();
  const bucket = String(item.bucket || item.sheetBucket || '').trim().toLowerCase();
  const autoKey = String(item.autoKey || '').trim().toLowerCase();
  if(item.autoGenerated) return true;
  if(autoKey.startsWith('ffd20:')) return true;
  if(autoKey.includes(':class:') || autoKey.includes(':archetype:') || autoKey.includes(':multiclass:') || autoKey.includes(':prestige:') || autoKey.includes(':race:')) return true;
  if(['race','class','archetype','multiclass','prestige'].includes(sourceKind)) return true;
  if(['racial','race','class','archetype','multiclass','prestige'].includes(bucket) && (item.sourceName || item.originName)) return true;
  return false;
}
function maFfd20AutoKeyForItem(item){
  const explicit = String(item?.autoKey || '').trim();
  if(explicit) return explicit;
  return ['ffd20', item?.sourceKind || item?.originType || item?.sourceType || 'source', item?.sourceName || item?.originName || '', item?.sourceLevel || item?.level || 0, item?.name || ''].map(maFfd20Norm).filter(Boolean).join(':');
}
function maFfd20EnsureAutoOverrideStore(data){
  if(!data || typeof data !== 'object') data = maFfd20ActiveData();
  if(!data[MA_FFD20_AUTO_OVERRIDE_STORE] || typeof data[MA_FFD20_AUTO_OVERRIDE_STORE] !== 'object' || Array.isArray(data[MA_FFD20_AUTO_OVERRIDE_STORE])) data[MA_FFD20_AUTO_OVERRIDE_STORE] = {};
  return data[MA_FFD20_AUTO_OVERRIDE_STORE];
}
function maFfd20AutoFieldSnapshot(item){
  const out = {};
  if(!item || typeof item !== 'object') return out;
  MA_FFD20_AUTO_EDIT_FIELDS.forEach(field => {
    if(Object.prototype.hasOwnProperty.call(item, field) && item[field] !== undefined) out[field] = maFfd20CloneValue(item[field]);
  });
  if(out.description !== undefined && out.desc === undefined) out.desc = out.description;
  if(out.at_higher !== undefined && out.at_higher_lvls === undefined) out.at_higher_lvls = out.at_higher;
  if(out.link !== undefined && out.sourceUrl === undefined) out.sourceUrl = out.link;
  if(out.sourceUrl !== undefined && out.link === undefined) out.link = out.sourceUrl;
  return out;
}
function maFfd20StampAutoDefaults(item){
  if(!item || typeof item !== 'object') return item;
  const snap = maFfd20AutoFieldSnapshot(item);
  item.autoDefaultValues = maFfd20CloneValue(snap);
  item._ffd20DefaultValues = maFfd20CloneValue(snap);
  item.autoDefaultDesc = snap.desc ?? '';
  item.autoDefaultAtHigherLvls = snap.at_higher_lvls ?? '';
  item._ffd20DefaultDesc = snap.desc ?? '';
  item._ffd20DefaultAtHigherLvls = snap.at_higher_lvls ?? '';
  return item;
}
function maFfd20DefaultSnapshotForItem(item, existingOverride){
  if(item?.autoDefaultValues && typeof item.autoDefaultValues === 'object') return maFfd20CloneValue(item.autoDefaultValues);
  if(item?._ffd20DefaultValues && typeof item._ffd20DefaultValues === 'object') return maFfd20CloneValue(item._ffd20DefaultValues);
  if(existingOverride?.defaults && typeof existingOverride.defaults === 'object') return maFfd20CloneValue(existingOverride.defaults);
  const out = {};
  if(item?.autoDefaultDesc !== undefined || item?._ffd20DefaultDesc !== undefined) out.desc = String(item.autoDefaultDesc ?? item._ffd20DefaultDesc ?? '');
  if(item?.autoDefaultAtHigherLvls !== undefined || item?._ffd20DefaultAtHigherLvls !== undefined) out.at_higher_lvls = String(item.autoDefaultAtHigherLvls ?? item._ffd20DefaultAtHigherLvls ?? '');
  if(Object.keys(out).length) return out;
  return maFfd20AutoFieldSnapshot(item);
}
function maFfd20MigrateLegacyDescOverrides(data){
  if(!data || typeof data !== 'object') return;
  const legacy = data[MA_FFD20_LEGACY_DESC_OVERRIDE_STORE];
  if(!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return;
  const store = maFfd20EnsureAutoOverrideStore(data);
  Object.entries(legacy).forEach(([key, value]) => {
    if(!value || typeof value !== 'object' || store[key]) return;
    store[key] = {
      key,
      values: {
        ...(value.desc !== undefined ? { desc: String(value.desc ?? '') } : {}),
        ...(value.at_higher_lvls !== undefined || value.at_higher !== undefined ? { at_higher_lvls: String(value.at_higher_lvls ?? value.at_higher ?? '') } : {})
      },
      defaults: {
        ...(value.defaultDesc !== undefined ? { desc: String(value.defaultDesc ?? '') } : {}),
        ...(value.defaultAtHigherLvls !== undefined ? { at_higher_lvls: String(value.defaultAtHigherLvls ?? '') } : {})
      },
      migratedFrom: MA_FFD20_LEGACY_DESC_OVERRIDE_STORE,
      updatedAt: value.updatedAt || Date.now()
    };
  });
}
function maFfd20CaptureAutoOverride(data, item, opts={}){
  if(!data || typeof data !== 'object' || !maFfd20IsImportedAutoItem(item)) return;
  maFfd20MigrateLegacyDescOverrides(data);
  const key = maFfd20AutoKeyForItem(item);
  if(!key) return;
  item.autoKey = item.autoKey || key;
  const store = maFfd20EnsureAutoOverrideStore(data);
  const existing = store[key] && typeof store[key] === 'object' ? store[key] : {};
  const values = maFfd20AutoFieldSnapshot(item);
  const defaults = maFfd20DefaultSnapshotForItem(item, existing);
  const changed = !!opts.force || !maFfd20AutoSnapshotsEqual(values, defaults);
  if(!changed){
    if(store[key]) delete store[key];
    item.autoCustomized = false;
    return;
  }
  store[key] = {
    ...existing,
    key,
    bucket: item.bucket || existing.bucket || '',
    sourceKind: item.sourceKind || item.originType || existing.sourceKind || '',
    sourceName: item.sourceName || item.originName || existing.sourceName || '',
    sourceLevel: item.sourceLevel || item.level || existing.sourceLevel || 0,
    values,
    defaults: Object.keys(defaults || {}).length ? maFfd20CloneValue(defaults) : (existing.defaults || {}),
    updatedAt: Date.now()
  };
  item.autoCustomized = true;
}
function maFfd20CaptureAllAutoOverrides(data){
  if(!data || typeof data !== 'object') return;
  maFfd20MigrateLegacyDescOverrides(data);
  MA_FFD20_AUTO_COLLECTIONS.forEach(col => {
    if(!Array.isArray(data[col])) return;
    data[col].forEach(item => maFfd20CaptureAutoOverride(data, item));
  });
}
function maFfd20ApplyAutoOverride(data, item){
  if(!data || typeof data !== 'object' || !item || typeof item !== 'object') return item;
  if(!maFfd20IsImportedAutoItem(item)) return item;
  maFfd20MigrateLegacyDescOverrides(data);
  maFfd20StampAutoDefaults(item);
  const key = maFfd20AutoKeyForItem(item);
  const store = maFfd20EnsureAutoOverrideStore(data);
  const override = store[key];
  if(!override || typeof override !== 'object') { item.autoCustomized = false; return item; }
  const values = override.values && typeof override.values === 'object' ? override.values : override;
  MA_FFD20_AUTO_EDIT_FIELDS.forEach(field => {
    if(Object.prototype.hasOwnProperty.call(values, field)) item[field] = maFfd20CloneValue(values[field]);
  });
  if(item.desc === undefined && item.description !== undefined) item.desc = item.description;
  if(item.at_higher_lvls === undefined && item.at_higher !== undefined) item.at_higher_lvls = item.at_higher;
  if(item.link && !item.sourceUrl) item.sourceUrl = item.link;
  if(item.sourceUrl && !item.link) item.link = item.sourceUrl;
  item.autoKey = item.autoKey || key;
  item.autoCustomized = true;
  return item;
}
async function maFfd20FindDefaultSnapshotForAutoItem(item){
  const ownDefaults = maFfd20DefaultSnapshotForItem(item, null);
  if(ownDefaults && Object.keys(ownDefaults).length) return ownDefaults;
  const data = maFfd20ActiveData();
  const key = maFfd20AutoKeyForItem(item);
  const saved = data?.[MA_FFD20_AUTO_OVERRIDE_STORE]?.[key];
  if(saved?.defaults && Object.keys(saved.defaults).length) return maFfd20CloneValue(saved.defaults);
  try {
    const lib = await maFfd20LoadLibrary();
    const imported = maFfd20BuildImported(lib, maFfd20ReadSelection()) || [];
    const hit = imported.find(row => maFfd20AutoKeyForItem(row?.ability) === key)?.ability;
    if(hit) return maFfd20AutoFieldSnapshot(hit);
  } catch(e) { console.warn('Could not find default FFD20 entry for reset', e); }
  return null;
}
function maFfd20ApplySnapshotToItem(item, snap){
  if(!item || typeof item !== 'object' || !snap || typeof snap !== 'object') return;
  MA_FFD20_AUTO_EDIT_FIELDS.forEach(field => {
    if(Object.prototype.hasOwnProperty.call(snap, field)) item[field] = maFfd20CloneValue(snap[field]);
    else if(Object.prototype.hasOwnProperty.call(item, field)) delete item[field];
  });
  if(item.desc === undefined && item.description !== undefined) item.desc = item.description;
  if(item.at_higher_lvls === undefined && item.at_higher !== undefined) item.at_higher_lvls = item.at_higher;
  if(item.link && !item.sourceUrl) item.sourceUrl = item.link;
  if(item.sourceUrl && !item.link) item.link = item.sourceUrl;
  maFfd20StampAutoDefaults(item);
  item.autoCustomized = false;
}
async function maFfd20ResetCurrentAutoItemToDefault(type, index, col, button){
  const data = maFfd20ActiveData();
  const collection = col || ({active:'activeAbilities',passive:'passiveAbilities',racial:'racialAbilities',feat:'feats',spell:'spells'}[type]);
  const item = data?.[collection]?.[index];
  if(!maFfd20IsImportedAutoItem(item)) return;
  const oldText = button?.textContent;
  if(button){ button.disabled = true; button.textContent = 'Resetting...'; }
  try {
    const defaults = await maFfd20FindDefaultSnapshotForAutoItem(item);
    if(!defaults){ alert('Could not find the default JSON version for this auto entry yet. Re-apply the class/race auto update once, then try reset again.'); return; }
    const key = maFfd20AutoKeyForItem(item);
    maFfd20ApplySnapshotToItem(item, defaults);
    const store = maFfd20EnsureAutoOverrideStore(data);
    delete store[key];
    if(typeof saveDataOnly === 'function') saveDataOnly();
    if(typeof refreshList === 'function') refreshList(type);
    populateEditorModal(type, item, index, collection);
  } finally {
    if(button){ button.disabled = false; button.textContent = oldText || 'Reset to Default'; }
  }
}
function maFfd20AddAutoResetButton(type, item, index, col){
  if(!['active','passive','racial','feat','spell'].includes(type) || !maFfd20IsImportedAutoItem(item)) return;
  if(!modalBody || modalBody.querySelector('[data-ffd20-auto-reset="true"]')) return;
  const panel = document.createElement('div');
  panel.className = 'ma-edit-field ma-edit-long ffd20-auto-reset-panel';
  panel.dataset.ffd20AutoReset = 'true';
  panel.style.border = '1px dashed rgba(var(--accent-rgb), .55)';
  panel.style.borderRadius = '10px';
  panel.style.padding = '10px 12px';
  panel.style.background = '#151515';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '8px';
  const note = document.createElement('small');
  note.style.color = '#aaa';
  note.style.lineHeight = '1.35';
  note.textContent = 'Auto-added FFD20 entry. Any edited info here is saved and restored if this entry disappears from leveling down and comes back later.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-edit';
  btn.style.width = 'max-content';
  btn.style.maxWidth = '100%';
  btn.textContent = 'Reset to Default';
  btn.onclick = (event) => { event.preventDefault(); event.stopPropagation(); maFfd20ResetCurrentAutoItemToDefault(type, index, col, btn); };
  panel.appendChild(note);
  panel.appendChild(btn);
  modalBody.appendChild(panel);
}

function maFfd20ToAbility(entry, sourcePrefix=''){
  const bucket = maFfd20Bucket(entry, sourcePrefix);
  const sourceKind = (sourcePrefix === 'race' || bucket === 'racial') ? 'race' : (entry.originType || sourcePrefix || '');
  const ability = {
    name: entry.name || '',
    type: bucket === 'racial' ? 'Racial' : (entry.type || entry.action || (bucket === 'active' ? 'Standard' : sourceKind === 'race' ? 'Racial' : '')),
    desc: entry.desc || entry.description || '',
    at_higher_lvls: entry.at_higher_lvls || '',
    link: entry.url || entry.sourceUrl || '',
    sourceUrl: entry.url || entry.sourceUrl || '',
    sourceKind,
    originType: sourceKind,
    bucket,
    sourceName: entry.originName || entry.sourceName || '',
    sourceLevel: entry.level || 0,
    autoGenerated: true,
    autoKey: maFfd20AutoKey(entry, sourcePrefix),
    replaces: Array.isArray(entry.replaces) ? entry.replaces : []
  };
  if(bucket === 'active') { ability.u_curr = Number(entry.u_curr ?? 0); ability.u_max = Number(entry.u_max ?? 0); ability.attack_type = entry.attack_type || 'None'; ability.damage = entry.damage || ''; ability.restoreOnLongRest = !!entry.restoreOnLongRest; }
  maFfd20StampAutoDefaults(ability);
  return { bucket, ability };
}
function maFfd20Collect(source, level, originType, originName){
  const list = Array.isArray(source?.features) ? source.features : Array.isArray(source?.traits) ? source.traits : [];
  return list.filter(entry => maFfd20Level(entry.level || 1) <= level).map(entry => ({...entry, originType, originName, sourceUrl:entry.url || entry.sourceUrl || source.url}));
}
function maFfd20BuildImported(lib, selection){
  const imported = [];
  const race = maFfd20Find(lib.races, selection.race);
  if(race) maFfd20Collect(race, 1, 'race', race.name).forEach(e => imported.push(maFfd20ToAbility(e, 'race')));
  const cls = maFfd20Find(lib.classes, selection.className);
  if(cls){
    maFfd20Collect(cls, selection.level || 1, 'class', cls.name).forEach(e => imported.push(maFfd20ToAbility(e, 'class')));
    const arch = maFfd20Find(cls.archetypes, selection.archetype);
    if(arch) maFfd20Collect(arch, selection.level || 1, 'archetype', arch.name).forEach(e => imported.push(maFfd20ToAbility(e, 'archetype')));
  }
  (selection.multiclasses || []).forEach((mc, idx) => {
    const mcls = maFfd20Find(lib.classes, mc.className || mc.class || mc.name);
    if(!mcls) return;
    const mLevel = maFfd20Level(mc.level || 1) || 1;
    maFfd20Collect(mcls, mLevel, 'multiclass', `Secondary ${idx+1}: ${mcls.name}`).forEach(e => imported.push(maFfd20ToAbility(e, 'multiclass')));
    const march = maFfd20Find(mcls.archetypes, mc.archetype);
    if(march) maFfd20Collect(march, mLevel, 'multiclass', `Secondary ${idx+1}: ${march.name}`).forEach(e => imported.push(maFfd20ToAbility(e, 'multiclass')));
  });
  const prestige = maFfd20Find(lib.prestigeClasses, selection.prestigeClass);
  if(prestige) maFfd20Collect(prestige, selection.prestigeLevel || 1, 'prestige', prestige.name).forEach(e => imported.push(maFfd20ToAbility(e, 'prestige')));
  return imported;
}
function maFfd20RemoveOldAuto(data){
  // Rebuild every JSON-imported FFD20 entry from the current class/race/level.
  // Before removing them, capture any player-edited fields so they can return
  // when the same auto entry is earned again.
  maFfd20CaptureAllAutoOverrides(data);
  ['activeAbilities','passiveAbilities','racialAbilities','feats','spells'].forEach(key => {
    if(!Array.isArray(data[key])) data[key] = [];
    data[key] = data[key].filter(item => !maFfd20IsImportedAutoItem(item));
  });
}
function maFfd20Push(data, imported){
  maFfd20MoveRaceEffectsToRacial(data);
  const replaceNames = imported.flatMap(x => Array.isArray(x.ability?.replaces) ? x.ability.replaces : []).map(maFfd20Norm).filter(Boolean);
  if(replaceNames.length){
    ['activeAbilities','passiveAbilities','racialAbilities'].forEach(key => { if(Array.isArray(data[key])) data[key] = data[key].filter(item => !replaceNames.includes(maFfd20Norm(item.name))); });
  }
  imported.forEach(({bucket, ability}) => {
    if(maFfd20IsRaceEffect(ability, data)) {
      bucket = 'racial';
      ability.sourceKind = 'race';
      ability.originType = 'race';
      ability.bucket = 'racial';
      ability.type = 'Racial';
    }
    maFfd20ApplyAutoOverride(data, ability);
    const key = bucket === 'active' ? 'activeAbilities' : bucket === 'racial' ? 'racialAbilities' : bucket === 'feat' ? 'feats' : bucket === 'spell' ? 'spells' : 'passiveAbilities';
    if(!Array.isArray(data[key])) data[key] = [];
    if(!data[key].some(x => x.autoKey && x.autoKey === ability.autoKey)) data[key].push(ability);
  });
  maFfd20MoveRaceEffectsToRacial(data);
}
async function maFfd20ApplySheetChoices({silent=false}={}){
  if(maFfd20ApplyingChoice) return;
  maFfd20ApplyingChoice = true;
  try {
    const lib = await maFfd20LoadLibrary();
    const data = maFfd20ActiveData();
    const sel = maFfd20ReadSelection();
    data.race = sel.race || data.race || '';
    data.class = sel.className || data.class || '';
    data.archetype = sel.archetype || '';
    data.character_level = String(sel.level || data.character_level || 1);
    if(MA_FFD20_IS_ADMIN){ data.prestige_class = sel.prestigeClass; data.prestige_level = String(sel.prestigeLevel || 1); }
    if(!Array.isArray(data.racialAbilities)) data.racialAbilities = [];
    maFfd20MoveRaceEffectsToRacial(data);
    maFfd20RemoveOldAuto(data);
    const imported = maFfd20BuildImported(lib, sel);
    maFfd20Push(data, imported);
    maFfd20MoveRaceEffectsToRacial(data);
    maFfd20RenderAll();
    maFfd20SaveNow();
    if(!silent) alert(`Updated ${imported.length} FFD20 entries. Manual entries were kept.`);
  } catch(e) { if(!silent) alert(e.message); else console.warn(e); }
  finally { maFfd20ApplyingChoice = false; }
}
function maFfd20HitDie(cls){ const m = String(cls?.hitDie || cls?.hit_die || '').match(/d\s*(\d+)/i); return m ? Number(m[1]) : 8; }
function maFfd20AvgHp(die){ return Math.floor(Number(die || 8) / 2) + 1; }
function maFfd20SkillBase(cls){ const m = String(cls?.skillPoints || cls?.skill_points || '').match(/\d+/); return m ? Number(m[0]) : 4; }
function maFfd20Mod(stat){ const n = Number(document.getElementById(stat)?.value || maFfd20ActiveData()?.[stat] || 10); return Math.floor(((Number.isFinite(n) ? n : 10) - 10) / 2); }
function maFfd20ClassObj(lib, name){ return maFfd20Find(lib.classes, name || document.getElementById('class')?.value || maFfd20ActiveData()?.class || ''); }
function maFfd20InitialHpSkill(cls, level, favored){
  const die = maFfd20HitDie(cls), con = maFfd20Mod('con'), intel = maFfd20Mod('int');
  const hp1 = Math.max(1, die + con);
  const hpLater = Math.max(1, maFfd20AvgHp(die) + con);
  const skillEach = Math.max(1, maFfd20SkillBase(cls) + intel);
  let hp = hp1 + Math.max(0, level - 1) * hpLater;
  let skill = skillEach * 4 + Math.max(0, level - 1) * skillEach;
  if(favored === 'skill') skill += level; else hp += level;
  return { hp, skill, die, hpLater, skillEach };
}
function maFfd20ApplyHpSkillToData(data, cls, level, favored){
  const calc = maFfd20InitialHpSkill(cls, level, favored);
  data.hp_curr = String(calc.hp); data.hp_max = String(calc.hp); data.hp_temp = data.hp_temp || '0';
  data.skill_points = String(calc.skill);
  return calc;
}
function maFfd20MilestonesBetween(oldLevel, newLevel){ const out=[]; for(let i=oldLevel+1;i<=newLevel;i++) if([4,8,12,16,20].includes(i)) out.push(i); return out; }
function maFfd20OddLevelsBetween(oldLevel, newLevel){ const out=[]; for(let i=oldLevel+1;i<=newLevel;i++) if(i % 2 === 1) out.push(i); return out; }
function maFfd20Dialog(title, bodyHtml, confirmText='Save'){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'ffd20-modal-overlay show';
    overlay.innerHTML = `<div class="ffd20-modal"><div class="ffd20-modal-head"><h3>${maFfd20Esc(title)}</h3><button class="btn-close" type="button" data-close>&times;</button></div><div class="ffd20-modal-body">${bodyHtml}</div><div class="ffd20-modal-actions"><button class="ffd20-mini-btn" type="button" data-close>Cancel</button><button class="btn-save" type="button" data-confirm>${maFfd20Esc(confirmText)}</button></div></div>`;
    document.body.appendChild(overlay);
    const confirmBtn = overlay.querySelector('[data-confirm]');
    const refreshRequiredPicks = () => {
      const missing = Array.from(overlay.querySelectorAll('[data-required-pick="true"]')).some(el => !String(el.value || '').trim());
      if(confirmBtn){
        confirmBtn.disabled = missing;
        confirmBtn.classList.toggle('disabled', missing);
        confirmBtn.title = missing ? 'Pick the required option first.' : '';
        confirmBtn.setAttribute('aria-disabled', missing ? 'true' : 'false');
      }
    };
    overlay.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => { overlay.remove(); resolve(null); }));
    overlay.addEventListener('change', event => {
      if(event.target?.matches?.('[data-required-pick="true"]')) refreshRequiredPicks();
    });
    overlay.addEventListener('input', event => {
      if(event.target?.matches?.('[data-required-pick="true"]')) refreshRequiredPicks();
    });
    confirmBtn?.addEventListener('click', () => {
      refreshRequiredPicks();
      if(confirmBtn.disabled){
        alert('Please pick the required ability score before applying.');
        return;
      }
      resolve(overlay);
      overlay.remove();
    });
    setTimeout(refreshRequiredPicks, 0);
  });
}
async function maFfd20HandleLevelChanged(event){
  const select = event?.target || document.getElementById('character_level');
  const oldLevel = maFfd20Level(select?.dataset.prevLevel || maFfd20ActiveData()?.character_level || 1) || 1;
  const newLevel = maFfd20Level(select?.value || 1) || 1;
  if(select) select.dataset.prevLevel = String(newLevel);
  if(newLevel <= oldLevel){ await maFfd20ApplySheetChoices({silent:true}); return; }
  let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message); return; }
  const cls = maFfd20ClassObj(lib);
  const die = maFfd20HitDie(cls), avg = maFfd20AvgHp(die), con = maFfd20Mod('con'), intel = maFfd20Mod('int'), skillEach = Math.max(1, maFfd20SkillBase(cls) + intel);
  const milestones = maFfd20MilestonesBetween(oldLevel, newLevel);
  const feats = maFfd20OddLevelsBetween(oldLevel, newLevel);
  const milestoneHtml = milestones.length ? `<div class="ffd20-milestone-grid">${milestones.map(l => `<label>Level ${l} ability +1<select data-ability-level="${l}" data-required-pick="true"><option value="">Pick</option>${MA_STATS.map(s=>`<option value="${s}">${s.toUpperCase()}</option>`).join('')}</select></label>`).join('')}</div>` : '<div class="ffd20-choice-note">No ability-score increase on this level.</div>';
  const overlay = await maFfd20Dialog(`Level Up: ${oldLevel} → ${newLevel}`, `
    <div class="ffd20-level-summary">
      <strong>Gains to apply now:</strong>
      <ul>
        <li>HP per new level: Avg d${die} = ${avg} + CON mod ${con >= 0 ? '+' : ''}${con}</li>
        <li>Skill points per new level: ${maFfd20SkillBase(cls)} + INT mod ${intel >= 0 ? '+' : ''}${intel} = ${skillEach}</li>
        <li>Feat reminder: ${feats.length ? feats.map(x=>'level '+x).join(', ') : 'no odd-level feat in this increase'}</li>
        <li>TODO reminder: BAB and saves automation still need rules hookup.</li>
      </ul>
    </div>
    <label>Favored class bonus for this level-up<select id="maLevelFavored"><option value="hp">+1 HP</option><option value="skill">+1 Skill Point</option></select></label>
    ${milestoneHtml}
  `, 'Apply Level Up');
  if(!overlay) return;
  const favored = overlay.querySelector('#maLevelFavored')?.value || 'hp';
  const data = maFfd20ActiveData();
  const levelsGained = newLevel - oldLevel;
  const hpGain = levelsGained * Math.max(1, avg + con) + (favored === 'hp' ? levelsGained : 0);
  const skillGain = levelsGained * skillEach + (favored === 'skill' ? levelsGained : 0);
  ['hp_curr','hp_max'].forEach(id => { const el = document.getElementById(id); if(el) el.value = String((Number(el.value)||0) + hpGain); data[id] = el?.value || String((Number(data[id])||0) + hpGain); });
  const sp = document.getElementById('skill_points'); if(sp){ sp.value = String((Number(sp.value)||0) + skillGain); data.skill_points = sp.value; }
  overlay.querySelectorAll('[data-ability-level]').forEach(sel => { const stat = sel.value; const el = document.getElementById(stat); if(el){ const base = Number(el.value) || 10; el.value = String(base + 1); data[stat] = el.value; } });
  await maFfd20ApplySheetChoices({silent:true});
  maFfd20RenderAll(); maFfd20SaveNow();
  alert(`Level-up applied. Added ${hpGain} max HP and ${skillGain} unused skill points. ${feats.length ? 'Pick feat(s) for: ' + feats.join(', ') + '.' : ''}`);
}
function maFfd20RenderMulticlasses(){
  const list = document.getElementById('maMulticlassList'); if(!list) return;
  const data = maFfd20ActiveData(); if(!Array.isArray(data.multiclasses)) data.multiclasses = [];
  list.innerHTML = '';
  data.multiclasses.forEach((mc, index) => {
    const row = document.createElement('div'); row.className = 'ffd20-multiclass-row';
    row.innerHTML = `<div><strong>Secondary ${index+1}: ${maFfd20Esc(mc.className || mc.class || 'Class')}</strong><small>${maFfd20Esc(mc.archetype || 'No archetype')} · Level ${maFfd20Esc(mc.level || 1)}</small></div><button class="ffd20-mini-btn danger" type="button">Delete</button>`;
    row.querySelector('button')?.addEventListener('click', async () => { data.multiclasses.splice(index,1); maFfd20RenderMulticlasses(); await maFfd20ApplySheetChoices({silent:true}); maFfd20SaveNow(); });
    list.appendChild(row);
  });
}
async function maFfd20OpenMulticlassDialog(){
  let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message); return; }
  const body = `<div class="ffd20-modal-grid"><label>Class<select id="maMultiClass"></select></label><label>Archetype<select id="maMultiArch"><option value="">No archetype</option></select></label><label>Level<select id="maMultiLevel">${maFfd20LevelOptions('1')}</select></label></div>`;
  const overlayPromise = maFfd20Dialog('Add Multiclass', body, 'Add Multiclass');
  setTimeout(() => {
    const c = document.getElementById('maMultiClass'), a = document.getElementById('maMultiArch');
    maFfd20FillSelect(c, lib.classes, 'Choose class');
    c?.addEventListener('change', () => { const cls=maFfd20Find(lib.classes,c.value); maFfd20FillSelect(a, cls?.archetypes || [], 'No archetype'); });
  }, 0);
  const overlay = await overlayPromise; if(!overlay) return;
  const data = maFfd20ActiveData(); if(!Array.isArray(data.multiclasses)) data.multiclasses = [];
  const className = overlay.querySelector('#maMultiClass')?.value || '';
  if(!className) return;
  data.multiclasses.push({ className, archetype: overlay.querySelector('#maMultiArch')?.value || '', level: overlay.querySelector('#maMultiLevel')?.value || '1' });
  maFfd20RenderMulticlasses(); await maFfd20ApplySheetChoices({silent:true}); maFfd20SaveNow();
}


/* --- MODULE PATCH: compact class rows + working class overlay, inside Firebase module scope --- */
function maClassRowsRefreshCard(){
  const d = maFfd20ActiveData ? (maFfd20ActiveData() || {}) : {};
  const classVal = document.getElementById('class')?.value || d.class || d.className || '';
  const archVal = document.getElementById('archetype')?.value || d.archetype || '';
  const lvlVal = document.getElementById('character_level')?.value || d.character_level || d.level || '1';
  const title = document.getElementById('maPrimaryClassTitle'); if(title) title.textContent = classVal || 'Choose Class';
  const sub = document.getElementById('maPrimaryClassSub'); if(sub) sub.textContent = archVal || 'No archetype selected';
  const badge = document.getElementById('maPrimaryClassLevel'); if(badge) badge.textContent = 'Lv ' + (lvlVal || '1');
}
function maClassRowsSetSelectValue(select, value, label){
  if(!select) return;
  const val = String(value || '');
  if(val && !Array.from(select.options || []).some(opt => opt.value === val)) maFfd20AddOption(select, val, label || val);
  select.value = val;
}
function maClassRowsInstallClicks(){
  if(document.body.dataset.maClassRowsModuleClicks === '1') return;
  document.body.dataset.maClassRowsModuleClicks = '1';
  document.addEventListener('click', event => {
    const primary = event.target.closest('#maClassBuildCard');
    if(primary){
      event.preventDefault();
      event.stopPropagation();
      maClassRowsOpenDialog('primary', null);
      return;
    }
    const add = event.target.closest('#maAddMulticlassBtn');
    if(add){
      event.preventDefault();
      event.stopPropagation();
      maClassRowsOpenDialog('multi', null);
      return;
    }
    const edit = event.target.closest('#maMulticlassList .ma-multiclass-edit');
    if(edit){
      const cards = Array.from(document.querySelectorAll('#maMulticlassList .ma-multiclass-edit'));
      const index = cards.indexOf(edit);
      if(index >= 0){
        event.preventDefault();
        event.stopPropagation();
        maClassRowsOpenDialog('multi', index);
      }
    }
  }, true);
}
maFfd20BuildChoiceGrid = function(force=false){
  const character = document.getElementById('character');
  if(!character) return;
  const currentGrid = document.getElementById('ffd20ChoiceGrid');
  if(currentGrid?.dataset?.maClassRows === '1' && !force){
    maClassRowsInstallClicks();
    maClassRowsRefreshCard();
    return;
  }
  const oldGrid = currentGrid || character.querySelector('.bio-grid');
  if(!oldGrid) return;
  const values = maFfd20CaptureBioValues ? maFfd20CaptureBioValues() : {};
  const d = maFfd20ActiveData ? (maFfd20ActiveData() || {}) : {};
  ['charName','race','class','archetype','character_level','alignment','size_category','size','languages','senses','shop_tags','prestige_class','prestige_level'].forEach(id => {
    if(values[id] === undefined || values[id] === '') values[id] = d[id] ?? values[id] ?? '';
  });
  if(!values.charName && d.name) values.charName = d.name;
  if(!values.class && d.className) values.class = d.className;
  if(!values.character_level && d.level) values.character_level = d.level;
  if(!values.size_category && d.size) values.size_category = d.size;
  const fieldClass = maFfd20FieldClass();
  const prestigeBlock = MA_FFD20_IS_ADMIN ? `<div class="ma-prestige-admin"><div class="bio-item"><label>Prestige Class</label><select id="prestige_class" class="${fieldClass} ma-ffd20-prestige"><option value="${maFfd20Esc(values.prestige_class || '')}">${maFfd20Esc(values.prestige_class || 'No prestige')}</option></select></div><div class="bio-item"><label>Prestige Level</label><select id="prestige_level" class="${fieldClass}">${maFfd20LevelOptions(values.prestige_level || '1')}</select></div></div>` : '';
  const shopTags = MA_FFD20_IS_ADMIN ? `<div class="bio-item"><label>Shop Access Tags</label><input id="shop_tags" class="${fieldClass}" placeholder="starter, magic_shop, blacksmith, potion_shop" value="${maFfd20Esc(values.shop_tags || '')}"></div>` : '';
  const grid = document.createElement('section');
  grid.id = 'ffd20ChoiceGrid';
  grid.dataset.maClassRows = '1';
  grid.className = 'ffd20-bio-three-col ffd20-v3-grid';
  grid.setAttribute('aria-label','Identity and Build');
  grid.innerHTML = `
    <div class="ffd20-bio-col">
      <h3>Identity</h3>
      <div class="bio-item"><label>Name</label><input id="charName" class="${fieldClass}" value="${maFfd20Esc(values.charName || '')}"></div>
      <div class="bio-item"><label>Alignment</label><select id="alignment" class="${fieldClass}"></select></div>
      <div class="bio-item"><label>Size</label><select id="size_category" class="${fieldClass}" aria-label="Character Size"></select><input id="size" class="${fieldClass}" type="hidden" value="${maFfd20Esc(values.size || values.size_category || '')}"></div>
      <div class="bio-item"><label>Languages</label><input id="languages" class="${fieldClass}" value="${maFfd20Esc(values.languages || '')}"></div>
      <div class="bio-item"><label>Senses</label><input id="senses" class="${fieldClass}" value="${maFfd20Esc(values.senses || '')}"></div>
    </div>
    <div class="ffd20-bio-col">
      <h3>Build</h3>
      <div class="bio-item"><label>Race</label><select id="race" class="${fieldClass} ma-ffd20-race"><option value="${maFfd20Esc(values.race || '')}">${maFfd20Esc(values.race || 'Loading races...')}</option></select></div>
      <select id="class" class="${fieldClass} ma-ffd20-class ma-ffd20-hidden-select"><option value="${maFfd20Esc(values.class || '')}">${maFfd20Esc(values.class || 'Choose class')}</option></select>
      <select id="archetype" class="${fieldClass} ma-ffd20-archetype ma-ffd20-hidden-select"><option value="${maFfd20Esc(values.archetype || '')}">${maFfd20Esc(values.archetype || 'No archetype')}</option></select>
      <select id="character_level" class="${fieldClass} ma-ffd20-level ma-ffd20-hidden-select" aria-label="Character Level">${maFfd20LevelOptions(values.character_level || '1')}</select>
      <button id="maClassBuildCard" class="ma-build-card" type="button" title="Edit class, archetype, and level"><span class="ma-class-click-label">Class</span><span class="ma-class-slot-main"><strong id="maPrimaryClassTitle" class="ma-build-card-title">${maFfd20Esc(values.class || 'Choose Class')}</strong><small id="maPrimaryClassSub" class="ma-build-card-sub">${maFfd20Esc(values.archetype || 'No archetype selected')}</small></span><span id="maPrimaryClassLevel" class="ma-build-card-level">Lv ${maFfd20Esc(values.character_level || '1')}</span></button>
      <div id="maMulticlassList" class="ffd20-multiclass-list"></div>
      <div class="bio-item ma-add-multiclass-wrap"><button class="ffd20-mini-btn" type="button" id="maAddMulticlassBtn">+ Add Multiclass</button></div>
      ${prestigeBlock}
      <div id="maBuildProgressionSummary"></div>
      ${shopTags}
    </div>`;
  oldGrid.replaceWith(grid);
  document.querySelector('.character-level-row')?.remove();
  maFfd20FillSimple(document.getElementById('alignment'), MA_ALIGNMENTS, 'Choose alignment', values.alignment || '');
  maFfd20FillSimple(document.getElementById('size_category'), MA_SIZES, 'Select Size', values.size_category || values.size || 'Medium');
  const levelEl = document.getElementById('character_level'); if(levelEl) levelEl.dataset.prevLevel = String(maFfd20Level(values.character_level || 1) || 1);
  document.getElementById('class')?.addEventListener('change', async () => { await maFfd20RefreshArchetypes(); maClassRowsRefreshCard(); await maFfd20ApplySheetChoices({silent:true}); });
  document.getElementById('race')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  document.getElementById('archetype')?.addEventListener('change', () => { maClassRowsRefreshCard(); maFfd20ApplySheetChoices({silent:true}); });
  document.getElementById('prestige_class')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  document.getElementById('prestige_level')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  document.getElementById('size_category')?.addEventListener('change', () => { const h=document.getElementById('size'); if(h) h.value=document.getElementById('size_category').value; try{ syncSizeFields(); }catch(e){} maFfd20SaveNow(); });
  document.getElementById('character_level')?.addEventListener('change', maFfd20HandleLevelChanged);
  document.getElementById('maClassBuildCard')?.addEventListener('click', () => maClassRowsOpenDialog('primary', null));
  document.getElementById('maAddMulticlassBtn')?.addEventListener('click', () => maClassRowsOpenDialog('multi', null));
  maClassRowsInstallClicks();
  maClassRowsRefreshCard();
};
maFfd20HandleLevelChanged = async function(event){
  const select = event?.target || document.getElementById('character_level');
  const newLevel = maFfd20Level(select?.value || maFfd20ActiveData()?.character_level || 1) || 1;
  if(select){ select.value = String(newLevel); select.dataset.prevLevel = String(newLevel); }
  const d = maFfd20ActiveData(); if(d) d.character_level = String(newLevel);
  maClassRowsRefreshCard();
  await maFfd20ApplySheetChoices({silent:true});
  maFfd20RenderAll();
  maFfd20SaveNow();
};
async function maClassRowsOpenDialog(kind='primary', index=null){
  let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message || e); return; }
  const d = maFfd20ActiveData(); if(d && !Array.isArray(d.multiclasses)) d.multiclasses = [];
  const isMulti = kind === 'multi';
  const mc = isMulti && index !== null ? (d.multiclasses[index] || {}) : {};
  const curClass = isMulti ? (mc.className || mc.class || '') : (document.getElementById('class')?.value || d.class || '');
  const curArch = isMulti ? (mc.archetype || '') : (document.getElementById('archetype')?.value || d.archetype || '');
  const curLevel = isMulti ? (mc.level || '1') : (document.getElementById('character_level')?.value || d.character_level || '1');
  const title = isMulti ? (index === null ? 'Add Class' : `Edit Class ${index+2}`) : 'Edit Class';
  const body = `<div class="ffd20-modal-grid"><label>Class<select id="maEditClass"></select></label><label>Archetype<select id="maEditArch"><option value="">No archetype</option></select></label><label>Level<select id="maEditLevel">${maFfd20LevelOptions(curLevel)}</select></label></div>`;
  const overlayPromise = maFfd20Dialog(title, body, 'Save Class');
  setTimeout(() => {
    const c = document.getElementById('maEditClass'), a = document.getElementById('maEditArch');

    maFfd20FillSelect(c, lib.classes, 'Choose class', curClass);

    // Keep the current class saved, but do not visually select it in the open dropdown.
    // This removes the native browser "selected option vs hovered option" highlight fight.
    if(c) {
        c.dataset.currentClass = curClass || '';
        c.selectedIndex = -1;
        c.value = '';
        c.title = curClass ? `Current class: ${curClass}` : '';
    }

    const fillArch = (keep=true) => {
        const activeClass = c?.value || c?.dataset.currentClass || curClass || '';
        const cls = maFfd20Find(lib.classes, activeClass);
        maFfd20FillSelect(a, cls?.archetypes || [], 'No archetype', keep ? curArch : '');
    };

    fillArch(true);
    c?.addEventListener('change', () => fillArch(false));
  }, 0);
  const target = isMulti && index !== null ? document.querySelectorAll('#maMulticlassList .ma-build-card')[index] : document.getElementById('maClassBuildCard');
  target?.classList.add('ma-glow'); setTimeout(()=>target?.classList.remove('ma-glow'),700);
  const overlay = await overlayPromise; if(!overlay) return;
  const classSelectEl = overlay.querySelector('#maEditClass');
  const className = classSelectEl?.value || classSelectEl?.dataset.currentClass || curClass || '';
  if(!className) return;
  let archetype = overlay.querySelector('#maEditArch')?.value || '';
  const chosenClassForArch = maFfd20Find(lib.classes, className);
  if(maFfd20Norm(className) !== maFfd20Norm(curClass) && archetype && !maFfd20Find(chosenClassForArch?.archetypes || [], archetype)) archetype = '';
  const level = String(maFfd20Level(overlay.querySelector('#maEditLevel')?.value || 1) || 1);
  if(isMulti){
    const item = { className, archetype, level };
    if(index === null) d.multiclasses.push(item); else d.multiclasses[index] = item;
    maFfd20RenderMulticlasses();
    await maFfd20ApplySheetChoices({silent:true});
    maFfd20SaveNow();
    return;
  }
  const classSelect = document.getElementById('class');
  const archSelect = document.getElementById('archetype');
  const levelSelect = document.getElementById('character_level');
  maClassRowsSetSelectValue(classSelect, className, className);
  if(d) d.class = className;
  await maFfd20RefreshArchetypes();
  maClassRowsSetSelectValue(archSelect, archetype, archetype || 'No archetype');
  if(d) d.archetype = archetype;
  maClassRowsSetSelectValue(levelSelect, level, level);
  if(levelSelect) levelSelect.dataset.prevLevel = level;
  if(d) d.character_level = level;
  maClassRowsRefreshCard();
  await maFfd20ApplySheetChoices({silent:true});
  maFfd20SaveNow();
}
maFfd20RenderMulticlasses = function(){
  const list = document.getElementById('maMulticlassList'); if(!list) return;
  const d = maFfd20ActiveData(); if(!d) return;
  if(!Array.isArray(d.multiclasses)) d.multiclasses = [];
  list.innerHTML = '';
  d.multiclasses.forEach((mc, index) => {
    const row = document.createElement('div');
    row.className = 'ma-multiclass-card';
    row.innerHTML = `<button type="button" class="ma-build-card ma-multiclass-edit"><span class="ma-class-click-label">Class ${index+2}</span><span class="ma-class-slot-main"><strong class="ma-build-card-title">${maFfd20Esc(mc.className || mc.class || 'Choose Class')}</strong><small class="ma-build-card-sub">${maFfd20Esc(mc.archetype || 'No archetype')}</small></span><span class="ma-build-card-level">Lv ${maFfd20Esc(mc.level || 1)}</span></button><button class="ffd20-mini-btn danger" type="button">Delete</button>`;
    row.querySelector('.ma-multiclass-edit')?.addEventListener('click', () => maClassRowsOpenDialog('multi', index));
    row.querySelector('button.danger')?.addEventListener('click', async () => { d.multiclasses.splice(index,1); maFfd20RenderMulticlasses(); await maFfd20ApplySheetChoices({silent:true}); maFfd20SaveNow(); });
    list.appendChild(row);
  });
};
maClassRowsInstallClicks();
setTimeout(() => { maFfd20BuildChoiceGrid(true); maFfd20RefreshOptions(); maFfd20RenderMulticlasses(); maClassRowsRefreshCard(); }, 0);

function maFfd20CreateMilestoneFields(level){
  const milestones = [4,8,12,16,20].filter(x => x <= level);
  if(!milestones.length) return '';
  return `<div class="ffd20-milestone-grid">${milestones.map(l => `<label>Level ${l} ability +1<select data-create-ability-level="${l}" data-required-pick="true"><option value="">Pick</option>${MA_STATS.map(s=>`<option value="${s}">${s.toUpperCase()}</option>`).join('')}</select></label>`).join('')}</div>`;
}
async function maFfd20OpenCreationWizard(){
  if(MA_FFD20_IS_ADMIN) return;
  if(!currentUser) return;
  let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message); return; }
  const nextIndex = (characterSheets?.length || 0) + 1;
  const body = `
    <div class="ffd20-modal-grid">
      <label>Name<input id="maCreateName" value="New Character ${nextIndex}"></label>
      <label>Race<select id="maCreateRace"></select></label>
      <label>Class<select id="maCreateClass"></select></label>
      <label>Archetype<select id="maCreateArch"><option value="">No archetype</option></select></label>
      <label>Level<select id="maCreateLevel">${maFfd20LevelOptions('1')}</select></label>
      <label>Alignment<select id="maCreateAlignment"></select></label>
      <label>Size<select id="maCreateSize"></select></label>
      <label>Languages<input id="maCreateLanguages" placeholder="Common, ..."></label>
      <label>Senses<input id="maCreateSenses" placeholder="Darkvision, low-light, ..."></label>
      <label>Favored class bonus<select id="maCreateFavored"><option value="hp">+1 HP each level</option><option value="skill">+1 Skill Point each level</option></select></label>
    </div>
    <div class="ffd20-level-summary"><strong>Starting calculations</strong><ul><li>Level 1 HP = Hit Die + CON mod.</li><li>Later HP = average Hit Die + CON mod. Example: d8 = 5 + CON.</li><li>Level 1 skill points are multiplied by 4.</li><li>Odd levels remind you to pick feats.</li><li>TODO reminder: BAB and saves automation still need rules hookup.</li></ul></div>
    <div id="maCreateMilestones">${maFfd20CreateMilestoneFields(1)}</div>`;
  const overlayPromise = maFfd20Dialog('Create FFD20 Character', body, 'Create Character');
  setTimeout(() => {
    maFfd20FillSelect(document.getElementById('maCreateRace'), lib.races, 'Choose race');
    maFfd20FillSelect(document.getElementById('maCreateClass'), lib.classes, 'Choose class');
    maFfd20FillSimple(document.getElementById('maCreateAlignment'), MA_ALIGNMENTS, 'Choose alignment');
    maFfd20FillSimple(document.getElementById('maCreateSize'), MA_SIZES, 'Select Size', 'Medium');
    document.getElementById('maCreateClass')?.addEventListener('change', () => { const cls=maFfd20Find(lib.classes, document.getElementById('maCreateClass').value); maFfd20FillSelect(document.getElementById('maCreateArch'), cls?.archetypes || [], 'No archetype', ''); });
    document.getElementById('maCreateLevel')?.addEventListener('change', e => { const target=document.getElementById('maCreateMilestones'); if(target) target.innerHTML = maFfd20CreateMilestoneFields(maFfd20Level(e.target.value)); });
  }, 0);
  const overlay = await overlayPromise; if(!overlay) return;
  const level = maFfd20Level(overlay.querySelector('#maCreateLevel')?.value || 1) || 1;
  const name = overlay.querySelector('#maCreateName')?.value?.trim() || `New Character ${nextIndex}`;
  const className = overlay.querySelector('#maCreateClass')?.value || '';
  const race = overlay.querySelector('#maCreateRace')?.value || '';
  try {
    const newData = createBlankCharacterData(name);
    newData.charName = name;
    newData.race = race;
    newData.class = className;
    newData.archetype = overlay.querySelector('#maCreateArch')?.value || '';
    newData.character_level = String(level);
    newData.alignment = overlay.querySelector('#maCreateAlignment')?.value || '';
    newData.size_category = overlay.querySelector('#maCreateSize')?.value || 'Medium';
    newData.size = newData.size_category;
    newData.languages = overlay.querySelector('#maCreateLanguages')?.value || '';
    newData.senses = overlay.querySelector('#maCreateSenses')?.value || '';
    newData.racialAbilities = Array.isArray(newData.racialAbilities) ? newData.racialAbilities : [];
    newData.multiclasses = [];
    overlay.querySelectorAll('[data-create-ability-level]').forEach(sel => { const stat = sel.value; newData[stat] = String((Number(newData[stat]) || 10) + 1); });
    const cls = maFfd20Find(lib.classes, className);
    const calc = maFfd20ApplyHpSkillToData(newData, cls, level, overlay.querySelector('#maCreateFavored')?.value || 'hp');
    maFfd20Push(newData, maFfd20BuildImported(lib, { race, className, archetype:newData.archetype, level, multiclasses:[] }));
    const ref = await addDoc(collection(db, 'users', currentUser.uid, 'characters'), newData);
    try { await setDoc(doc(db, 'users', currentUser.uid), { charactersMigrated:true }, { merge:true }); } catch(e){ console.warn(e); }
    currentSummonId = ref.id;
    rememberSelectedCharacterId(currentSummonId);
    fullData = sanitizeCharacterDoc({ id:ref.id, ...newData }, name);
    showNoCharacterState(false);
    loadCurrentSheet(); updateSummonMenu();
    document.getElementById('summonMenu')?.classList.remove('show');
    const feats = Array.from({length:level}, (_,i)=>i+1).filter(x => x % 2 === 1);
    alert(`Created ${name}. Starting HP: ${calc.hp}. Unused skill points: ${calc.skill}. Feat reminder for level(s): ${feats.join(', ')}.`);
  } catch(err){ console.error(err); alert('Error creating character: ' + (err?.message || err)); }
}
function maFfd20SyncAfterPopulate(){
  maFfd20BuildChoiceGrid();
  const data = maFfd20ActiveData() || {};
  ['charName','bio','race','class','archetype','character_level','alignment','size_category','languages','senses','shop_tags','prestige_class','prestige_level'].forEach(id => { const el=document.getElementById(id); if(el && data[id] !== undefined) el.value = data[id]; });
  const levelEl = document.getElementById('character_level'); if(levelEl) levelEl.dataset.prevLevel = String(maFfd20Level(levelEl.value || data.character_level || 1) || 1);
  maFfd20RefreshOptions(); maFfd20RenderMulticlasses();
}
function maFfd20InitChoiceUi(){
  if(maFfd20ChoiceUiReady) return;
  maFfd20ChoiceUiReady = true;
  document.getElementById('ffd20BuilderPanel')?.remove();
  maFfd20BuildChoiceGrid(); maFfd20RefreshOptions();
  if(!MA_FFD20_IS_ADMIN && window.createNewSummon){
    window.createNewSummon = maFfd20OpenCreationWizard;
    try { createNewSummon = window.createNewSummon; } catch(e) {}
  }
}
if(MA_FFD20_IS_ADMIN){
  const maOldPopulateSheet = populateSheet;
  populateSheet = function(...args){ const result = maOldPopulateSheet.apply(this, args); maFfd20SyncAfterPopulate(); return result; };
} else {
  const maOldLoadCurrentSheet = loadCurrentSheet;
  loadCurrentSheet = function(...args){ const result = maOldLoadCurrentSheet.apply(this, args); maFfd20SyncAfterPopulate(); const addBtn=document.getElementById('btnAddSummon'); if(addBtn) addBtn.onclick = window.createNewSummon || maFfd20OpenCreationWizard; return result; };
}
window.addEventListener('DOMContentLoaded', maFfd20InitChoiceUi);
setTimeout(maFfd20InitChoiceUi, 0);



/* --- v4 repair: class math, vitals display, and level-up save rollback --- */
function maV4Num(id, fallback=0){
  const el = document.getElementById(id);
  const d = maFfd20ActiveData?.() || {};
  const raw = el?.value ?? d[id] ?? fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
function maV4Set(id, val){
  const el = document.getElementById(id);
  const out = String(Number.isFinite(Number(val)) ? Math.trunc(Number(val)) : val);
  if(el) el.value = out;
  const d = maFfd20ActiveData?.();
  if(d) d[id] = out;
}
function maV4Level(v){ return Math.max(0, Math.trunc(Number(String(v ?? '').match(/\d+/)?.[0] || v || 0) || 0)); }
function maV4Int(v){ const m = String(v ?? '').match(/[+-]?\d+/); return m ? Number(m[0]) || 0 : 0; }
function maV4StatMod(stat){
  const n = Number(document.getElementById(stat)?.value || maFfd20ActiveData()?.[stat] || 10);
  return Math.floor(((Number.isFinite(n) ? n : 10) - 10) / 2);
}
function maV4HitDie(cls){ return Math.max(1, maV4Int(cls?.hitDie || '8') || 8); }
function maV4AvgDie(die){ return Math.floor(die / 2) + 1; }
function maV4SkillBase(cls){ return Math.max(0, maV4Int(cls?.skillPoints || '0') || 0); }
function maV4ProgressionAt(cls, lvl){
  const rows = Array.isArray(cls?.progression) ? cls.progression : [];
  let best = null;
  for(const row of rows){ if(maV4Level(row.level) <= lvl) best = row; }
  best = best || rows[0] || {};
  return {
    bab: Number(best.babValue ?? maV4Int(best.bab)) || 0,
    fort: Number(best.fortValue ?? maV4Int(best.fort)) || 0,
    ref: Number(best.refValue ?? maV4Int(best.ref)) || 0,
    will: Number(best.willValue ?? maV4Int(best.will)) || 0
  };
}
function maV4ClassEntries(lib, sel){
  const out = [];
  const mainName = sel?.className || sel?.class || document.getElementById('class')?.value || '';
  const mainLevel = maV4Level(sel?.level || sel?.character_level || document.getElementById('character_level')?.value || 1) || 1;
  if(mainName) out.push({label:'Class', name:mainName, level:mainLevel, cls:maFfd20Find(lib.classes, mainName)});
  const mcs = Array.isArray(sel?.multiclasses) ? sel.multiclasses : (Array.isArray(maFfd20ActiveData()?.multiclasses) ? maFfd20ActiveData().multiclasses : []);
  mcs.forEach((mc,i)=>{
    const name = mc.className || mc.class || mc.name || '';
    if(name) out.push({label:`Class ${i+2}`, name, level:maV4Level(mc.level || 1) || 1, cls:maFfd20Find(lib.classes, name)});
  });
  return out;
}
function maV4ReadSelection(){
  const d = maFfd20ActiveData?.() || {};
  return {
    className: document.getElementById('class')?.value || d.class || d.className || '',
    archetype: document.getElementById('archetype')?.value || d.archetype || '',
    level: document.getElementById('character_level')?.value || d.character_level || 1,
    multiclasses: Array.isArray(d.multiclasses) ? JSON.parse(JSON.stringify(d.multiclasses)) : []
  };
}
function maV4TotalLevel(sel){
  return maV4ClassEntries({classes:[]}, sel).reduce((sum,e)=>sum+(maV4Level(e.level)||0),0);
}
function maV4Totals(lib, sel){
  const con = maV4StatMod('con'), intel = maV4StatMod('int');
  const totals = {hp:0, skill:0, bab:0, fort:0, ref:0, will:0, rows:[]};
  let overallLevel = 0;
  maV4ClassEntries(lib, sel).forEach(entry=>{
    const die = maV4HitDie(entry.cls);
    const avg = maV4AvgDie(die);
    const skillEach = Math.max(1, maV4SkillBase(entry.cls) + intel);
    let hpGain = 0, skillGain = 0;
    for(let i=1;i<=entry.level;i++){
      overallLevel++;
      const firstOverall = overallLevel === 1;
      hpGain += Math.max(1, (firstOverall ? die : avg) + con);
      skillGain += firstOverall ? (skillEach * 4) : skillEach;
    }
    const p = maV4ProgressionAt(entry.cls, entry.level);
    totals.hp += hpGain; totals.skill += skillGain;
    totals.bab += p.bab; totals.fort += p.fort; totals.ref += p.ref; totals.will += p.will;
    totals.rows.push({...entry, die, avg, skillEach, hpGain, skillGain, prog:p});
  });
  const totalLevel = maV4TotalLevel(sel);
  totals.totalLevel = totalLevel;
  maV37ApplySavedLevelBonuses(totals, totalLevel);
  return totals;
}
function maV4FeatureNamesBetween(lib, oldSel, newSel){
  const oldEntries = maV4ClassEntries(lib, oldSel);
  const oldByLabel = new Map(oldEntries.map(e=>[e.label, e]));
  const names = [];
  maV4ClassEntries(lib, newSel).forEach(e=>{
    const oldLevel = oldByLabel.get(e.label)?.level || 0;
    (Array.isArray(e.cls?.features) ? e.cls.features : []).forEach(f=>{
      const fl = maV4Level(f.level || 1);
      if(fl > oldLevel && fl <= e.level && f.name) names.push(`${e.label}: ${f.name}`);
    });
  });
  return [...new Set(names)].slice(0,30);
}
function maV4Plus(n){ n=Number(n)||0; return String(Math.trunc(n)); }
function maV4Formula(t){
  return t.rows.map(r=>`${r.label} ${r.level}: d${r.die}, HP ${r.hpGain}, skill ${r.skillGain}, BAB ${maV4Plus(r.prog.bab)}, saves ${maV4Plus(r.prog.fort)}/${maV4Plus(r.prog.ref)}/${maV4Plus(r.prog.will)}`).join(' · ') || 'No class data found.';
}

/* --- v37 level-up direct helpers --- */
const MA_V37_LEVEL_BONUS_KEY = 'levelBonusChoicesV37';
function maV37Data(){
  try { return maFfd20ActiveData?.() || getActiveData?.() || {}; }
  catch(e){ return {}; }
}
function maV37Int(value, fallback=0){
  const match = String(value ?? '').match(/[+-]?\d+/);
  const n = match ? Number(match[0]) : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function maV37Plain(value){ return String(Math.trunc(Number(value) || 0)); }
function maV37Delta(oldValue, newValue, label='previous'){
  oldValue = Number(oldValue) || 0;
  newValue = Number(newValue) || 0;
  const diff = Math.trunc(newValue - oldValue);
  return `was ${Math.trunc(oldValue)} · ${diff} from ${label}`;
}
function maV37CleanLevelBonusChoices(maxLevel){
  const d = maV37Data();
  if(!d[MA_V37_LEVEL_BONUS_KEY] || typeof d[MA_V37_LEVEL_BONUS_KEY] !== 'object' || Array.isArray(d[MA_V37_LEVEL_BONUS_KEY])) d[MA_V37_LEVEL_BONUS_KEY] = {};
  Object.keys(d[MA_V37_LEVEL_BONUS_KEY]).forEach(level => {
    const n = maV37Int(level, 0);
    if(n < 2 || n > maxLevel) delete d[MA_V37_LEVEL_BONUS_KEY][level];
  });
  return d[MA_V37_LEVEL_BONUS_KEY];
}
function maV37SaveLevelBonusChoices(result, maxLevel){
  const choices = maV37CleanLevelBonusChoices(maxLevel);
  if(result && result.favoredChoices){
    Object.entries(result.favoredChoices).forEach(([level, choice]) => {
      const n = maV37Int(level, 0);
      if(n >= 2 && n <= maxLevel && (choice === 'hp' || choice === 'skill')) choices[String(n)] = choice;
    });
  }
  return maV37CleanLevelBonusChoices(maxLevel);
}
function maV37LevelBonusTotals(maxLevel){
  const choices = maV37CleanLevelBonusChoices(maxLevel);
  let hp = 0, skill = 0;
  Object.entries(choices).forEach(([level, choice]) => {
    const n = maV37Int(level, 0);
    if(n < 2 || n > maxLevel) return;
    if(choice === 'hp') hp += 1;
    if(choice === 'skill') skill += 1;
  });
  return {hp, skill};
}
function maV37ApplySavedLevelBonuses(totals, maxLevel){
  const bonus = maV37LevelBonusTotals(maxLevel);
  totals.hp += bonus.hp;
  totals.skill += bonus.skill;
  totals.levelHpBonus = bonus.hp;
  totals.levelSkillBonus = bonus.skill;
  return totals;
}
function maV37LevelBonusSection(oldTotal, newTotal){
  const saved = maV37CleanLevelBonusChoices(newTotal);
  const rows = [];
  for(let level = oldTotal + 1; level <= newTotal; level++){
    if(level <= 1) continue;
    const selected = saved[String(level)] || '';
    rows.push(`
      <div class="ma-v37-bonus-row">
        <strong>Level ${level}</strong>
        <select data-level-bonus-level="${level}" data-required-pick="true">
          <option value="" ${selected ? '' : 'selected'}>Choose one</option>
          <option value="hp" ${selected === 'hp' ? 'selected' : ''}>1 HP</option>
          <option value="skill" ${selected === 'skill' ? 'selected' : ''}>1 Skill Point</option>
        </select>
      </div>
    `);
  }
  if(!rows.length) return '';
  return `
    <div class="ma-levelup-section ma-levelup-bonus-required">
      <h4>Level Bonus</h4>
      ${rows.join('')}
      <div class="ma-levelup-note">Level 1 gets no extra HP or skill point. Each later character level chooses either 1 HP or 1 Skill Point.</div>
    </div>
  `;
}
function maV37RanksSpent(){
  try { if(typeof maV19RanksSpent === 'function') return maV19RanksSpent(); } catch(e) {}
  const inputs = Array.from(document.querySelectorAll('#skillsTableBody .skill-ranks'));
  if(inputs.length) return inputs.reduce((sum, input) => sum + Math.max(0, maV37Int(input.value,0)), 0);
  const d = maV37Data();
  const skills = Array.isArray(d.skills) ? d.skills : [];
  return skills.reduce((sum, skill) => sum + Math.max(0, maV37Int(skill?.lvl ?? skill?.ranks ?? skill?.rank ?? 0, 0)), 0);
}
function maV37LockBaseFields(){
  ['bab','fort_base','ref_base','will_base'].forEach(id => {
    const el = document.getElementById(id);
    if(el){
      el.readOnly = true;
      el.setAttribute('readonly', 'readonly');
      el.classList.add('ma-v37-base-locked');
      el.title = 'Auto-filled from class progression in ffd20_data.json.';
    }
  });
}

function maV4LevelList(oldTotal,newTotal,pred){ const out=[]; for(let l=oldTotal+1;l<=newTotal;l++){ if(pred(l)) out.push(l); } return out; }
async function maV4LevelUpOverlay(lib, oldSel, newSel, label){
  const oldTotal = maV4TotalLevel(oldSel), newTotal = maV4TotalLevel(newSel);
  if(newTotal <= oldTotal){
    maV37CleanLevelBonusChoices(newTotal);
    return {oldTotals:maV4Totals(lib, oldSel), newTotals:maV4Totals(lib, newSel), pickedStats:[], favoredChoices:{}};
  }

  const oldTotals = maV4Totals(lib, oldSel), newTotals = maV4Totals(lib, newSel);
  const feats = maV4LevelList(oldTotal, newTotal, l=>l%2===1 && l>1);
  const abilityLevels = maV4LevelList(oldTotal, newTotal, l=>[4,8,12,16,20].includes(l));
  const abilities = maV4FeatureNamesBetween(lib, oldSel, newSel);
  const levelBonusSection = maV37LevelBonusSection(oldTotal, newTotal);

  const featSection = feats.length
    ? `<div class="ma-levelup-section"><h4>Feats</h4><div class="ma-levelup-pill-list">${feats.map(l=>`<span class="ma-levelup-pill ma-levelup-feat">Feat gained at level ${l}</span>`).join('')}</div></div>`
    : '';
  const abilitySection = abilityLevels.length
    ? `<div class="ma-levelup-section ma-levelup-ability-required"><h4>Ability Score</h4><div class="ma-levelup-picks">${abilityLevels.map(l=>`<label>Level ${l} +1 score<select data-ability-level="${l}" data-required-pick="true"><option value="">Pick</option>${MA_STATS.map(s=>`<option value="${s}">${s.toUpperCase()}</option>`).join('')}</select></label>`).join('')}</div><div class="ma-levelup-note">This adds +1 to the actual ability score, not directly to the modifier.</div></div>`
    : '';
  const classAbilitySection = abilities.length
    ? `<div class="ma-levelup-section"><h4>New Class Abilities</h4><div class="ma-levelup-pill-list">${abilities.map(n=>`<span class="ma-levelup-pill">${maFfd20Esc(n)}</span>`).join('')}</div></div>`
    : '';

  const body = `
    <div class="ma-levelup-hero"><div class="ma-levelup-runes"><i></i><i></i><i></i><i></i><i></i></div><div class="ma-levelup-title">LEVEL UP</div><div class="ma-levelup-sub">${maFfd20Esc(label)} · Character Level ${oldTotal} → ${newTotal}</div></div>
    <div class="ma-levelup-grid ma-v37-level-grid">
      <div class="ma-levelup-card ma-v37-level-card"><small>HP Max</small><strong>${maV37Plain(newTotals.hp)}</strong><span>${maV37Delta(oldTotals.hp, newTotals.hp, 'previous HP')}</span></div>
      <div class="ma-levelup-card ma-v37-level-card"><small>BAB Base</small><strong>${maV37Plain(newTotals.bab)}</strong><span>${maV37Delta(oldTotals.bab, newTotals.bab, 'previous BAB')}</span></div>
      <div class="ma-levelup-card ma-v37-level-card"><small>Saves Base</small><strong>${maV37Plain(newTotals.fort)}/${maV37Plain(newTotals.ref)}/${maV37Plain(newTotals.will)}</strong><span>was ${maV37Plain(oldTotals.fort)}/${maV37Plain(oldTotals.ref)}/${maV37Plain(oldTotals.will)} · Fort / Ref / Will</span></div>
    </div>
    ${levelBonusSection}
    ${featSection}
    ${abilitySection}
    ${classAbilitySection}
    <div class="ma-levelup-section"><h4>Class Math</h4><div class="ma-levelup-note">${maFfd20Esc(maV4Formula(newTotals))}</div></div>`;
  const overlay = await maFfd20Dialog('Level Up', body, 'Apply Level Up');
  if(!overlay) return null;

  const pickedStats = Array.from(overlay.querySelectorAll('[data-ability-level]')).map(s=>s.value).filter(Boolean);
  if(abilityLevels.length && pickedStats.length !== abilityLevels.length){
    alert('Please pick an ability score for every ability-score increase.');
    return null;
  }

  const favoredChoices = {};
  const favoredSelects = Array.from(overlay.querySelectorAll('[data-level-bonus-level]'));
  for(const select of favoredSelects){
    const level = select.dataset.levelBonusLevel;
    const choice = select.value;
    if(!choice){
      alert('Please choose 1 HP or 1 Skill Point for every new level after level 1.');
      return null;
    }
    favoredChoices[level] = choice;
  }

  return {oldTotals, newTotals, pickedStats, favoredChoices};
}

function maV4ApplyAbilityPicks(picks, result=null){
  if(result && result._maV37AbilityPicksApplied) return;
  (picks || []).forEach(stat=>{
    stat = String(stat || '').toLowerCase();
    if(!MA_STATS.includes(stat)) return;
    const cur = maV4Num(stat, 10);
    maV4Set(stat, cur+1);
    const el = document.getElementById(stat);
    if(el){
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    }
  });
  if(result) result._maV37AbilityPicksApplied = true;
  try{ updateCalcs?.(); updateCalculations?.(); computeDerivedStats?.(); renderAbilityDrawerScores?.(); }catch(e){}
}


function maV4RefreshVitalsDisplay(){
  try {
    const hpTotal = document.getElementById('hp_effective_max');

    if (hpTotal) {
      hpTotal.value = String(Math.max(0, maV4Num('hp_max', 0) + maV4Num('hp_max_temp', 0)));
    }

    if (mpTotal) {
    }
  } catch(e) {}
}

window.refreshEffectiveVitals = maV4RefreshVitalsDisplay;
function maV4ApplyTotals(lib, oldSel, newSel, result=null){
  const newTotalLevel = maV4TotalLevel(newSel);
  if(result) maV37SaveLevelBonusChoices(result, newTotalLevel);
  else maV37CleanLevelBonusChoices(newTotalLevel);

  maV4ApplyAbilityPicks(result?.pickedStats || [], result);
  const oldTotals = result?.oldTotals || maV4Totals(lib, oldSel);
  const totals = maV4Totals(lib, newSel);

  const oldHpBase = maV4Num('hp_max', oldTotals.hp);
  const oldHpCurr = maV4Num('hp_curr', 0);
  const hpGain = totals.hp - oldHpBase;
  const hpMaxEff = Math.max(0, totals.hp + maV4Num('hp_max_temp', 0));
  maV4Set('hp_max', totals.hp);
  if(document.getElementById('hp_temp') && (document.getElementById('hp_temp').value === '' || maFfd20ActiveData().hp_temp === undefined)) maV4Set('hp_temp', 0);
  const newHpCurr = result ? Math.min(hpMaxEff, Math.max(0, oldHpCurr + Math.max(0,hpGain))) : (oldHpCurr ? Math.min(oldHpCurr, hpMaxEff) : hpMaxEff);
  maV4Set('hp_curr', newHpCurr);

  maV4Set('bab', totals.bab);
  maV4Set('fort_base', totals.fort);
  maV4Set('ref_base', totals.ref);
  maV4Set('will_base', totals.will);
  maV37LockBaseFields();

  const skillEl = document.getElementById('skill_points');
  if(skillEl){
    const unused = totals.skill - maV37RanksSpent();
    skillEl.value = String(unused);
    const d = maV37Data();
    d.skill_points = String(unused);
    d.skill_points_total = String(totals.skill);
    d.total_skill_points = String(totals.skill);
  }

  try{ maV4RefreshVitalsDisplay(); }catch(e){}
  try{ updateCalcs?.(); updateCalculations?.(); computeDerivedStats?.(); renderSelectedCombatDisplays?.(); renderAbilityDrawerScores?.(); }catch(e){}
  return totals;
}
async function maV4RecalcAndSave(silent=true){
  let lib; try{ lib = await maFfd20LoadLibrary(); }catch(e){ if(!silent) alert(e.message || e); return null; }
  const sel = maV4ReadSelection();
  const totals = maV4ApplyTotals(lib, sel, sel, null);
  try{ maFfd20RenderAll(); }catch(e){}
  try{ maFfd20SaveNow(); }catch(e){}
  return totals;
}
window.maV4RecalcAndSave = maV4RecalcAndSave;

maClassRowsOpenDialog = async function(kind='primary', index=null){
  let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message || e); return; }
  const d = maFfd20ActiveData(); if(d && !Array.isArray(d.multiclasses)) d.multiclasses = [];
  const oldSel = maV4ReadSelection();
  const isMulti = kind === 'multi';
  const mc = isMulti && index !== null ? (d.multiclasses[index] || {}) : {};
  const curClass = isMulti ? (mc.className || mc.class || '') : (document.getElementById('class')?.value || d.class || '');
  const curArch = isMulti ? (mc.archetype || '') : (document.getElementById('archetype')?.value || d.archetype || '');
  const curLevel = isMulti ? (mc.level || '1') : (document.getElementById('character_level')?.value || d.character_level || '1');
  const title = isMulti ? (index === null ? 'Add Class' : `Edit Class ${index+2}`) : 'Edit Class';
  const body = `<div class="ffd20-modal-grid"><label>Class<select id="maEditClass"></select></label><label>Archetype<select id="maEditArch"><option value="">No archetype</option></select></label><label>Level<select id="maEditLevel">${maFfd20LevelOptions(curLevel)}</select></label></div>`;
  const overlayPromise = maFfd20Dialog(title, body, 'Save Class');
  setTimeout(() => {
    const c = document.getElementById('maEditClass'), a = document.getElementById('maEditArch');
    maFfd20FillSelect(c, lib.classes, 'Choose class', curClass);
    const fillArch = (keep=true) => { const cls = maFfd20Find(lib.classes, c?.value || ''); maFfd20FillSelect(a, cls?.archetypes || [], 'No archetype', keep ? curArch : ''); };
    fillArch(true); c?.addEventListener('change', () => fillArch(false));
  }, 0);
  const overlay = await overlayPromise;
  if(!overlay) return;
  const className = overlay.querySelector('#maEditClass')?.value || '';
  if(!className) return;
  let archetype = overlay.querySelector('#maEditArch')?.value || '';
  const chosenClassForArch = maFfd20Find(lib.classes, className);
  if(maFfd20Norm(className) !== maFfd20Norm(curClass) && archetype && !maFfd20Find(chosenClassForArch?.archetypes || [], archetype)) archetype = '';
  const level = String(maV4Level(overlay.querySelector('#maEditLevel')?.value || 1) || 1);
  const newSel = JSON.parse(JSON.stringify(oldSel));
  if(isMulti){
    const item = { className, archetype, level };
    if(index === null) newSel.multiclasses.push(item); else newSel.multiclasses[index] = item;
  } else {
    newSel.className = className; newSel.class = className; newSel.archetype = archetype; newSel.level = level; newSel.character_level = level;
  }
  const oldTotal = maV4TotalLevel(oldSel), newTotal = maV4TotalLevel(newSel);
  let levelResult = null;
  if(newTotal > oldTotal){
    levelResult = await maV4LevelUpOverlay(lib, oldSel, newSel, isMulti ? (index===null ? `Class ${newSel.multiclasses.length+1}` : `Class ${index+2}`) : 'Class');
    if(!levelResult) return;
  }
  if(isMulti){
    const item = { className, archetype, level };
    if(index === null) d.multiclasses.push(item); else d.multiclasses[index] = item;
    maFfd20RenderMulticlasses();
  } else {
    const classSelect = document.getElementById('class'), archSelect = document.getElementById('archetype'), levelSelect = document.getElementById('character_level');
    maClassRowsSetSelectValue(classSelect, className, className); if(d) d.class = className;
    await maFfd20RefreshArchetypes();
    maClassRowsSetSelectValue(archSelect, archetype, archetype || 'No archetype'); if(d) d.archetype = archetype;
    maClassRowsSetSelectValue(levelSelect, level, level); if(levelSelect) levelSelect.dataset.prevLevel = level; if(d) d.character_level = level;
  }
  maV4ApplyTotals(lib, oldSel, maV4ReadSelection(), levelResult);
  maClassRowsRefreshCard(); await maFfd20ApplySheetChoices({silent:true}); maV4ApplyTotals(lib, oldSel, maV4ReadSelection(), levelResult);
  maFfd20RenderAll(); maFfd20SaveNow();
};

/* --- v19 skill-point class calculation repair --- */
const MA_V19_SKILL_PATCH = true;
function maV19Int(value, fallback = 0){
  if(value === '' || value === null || value === undefined) return fallback;
  const n = Number(String(value).match(/[+-]?\d+/)?.[0] ?? value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function maV19Data(){ try { return maFfd20ActiveData?.() || getActiveData?.() || {}; } catch(e) { return {}; } }
function maV19Rows(sel = null){
  try { if(typeof maV4ClassEntries === 'function') return maV4ClassEntries({classes:[]}, sel || maV4ReadSelection()).filter(r => r.name && maV19Int(r.level,0) > 0); } catch(e) {}
  const d = maV19Data();
  const rows = [];
  const mainName = document.getElementById('class')?.value || d.class || d.className || '';
  const mainLevel = maV19Int(document.getElementById('character_level')?.value || d.character_level || d.level || 1, 1);
  if(mainName) rows.push({label:'Class', name:mainName, level:Math.max(1, mainLevel)});
  (Array.isArray(d.multiclasses) ? d.multiclasses : []).forEach((mc, i) => {
    const name = mc.className || mc.class || mc.name || '';
    const level = maV19Int(mc.level || 0, 0);
    if(name && level) rows.push({label:'Class ' + (i+2), name, level});
  });
  return rows;
}
function maV19TotalLevel(sel = null){
  return Math.max(1, maV19Rows(sel).reduce((sum, row) => sum + Math.max(0, maV19Int(row.level,0)), 0));
}
function maV19RanksSpent(){
  const inputs = Array.from(document.querySelectorAll('#skillsTableBody .skill-ranks'));
  if(inputs.length) return inputs.reduce((sum, input) => sum + Math.max(0, maV19Int(input.value,0)), 0);
  const skills = Array.isArray(maV19Data().skills) ? maV19Data().skills : [];
  return skills.reduce((sum, skill) => sum + Math.max(0, maV19Int(skill?.lvl,0)), 0);
}
function maV19FavoredSkillCount(maxLevel = maV19TotalLevel()){
  const d = maV19Data();
  const maps = [
    d.levelBonusChoicesV37,
    d.levelBonusChoicesV36,
    d.levelBonusChoicesV35,
    d.favored_bonuses,
    d.favoredBonuses,
    d.favoredClassBonuses
  ].filter(map => map && typeof map === 'object' && !Array.isArray(map));
  const seen = new Set();
  let count = 0;
  maps.forEach(map => {
    Object.entries(map).forEach(([level, choice]) => {
      const lvl = maV19Int(level, 0);
      if(lvl < 2 || lvl > maxLevel || seen.has(String(lvl))) return;
      if(String(choice || '').toLowerCase() === 'skill'){
        count++;
        seen.add(String(lvl));
      }
    });
  });
  return count;
}
function maV19SkillBaseFromClass(cls){
  const raw = String(cls?.skillPoints ?? cls?.skill_points ?? '').trim();
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : 0;
}
async function maV19ClassSkillBudget(){
  let lib = null;
  try { lib = await maFfd20LoadLibrary(); } catch(e) { lib = maFfd20Library || { classes:[] }; }
  const intMod = (typeof maV4StatMod === 'function') ? maV4StatMod('int') : Math.floor(((Number(document.getElementById('int')?.value || maV19Data().int || 10) || 10) - 10) / 2);
  let total = 0;
  let classRows = [];
  maV19Rows().forEach((row, rowIndex) => {
    const cls = maFfd20Find?.(lib.classes || [], row.name) || {};
    const classNumber = maV19SkillBaseFromClass(cls);
    const perLevel = Math.max(1, classNumber + intMod);
    const level = Math.max(0, maV19Int(row.level, 0));
    let rowTotal = 0;
    for(let lvl = 1; lvl <= level; lvl++){
      rowTotal += perLevel;
    }
    total += rowTotal;
    classRows.push({ label:row.label, className:row.name, level, skillPointsText:cls.skillPoints || cls.skill_points || '', classNumber, intMod, perLevel, total:rowTotal });
  });
  return { total, rows:classRows, intMod };
}
function maV19WriteSkillPointDomAndData(result){
  const d = maV19Data();
  const el = document.getElementById('skill_points');
  const unused = result.unused;
  if(el){
    el.value = String(unused);
    el.readOnly = true;
    el.removeAttribute('min');
    el.setAttribute('aria-readonly','true');
    el.title = 'Unused Skill Points = class skill points from ffd20_data.json + favored +1 skill choices - total ranks spent. This can go negative.';
  }
  d.skill_points = String(unused);
  d.skill_points_total = String(result.totalBudget);
  d.total_skill_points = String(result.totalBudget);
  d.skill_ranks_spent = String(result.ranks);
  d.skill_points_class_budget = String(result.classBudget);
  d.skill_points_favored_bonus = String(result.favoredSkill);
  d.skill_points_formula = 'Unused = class skill points + favored skill choices - ranks spent';
  d.skill_points_debug_rows = result.rows;
}
async function maV19WriteSkillBudget(options = {}){
  const budget = await maV19ClassSkillBudget();
  const totalLevel = maV19TotalLevel();
  const favoredSkill = maV19FavoredSkillCount(totalLevel);
  const ranks = maV19RanksSpent();
  const totalBudget = budget.total + favoredSkill;
  const unused = totalBudget - ranks;
  const result = { unused, totalBudget, classBudget:budget.total, favoredSkill, ranks, totalLevel, rows:budget.rows };
  maV19WriteSkillPointDomAndData(result);
  document.querySelectorAll('#skillsTableBody .skill-ranks').forEach(input => {
    input.setAttribute('min','0');
    input.setAttribute('max', String(totalLevel));
    input.dataset.prevValue = String(maV19Int(input.value,0));
  });
  if(options.save){ try { maFfd20SaveNow(); } catch(e) { try { save?.(true); } catch(_e) {} } }
  return result;
}
let maV19SkillTimer = null;
function maV19ScheduleSkillBudget(options = {}){
  clearTimeout(maV19SkillTimer);
  maV19SkillTimer = setTimeout(() => { maV19WriteSkillBudget(options); }, options.delay ?? 35);
}
if(typeof setUnusedSkillPoints === 'function'){
  setUnusedSkillPoints = function(value){
    const d = maV19Data();
    const str = String(maV19Int(value, 0));
    const el = document.getElementById('skill_points');
    if(el) el.value = str;
    d.skill_points = str;
  };
}
if(typeof applySkillRankChange === 'function'){
  applySkillRankChange = function(input){
    if(input){
      const cap = maV19TotalLevel();
      input.setAttribute('min','0');
      input.setAttribute('max', String(cap));
      input.value = String(Math.max(0, Math.min(cap, maV19Int(input.value, 0))));
      input.dataset.prevValue = input.value;
    }
    try { updateCalcs?.(); } catch(e) {}
    maV19ScheduleSkillBudget({ delay:0, save:true });
  };
}
if(typeof syncSkillRankCap === 'function'){
  syncSkillRankCap = function(){
    const cap = maV19TotalLevel();
    document.querySelectorAll('#skillsTableBody .skill-ranks').forEach(input => {
      input.setAttribute('min','0');
      input.setAttribute('max', String(cap));
      const next = Math.max(0, Math.min(cap, maV19Int(input.value,0)));
      input.value = String(next);
      input.dataset.prevValue = String(next);
    });
    maV19ScheduleSkillBudget({ delay:0, save:false });
    return false;
  };
}
if(typeof syncSkillStateAfterLoad === 'function'){
  const maV19OldSyncSkillStateAfterLoad = syncSkillStateAfterLoad;
  syncSkillStateAfterLoad = function(...args){
    const result = maV19OldSyncSkillStateAfterLoad.apply(this, args);
    document.body.classList.remove('skill-edit-mode');
    maV19ScheduleSkillBudget({ delay:0, save:false });
    setTimeout(() => maV19WriteSkillBudget({save:false}), 250);
    return result;
  };
}
if(typeof maV4ApplyTotals === 'function'){
  const maV19OldApplyTotals = maV4ApplyTotals;
  maV4ApplyTotals = function(...args){
    const result = maV19OldApplyTotals.apply(this, args);
    maV19ScheduleSkillBudget({ delay:0, save:false });
    return result;
  };
}
if(typeof maV4RecalcAndSave === 'function'){
  const maV19OldRecalcAndSave = maV4RecalcAndSave;
  maV4RecalcAndSave = async function(...args){
    const result = await maV19OldRecalcAndSave.apply(this, args);
    await maV19WriteSkillBudget({save:true});
    return result;
  };
  window.maV4RecalcAndSave = maV4RecalcAndSave;
}
document.addEventListener('input', event => {
  const target = event.target;
  const id = target?.id || '';
  if(target?.classList?.contains('skill-ranks') || id === 'int' || id === 'class' || id === 'character_level' || id === 'archetype'){
    maV19ScheduleSkillBudget({ delay: id === 'int' ? 80 : 20, save:true });
  }
}, true);
document.addEventListener('change', event => {
  const target = event.target;
  const id = target?.id || '';
  if(target?.classList?.contains('skill-ranks') || id === 'int' || id === 'class' || id === 'character_level' || id === 'archetype'){
    maV19ScheduleSkillBudget({ delay:20, save:true });
  }
}, true);
document.addEventListener('click', event => {
  if(event.target?.closest?.('#maClassBuildCard,#maAddMulticlassBtn,.ma-multiclass-edit,.ffd20-modal-actions button,.btn-save,#skillsEnterEditBtn,#skillsExitEditBtn')){
    maV19ScheduleSkillBudget({ delay:120, save:true });
    setTimeout(() => maV19WriteSkillBudget({save:false}), 450);
  }
}, true);
window.maV19UpdateSkillBudget = maV19WriteSkillBudget;
window.maV11UpdateSkillBudget = maV19WriteSkillBudget;
window.maV9UpdateSkillBudget = async function(){ return (await maV19WriteSkillBudget()).unused; };
setTimeout(() => maV19WriteSkillBudget({save:false}), 0);
setTimeout(() => maV19WriteSkillBudget({save:false}), 400);
setTimeout(() => maV19WriteSkillBudget({save:true}), 1200);



/* --- v30 race + ability live sync repair ---
   Keeps the visible Race card and ability-score modifier cards in sync immediately
   after changing race or any ability score, without waiting for a later save/snapshot. */
const MA_V30_ABILITY_STATS = ['str','dex','con','int','wis','cha'];
let maV30RaceAbilityTimer = null;
function maV30SignedModFromScore(score){
  const n = Number(score);
  const safe = Number.isFinite(n) ? n : 10;
  const mod = Math.floor((safe - 10) / 2);
  return (mod >= 0 ? '+' : '') + mod;
}
function maV30EnsureSelectOption(select, value, label){
  if(!select || value === undefined || value === null || String(value).trim() === '') return;
  const str = String(value);
  if(!Array.from(select.options || []).some(opt => opt.value === str)){
    const opt = document.createElement('option');
    opt.value = str;
    opt.textContent = label || str;
    select.appendChild(opt);
  }
}
function maV30RefreshAbilityScoreMirrors(){
  MA_V30_ABILITY_STATS.forEach(stat => {
    const original = document.getElementById(stat);
    const mirror = document.querySelector('[data-ma-stat-input="'+stat+'"]');
    const modPill = document.querySelector('[data-ma-stat-mod="'+stat+'"]');
    const legacyMod = document.getElementById('mod-' + stat);
    const score = original?.value || maFfd20ActiveData?.()?.[stat] || '10';
    const signed = legacyMod?.textContent || maV30SignedModFromScore(score);
    if(mirror && document.activeElement !== mirror) mirror.value = score;
    if(modPill) modPill.textContent = signed;
    if(legacyMod) legacyMod.textContent = signed;
  });
}
function maV30RefreshRaceCardNow(){
  const data = maFfd20ActiveData?.() || {};
  const race = document.getElementById('race');
  const value = String(race?.value || data.race || '').trim();
  if(race){
    maV30EnsureSelectOption(race, value, value);
    race.value = value;
    if(value) race.setAttribute('value', value);
    else race.removeAttribute('value');
  }
  data.race = value;
  try { if(typeof window.maRefreshRaceCardV29 === 'function') window.maRefreshRaceCardV29(); } catch(e) {}
  const card = document.getElementById('maRaceBuildCard');
  const title = document.getElementById('maRaceBuildTitle');
  const sub = document.getElementById('maRaceBuildSub');
  if(card && !title){
    card.innerHTML = '<span class="ma-class-click-label">Race</span><span class="ma-class-slot-main"><strong id="maRaceBuildTitle" class="ma-build-card-title"></strong><small id="maRaceBuildSub" class="ma-build-card-sub"></small></span><span class="ma-build-card-level">Edit</span>';
  }
  const nextTitle = document.getElementById('maRaceBuildTitle');
  const nextSub = document.getElementById('maRaceBuildSub');
  if(nextTitle) nextTitle.textContent = value || 'Choose Race';
  if(nextSub) nextSub.textContent = value ? 'Click to change ancestry' : 'Pick race traits and ancestry';
}
function maV30RefreshRaceAbilityUi(){
  maV30RefreshRaceCardNow();
  try { if(typeof maFfd20MoveRaceEffectsToRacial === 'function') maFfd20MoveRaceEffectsToRacial(maFfd20ActiveData?.() || {}); } catch(e) {}
  try { if(typeof updateCalculations === 'function') updateCalculations(); } catch(e) {}
  try { if(typeof updateCalcs === 'function') updateCalcs(); } catch(e) {}
  try { if(typeof computeDerivedStats === 'function') computeDerivedStats(); } catch(e) {}
  try { if(typeof renderSelectedCombatDisplays === 'function') renderSelectedCombatDisplays(); } catch(e) {}
  try { if(typeof renderAbilityDrawerScores === 'function') renderAbilityDrawerScores(); } catch(e) {}
  try { if(typeof refreshSpellDcDisplays === 'function') refreshSpellDcDisplays('race'); } catch(e) {}
  maV30RefreshAbilityScoreMirrors();
}
function maV30ScheduleRaceAbilitySync(options = {}){
  const immediate = options.immediate !== false;
  const saveNow = !!options.save;
  if(immediate) maV30RefreshRaceAbilityUi();
  clearTimeout(maV30RaceAbilityTimer);
  maV30RaceAbilityTimer = setTimeout(() => {
    maV30RefreshRaceAbilityUi();
    try { if(typeof renderAbilities === 'function'){ renderAbilities('passive'); renderAbilities('racial'); } } catch(e) {}
    maV30RefreshRaceAbilityUi();
    if(saveNow){ try { maFfd20SaveNow?.(); } catch(e) {} }
  }, options.delay ?? 90);
  setTimeout(maV30RefreshRaceAbilityUi, 260);
  setTimeout(maV30RefreshRaceAbilityUi, 650);
}
const maV30PreviousApplySheetChoices = maFfd20ApplySheetChoices;
maFfd20ApplySheetChoices = async function(...args){
  const result = await maV30PreviousApplySheetChoices.apply(this, args);
  maV30ScheduleRaceAbilitySync({immediate:true, delay:0});
  return result;
};
document.addEventListener('input', event => {
  const target = event.target;
  if(target?.id === 'race' || MA_V30_ABILITY_STATS.includes(target?.id || '')){
    const data = maFfd20ActiveData?.() || {};
    if(target.id) data[target.id] = target.value;
    maV30ScheduleRaceAbilitySync({immediate:true, delay:40});
  }
}, true);
document.addEventListener('change', event => {
  const target = event.target;
  if(target?.id === 'race' || MA_V30_ABILITY_STATS.includes(target?.id || '')){
    const data = maFfd20ActiveData?.() || {};
    if(target.id) data[target.id] = target.value;
    maV30ScheduleRaceAbilitySync({immediate:true, delay:80, save:target.id === 'race'});
  }
}, true);
window.maV30RaceAbilitySync = maV30ScheduleRaceAbilitySync;
window.maV30RefreshAbilityScoreMirrors = maV30RefreshAbilityScoreMirrors;
setTimeout(() => maV30ScheduleRaceAbilitySync({immediate:true, delay:80}), 0);
setTimeout(() => maV30ScheduleRaceAbilitySync({immediate:true, delay:80}), 700);

/* --- v31 race card hydrate repair ---
   The pretty Race card is rendered by later non-module scripts. Publish the current
   Firebase-backed race value to window/body/localStorage whenever the sheet, options,
   or race picker refreshes, so the card never falls back to Choose Race after reload. */
const MA_V31_RACE_STORAGE_PREFIX = 'mountAetheriaCurrentRaceV31:';
function maV31CleanRaceValue(value){
  const text = String(value || '').trim();
  if(!text || /^choose race$/i.test(text) || /^loading races/i.test(text)) return '';
  return text;
}
function maV31CurrentRaceFromData(){
  let data = {};
  try { data = maFfd20ActiveData?.() || {}; } catch(e) { data = {}; }
  const select = document.getElementById('race');
  return maV31CleanRaceValue(data.race)
      || maV31CleanRaceValue(select?.value)
      || maV31CleanRaceValue(select?.getAttribute('value'));
}
function maV31PersistRaceState(value){
  const raceValue = maV31CleanRaceValue(value);
  try { window.maCurrentCharacterIdV31 = currentSummonId || ''; } catch(e) {}
  try { window.maCurrentRaceValueV31 = raceValue; } catch(e) {}
  try { document.body.dataset.maCurrentRaceV31 = raceValue; } catch(e) {}
  try { document.documentElement.dataset.maCurrentRaceV31 = raceValue; } catch(e) {}
  try {
    if(currentSummonId && raceValue) localStorage.setItem(MA_V31_RACE_STORAGE_PREFIX + currentSummonId, raceValue);
  } catch(e) {}
}
function maV31ApplyRaceToSelect(value){
  const raceValue = maV31CleanRaceValue(value);
  const select = document.getElementById('race');
  if(!select || !raceValue) return raceValue;
  maV30EnsureSelectOption(select, raceValue, raceValue);
  select.value = raceValue;
  select.setAttribute('value', raceValue);
  try {
    const data = maFfd20ActiveData?.() || {};
    data.race = raceValue;
  } catch(e) {}
  return raceValue;
}
function maV31PublishRaceState(){
  const raceValue = maV31ApplyRaceToSelect(maV31CurrentRaceFromData());
  maV31PersistRaceState(raceValue);
  try { if(typeof window.maRefreshRaceCardV29 === 'function') window.maRefreshRaceCardV29(); } catch(e) {}
  try { if(typeof window.maRefreshRaceCardV31 === 'function') window.maRefreshRaceCardV31(); } catch(e) {}
  return raceValue;
}
function maV31SchedulePublishRace(){
  maV31PublishRaceState();
  setTimeout(maV31PublishRaceState, 0);
  setTimeout(maV31PublishRaceState, 80);
  setTimeout(maV31PublishRaceState, 250);
  setTimeout(maV31PublishRaceState, 700);
}
window.maGetCurrentRaceV31 = function(){
  return maV31CleanRaceValue(window.maCurrentRaceValueV31)
      || maV31CurrentRaceFromData()
      || (function(){ try { return currentSummonId ? maV31CleanRaceValue(localStorage.getItem(MA_V31_RACE_STORAGE_PREFIX + currentSummonId)) : ''; } catch(e) { return ''; } })();
};
window.maSetCurrentRaceV31 = function(value){
  const raceValue = maV31ApplyRaceToSelect(value);
  maV31PersistRaceState(raceValue);
  maV31SchedulePublishRace();
  return raceValue;
};
try {
  const maV31PrevLoadCurrentSheet = loadCurrentSheet;
  loadCurrentSheet = function(...args){
    const result = maV31PrevLoadCurrentSheet.apply(this, args);
    maV31SchedulePublishRace();
    return result;
  };
} catch(e) {}
try {
  const maV31PrevBuildChoiceGrid = maFfd20BuildChoiceGrid;
  maFfd20BuildChoiceGrid = function(...args){
    const result = maV31PrevBuildChoiceGrid.apply(this, args);
    maV31SchedulePublishRace();
    return result;
  };
} catch(e) {}
try {
  const maV31PrevRefreshOptions = maFfd20RefreshOptions;
  maFfd20RefreshOptions = async function(...args){
    const result = await maV31PrevRefreshOptions.apply(this, args);
    maV31SchedulePublishRace();
    return result;
  };
} catch(e) {}
try {
  const maV31PrevApplyChoices = maFfd20ApplySheetChoices;
  maFfd20ApplySheetChoices = async function(...args){
    const result = await maV31PrevApplyChoices.apply(this, args);
    maV31SchedulePublishRace();
    return result;
  };
} catch(e) {}
document.addEventListener('input', event => { if(event.target?.id === 'race') maV31SchedulePublishRace(); }, true);
document.addEventListener('change', event => { if(event.target?.id === 'race') maV31SchedulePublishRace(); }, true);
setTimeout(maV31SchedulePublishRace, 0);
setTimeout(maV31SchedulePublishRace, 900);

window.addEventListener('DOMContentLoaded', () => setTimeout(maV37LockBaseFields, 120));
setTimeout(maV37LockBaseFields, 900);


/* --- MODULE prestige class integration repair v2: keep prestige classes in the real class library --- */
(function(){
  if(window.maPrestigeClassModuleRepairV2) return;
  window.maPrestigeClassModuleRepairV2 = true;

  const CLASS_SELECT_IDS = new Set(['class','maEditClass','maCreateClass','ffd20ClassSelect']);

  function pcName(item){
    if(typeof item === 'string') return item.trim();
    return String(item?.name || item?.title || item?.className || item?.class || item?.label || '').trim();
  }
  function pcNorm(value){
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function pcObj(item, isPrestige=false){
    const out = (item && typeof item === 'object') ? item : { name:String(item || '') };
    if(isPrestige && out && typeof out === 'object') out.isPrestigeClass = true;
    return out;
  }
  function pcUniqueSorted(list){
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .map(item => pcObj(item, !!item?.isPrestigeClass))
      .filter(item => pcName(item))
      .filter(item => {
        const key = pcNorm(pcName(item));
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a,b) => pcName(a).localeCompare(pcName(b), undefined, { sensitivity:'base' }));
  }
  function pcPushArray(out, value, isPrestige=false){
    if(!Array.isArray(value)) return;
    value.forEach(item => { if(pcName(item)) out.push(pcObj(item, isPrestige)); });
  }
  function pcLooksPrestige(item, path=''){
    const text = [
      path,
      item?.type,
      item?.category,
      item?.group,
      item?.classType,
      item?.sourceType,
      item?.tags,
      item?.section,
      item?.kind,
      item?.subtype,
      item?.source
    ].map(v => Array.isArray(v) ? v.join(' ') : String(v || '')).join(' ').toLowerCase();
    return /\bprestige\b/.test(text);
  }
  function pcLooksClassLike(item){
    if(!item || typeof item !== 'object' || !pcName(item)) return false;
    return !!(
      Array.isArray(item.features) ||
      Array.isArray(item.traits) ||
      Array.isArray(item.abilities) ||
      Array.isArray(item.classFeatures) ||
      Array.isArray(item.class_features) ||
      Array.isArray(item.progression) ||
      Array.isArray(item.levels) ||
      Array.isArray(item.archetypes) ||
      item.hitDie || item.hit_die || item.skillPoints || item.skill_points || item.skillRanks || item.skill_ranks ||
      item.bab || item.fort || item.ref || item.will || item.saves || item.hp
    );
  }
  function pcWalkPrestige(node, path='', out=[]){
    if(!node || typeof node !== 'object') return out;
    if(Array.isArray(node)){
      if(/\bprestige\b/i.test(path)){
        node.forEach(item => { if(pcName(item)) out.push(pcObj(item, true)); });
      } else {
        node.forEach((item, index) => pcWalkPrestige(item, `${path}[${index}]`, out));
      }
      return out;
    }
    Object.entries(node).forEach(([key, value]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if(Array.isArray(value) && /\bprestige\b/i.test(nextPath)){
        value.forEach(item => { if(pcName(item)) out.push(pcObj(item, true)); });
        return;
      }
      if(value && typeof value === 'object' && pcLooksPrestige(value, nextPath) && pcLooksClassLike(value)){
        out.push(pcObj(value, true));
        return;
      }
      if(value && typeof value === 'object') pcWalkPrestige(value, nextPath, out);
    });
    return out;
  }
  function pcNormalizeLibrary(lib){
    if(!lib || typeof lib !== 'object') lib = {};

    const normalSources = [];
    ['classes','baseClasses','base_classes','coreClasses','core_classes','standardClasses','standard_classes'].forEach(key => pcPushArray(normalSources, lib[key], false));

    const explicitPrestige = [];
    ['prestigeClasses','prestige_classes','prestige','prestigeClass','prestige_class','prestige_classes_list'].forEach(key => pcPushArray(explicitPrestige, lib[key], true));
    pcWalkPrestige(lib, '', explicitPrestige);

    const baseCore = [];
    const prestige = [];
    normalSources.forEach(item => {
      if(item?.isPrestigeClass || pcLooksPrestige(item, 'classes')) prestige.push(pcObj(item, true));
      else baseCore.push(pcObj(item, false));
    });
    explicitPrestige.forEach(item => prestige.push(pcObj(item, true)));

    lib.baseCoreClasses = pcUniqueSorted(baseCore);
    lib.prestigeClasses = pcUniqueSorted(prestige.map(item => pcObj(item, true)));
    lib.classes = pcUniqueSorted([].concat(lib.baseCoreClasses, lib.prestigeClasses));
    if(Array.isArray(lib.races)) lib.races = pcUniqueSorted(lib.races);
    return lib;
  }
  function pcAddOption(parent, value, text, disabled=false){
    const opt = document.createElement('option');
    opt.value = value || '';
    opt.textContent = text || value || '';
    if(disabled) opt.disabled = true;
    parent.appendChild(opt);
    return opt;
  }
  function pcFillClassSelect(select, lib, placeholder='Choose class', currentValue=''){
    if(!select) return;
    lib = pcNormalizeLibrary(lib || maFfd20Library || {});
    const current = (arguments.length >= 4 ? currentValue : select.value) || '';
    select.innerHTML = '';
    pcAddOption(select, '', placeholder || 'Choose class');

    const addGroup = (label, list) => {
      const group = document.createElement('optgroup');
      group.label = label;
      if(!Array.isArray(list) || !list.length){
        pcAddOption(group, '', label === 'Prestige Classes' ? 'No prestige classes found' : 'No classes found', true);
      } else {
        list.forEach(item => {
          const name = pcName(item);
          if(name) pcAddOption(group, name, name);
        });
      }
      select.appendChild(group);
    };

    addGroup('Base / Core Classes', lib.baseCoreClasses || []);
    addGroup('Prestige Classes', lib.prestigeClasses || []);

    const all = [].concat(lib.baseCoreClasses || [], lib.prestigeClasses || []);
    if(current && !all.some(item => pcNorm(pcName(item)) === pcNorm(current))){
      pcAddOption(select, current, `${current} (current)`);
    }
    select.value = current;
  }

  const pcOldLoadLibrary = maFfd20LoadLibrary;
  maFfd20LoadLibrary = async function(...args){
    const lib = await pcOldLoadLibrary.apply(this, args);
    maFfd20Library = pcNormalizeLibrary(lib || maFfd20Library || {});
    return maFfd20Library;
  };

  const pcOldFind = maFfd20Find;
  maFfd20Find = function(list, name){
    const target = pcNorm(name);
    if(!target) return null;
    const source = Array.isArray(list) ? list : [];
    let found = source.find(item => pcNorm(pcName(item)) === target);
    if(found) return found;
    const lib = pcNormalizeLibrary(maFfd20Library || {});
    found = [].concat(lib.classes || [], lib.prestigeClasses || [], lib.baseCoreClasses || [])
      .find(item => pcNorm(pcName(item)) === target);
    return found || (typeof pcOldFind === 'function' ? pcOldFind(list, name) : null);
  };

  const pcOldFillSelect = maFfd20FillSelect;
  maFfd20FillSelect = function(select, list, placeholder, currentValue=''){
    if(select && CLASS_SELECT_IDS.has(select.id)){
      const lib = pcNormalizeLibrary(
        Array.isArray(list)
          ? Object.assign({}, maFfd20Library || {}, { classes:list })
          : (list || maFfd20Library || {})
      );
      return pcFillClassSelect(select, lib, placeholder || 'Choose class', currentValue);
    }
    return pcOldFillSelect.apply(this, arguments);
  };

  const pcOldRefreshOptions = maFfd20RefreshOptions;
  maFfd20RefreshOptions = async function(...args){
    const result = await pcOldRefreshOptions.apply(this, args);
    const lib = pcNormalizeLibrary(result || maFfd20Library || {});
    maFfd20Library = lib;
    const data = maFfd20ActiveData?.() || {};
    pcFillClassSelect(document.getElementById('class'), lib, 'Choose class', document.getElementById('class')?.value || data.class || data.className || '');
    try { await maFfd20RefreshArchetypes(); } catch(e) { console.warn(e); }
    try { maFfd20RenderMulticlasses(); } catch(e) {}
    try { maClassRowsRefreshCard?.(); } catch(e) {}
    return lib;
  };

  const pcOldRefreshArchetypes = maFfd20RefreshArchetypes;
  maFfd20RefreshArchetypes = async function(...args){
    let lib;
    try { lib = pcNormalizeLibrary(await maFfd20LoadLibrary()); } catch(e) { return pcOldRefreshArchetypes.apply(this, args); }
    const data = maFfd20ActiveData?.() || {};
    const cls = maFfd20Find(lib.classes, document.getElementById('class')?.value || data.class || data.className || '');
    maFfd20FillSelect(document.getElementById('archetype'), cls?.archetypes || [], 'No archetype', document.getElementById('archetype')?.value || data.archetype || '');
  };

  // Expose safe wrappers so later classic scripts can load the same normalized library instead of rebuilding an empty one.
  Object.assign(window, {
    maFfd20LoadLibrary: (...args) => maFfd20LoadLibrary(...args),
    maFfd20RefreshOptions: (...args) => maFfd20RefreshOptions(...args),
    maFfd20RefreshArchetypes: (...args) => maFfd20RefreshArchetypes(...args),
    maFfd20Find: (...args) => maFfd20Find(...args),
    maFfd20FillSelect: (...args) => maFfd20FillSelect(...args),
    maFfd20FillSimple: (...args) => maFfd20FillSimple(...args),
    maFfd20AddOption: (...args) => maFfd20AddOption(...args),
    maFfd20BuildChoiceGrid: (...args) => maFfd20BuildChoiceGrid(...args),
    maFfd20RenderMulticlasses: (...args) => maFfd20RenderMulticlasses(...args),
    maFfd20ApplySheetChoices: (...args) => maFfd20ApplySheetChoices(...args),
    maFfd20ReadSelection: (...args) => maFfd20ReadSelection(...args),
    maFfd20SaveNow: (...args) => maFfd20SaveNow(...args),
    maFfd20RenderAll: (...args) => maFfd20RenderAll(...args),
    maFfd20ActiveData: (...args) => maFfd20ActiveData(...args),
    maFfd20HitDie: (...args) => maFfd20HitDie(...args),
    maFfd20AvgHp: (...args) => maFfd20AvgHp(...args),
    maFfd20SkillBase: (...args) => maFfd20SkillBase(...args),
    maFfd20Level: (...args) => maFfd20Level(...args),
    maFfd20LevelOptions: (...args) => maFfd20LevelOptions(...args),
    maFfd20Esc: (...args) => maFfd20Esc(...args),
    maFfd20Dialog: (...args) => maFfd20Dialog(...args),
    maFfd20BuildImported: (...args) => maFfd20BuildImported(...args),
    maFfd20Push: (...args) => maFfd20Push(...args),
    maFfd20ApplyHpSkillToData: (...args) => maFfd20ApplyHpSkillToData(...args),
    maFfd20CaptureBioValues: (...args) => maFfd20CaptureBioValues(...args),
    maFfd20FieldClass: (...args) => maFfd20FieldClass(...args),
    maFfd20MoveRaceEffectsToRacial: (...args) => maFfd20MoveRaceEffectsToRacial(...args),
    maFfd20FillClassSelect: pcFillClassSelect,
    maNormalizePrestigeClassesModule: pcNormalizeLibrary
  });
  try {
    Object.defineProperty(window, 'maFfd20Library', {
      configurable:true,
      get(){ return maFfd20Library; },
      set(value){ maFfd20Library = pcNormalizeLibrary(value || {}); }
    });
  } catch(e) {}

  setTimeout(() => maFfd20RefreshOptions().catch(console.warn), 0);
  setTimeout(() => maFfd20RefreshOptions().catch(console.warn), 500);
})();

// Bridge module-scoped sheet helpers for later non-module add-ons.
Object.assign(window, {
  getActiveData,
  saveDataOnly,
  renderSpells,
  spellLevelLabel
});



