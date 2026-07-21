
/* --- v36 Active uses + long-rest + class picker stability patch --- */
(function(){
  if(window.maV36ActiveUseClassPatch) return;
  window.maV36ActiveUseClassPatch = true;

  const norm = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const liveUseStore = window.maV36ActiveUseStore = window.maV36ActiveUseStore || new Map();
  const abilityKey = ability => {
    if(!ability) return '';
    const autoKey = String(ability.autoKey || '').trim();
    if(autoKey) return 'auto:' + autoKey;
    return ['manual', ability.name || '', ability.sourceKind || ability.originType || '', ability.sourceName || ability.originName || '', ability.sourceLevel || ''].map(norm).filter(Boolean).join(':');
  };
  function stateForAbility(ability){
    return {
      u_curr: Math.max(0, Number(ability?.u_curr) || 0),
      u_max: Math.max(0, Number(ability?.u_max) || 0),
      restoreOnLongRest: ability?.restoreOnLongRest !== false,
      ts: Date.now()
    };
  }
  function rememberAbility(ability){
    const key = abilityKey(ability);
    if(!key) return null;
    const state = stateForAbility(ability);
    liveUseStore.set(key, state);
    const nameKey = 'name:' + norm(ability.name || '');
    if(nameKey !== 'name:') liveUseStore.set(nameKey, state);
    return state;
  }
  function snapshotActiveUses(){
    const map = new Map();
    try {
      const list = (typeof getActiveData === 'function' && getActiveData()?.activeAbilities) || [];
      list.forEach(ability => {
        const key = abilityKey(ability);
        if(!key) return;
        const state = rememberAbility(ability);
        map.set(key, state);
        const nameKey = 'name:' + norm(ability.name || '');
        if(nameKey !== 'name:') map.set(nameKey, state);
      });
    } catch(e) {}
    return map;
  }
  function restoreActiveUses(map){
    try {
      const list = (typeof getActiveData === 'function' && getActiveData()?.activeAbilities) || [];
      list.forEach(ability => {
        const key = abilityKey(ability);
        const nameKey = 'name:' + norm(ability.name || '');
        const stored = liveUseStore.get(key) || liveUseStore.get(nameKey);
        const snapped = map.get(key) || map.get(nameKey);
        const saved = stored && (!snapped || (stored.ts || 0) >= (snapped.ts || 0)) ? stored : snapped;
        if(!saved) return;
        const importedMax = Math.max(0, Number(ability.u_max) || 0);
        const savedMax = Math.max(0, Number(saved.u_max) || 0);
        const max = Math.max(importedMax, savedMax);
        if(max > 0) {
          ability.u_max = max;
          ability.u_curr = Math.min(Math.max(0, Number(saved.u_curr) || 0), max);
          ability.restoreOnLongRest = saved.restoreOnLongRest !== false;
        }
      });
    } catch(e) {}
  }

  const oldApply = (typeof maFfd20ApplySheetChoices === 'function') ? maFfd20ApplySheetChoices : null;
  if(oldApply && !oldApply.maV36Wrapped){
    const wrapped = async function(...args){
      const before = snapshotActiveUses();
      const out = await oldApply.apply(this, args);
      restoreActiveUses(before);
      try { if(typeof renderAbilities === 'function') renderAbilities('active'); } catch(e) {}
      try { if(typeof maFfd20SaveNow === 'function') maFfd20SaveNow(); else if(typeof saveDataOnly === 'function') saveDataOnly(); } catch(e) {}
      return out;
    };
    wrapped.maV36Wrapped = true;
    maFfd20ApplySheetChoices = wrapped;
    window.maFfd20ApplySheetChoices = (...args) => maFfd20ApplySheetChoices(...args);
  }

  const oldUpdateUse = window.updateAbilityUse;
  window.updateAbilityUse = function(idx, key, val){
    try {
      const list = (typeof getActiveData === 'function' && getActiveData()?.activeAbilities) || [];
      const ability = list[idx];
      if(!ability) return;
      const parsed = Math.max(0, parseInt(String(val || '0').replace(/[^0-9]/g, ''), 10) || 0);
      if(key === 'u_curr') ability.u_curr = Math.min(parsed, Math.max(0, Number(ability.u_max) || 0));
      else ability[key] = parsed;
      if(key === 'u_max' && Number(ability.u_curr || 0) > Number(ability.u_max || 0)) ability.u_curr = Math.max(0, Number(ability.u_max) || 0);
      if(Number(ability.u_max || 0) > 0 && ability.restoreOnLongRest === undefined) ability.restoreOnLongRest = true;
      rememberAbility(ability);
      if(typeof saveDataOnly === 'function') saveDataOnly();
      if(typeof renderAbilities === 'function') renderAbilities('active');
    } catch(e) {
      if(typeof oldUpdateUse === 'function') return oldUpdateUse.apply(this, arguments);
    }
  };

  const oldUseActive = window.useActiveAbility;
  const locks = new Map();
  window.useActiveAbility = function(idx){
    const now = Date.now();
    const key = String(idx);
    if(locks.has(key) && now - locks.get(key) < 450) return;
    locks.set(key, now);
    try {
      const list = (typeof getActiveData === 'function' && getActiveData()?.activeAbilities) || [];
      const ability = list[idx];
      if(!ability) return;
      const state = (typeof getActiveAbilityUseState === 'function') ? getActiveAbilityUseState(ability) : null;
      if(state && !state.isReady){ if(typeof renderAbilities === 'function') renderAbilities('active'); return; }
      const hasTracked = Math.max(0, Number(ability.u_max) || 0) > 0;
      if(hasTracked){
        const remaining = Math.max(0, Number(ability.u_curr) || 0);
        if(remaining <= 0){ if(typeof renderAbilities === 'function') renderAbilities('active'); return; }
        ability.u_curr = Math.max(0, remaining - 1);
        ability.restoreOnLongRest = ability.restoreOnLongRest !== false;
        rememberAbility(ability);
        if(typeof saveDataOnly === 'function') saveDataOnly();
        if(typeof renderAbilities === 'function') renderAbilities('active');
      }
      if(typeof abilityIsRollable === 'function' && abilityIsRollable(ability)) rollAbilityAction(idx, { includeCard: true });
      else {
        if(typeof sendAbilityCard === 'function') sendAbilityCard('active', idx);
        if(typeof showUsageOverlay === 'function') showUsageOverlay(ability.name || 'Active Ability', 'Ability Used');
      }
    } catch(e) {
      if(typeof oldUseActive === 'function') return oldUseActive.apply(this, arguments);
      console.warn('Active ability use failed', e);
    }
  };
  window.useAbilityByType = function(subType, index){
    if(subType === 'active') return window.useActiveAbility(index);
    try {
      const bundle = getAbilityChatBundle(subType);
      const list = getActiveData()[bundle.key] || [];
      const item = list[index];
      if(!item) return;
      const diceExpr = String(item.damage || '').trim();
      if(!diceExpr) return;
      const result = rollDamageExpression(diceExpr);
      const calcLine = damageCalcLine(result, 'Dice Roll Calc');
      const lines = [`> Category: ${bundle.label}`, `> Dice Roll: ${diceExpr}`];
      if(String(item.desc || '').trim()) lines.push(`> Description: ${String(item.desc).trim()}`);
      if(calcLine) lines.push(calcLine);
      routeChatEntry({
        kind: 'roll',
        title: `${item.name || bundle.label} Dice Roll`,
        subtitle: currentChatSheetLabel(),
        lines,
        discordLines: lines,
        results: [`<strong>Dice Roll:</strong> ${chatEscapeHtml(formatDamageTotalText(result))}`]
      });
    } catch(e) { console.warn('Ability roll failed', e); }
  };

  const oldLongRest = window.performLongRest;
  window.performLongRest = function(){
    const out = typeof oldLongRest === 'function' ? oldLongRest.apply(this, arguments) : undefined;
    try {
      let changed = 0;
      ((typeof getActiveData === 'function' && getActiveData()?.activeAbilities) || []).forEach(ability => {
        const max = Math.max(0, Number(ability?.u_max) || 0);
        if(max > 0 && Number(ability.u_curr || 0) !== max){ ability.u_curr = max; ability.restoreOnLongRest = true; rememberAbility(ability); changed++; }
      });
      if(changed){
        if(typeof renderAbilities === 'function') renderAbilities('active');
        if(typeof saveDataOnly === 'function') saveDataOnly();
      }
    } catch(e) {}
    return out;
  };

  document.addEventListener('wheel', event => {
    if(event.target?.matches?.('.ability-use-current-input,.ma-edit-uses-field input,input[type="number"]')) event.target.blur();
  }, { passive:true, capture:true });

  function hydrateClassDialog(){
    try {
      const c = document.getElementById('maEditClass');
      if(!c || c.dataset.maV36Hydrated === '1') return;
      c.dataset.maV36Hydrated = '1';
      const modal = c.closest('.ffd20-modal');
      modal?.classList.add('maEditClassHydrating');
      Promise.resolve(typeof window.maFfd20LoadLibrary === 'function' ? window.maFfd20LoadLibrary() : (window.maFfd20Library || {})).then(lib => {
        const d = (typeof getActiveData === 'function' ? getActiveData() : {}) || {};
        const current = c.value || d.class || d.className || '';
        if(typeof window.maFfd20FillSelect === 'function') window.maFfd20FillSelect(c, lib.classes || [], 'Choose class', current);
        const a = document.getElementById('maEditArch');
        const fillArch = () => {
          const cls = typeof window.maFfd20Find === 'function' ? window.maFfd20Find(lib.classes || [], c.value || '') : null;
          if(typeof window.maFfd20FillSelect === 'function') window.maFfd20FillSelect(a, cls?.archetypes || [], 'No archetype', a?.value || d.archetype || '');
        };
        fillArch();
        c.addEventListener('change', fillArch, { passive:true });
      }).finally(() => modal?.classList.remove('maEditClassHydrating'));
    } catch(e) {}
  }
  const mo = new MutationObserver(() => hydrateClassDialog());
  try { mo.observe(document.documentElement, { childList:true, subtree:true }); } catch(e) {}
  document.addEventListener('click', event => {
    if(event.target?.closest?.('#maClassBuildCard,#maAddMulticlassBtn,#maMulticlassList .ma-build-card')) setTimeout(hydrateClassDialog, 0);
  }, true);
})();
