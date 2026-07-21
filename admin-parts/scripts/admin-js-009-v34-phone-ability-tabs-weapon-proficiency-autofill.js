
/* --- v34 phone ability tabs + weapon proficiency autofill --- */
(function(){
  const FEATURE_NAME = 'Weapon and Armor Proficiency';

  function norm(value){
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getData(){
    try {
      if(typeof maFfd20ActiveData === 'function') return maFfd20ActiveData() || {};
      if(typeof getActiveData === 'function') return getActiveData() || {};
    } catch(e) {}
    return {};
  }

  function getFeatureText(feature){
    return String(
      feature?.desc ??
      feature?.description ??
      feature?.text ??
      feature?.body ??
      feature?.effect ??
      feature?.summary ??
      ''
    ).trim();
  }

  function featureList(source){
    if(!source || typeof source !== 'object') return [];
    return []
      .concat(Array.isArray(source.features) ? source.features : [])
      .concat(Array.isArray(source.traits) ? source.traits : [])
      .concat(Array.isArray(source.abilities) ? source.abilities : [])
      .concat(Array.isArray(source.classFeatures) ? source.classFeatures : [])
      .concat(Array.isArray(source.class_features) ? source.class_features : []);
  }

  function findProficiencyFeature(source){
    const target = norm(FEATURE_NAME);
    return featureList(source).find(feature => norm(feature?.name || feature?.title || '') === target);
  }

  function findClassInLibrary(lib, className){
    const target = norm(className);
    if(!target) return null;

    const all = []
      .concat(Array.isArray(lib?.classes) ? lib.classes : [])
      .concat(Array.isArray(lib?.baseCoreClasses) ? lib.baseCoreClasses : [])
      .concat(Array.isArray(lib?.prestigeClasses) ? lib.prestigeClasses : [])
      .concat(Array.isArray(lib?.prestige_classes) ? lib.prestige_classes : []);

    return all.find(item => norm(item?.name || item?.title || item?.className || item?.class || '') === target) || null;
  }

  function currentClassRows(){
    const data = getData();
    const rows = [];

    const mainClass =
      document.getElementById('class')?.value ||
      data.class ||
      data.className ||
      '';

    if(mainClass){
      rows.push({
        label: 'Class',
        name: mainClass
      });
    }

    const multiclasses = Array.isArray(data.multiclasses) ? data.multiclasses : [];
    multiclasses.forEach((mc, index) => {
      const name = mc?.className || mc?.class || mc?.name || '';
      if(name){
        rows.push({
          label: 'Class ' + (index + 2),
          name
        });
      }
    });

    const prestige =
      document.getElementById('prestige_class')?.value ||
      data.prestige_class ||
      data.prestigeClass ||
      '';

    if(prestige){
      rows.push({
        label: 'Prestige',
        name: prestige
      });
    }

    return rows;
  }

  function ensureWeaponProficiencyCard(){
    const textarea = document.getElementById('proficiencies');
    const weaponList = document.getElementById('weaponList');
    if(!textarea || !weaponList) return null;

    const weaponPanel = weaponList.parentElement;
    if(!weaponPanel) return textarea;

    let card = document.getElementById('weaponProficiencyCardV34');

    if(!card){
      card = document.createElement('div');
      card.id = 'weaponProficiencyCardV34';
      card.innerHTML = '<label for="proficiencies">Weapon and Armor Proficiency</label>';
      card.appendChild(textarea);
    }

    const addWeaponBtn = Array.from(weaponPanel.querySelectorAll('button'))
      .find(btn => /add weapon/i.test(btn.textContent || ''));

    if(addWeaponBtn && card.parentElement !== weaponPanel){
      addWeaponBtn.insertAdjacentElement('afterend', card);
    } else if(!card.parentElement) {
      weaponPanel.appendChild(card);
    }

    // Remove the old empty wrapper left under Feats if it exists.
    document.querySelectorAll('#a-feats > div').forEach(div => {
      if(div !== card && div.textContent.trim() === 'Proficiencies' && !div.querySelector('#proficiencies')){
        div.remove();
      }
    });

    return textarea;
  }

  async function autofillWeaponProficiency(){
    const textarea = ensureWeaponProficiencyCard();
    if(!textarea) return;

    let lib = null;
    try {
      if(typeof maFfd20LoadLibrary === 'function') lib = await maFfd20LoadLibrary();
    } catch(e) {
      console.warn('Could not load class library for proficiencies', e);
      return;
    }

    const rows = currentClassRows();
    const blocks = [];

    rows.forEach(row => {
      const cls = findClassInLibrary(lib, row.name);
      const feature = findProficiencyFeature(cls);
      if(!feature) return;

      const desc = getFeatureText(feature);
      blocks.push(desc ? `${row.name}: ${desc}` : `${row.name}: ${FEATURE_NAME}`);
    });

    const next = blocks.join('\n\n').trim();

    // Forceful for test branch: class JSON owns this field.
    if(next && textarea.value !== next){
      textarea.value = next;

      const data = getData();
      data.proficiencies = next;

      textarea.dispatchEvent(new Event('input', { bubbles:true }));
      textarea.dispatchEvent(new Event('change', { bubbles:true }));

      try {
        if(typeof save === 'function') save(true);
        else if(typeof triggerSave === 'function') triggerSave();
      } catch(e) {}
    }
  }

  function scheduleAutofill(){
    ensureWeaponProficiencyCard();
    setTimeout(autofillWeaponProficiency, 80);
    setTimeout(autofillWeaponProficiency, 400);
  }

  document.addEventListener('DOMContentLoaded', scheduleAutofill);
  window.addEventListener('load', scheduleAutofill);

  document.addEventListener('change', event => {
    if(['class','archetype','character_level','prestige_class','prestige_level'].includes(event.target?.id)){
      scheduleAutofill();
    }
  }, true);

  document.addEventListener('click', event => {
    if(event.target?.closest?.('#maClassBuildCard, #maMulticlassList, #maAddMulticlassBtn')){
      setTimeout(scheduleAutofill, 500);
    }
  }, true);

  const oldRefreshOptions = window.maFfd20RefreshOptions;
  if(typeof oldRefreshOptions === 'function'){
    window.maFfd20RefreshOptions = async function(){
      const result = await oldRefreshOptions.apply(this, arguments);
      scheduleAutofill();
      return result;
    };
  }

  window.maV34RefreshWeaponProficiency = scheduleAutofill;

  setTimeout(scheduleAutofill, 250);
  setTimeout(scheduleAutofill, 1000);
})();
