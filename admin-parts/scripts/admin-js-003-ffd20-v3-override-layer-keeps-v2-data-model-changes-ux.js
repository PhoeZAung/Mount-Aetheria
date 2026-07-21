
/* --- FFD20 v3 override layer: keeps v2 data model, changes UX + progression stats --- */
(function(){
  if(typeof maFfd20Esc === 'undefined') return;
  const IS_ADMIN = (typeof MA_FFD20_IS_ADMIN !== 'undefined' && MA_FFD20_IS_ADMIN);
  document.body.classList.add(IS_ADMIN ? 'ma-ffd20-admin' : 'ma-ffd20-player');

  function data(){ return maFfd20ActiveData ? (maFfd20ActiveData() || {}) : {}; }
  function value(id, fallback=''){ const el=document.getElementById(id); return el ? el.value : (data()[id] ?? fallback); }
  function setField(id, val){ const el=document.getElementById(id); const str=String(val ?? ''); if(el) el.value=str; data()[id]=str; }
  function intVal(v){ const m=String(v ?? '').match(/[+-]?\d+/); return m ? parseInt(m[0],10) : 0; }
  function plus(n){ n=Number(n)||0; return n >= 0 ? `+${n}` : String(n); }
  function levelOf(v){ return maFfd20Level ? (maFfd20Level(v)||0) : (parseInt(v,10)||0); }
  function statMod(stat){ const n=Number(document.getElementById(stat)?.value || data()[stat] || 10); return Math.floor(((Number.isFinite(n)?n:10)-10)/2); }

  function maAutoReadNumber(id, fallback=0){
    const el = document.getElementById(id);
    const raw = el ? el.value : data()[id];
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  function maCurrentSelectionClone(){
    const sel = maFfd20ReadSelection ? maFfd20ReadSelection() : {};
    sel.multiclasses = Array.isArray(data().multiclasses) ? data().multiclasses.map(x => ({...x})) : [];
    return sel;
  }
  function maTotalCharacterLevel(sel){
    let total = levelOf(sel?.level || sel?.character_level || 1) || 1;
    (sel?.multiclasses || []).forEach(mc => { total += levelOf(mc.level || 0) || 0; });
    if(IS_ADMIN && sel?.prestigeClass) total += levelOf(sel.prestigeLevel || 0) || 0;
    return Math.max(1,total);
  }
  function maClassEntryList(lib, sel){
    const rows = [];
    const primaryLevel = levelOf(sel?.level || 1) || 1;
    const primaryClass = maFfd20Find(lib.classes, sel?.className || sel?.class || '');
    const primaryArch = primaryClass ? maFfd20Find(primaryClass.archetypes, sel?.archetype || '') : null;
    if(primaryClass) rows.push({slot:'primary', label:'Class', className:primaryClass.name, archetype:sel?.archetype || '', level:primaryLevel, cls:primaryClass, arch:primaryArch, firstOverall:true});
    (sel?.multiclasses || []).forEach((mc, i) => {
      const className = mc.className || mc.class || mc.name || '';
      const cls = maFfd20Find(lib.classes, className);
      const arch = cls ? maFfd20Find(cls.archetypes, mc.archetype || '') : null;
      if(cls) rows.push({slot:`multi${i}`, label:`Class ${i+2}`, className:cls.name, archetype:mc.archetype || '', level:levelOf(mc.level || 1) || 1, cls, arch, firstOverall:false});
    });
    if(IS_ADMIN && sel?.prestigeClass){
      const cls = maFfd20Find(lib.prestigeClasses, sel.prestigeClass);
      if(cls) rows.push({slot:'prestige', label:'Prestige', className:cls.name, archetype:'', level:levelOf(sel.prestigeLevel || 1) || 1, cls, arch:null, firstOverall:false});
    }
    return rows;
  }
  function maCalcClassTotals(lib, sel){
    const con = statMod('con');
    const intel = statMod('int');
    const totals = { hp:0, skill:0, bab:0, fort:0, ref:0, will:0, totalLevel:maTotalCharacterLevel(sel), rows:[] };
    maClassEntryList(lib, sel).forEach(entry => {
      const die = maFfd20HitDie ? maFfd20HitDie(entry.cls) : 8;
      const avg = maFfd20AvgHp ? maFfd20AvgHp(die) : (Math.floor(die/2)+1);
      const skillBase = maFfd20SkillBase ? maFfd20SkillBase(entry.cls) : 4;
      const skillEach = Math.max(1, skillBase + intel);
      let hpGain = 0, skillGain = 0;
      for(let lvl=1; lvl<=entry.level; lvl++){
        const firstOverall = entry.firstOverall && lvl === 1;
        hpGain += Math.max(1, (firstOverall ? die : avg) + con);
        skillGain += firstOverall ? (skillEach * 4) : skillEach;
      }
      const prog = progressionAt(entry.cls, entry.level);
      totals.hp += hpGain; totals.skill += skillGain;
      totals.bab += prog.babValue || 0; totals.fort += prog.fortValue || 0; totals.ref += prog.refValue || 0; totals.will += prog.willValue || 0;
      totals.rows.push({...entry, die, avg, skillBase, skillEach, hpGain, skillGain, prog});
    });
    return totals;
  }
  function maLevelsBetween(oldLevel, newLevel, predicate){
    const out=[]; for(let i=oldLevel+1;i<=newLevel;i++){ if(predicate(i)) out.push(i); } return out;
  }
  function maAbilityPicksHtml(milestones){
    if(!milestones.length) return '';
    return `<div class="ma-levelup-picks">${milestones.map(l => `<label>Level ${l} +1<select data-ability-level="${l}" data-required-pick="true"><option value="">Pick</option>${MA_STATS.map(s=>`<option value="${s}">${s.toUpperCase()}</option>`).join('')}</select></label>`).join('')}</div><div class="ma-levelup-note">Ability score pick is required before applying the level-up.</div>`;
  }
  function maFeatureNamesBetween(lib, oldSel, newSel){
    const oldRows = new Map(maClassEntryList(lib, oldSel).map(r => [r.slot, r]));
    const names=[];
    maClassEntryList(lib, newSel).forEach(row => {
      const oldLevel = oldRows.get(row.slot)?.level || 0;
      function addFeatures(source, sourceLabel){
        (Array.isArray(source?.features) ? source.features : []).forEach(f => {
          const fl = levelOf(f.level || 1);
          if(fl > oldLevel && fl <= row.level && f.name) names.push(`${row.label}: ${f.name}`);
        });
      }
      addFeatures(row.cls, row.label);
      if(row.arch) addFeatures(row.arch, `${row.label} Archetype`);
    });
    return [...new Set(names)].slice(0,30);
  }
  function maClassFormulaLine(totals){
    if(!totals?.rows?.length) return 'No class data found.';
    return totals.rows.map(r => `${r.label} ${r.level}: d${r.die}, ${r.skillBase}+INT skill, BAB ${plus(r.prog.babValue||0)}, saves ${plus(r.prog.fortValue||0)}/${plus(r.prog.refValue||0)}/${plus(r.prog.willValue||0)}`).join(' · ');
  }
  function maFavoredStore(){
    const d = data();
    if(!d.favoredClassBonuses || typeof d.favoredClassBonuses !== 'object' || Array.isArray(d.favoredClassBonuses)) d.favoredClassBonuses = {};
    return d.favoredClassBonuses;
  }
  function maFavoredLevelsBetween(oldLevel, newLevel){
    const out=[];
    for(let lvl=oldLevel+1; lvl<=newLevel; lvl++) out.push(lvl);
    return out;
  }
  function maFavoredPicksHtml(levels){
    if(!levels.length) return '';
    const store = maFavoredStore();
    return `<div class="ma-levelup-section"><h4>Favored Class Bonus</h4><div class="ma-levelup-picks">${levels.map(l => {
      const saved = String(store[String(l)] || 'hp').toLowerCase() === 'skill' ? 'skill' : 'hp';
      return `<label>Level ${l}<select data-favored-level="${l}"><option value="hp"${saved === 'hp' ? ' selected' : ''}>+1 HP</option><option value="skill"${saved === 'skill' ? ' selected' : ''}>+1 Skill Point</option></select></label>`;
    }).join('')}</div><div class="ma-levelup-note">Pick one favored-class bonus for each new level. These choices are saved on the character.</div></div>`;
  }
  function maReadFavoredPicks(overlay){
    const picks = {};
    overlay?.querySelectorAll?.('[data-favored-level]')?.forEach(sel => {
      const lvl = String(sel.getAttribute('data-favored-level') || '').trim();
      if(lvl) picks[lvl] = String(sel.value || 'hp').toLowerCase() === 'skill' ? 'skill' : 'hp';
    });
    return picks;
  }
  function maRecordFavoredPicks(picks){
    if(!picks || typeof picks !== 'object') return;
    const store = maFavoredStore();
    Object.entries(picks).forEach(([lvl, pick]) => {
      store[String(lvl)] = String(pick || 'hp').toLowerCase() === 'skill' ? 'skill' : 'hp';
    });
  }
  function maFavoredCountsFromPicks(picks){
    const out = { hp:0, skill:0 };
    Object.values(picks || {}).forEach(pick => {
      if(String(pick).toLowerCase() === 'skill') out.skill += 1;
      else out.hp += 1;
    });
    return out;
  }
  function maFavoredCountsThrough(totalLevel){
    const store = maFavoredStore();
    const out = { hp:0, skill:0 };
    for(let lvl=1; lvl<=Number(totalLevel || 0); lvl++){
      const pick = String(store[String(lvl)] || '').toLowerCase();
      if(pick === 'skill') out.skill += 1;
      else if(pick === 'hp') out.hp += 1;
    }
    return out;
  }
  async function maShowLevelUpScreen(lib, oldSel, newSel, slotLabel){
    const oldTotalLevel = maTotalCharacterLevel(oldSel);
    const newTotalLevel = maTotalCharacterLevel(newSel);
    if(newTotalLevel <= oldTotalLevel) return { oldTotals:maCalcClassTotals(lib, oldSel), newTotals:maCalcClassTotals(lib, newSel), pickedStats:[], favoredPicks:{} };
    const oldTotals = maCalcClassTotals(lib, oldSel);
    const newTotals = maCalcClassTotals(lib, newSel);
    const hpDelta = newTotals.hp - oldTotals.hp;
    const skillDelta = newTotals.skill - oldTotals.skill;
    const feats = maLevelsBetween(oldTotalLevel, newTotalLevel, l => l % 2 === 1 && l > 1);
    const milestones = maLevelsBetween(oldTotalLevel, newTotalLevel, l => [4,8,12,16,20].includes(l));
    const favoredLevels = maFavoredLevelsBetween(oldTotalLevel, newTotalLevel);
    const abilities = maFeatureNamesBetween(lib, oldSel, newSel);
    const featSection = feats.length
      ? `<div class="ma-levelup-section"><h4>Feats</h4><div class="ma-levelup-pill-list">${feats.map(l=>`<span class="ma-levelup-pill ma-levelup-feat">Feat gained at level ${l}</span>`).join('')}</div></div>`
      : '';
    const favoredSection = maFavoredPicksHtml(favoredLevels);
    const abilitySection = milestones.length
      ? `<div class="ma-levelup-section ma-levelup-ability-required"><h4>Ability Score</h4>${maAbilityPicksHtml(milestones)}</div>`
      : '';
    const classAbilitySection = abilities.length
      ? `<div class="ma-levelup-section"><h4>New Class Abilities</h4><div class="ma-levelup-pill-list">${abilities.map(n=>`<span class="ma-levelup-pill">${maFfd20Esc(n)}</span>`).join('')}</div></div>`
      : '';
    const body = `
      <div class="ma-levelup-hero"><div class="ma-levelup-runes"><i></i><i></i><i></i><i></i><i></i></div><div class="ma-levelup-title">LEVEL UP</div><div class="ma-levelup-sub">${maFfd20Esc(slotLabel)} · Character Level ${oldTotalLevel} → ${newTotalLevel}</div></div>
      <div class="ma-levelup-grid">
        <div class="ma-levelup-card"><small>HP</small><strong>${plus(hpDelta)}</strong><span>Before favored bonus</span></div>
        <div class="ma-levelup-card"><small>Skill Points</small><strong>${plus(skillDelta)}</strong><span>Before favored bonus</span></div>
        <div class="ma-levelup-card"><small>BAB</small><strong>${plus(newTotals.bab)}</strong><span>${plus(newTotals.bab-oldTotals.bab)} from this change</span></div>
        <div class="ma-levelup-card"><small>Saves</small><strong>${plus(newTotals.fort)}/${plus(newTotals.ref)}/${plus(newTotals.will)}</strong><span>Fort / Ref / Will</span></div>
      </div>
      ${favoredSection}
      ${featSection}
      ${abilitySection}
      ${classAbilitySection}
      <div class="ma-levelup-section"><h4>Class Math</h4><div class="ma-levelup-note">${maFfd20Esc(maClassFormulaLine(newTotals))}</div></div>
    `;
    const overlay = await maFfd20Dialog('Level Up', body, 'Apply Level Up');
    if(!overlay) return null;
    const pickedStats = Array.from(overlay.querySelectorAll('[data-ability-level]')).map(sel => sel.value).filter(Boolean);
    if(milestones.length && pickedStats.length !== milestones.length){
      alert('Please pick an ability score for every ability-score increase.');
      return null;
    }
    const favoredPicks = maReadFavoredPicks(overlay);
    const favoredCounts = maFavoredCountsFromPicks(favoredPicks);
    return { oldTotals, newTotals, pickedStats, favoredPicks, favoredHpBonus:favoredCounts.hp, favoredSkillBonus:favoredCounts.skill };
  }
  
function maApplyAbilityPicks(pickedStats){
    (pickedStats || []).forEach(stat => {
      const el = document.getElementById(stat);
      const cur = Number(el?.value || data()[stat] || 10) || 10;
      if(el) el.value = String(cur + 1);
      data()[stat] = String(cur + 1);
    });
  }
  function maSetCoreProgressionFields(finalTotals){
    setBaseField('bab', finalTotals.bab || 0);
    setBaseField('fort_base', finalTotals.fort || 0);
    setBaseField('ref_base', finalTotals.ref || 0);
    setBaseField('will_base', finalTotals.will || 0);
  }
  function maApplyFinalClassTotals(lib, oldSel, newSel, levelResult){
    const oldTotals = levelResult?.oldTotals || maCalcClassTotals(lib, oldSel);
    if(levelResult?.favoredPicks) maRecordFavoredPicks(levelResult.favoredPicks);
    maApplyAbilityPicks(levelResult?.pickedStats || []);
    const pureFinalTotals = maCalcClassTotals(lib, newSel);
    const favoredStored = maFavoredCountsThrough(maTotalCharacterLevel(newSel));
    const finalTotals = {
      ...pureFinalTotals,
      hp: pureFinalTotals.hp + favoredStored.hp,
      skill: pureFinalTotals.skill + favoredStored.skill
    };
    const d = data();
    const prevHpMax = Number(d.hp_max || document.getElementById('hp_max')?.value || oldTotals.hp) || oldTotals.hp;
    const baseHpGain = levelResult ? Math.max(0, (levelResult.newTotals?.hp ?? pureFinalTotals.hp) - (levelResult.oldTotals?.hp ?? oldTotals.hp)) : (finalTotals.hp - prevHpMax);
    const favoredHpGain = Number(levelResult?.favoredHpBonus || 0) || 0;
    const hpGain = levelResult ? (baseHpGain + favoredHpGain) : (finalTotals.hp - prevHpMax);
    const hpMaxTemp = Number(d.hp_max_temp || document.getElementById('hp_max_temp')?.value || 0) || 0;
    const curHp = Number(d.hp_curr || document.getElementById('hp_curr')?.value || 0) || 0;
    const targetHpMax = levelResult ? Math.max(0, prevHpMax + hpGain) : Math.max(0, finalTotals.hp);
    finalTotals.hp = targetHpMax;
    const newEffectiveHpMax = Math.max(0, targetHpMax + hpMaxTemp);
    const newHpCurr = levelResult ? Math.min(newEffectiveHpMax, Math.max(0, curHp + Math.max(0,hpGain))) : Math.min(curHp || newEffectiveHpMax, newEffectiveHpMax);
    setBaseField('hp_max', targetHpMax);
    setBaseField('hp_curr', newHpCurr);
    if(d.hp_temp === undefined || d.hp_temp === null || d.hp_temp === '') setBaseField('hp_temp', 0);
    const baseSkillGain = levelResult ? Math.max(0, (levelResult.newTotals?.skill ?? pureFinalTotals.skill) - (levelResult.oldTotals?.skill ?? oldTotals.skill)) : Math.max(0, finalTotals.skill - oldTotals.skill);
    const favoredSkillGain = Number(levelResult?.favoredSkillBonus || 0) || 0;
    const skillGain = baseSkillGain + favoredSkillGain;
    const spEl = document.getElementById('skill_points');
    if(levelResult && skillGain){
      const nextSp = (Number(spEl?.value || d.skill_points || 0) || 0) + skillGain;
      if(spEl) spEl.value = String(nextSp);
      d.skill_points = String(nextSp);
    }
    maSetCoreProgressionFields(finalTotals);
    refreshCards(finalTotals);
    try{ computeDerivedStats(); }catch(e){}
    return finalTotals;
  }


function progressionAt(cls, level){
    const rows = Array.isArray(cls?.progression) ? cls.progression : [];
    if(!rows.length) return { level, babValue:0, fortValue:0, refValue:0, willValue:0 };
    let best = rows[0];
    for(const row of rows){ if(levelOf(row.level) <= level) best = row; }
    return {
      level,
      babValue: Number(best.babValue ?? intVal(best.bab)) || 0,
      fortValue: Number(best.fortValue ?? intVal(best.fort)) || 0,
      refValue: Number(best.refValue ?? intVal(best.ref)) || 0,
      willValue: Number(best.willValue ?? intVal(best.will)) || 0,
      raw: best
    };
  }
  function combineProgression(lib, selection){
    const totals = { bab:0, fort:0, ref:0, will:0 };
    function add(cls, lvl){
      if(!cls || !lvl) return;
      const p = progressionAt(cls, lvl);
      totals.bab += p.babValue || 0;
      totals.fort += p.fortValue || 0;
      totals.ref += p.refValue || 0;
      totals.will += p.willValue || 0;
    }
    add(maFfd20Find(lib.classes, selection.className), levelOf(selection.level || 1));
    (selection.multiclasses || []).forEach(mc => add(maFfd20Find(lib.classes, mc.className || mc.class || mc.name), levelOf(mc.level || 1)));
    if(IS_ADMIN && selection.prestigeClass) add(maFfd20Find(lib.prestigeClasses, selection.prestigeClass), levelOf(selection.prestigeLevel || 1));
    return totals;
  }
  async function currentProgression(){
    const lib = await maFfd20LoadLibrary();
    return combineProgression(lib, maFfd20ReadSelection());
  }
  function setBaseField(id, val){ const el=document.getElementById(id); if(el) el.value=String(val); data()[id]=String(val); }
  async function updateProgressionFields(){
    let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ return null; }
    const sel = maCurrentSelectionClone();
    const totals = maCalcClassTotals(lib, sel);
    maSetCoreProgressionFields(totals);
    const d = data();
    const oldHpMax = Number(d.hp_max || document.getElementById('hp_max')?.value || 0) || 0;
    const oldHpCurr = Number(d.hp_curr || document.getElementById('hp_curr')?.value || 0) || 0;
    const newHpBase = totals.hp || 0;
    const hpDelta = newHpBase - oldHpMax;
    setBaseField('hp_max', newHpBase);
    if(d.hp_temp === undefined || d.hp_temp === null || d.hp_temp === '') setBaseField('hp_temp', 0);
    const hpEffectiveMax = Math.max(0, newHpBase + (Number(d.hp_max_temp || document.getElementById('hp_max_temp')?.value || 0) || 0));
    if(!oldHpCurr || oldHpCurr > hpEffectiveMax) setBaseField('hp_curr', hpEffectiveMax);
    else if(hpDelta > 0) setBaseField('hp_curr', Math.min(hpEffectiveMax, oldHpCurr + hpDelta));
    try{ refreshEffectiveVitals(); }catch(e){}
    refreshCards(totals);
    try{ computeDerivedStats(); }catch(e){}
    return totals;
  }
  function statStrip(t){
    t = t || {bab:0,fort:0,ref:0,will:0};
  }
  function adminChoiceValue(id){
    const d = data();
    const saved = d[id] ?? '';
    if(window.adminHydratingSheet || window.__adminSheetHydrated === false) return saved || '';
    return document.getElementById(id)?.value || saved || '';
  }
  function refreshCards(totals){
    const cls = value('class',''); const arch = value('archetype',''); const lvl = value('character_level','1');
    const title = document.getElementById('maPrimaryClassTitle'); if(title) title.textContent = cls || 'Choose Class';
    const sub = document.getElementById('maPrimaryClassSub'); if(sub) sub.textContent = arch || 'No archetype selected';
    const badge = document.getElementById('maPrimaryClassLevel'); if(badge) badge.textContent = `Lv ${lvl || 1}`;
    const stat = document.getElementById('maPrimaryClassStats'); if(stat) stat.innerHTML = statStrip(totals);
    const compact = document.getElementById('maBuildProgressionSummary'); if(compact) compact.innerHTML = statStrip(totals).replace('ma-stat-strip','ma-build-summary');
  }
  async function refreshCardsFromLibrary(){ try { refreshCards(await currentProgression()); } catch(e){ refreshCards(null); } }

  maFfd20BuildChoiceGrid = function(force=false){
    const character = document.getElementById('character');
    if(!character) return;
    const existing = document.getElementById('ffd20ChoiceGrid');
    if(existing && existing.dataset.version === 'v3' && !force) return;
    const oldGrid = existing || character.querySelector('.bio-grid');
    if(!oldGrid) return;
    const values = maFfd20CaptureBioValues ? maFfd20CaptureBioValues() : {};
    const d = data();
    ['charName','race','class','archetype','character_level','alignment','size_category','size','languages','senses','shop_tags','prestige_class','prestige_level'].forEach(id => {
      let saved = d[id];
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'charName') saved = d.name;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'class') saved = d.className;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'character_level') saved = d.level;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'size_category') saved = d.size;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'size') saved = d.size_category;
      if((values[id] === undefined || values[id] === null || String(values[id]).trim() === '') && saved !== undefined && saved !== null && String(saved).trim() !== '') values[id] = saved;
    });
    const fieldClass = maFfd20FieldClass ? maFfd20FieldClass() : (IS_ADMIN ? 'save-field' : 'live-field');
    const shopTags = IS_ADMIN ? `<div class="bio-item"><label>Shop Access Tags</label><input id="shop_tags" class="${fieldClass}" placeholder="starter, magic_shop, blacksmith, potion_shop" value="${maFfd20Esc(values.shop_tags || '')}"></div>` : '';
  const prestigeBlock = '';
    const grid = document.createElement('section');
    grid.id = 'ffd20ChoiceGrid'; grid.dataset.version = 'v3'; grid.className = 'ffd20-bio-three-col ffd20-v3-grid';
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
        <button id="maClassBuildCard" class="ma-build-card" type="button" title="Edit class, archetype, and level"><span class="ma-class-click-label">Class</span><span class="ma-class-slot-main"><strong id="maPrimaryClassTitle" class="ma-build-card-title">${maFfd20Esc(values.class || 'Choose Class')}</strong><small id="maPrimaryClassSub" class="ma-build-card-sub">${maFfd20Esc(values.archetype ? values.archetype : 'No archetype selected')}</small></span><span id="maPrimaryClassLevel" class="ma-build-card-level">Lv ${maFfd20Esc(values.character_level || '1')}</span><span id="maPrimaryClassStats" hidden>${statStrip(null)}</span></button>
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
    const lvlEl = document.getElementById('character_level'); if(lvlEl) lvlEl.dataset.prevLevel = String(levelOf(values.character_level || 1) || 1);
    document.getElementById('race')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
    document.getElementById('size_category')?.addEventListener('change', () => { const h=document.getElementById('size'); if(h) h.value=document.getElementById('size_category').value; try{ syncSizeFields(); }catch(e){} maFfd20SaveNow(); });
    document.getElementById('maClassBuildCard')?.addEventListener('click', () => openClassDialog('primary'));
    document.getElementById('maAddMulticlassBtn')?.addEventListener('click', () => openClassDialog('multi'));
    document.getElementById('prestige_class')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
    document.getElementById('prestige_level')?.addEventListener('change', () => maFfd20ApplySheetChoices({silent:true}));
  };

  maFfd20RefreshOptions = async function(){
    maFfd20BuildChoiceGrid();
    let lib;
    try { lib = await maFfd20LoadLibrary(); }
    catch(e){ console.warn(e); return null; }
    maFfd20FillSelect(document.getElementById('race'), lib.races, 'Choose race', adminChoiceValue('race'));
    maFfd20FillSelect(document.getElementById('class'), lib.classes, 'Choose class', adminChoiceValue('class'));
    await maFfd20RefreshArchetypes();
    if(IS_ADMIN) maFfd20FillSelect(document.getElementById('prestige_class'), lib.prestigeClasses, 'No prestige', adminChoiceValue('prestige_class'));
    maFfd20RenderMulticlasses();
    await updateProgressionFields();
    return lib;
  };

  maFfd20RefreshArchetypes = async function(){
    let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ return; }
    const cls = maFfd20Find(lib.classes, adminChoiceValue('class'));
    maFfd20FillSelect(document.getElementById('archetype'), cls?.archetypes || [], 'No archetype', adminChoiceValue('archetype'));
  };

  const oldApplyChoices = maFfd20ApplySheetChoices;
  maFfd20ApplySheetChoices = async function(opts={}){
    const out = await oldApplyChoices.call(this, opts);
    await updateProgressionFields();
    maFfd20RenderMulticlasses();
    await refreshCardsFromLibrary();
    try{ maFfd20SaveNow(); }catch(e){}
    return out;
  };

  function newAbilityNames(lib, oldLevel, newLevel){
    const sel = maCurrentSelectionClone();
    const oldSel = {...sel, level:oldLevel};
    const newSel = {...sel, level:newLevel};
    return maFeatureNamesBetween(lib, oldSel, newSel).map(x => x.replace(/^Class:\s*/,'')).slice(0,18);
  }
  function milestonePickerHtml(milestones){
    if(!milestones.length) return '';
    return `<div class="ma-level-card"><small>Ability Score</small><strong>+1</strong><span>${milestones.map(l=>'Level '+l).join(', ')}</span></div><div class="ma-ability-score-picks">${milestones.map(l => `<label>Level ${l} +1<select data-ability-level="${l}">${MA_STATS.map(s=>`<option value="${s}">${s.toUpperCase()}</option>`).join('')}</select></label>`).join('')}</div>`;
  }

  maFfd20HandleLevelChanged = async function(event){
    const select = event?.target || document.getElementById('character_level');
    const oldSel = maCurrentSelectionClone();
    const oldLevel = levelOf(select?.dataset.prevLevel || oldSel.level || 1) || 1;
    const newLevel = levelOf(select?.value || oldLevel) || oldLevel;
    const newSel = {...oldSel, level:newLevel};
    if(newLevel > oldLevel){
      let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message); if(select) select.value=String(oldLevel); return false; }
      const result = await maShowLevelUpScreen(lib, {...oldSel, level:oldLevel}, newSel, 'Class');
      if(!result){ if(select) select.value=String(oldLevel); return false; }
      if(select) select.dataset.prevLevel = String(newLevel);
      setField('character_level', newLevel);
      maApplyFinalClassTotals(lib, {...oldSel, level:oldLevel}, newSel, result);
    } else {
      if(select) select.dataset.prevLevel = String(newLevel);
      setField('character_level', newLevel);
    }
    await maFfd20ApplySheetChoices({silent:true});
    maFfd20RenderAll();
    maFfd20SaveNow();
    return true;
  };

  async function openClassDialog(kind='primary', index=null){
    let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message); return; }
    const isMulti = kind === 'multi';
    const oldSel = maCurrentSelectionClone();
    const mc = isMulti && index !== null ? (data().multiclasses || [])[index] || {} : {};
    const curClass = isMulti ? (mc.className || mc.class || '') : value('class','');
    const curArch = isMulti ? (mc.archetype || '') : value('archetype','');
    const curLevel = isMulti ? (mc.level || 1) : value('character_level','1');
    const title = isMulti ? (index === null ? 'Add Multiclass' : `Edit Class ${index+2}`) : 'Edit Class';
    const body = `<div class="ffd20-modal-grid"><label>Class<select id="maEditClass"></select></label><label>Archetype<select id="maEditArch"><option value="">No archetype</option></select></label><label>Level<select id="maEditLevel">${maFfd20LevelOptions(curLevel)}</select></label></div>`;
    const promise = maFfd20Dialog(title, body, 'Save Class');
    setTimeout(() => {
      const c=document.getElementById('maEditClass'), a=document.getElementById('maEditArch');
      maFfd20FillSelect(c, lib.classes, 'Choose class', curClass);
      const fillA=(keepCurrent=true)=>{ const cls=maFfd20Find(lib.classes, c?.value || ''); maFfd20FillSelect(a, cls?.archetypes || [], 'No archetype', keepCurrent ? curArch : ''); };
      fillA(true); c?.addEventListener('change', () => fillA(false));
    },0);
    const glowTarget = isMulti && index !== null ? document.querySelectorAll('#maMulticlassList .ma-build-card')[index] : document.getElementById('maClassBuildCard'); glowTarget?.classList.add('ma-glow'); setTimeout(()=>glowTarget?.classList.remove('ma-glow'),700);
    const overlay = await promise; if(!overlay) return;
    const className=overlay.querySelector('#maEditClass')?.value || '';
    const arch=overlay.querySelector('#maEditArch')?.value || '';
    const lvl=levelOf(overlay.querySelector('#maEditLevel')?.value || '1') || 1;
    if(!className) return;
    const newSel = {...oldSel, multiclasses:Array.isArray(oldSel.multiclasses) ? oldSel.multiclasses.map(x=>({...x})) : []};
    let slotLabel = 'Class';
    if(isMulti){
      const item={className, archetype:arch, level:String(lvl)};
      if(index === null){ newSel.multiclasses.push(item); slotLabel = `Class ${newSel.multiclasses.length + 1}`; }
      else { newSel.multiclasses[index]=item; slotLabel = `Class ${index+2}`; }
    } else {
      newSel.className = className; newSel.class = className; newSel.archetype = arch; newSel.level = lvl;
    }
    const oldTotal = maTotalCharacterLevel(oldSel);
    const newTotal = maTotalCharacterLevel(newSel);
    let levelResult = null;
    if(newTotal > oldTotal){
      levelResult = await maShowLevelUpScreen(lib, oldSel, newSel, slotLabel);
      if(!levelResult) return;
    }
    if(isMulti){
      if(!Array.isArray(data().multiclasses)) data().multiclasses=[];
      if(index === null) data().multiclasses.push({className, archetype:arch, level:String(lvl)}); else data().multiclasses[index]={className, archetype:arch, level:String(lvl)};
      maFfd20RenderMulticlasses();
    } else {
      setField('class', className); await maFfd20RefreshArchetypes(); setField('archetype', arch);
      const levelEl=document.getElementById('character_level');
      if(levelEl){ levelEl.value=String(lvl); levelEl.dataset.prevLevel = String(lvl); }
      setField('character_level', lvl);
    }
    maApplyFinalClassTotals(lib, oldSel, newSel, levelResult);
    await maFfd20ApplySheetChoices({silent:true});
    maApplyFinalClassTotals(lib, oldSel, newSel, levelResult);
    try{ refreshEffectiveVitals(); }catch(e){}
    maFfd20RenderMulticlasses();
    maFfd20SaveNow();
  }

  maFfd20RenderMulticlasses = function(){
    const list=document.getElementById('maMulticlassList'); if(!list) return;
    if(!Array.isArray(data().multiclasses)) data().multiclasses=[];
    list.innerHTML = '';
    data().multiclasses.forEach((mc,index)=>{
      const row=document.createElement('div'); row.className='ma-multiclass-card';
      row.innerHTML = `<button type="button" class="ma-build-card ma-multiclass-edit"><span class="ma-class-click-label">Class ${index+2}</span><span class="ma-class-slot-main"><strong class="ma-build-card-title">${maFfd20Esc(mc.className || mc.class || 'Choose Class')}</strong><small class="ma-build-card-sub">${maFfd20Esc(mc.archetype || 'No archetype')}</small></span><span class="ma-build-card-level">Lv ${maFfd20Esc(mc.level || 1)}</span></button><button class="ffd20-mini-btn danger" type="button">Delete</button>`;
      row.querySelector('button:first-child')?.addEventListener('click',()=>openClassDialog('multi',index));
      row.querySelector('button.danger')?.addEventListener('click',async()=>{ data().multiclasses.splice(index,1); maFfd20RenderMulticlasses(); await maFfd20ApplySheetChoices({silent:true}); maFfd20SaveNow(); });
      list.appendChild(row);
    });
  };

  function createMilestoneHtml(level){ const milestones=[4,8,12,16,20].filter(x=>x<=level); return milestonePickerHtml(milestones); }
  maFfd20OpenCreationWizard = async function(){
    if(IS_ADMIN || !currentUser) return;
    let lib; try { lib = await maFfd20LoadLibrary(); } catch(e){ alert(e.message); return; }
    const nextIndex=(characterSheets?.length || 0)+1;
    const body = `<div class="ffd20-modal-grid"><label>Name<input id="maCreateName" value="New Character ${nextIndex}"></label><label>Race<select id="maCreateRace"></select></label><label>Class<select id="maCreateClass"></select></label><label>Archetype<select id="maCreateArch"><option value="">No archetype</option></select></label><label>Level<select id="maCreateLevel">${maFfd20LevelOptions('1')}</select></label><label>Alignment<select id="maCreateAlignment"></select></label><label>Size<select id="maCreateSize"></select></label><label>Languages<input id="maCreateLanguages" placeholder="Common, ..."></label><label>Senses<input id="maCreateSenses" placeholder="Darkvision, low-light, ..."></label><label>Favored class bonus<select id="maCreateFavored"><option value="hp">+1 HP each level</option><option value="skill">+1 Skill Point each level</option></select></label></div><div class="ffd20-level-summary"><strong>Starting rules</strong><div class="ma-new-ability-list"><span class="ma-new-ability-pill">Level 1 HP = HD + CON</span><span class="ma-new-ability-pill">Level-up HP = Avg HD + CON</span><span class="ma-new-ability-pill">Level 1 skills ×4</span></div></div><div id="maCreateMilestones"></div>`;
    const promise=maFfd20Dialog('Create Character', body, 'Create Character');
    setTimeout(()=>{
      maFfd20FillSelect(document.getElementById('maCreateRace'), lib.races, 'Choose race');
      maFfd20FillSelect(document.getElementById('maCreateClass'), lib.classes, 'Choose class');
      maFfd20FillSimple(document.getElementById('maCreateAlignment'), MA_ALIGNMENTS, 'Choose alignment');
      maFfd20FillSimple(document.getElementById('maCreateSize'), MA_SIZES, 'Select Size', 'Medium');
      const c=document.getElementById('maCreateClass'), a=document.getElementById('maCreateArch');
      c?.addEventListener('change',()=>{ const cls=maFfd20Find(lib.classes,c.value); maFfd20FillSelect(a, cls?.archetypes || [], 'No archetype'); });
      document.getElementById('maCreateLevel')?.addEventListener('change',e=>{ const target=document.getElementById('maCreateMilestones'); if(target) target.innerHTML=createMilestoneHtml(levelOf(e.target.value)); });
    },0);
    const overlay=await promise; if(!overlay) return;
    const level=levelOf(overlay.querySelector('#maCreateLevel')?.value || 1) || 1;
    const name=overlay.querySelector('#maCreateName')?.value?.trim() || `New Character ${nextIndex}`;
    const className=overlay.querySelector('#maCreateClass')?.value || '';
    const race=overlay.querySelector('#maCreateRace')?.value || '';
    try{
      const newData=createBlankCharacterData(name);
      Object.assign(newData,{charName:name,race,class:className,archetype:overlay.querySelector('#maCreateArch')?.value || '',character_level:String(level),alignment:overlay.querySelector('#maCreateAlignment')?.value || '',size_category:overlay.querySelector('#maCreateSize')?.value || 'Medium',size:overlay.querySelector('#maCreateSize')?.value || 'Medium',languages:overlay.querySelector('#maCreateLanguages')?.value || '',senses:overlay.querySelector('#maCreateSenses')?.value || '',multiclasses:[]});
      overlay.querySelectorAll('[data-ability-level]').forEach(sel=>{ const stat=sel.value; newData[stat]=String((Number(newData[stat]) || 10)+1); });
      const createFavored=overlay.querySelector('#maCreateFavored')?.value || 'hp'; newData.favoredClassBonuses={}; for(let lvl=1; lvl<=level; lvl++) newData.favoredClassBonuses[String(lvl)] = createFavored; const cls=maFfd20Find(lib.classes,className); const calc=maFfd20ApplyHpSkillToData(newData, cls, level, createFavored);
      const prog=combineProgression(lib,{className,archetype:newData.archetype,level,multiclasses:[]});
      newData.racialAbilities=Array.isArray(newData.racialAbilities)?newData.racialAbilities:[];
      maFfd20Push(newData, maFfd20BuildImported(lib,{race,className,archetype:newData.archetype,level,multiclasses:[]}));
      const ref=await addDoc(collection(db,'users',currentUser.uid,'characters'),newData);
      try{ await setDoc(doc(db,'users',currentUser.uid),{charactersMigrated:true},{merge:true}); }catch(e){ console.warn(e); }
      currentSummonId=ref.id; fullData=sanitizeCharacterDoc({id:ref.id,...newData},name); showNoCharacterState(false); loadCurrentSheet(); updateSummonMenu(); document.getElementById('summonMenu')?.classList.remove('show');
      alert(`Created ${name}. HP ${calc.hp}. Skill points ${calc.skill}.`);
    }catch(err){ console.error(err); alert('Error creating character: ' + (err?.message || err)); }
  };

  maFfd20SyncAfterPopulate = function(){
    const existing=document.getElementById('ffd20ChoiceGrid'); if(existing) existing.remove();
    maFfd20BuildChoiceGrid(true);
    const d=data();
    ['charName','race','class','archetype','character_level','alignment','size_category','size','languages','senses','shop_tags','prestige_class','prestige_level'].forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      let saved=d[id];
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'charName') saved=d.name;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'class') saved=d.className;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'character_level') saved=d.level;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'size_category') saved=d.size;
      if((saved === undefined || saved === null || String(saved).trim() === '') && id === 'size') saved=d.size_category;
      if(saved === undefined || saved === null || String(saved).trim() === '') return;
      const str=String(saved);
      if(el.tagName === 'SELECT' && !Array.from(el.options || []).some(opt => opt.value === str)) maFfd20AddOption(el, str, str);
      el.value=str;
    });
    const levelEl=document.getElementById('character_level'); if(levelEl) levelEl.dataset.prevLevel=String(levelOf(levelEl.value || d.character_level || 1)||1);
    maFfd20RefreshOptions(); maFfd20RenderMulticlasses(); refreshCardsFromLibrary();
  };
})();
