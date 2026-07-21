
const TOOLS_EMBED_SHOP = new URLSearchParams(window.location.search).get('embed') === 'shop';
document.body.classList.toggle('embed-shop', TOOLS_EMBED_SHOP);
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, deleteDoc, doc, updateDoc, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyBpoi5qvqUehnhcyhfB7d0gtelNUICIthw",authDomain:"mount-aetheria.firebaseapp.com",projectId:"mount-aetheria",storageBucket:"mount-aetheria.firebasestorage.app",messagingSenderId:"492855693446",appId:"1:492855693446:web:f9948569254a7220c38107",measurementId:"G-0PF84KDN7L"};
const ADMIN_EMAIL="phoeaung2076@gmail.com";
const ADMIN_UID="U7uyfcMtULSLJvXD0HzJaiMIeGE3";
const MASTER_ITEMS_PATH="data/items.json";
function currentUserIsAdmin(user){return !!user && ((user.email||"").toLowerCase()===ADMIN_EMAIL || user.uid===ADMIN_UID);}
const app=initializeApp(firebaseConfig); const auth=getAuth(app); const db=getFirestore(app);
const SHOP_GROUPS={Tools:["Gear","Food","Weapon","Ranged Weapon","Ammunition","Armor","Enchantment","Machine"],Magic:["Alchemical Items","Artifacts","Magic Items"]};
const CATEGORY_ORDER=[...SHOP_GROUPS.Tools,...SHOP_GROUPS.Magic];
const FILTER_LABELS={type:"Type",secondaryType:"Secondary Type",filterTag:"Secondary Type",proficiency:"Proficiency",usageType:"Usage",tier:"Tier",sourceSystem:"Source System",lvl:"Recommended Lvl",rarity:"Rarity"};
const FILTERS_BY_CATEGORY={
  "Gear":["type","secondaryType","proficiency","usageType","sourceSystem","lvl","rarity"],
  "Weapon":["type","proficiency","usageType","sourceSystem","lvl","rarity"],
  "Ranged Weapon":["type","proficiency","usageType","sourceSystem","lvl","rarity"],
  "Ammunition":["type","sourceSystem","lvl","rarity"],
  "Armor":["type","sourceSystem","lvl","rarity"],
  "Enchantment":["type","secondaryType","sourceSystem","lvl","rarity"],
  "Machine":["type","sourceSystem","lvl","rarity"],
  "Alchemical Items":["type","secondaryType","tier","sourceSystem","lvl","rarity"],
  "Artifacts":["type","sourceSystem","lvl","rarity"],
  "Magic Items":["type","secondaryType","sourceSystem","lvl","rarity"],
  "Food":["type","secondaryType","sourceSystem","lvl","rarity"]
};
const TAGS_BY_CATEGORY=FILTERS_BY_CATEGORY;
const DETAIL_FIELDS_BY_CATEGORY={
  "Gear":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["Dmg",["dmg","damage","damageDice","damage_dice","dmgM","dmgS","attackDmg"]],["Crit",["crit","critical"]],["Range",["range","rangeIncrement","range_increment"]]],
  "Weapon":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["Dmg",["dmg","damage","damageDice","damage_dice","dmgM","dmgS","attackDmg"]],["Crit",["crit","critical"]],["Range",["range","rangeIncrement","range_increment"]]],
  "Ranged Weapon":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["Dmg",["dmg","damage","damageDice","damage_dice","dmgM","dmgS","attackDmg"]],["Crit",["crit","critical"]],["Range",["range","rangeIncrement","range_increment"]]],
  "Ammunition":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]]],
  "Armor":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["AC bonus",["acBonus","ac bonus","armorBonus","armor bonus","shieldBonus"]],["Max Dex",["maxDex","max dex","maxDexBonus"]],["Check penalty",["checkPenalty","check penalty","armorCheckPenalty"]],["Spell failure",["spellFailure","spell failure","arcaneSpellFailure"]],["Speed",["speed","speedPenalty","speed penalty","speed30Ft","speed20Ft"]]],
  "Enchantment":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["CL",["cl","casterLevel","caster level"]]],
  "Machine":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["CL",["cl","casterLevel","caster level"]],["Speed",["speed"]],["Full speed",["fullSpeed","full speed"]],["Passengers/Crew",["passengersCrew","passengers/crew","passengers","crew"]],["Fuel",["fuel"]],["Mileage",["mileage"]],["AC/CMD",["acCmd","ac/cmd","ac cmd"]],["HP",["hp"]],["Hardness",["hardness"]]],
  "Alchemical Items":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["CL",["cl","casterLevel","caster level"]],["Range",["range"]],["DC Saves",["dcSave","dc saves","dcSaves","saveDc","save DC"]],["Spell Needed",["spellNeeded","spell needed","spell"]]],
  "Artifacts":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["CL",["cl","casterLevel","caster level"]]],
  "Magic Items":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]],["CL",["cl","casterLevel","caster level"]]],
  "Food":[["Slot amount",["slotAmount","slot amount","slot_amount","slotsUsed","slots_used","slot"]]]
};
let isAdmin=false,currentUser=null,allShopItems=[],allShopItemsById=new Map(),allShops=[],allShopRegions=[],allPartyGroups=[],editingRegionId=null,regionDraftAccess={},selectedRegionPartyTag="",userCharacters=[],selectedCharacterId=null,selectedCategory="Gear",selectedItemIds=new Set(),activeFilters={},visibleBuilderIds=[],editingShopId=null,viewFilters={},openCategoryState={},builderSort="nameAsc",builderViewMode="all",purchaseInFlight=false;
const modal=document.getElementById('customModal'), modalTitle=document.getElementById('modalTitle'), modalMsg=document.getElementById('modalMsg'), modalYes=document.getElementById('modalYesBtn'), modalNo=document.getElementById('modalNoBtn');
function clearModalExtras(){modal.querySelectorAll('.purchase-qty-input,.modal-extra-note').forEach(el=>el.remove());}
function resetModalButtons(){modalYes.style.display='';modalYes.textContent='Yes';modalNo.textContent='No';modalNo.style.width='';}
function showConfirm(title,msg,onYes){clearModalExtras();resetModalButtons();modalTitle.textContent=title;modalMsg.textContent=msg;modal.style.display='flex';modalYes.onclick=()=>{modal.style.display='none';onYes();};modalNo.onclick=()=>{modal.style.display='none';};}
function showAlert(title,msg){clearModalExtras();resetModalButtons();modalTitle.textContent=title;modalMsg.textContent=msg;modalYes.style.display='none';modalNo.textContent='OK';modalNo.style.width='100%';modal.style.display='flex';modalNo.onclick=()=>{modal.style.display='none';resetModalButtons();};}
function askPurchaseQuantity(item,unitPrice){const isAmmo=isAmmunitionItem(item); if(!isAmmo)return Promise.resolve(1); return new Promise(resolve=>{clearModalExtras();resetModalButtons();modalTitle.textContent='Buy Ammunition';modalMsg.textContent=`How many ${item.name||'ammo'} do you want to buy? Unit price: ${unitPrice.toLocaleString()} gil.`;let input=document.createElement('input');input.className='purchase-qty-input';input.type='number';input.min='1';input.step='1';input.value='1';modalMsg.insertAdjacentElement('afterend',input);setTimeout(()=>input?.focus(),0);modalYes.textContent='Buy';modal.style.display='flex';modalYes.onclick=()=>{const qty=Math.max(1,Math.floor(Number(input?.value)||1));clearModalExtras();modal.style.display='none';resetModalButtons();resolve(qty);};modalNo.onclick=()=>{clearModalExtras();modal.style.display='none';resetModalButtons();resolve(0);};});}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function normalizeTags(input){if(Array.isArray(input))return input.flatMap(normalizeTags);return String(input||'').split(/[,|\n]+/).map(t=>t.trim().toLowerCase()).filter(Boolean).filter((t,i,a)=>a.indexOf(t)===i);}
function normalizeShopTag(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
function getCharTags(c){return normalizeTags(c?.shopTags?.length?c.shopTags:c?.shop_tags);}
function getPartyTags(c){return normalizeTags(c?.group_tags);}
function getCharacterGroupTags(c){return getPartyTags(c);}
function isShopBuilderMode(){return isAdmin && !TOOLS_EMBED_SHOP;}
function parseGilNumber(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const cleaned=String(value).trim().replace(/,/g,'').replace(/[^0-9.+-]/g,'');
  if(!cleaned)return null;
  const parsed=Number(cleaned);
  return Number.isFinite(parsed)?parsed:null;
}
function getGilInfo(character){
  const candidates=[
    ['currency_gil',character?.currency_gil],
    ['gil',character?.gil],
    ['currencyGil',character?.currencyGil],
    ['currentGil',character?.currentGil],
    ['wallet.gil',character?.wallet?.gil],
    ['currency.gil',character?.currency?.gil],
    ['currency.currency_gil',character?.currency?.currency_gil],
    ['resources.gil',character?.resources?.gil],
    ['sheet.currency_gil',character?.sheet?.currency_gil],
    ['data.currency_gil',character?.data?.currency_gil]
  ];
  for(const [source,value] of candidates){
    const parsed=parseGilNumber(value);
    if(parsed!==null)return {found:true,value:parsed,source};
  }
  return {found:false,value:0,source:''};
}
function getGil(c){return getGilInfo(c).value;}
function getPrice(item){return Number(item?.priceGil ?? item?.price ?? String(item?.cost||'').replace(/[^0-9.]/g,''))||0;}
function getDisplayCost(item){return item?.cost || (getPrice(item)?`${getPrice(item).toLocaleString()} gil`:'—');}
function lookupField(item,keys){for(const key of keys){if(!key)continue; const variants=[key,key.replace(/\s+/g,''),key.replace(/\s+/g,'_'),key.replace(/\s+/g,'-')]; for(const vKey of variants){if(item&&Object.prototype.hasOwnProperty.call(item,vKey)&&String(item[vKey]??'').trim())return item[vKey]; if(item?.raw&&Object.prototype.hasOwnProperty.call(item.raw,vKey)&&String(item.raw[vKey]??'').trim())return item.raw[vKey];}} return '';}
function fieldAliases(field){const map={secondaryType:["secondaryType","secondary type","filterTag","filter tag","subcategory","subtype"],usageType:["usageType","usage type","usage"],sourceSystem:["sourceSystem","source system"],lvl:["lvl","level","recommendedLvl","recommended lvl","recommendedLevel","recommended level"],rarity:["rarity"],proficiency:["proficiency"],tier:["tier"],type:["type"]}; return map[field]||[field];}
function itemField(item,field){const v=lookupField(item,fieldAliases(field)); return v===null||v===undefined?'':String(v).trim();}
function itemFilterValue(item,field){const v=itemField(item,field); return field==='lvl'&&v?String(parseInt(v,10)||v):v.toLowerCase();}
function safeText(v){if(v===undefined||v===null)return ''; if(Array.isArray(v))return v.map(safeText).join(' '); if(typeof v==='object')return Object.values(v).map(safeText).join(' '); return String(v);}
function cleanCategoryKey(v){return String(v||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');}
function directCategoryAlias(v){const c=cleanCategoryKey(v); if(!c)return ''; if(['weapon','weapons','melee weapon','melee weapons'].includes(c))return 'Weapon'; if(['ranged weapon','ranged weapons','firearm','firearms','gun arm','gun arms','gunarm','gunarms','power weapon','power weapons'].includes(c))return 'Ranged Weapon'; if(['ammunition','ammo','arrows','arrow','bullet','bullets','cartridge','cartridges'].includes(c))return 'Ammunition'; if(['armor','armour','shield','shields'].includes(c))return 'Armor'; if(['gear','equipment','adventuring gear','general gear'].includes(c))return 'Gear'; if(['religious gear','religious','channel foci','channel focus'].includes(c))return 'Gear'; if(['machine','machines','technological item','technological items'].includes(c))return 'Machine'; if(['alchemical item','alchemical items','alchemical','alchemy'].includes(c))return 'Alchemical Items'; if(['artifact','artifacts'].includes(c))return 'Artifacts'; if(['rod','rods','staff','staves','magic rod','magic rods','magic staff','magic staves'].includes(c))return 'Ranged Weapon'; if(['magic item','magic items','wondrous item','wondrous items','wand','wands','ring','rings','materia'].includes(c))return 'Magic Items'; if(['enchantment','enchantments','weapon enchantment','armor enchantment','armour enchantment'].includes(c))return 'Enchantment'; if(['consumable','consumables','food','foods','chocobo food','drink','drinks','alcohol','alcoholic','alchoal','dessert','desserts','desert','deserts'].includes(c))return 'Food'; if(['collection','collections'].includes(c))return 'Collections'; if(['misc','miscellaneous','other'].includes(c))return 'Misc'; return '';} 
function compactBlob(raw){
  const r=raw?.raw||{};
  return [
    raw?.category,raw?.shopGroup,raw?.type,raw?.subtype,raw?.kind,raw?.tags,raw?.tagList,
    raw?.id,raw?.itemId,raw?.name,raw?.sourceUrl,raw?.source,raw?.url,raw?.href,raw?.link,raw?.page,
    raw?.desc,raw?.description,raw?.special,raw?.basePrice,raw?.priceMod,raw?.['base price'],raw?.['price mod'],
    r.category,r.shopGroup,r.type,r.subtype,r.kind,r.tags,r.tagList,r.id,r.itemId,r.name,
    r.sourceUrl,r.source,r.url,r.href,r.link,r.page,r.desc,r.description,r.special,r.basePrice,r.priceMod,r['base price'],r['price mod'],
    safeText(raw),safeText(r)
  ].map(safeText).join(' ').toLowerCase().replace(/[_-]+/g,' ');
}
function categoryDebugText(){
  if(!allShopItems.length)return 'No master items loaded. Use Import JSON, or add items.json to the repo as data/items.json.';
  const counts={};
  allShopItems.forEach(i=>{const cat=i.category||'Blank';counts[cat]=(counts[cat]||0)+1;});
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([k,v])=>`${k}: ${v}`).join(' • ');
}
function inferCategoryName(raw){const direct=directCategoryAlias(raw?.category)||directCategoryAlias(raw?.raw?.category); const typeDirect=directCategoryAlias(raw?.type)||directCategoryAlias(raw?.raw?.type)||directCategoryAlias(raw?.kind)||directCategoryAlias(raw?.raw?.kind); const blob=compactBlob(raw); const strong=(patterns)=>patterns.some(rx=>rx.test(blob));
  if(typeDirect==='Food')return 'Food';
  if(direct && direct!=='Gear' && direct!=='Misc')return direct;
  if(strong([/\bmagic rods?\b/,/\bmagic staves\b/,/\brods?\b/,/\bstaves\b/,/\bstaff\b/,/MagicRods\.aspx/i,/MagicStaves\.aspx/i]))return 'Ranged Weapon';
  if(strong([/\bmachines?\b/,/\/machines?\//,/\bmagitek\b/,/\bvehicle\b/]))return 'Machine';
  if(strong([/\bartifacts?\b/,/\/artifacts?\//]))return 'Artifacts';
  if(strong([/\balchemical items?\b/,/\balchemical\b/,/\balchemy\b/,/\/alchemical[-_ ]?items?\//]))return 'Alchemical Items';
  if(strong([/\bmagic items?\b/,/\bwondrous items?\b/,/\/magic[-_ ]?items?\//,/\bwands?\b/,/\brings?\b/,/\bmateria\b/]))return 'Magic Items';
  if(strong([/\benchantments?\b/,/\/enchantments?\//,/\bprice mod\b/,/\bbase price\b/]))return 'Enchantment';
  if(cleanCategoryKey(raw?.shopGroup||raw?.raw?.shopGroup)==='magic')return 'Magic Items';
  if(strong([/\bammunition\b/,/\bammo\b/,/\barrows?\b/,/\bbullets?\b/,/\bcartridges?\b/]))return 'Ammunition';
  if(strong([/\branged weapons?\b/,/\bfirearms?\b/,/\bgun arms?\b/,/\bguns?\b/,/\bcrossbows?\b/,/\bbows?\b/,/\/firearms?\//,/\/gun[-_ ]?arms?\//]))return 'Ranged Weapon';
  if(strong([/\barmou?r\b/,/\bshields?\b/,/\/armor\//]))return 'Armor';
  if(strong([/\bweapons?\b/,/\/weapons?\//]))return 'Weapon';
  if(direct)return direct;
  return 'Gear';}
function normalizeCategoryName(category){return directCategoryAlias(category)||String(category||'').trim()||'Gear';}
function categoryGroup(category){return Object.entries(SHOP_GROUPS).find(([,cats])=>cats.includes(category))?.[0]||'Other';}
function importedProficiencyValue(raw){return String(raw?.proficiency||raw?.raw?.proficiency||raw?.Proficiency||raw?.raw?.Proficiency||'').trim().toLowerCase();}
function normalizeImportedItem(raw){const id=String(raw.id||raw.itemId||raw.name||('item_'+Date.now())).trim(); const category=inferCategoryName(raw); const type=String(lookupField(raw,["type","Type"])||'').trim().toLowerCase(); const secondaryType=String(lookupField(raw,["secondaryType","Secondary Type","secondary type","filterTag","Filter Tag","filter tag","subcategory","subtype"])||'').trim().toLowerCase(); const slot=String(lookupField(raw,["slot","Slot"])||'').trim().toLowerCase(); const slotAmount=String(lookupField(raw,["slotAmount","Slot Amount","slot amount","slot_amount","slotsUsed","slots used"])||'').trim(); const sourceSystem=String(lookupField(raw,["sourceSystem","Source System","source system"])||'custom').trim().toLowerCase(); const rawLvl=lookupField(raw,["lvl","level","Recommended Lvl","recommended lvl","recommendedLvl","recommendedLevel"]); const lvl=rawLvl===null||rawLvl===undefined||rawLvl===''?null:Number(rawLvl)||null; const rarity=String(lookupField(raw,["rarity","Rarity"])||'').trim(); const usageType=String(lookupField(raw,["usageType","Usage","usage type","usage"])||'').trim().toLowerCase(); const tier=String(lookupField(raw,["tier","Tier"])||'').trim(); const item={...raw,id,name:raw.name||raw.raw?.name||'Unnamed Item',category,shopGroup:categoryGroup(category),cost:raw.cost||raw.raw?.cost||'',priceGil:getPrice(raw),type,secondaryType,filterTag:secondaryType,slot,slotAmount,lvl,rarity,sourceSystem,sourceUrl:lookupField(raw,["sourceUrl","Source URL","source url","source"])||'',desc:raw.desc||raw.description||raw.raw?.desc||raw.raw?.description||'',special:raw.special||raw.raw?.special||'',proficiency:importedProficiencyValue(raw),usageType,tier}; item.tags=normalizeTags([raw.tags,raw.tagList,category,item.shopGroup,type,secondaryType,slot,rarity,sourceSystem,item.proficiency,item.usageType,tier,lvl?`lvl-${lvl}`:'']); return item;}
function mergeItems(staticItems,firestoreItems){const map=new Map(); [...staticItems,...firestoreItems].forEach(raw=>{const item=normalizeImportedItem(raw); if(item.id)map.set(item.id,item);}); allShopItems=[...map.values()].sort((a,b)=>String(a.category).localeCompare(String(b.category))||String(a.name).localeCompare(String(b.name))); allShopItemsById=new Map(allShopItems.map(i=>[i.id,i])); console.info('[Shop] Master items loaded:',allShopItems.length,categoryDebugText());}
function setMasterItemSourceStatus(message,type=''){
  const el=document.getElementById('masterItemSourceStatus');
  if(!el)return;
  el.textContent=message;
  el.classList.remove('good','bad');
  if(type)el.classList.add(type);
}
async function loadStaticItems(){
  setMasterItemSourceStatus(`Loading ${MASTER_ITEMS_PATH}...`);
  const response=await fetch(MASTER_ITEMS_PATH,{cache:'no-store'});
  if(!response.ok)throw new Error(`Could not load ${MASTER_ITEMS_PATH} (${response.status}).`);
  const data=await response.json();
  const items=Array.isArray(data)?data:(data.items||data.shopItems||[]);
  if(!Array.isArray(items)||!items.length)throw new Error(`${MASTER_ITEMS_PATH} contains no items.`);
  setMasterItemSourceStatus(`${items.length.toLocaleString()} items loaded from ${MASTER_ITEMS_PATH}.`,'good');
  return items;
}
async function loadShopItems(){
  try{
    const staticItems=await loadStaticItems();
    mergeItems(staticItems,[]);
  }catch(error){
    allShopItems=[];
    allShopItemsById=new Map();
    setMasterItemSourceStatus(error.message||String(error),'bad');
    throw error;
  }
}
async function loadShopSessions(){const snap=await getDocs(collection(db,'shopSessions')); allShops=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)||String(a.name||'').localeCompare(String(b.name||'')));}
function normalizeRegionRecord(id,data={}){
  let accessRules=Array.isArray(data.accessRules)
    ? data.accessRules
    : [];
  if(!accessRules.length && (data.characterGroupTag||data.groupTag) && Array.isArray(data.shopIds)){
    accessRules=[{
      partyTag:normalizeShopTag(data.characterGroupTag||data.groupTag),
      shopIds:[...new Set(data.shopIds.map(String))]
    }];
  }
  accessRules=accessRules.map(rule=>({
    partyTag:normalizeShopTag(rule?.partyTag||rule?.groupTag||rule?.characterGroupTag||''),
    shopIds:[...new Set((Array.isArray(rule?.shopIds)?rule.shopIds:[]).map(String))]
  })).filter(rule=>rule.partyTag);
  const shopIds=[...new Set(accessRules.flatMap(rule=>rule.shopIds))];
  return {id,...data,name:String(data.name||'Unnamed Region'),accessRules,shopIds};
}
async function loadShopRegions(){
  const [regionSnap,groupSnap]=await Promise.all([
    getDocs(collection(db,'shopAccessGroups')),
    getDocs(collection(db,'adminCharacterGroups'))
  ]);
  allShopRegions=regionSnap.docs
    .map(d=>normalizeRegionRecord(d.id,d.data()||{}))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
  allPartyGroups=groupSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(group=>String(group.name||'').trim())
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
}
async function loadUserCharacters(){
  userCharacters=[];
  if(!currentUser)return;

  if(isShopBuilderMode()){
    const usersSnap=await getDocs(collection(db,'users'));
    const characterRows=await Promise.all(usersSnap.docs.map(async userDoc=>{
      const uid=userDoc.id;
      const userData=userDoc.data()||{};
      try{
        const charsSnap=await getDocs(collection(db,'users',uid,'characters'));
        return charsSnap.docs.map(characterDoc=>{
          const data=characterDoc.data()||{};
          const ownerLabel=userData.name||userData.displayName||userData.email||uid;
          return {
            id:characterDoc.id,
            key:`${uid}::${characterDoc.id}`,
            ownerUid:uid,
            ownerLabel,
            ownerEmail:userData.email||'',
            ...data
          };
        });
      }catch(error){
        console.warn('Could not load characters for user',uid,error);
        return [];
      }
    }));

    userCharacters=characterRows.flat().sort((a,b)=>
      String(a.ownerLabel||'').localeCompare(String(b.ownerLabel||''),undefined,{sensitivity:'base'})||
      String(a.charName||'').localeCompare(String(b.charName||''),undefined,{sensitivity:'base'})
    );
    if(!userCharacters.some(c=>c.key===selectedCharacterId)&&userCharacters[0]){
      selectedCharacterId=userCharacters[0].key;
    }
    return;
  }

  const snap=await getDocs(collection(db,'users',currentUser.uid,'characters'));
  userCharacters=snap.docs.map(d=>({
    id:d.id,
    key:`${currentUser.uid}::${d.id}`,
    ownerUid:currentUser.uid,
    ownerLabel:currentUser.displayName||currentUser.email||'You',
    ownerEmail:currentUser.email||'',
    ...d.data()
  })).sort((a,b)=>String(a.charName||'').localeCompare(String(b.charName||''),undefined,{sensitivity:'base'}));

  if(!userCharacters.some(c=>c.key===selectedCharacterId||c.id===selectedCharacterId)&&userCharacters[0]){
    selectedCharacterId=userCharacters[0].key;
  }
}
async function removeLegacyShopExpiryFieldsV17(){if(!isShopBuilderMode())return; const legacy=allShops.filter(shop=>Object.prototype.hasOwnProperty.call(shop,'expiresAt')); if(!legacy.length)return; for(let i=0;i<legacy.length;i+=25){await Promise.all(legacy.slice(i,i+25).map(shop=>updateDoc(doc(db,'shopSessions',shop.id),{expiresAt:deleteField()})));} legacy.forEach(shop=>delete shop.expiresAt);}
let gmShopTab='individual';
window.setGmShopTab=(tab)=>{
  gmShopTab=tab==='region'?'region':'individual';
  document.getElementById('gmIndividualTabBtn')?.classList.toggle('active',gmShopTab==='individual');
  document.getElementById('gmGroupTabBtn')?.classList.toggle('active',gmShopTab==='region');
  document.getElementById('gmIndividualShopPanel')?.classList.toggle('active',gmShopTab==='individual');
  document.getElementById('gmGroupShopPanel')?.classList.toggle('active',gmShopTab==='region');
  if(gmShopTab==='individual'){
    clearRegionPreview();
    renderSelectedShop();
  }
};

function renderGmDashboardStats(){
  const values={
    gmStatShops:allShops.length,
    gmStatGroups:allShopRegions.length,
    gmStatItems:allShopItems.length,
    gmStatCharacters:userCharacters.length
  };
  Object.entries(values).forEach(([id,value])=>{
    const el=document.getElementById(id);
    if(el)el.textContent=Number(value||0).toLocaleString();
  });
}
async function loadShopData(){
  try{
    await Promise.all([loadShopItems(),loadShopSessions(),loadShopRegions(),loadUserCharacters()]);
    await removeLegacyShopExpiryFieldsV17();
    renderShopShell();
    renderAdminBuilder();
    renderRegionManager();
    renderGmDashboardStats();
    setGmShopTab(gmShopTab);
  }catch(e){
    console.error(e);
    renderGmDashboardStats();
    const status=document.getElementById('shopStatus');
    if(status)status.textContent='Shop error: '+(e.message||String(e));
  }
}
function regionAllowedShopIds(region,character){
  const partyTags=getPartyTags(character);
  if(!partyTags.length)return [];
  const allowed=new Set();
  (region?.accessRules||[]).forEach(rule=>{
    if(partyTags.includes(normalizeShopTag(rule.partyTag))){
      (rule.shopIds||[]).forEach(id=>allowed.add(String(id)));
    }
  });
  return [...allowed];
}
function regionShopsForCharacter(region,character){
  const allowed=new Set(regionAllowedShopIds(region,character));
  return allShops
    .filter(shop=>shop.active!==false && allowed.has(String(shop.id)))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
}
function visibleRegions(character){
  return allShopRegions.filter(region=>regionShopsForCharacter(region,character).length);
}
function shopItemsFor(shop){if(Array.isArray(shop?.itemIds)&&shop.itemIds.length)return shop.itemIds.map(id=>allShopItemsById.get(id)).filter(Boolean); return [];}
function selectedShopId(){return isShopBuilderMode()?document.getElementById('adminShopSelect')?.value:document.getElementById('shopSelect')?.value;}
function findShop(id){return allShops.find(s=>s.id===id)||null;}
function renderShopShell(){document.getElementById('playerShopTop').style.display=isShopBuilderMode()?'none':'grid'; document.getElementById('adminShopPanel').style.display=isShopBuilderMode()?'block':'none'; const character=renderCharacterBox(); renderShopDropdowns(character); renderSelectedShop();}
function characterOptionLabel(c){
  const base=isShopBuilderMode()
    ? `${c.ownerLabel||c.ownerEmail||c.ownerUid||'User'} — ${c.charName||'Unnamed Character'}`
    : (c.charName||'Unnamed Character');
  const gilInfo=getGilInfo(c);
  return `${base} • ${gilInfo.found?gilInfo.value.toLocaleString()+' gil':'Gil not saved'}`;
}
function renderCharacterBox(){
  const sel=document.getElementById(isShopBuilderMode()?'adminBuyerCharacterSelect':'shopCharacterSelect');
  const gilEl=document.getElementById(isShopBuilderMode()?'adminBuyerGil':'characterGil');
  const gilSourceEl=document.getElementById('adminBuyerGilSource');
  const adminBox=document.getElementById('adminBuyerBox');
  if(adminBox)adminBox.style.display=isShopBuilderMode()?'grid':'none';
  if(!sel||!gilEl)return null;

  if(!currentUser){
    sel.innerHTML='<option>Please sign in</option>';
    gilEl.textContent='Gil: 0';
    if(gilSourceEl){gilSourceEl.textContent='Sign in to load character balances.';gilSourceEl.classList.add('bad');}
    return null;
  }

  if(!userCharacters.length){
    sel.innerHTML='<option>No characters found</option>';
    gilEl.textContent='Gil: 0';
    if(gilSourceEl){gilSourceEl.textContent='No readable character documents were found.';gilSourceEl.classList.add('bad');}
    return null;
  }

  const selected=selectedCharacter()||userCharacters[0];
  selectedCharacterId=selected?.key||selected?.id||null;
  sel.innerHTML=userCharacters.map(c=>`<option value="${esc(c.key||c.id)}" ${(c.key||c.id)===selectedCharacterId?'selected':''}>${esc(characterOptionLabel(c))}</option>`).join('');

  const gilInfo=getGilInfo(selected);
  gilEl.textContent=gilInfo.found?`Gil: ${gilInfo.value.toLocaleString()}`:'Gil: Not saved';
  if(gilSourceEl){
    gilSourceEl.classList.toggle('bad',!gilInfo.found);
    gilSourceEl.textContent=gilInfo.found
      ? `Balance read from ${gilInfo.source}.`
      : 'This character has no recognized Gil field. Saving Gil once from the character sheet will create currency_gil.';
  }
  return selected;
}
document.getElementById('shopCharacterSelect').addEventListener('change',e=>{selectedCharacterId=e.target.value;renderShopShell();});
const adminBuyerSelect=document.getElementById('adminBuyerCharacterSelect'); if(adminBuyerSelect)adminBuyerSelect.addEventListener('change',e=>{selectedCharacterId=e.target.value;renderShopShell();});
function renderShopDropdowns(character){const focusId=(location.hash.match(/shop=([^&]+)/)||[])[1]; if(isShopBuilderMode()){const sel=document.getElementById('adminShopSelect'); const shops=allShops; sel.innerHTML=shops.length?shops.map(s=>`<option value="${esc(s.id)}">${esc(s.name||'Unnamed Shop')}</option>`).join(''):'<option value="">No shops yet</option>'; if(focusId&&shops.some(s=>s.id===focusId))sel.value=focusId; if(!sel.value&&shops[0])sel.value=shops[0].id; return;} const shops=getVisibleShops(character); const sel=document.getElementById('shopSelect'); sel.innerHTML=shops.length?shops.map(s=>`<option value="${esc(s.id)}">${esc(s.name||'Unnamed Shop')}</option>`).join(''):'<option value="">No shops available</option>'; if(focusId&&shops.some(s=>s.id===focusId))sel.value=focusId; if(!sel.value&&shops[0])sel.value=shops[0].id;}
window.renderSelectedShop=()=>{const id=selectedShopId(); const shop=findShop(id); const view=document.getElementById('shopView'); if(!shop){document.getElementById('shopStatus').textContent=isAdmin?'No shop selected. Create one in the builder.':'No shop is available for this character.'; view.innerHTML=''; return;} const items=shopItemsFor(shop); document.getElementById('shopStatus').textContent=`${shop.name||'Unnamed Shop'} • ${items.length.toLocaleString()} item(s) • ${allShopItems.length.toLocaleString()} master item(s) loaded`; view.innerHTML=renderShopCard(shop,items);};
function renderShopCategoriesOnly(shop,items){const byCat={}; items.forEach(item=>{const cat=item.category||'Misc'; if(!byCat[cat])byCat[cat]=[]; byCat[cat].push(item);}); const cats=Object.keys(byCat).sort((a,b)=>{const ai=CATEGORY_ORDER.indexOf(a),bi=CATEGORY_ORDER.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||String(a).localeCompare(String(b));}); return `<div class="clean-shop-body">${cats.length?cats.map((cat)=>renderCategoryAccordion(shop,cat,byCat[cat],false)).join(''):'<div class="empty-msg">This shop has no item IDs. Edit the shop and select items.</div>'}</div>`;}
function renderShopCard(shop,items){return `<section class="clean-shop-card"><div class="clean-shop-head"><div><h3 class="shop-title">${esc(shop.name||'Unnamed Shop')}</h3></div></div>${renderShopCategoriesOnly(shop,items)}</section>`;}
function filterKey(shopId,cat,field){return `${shopId}::${cat}::${field}`;}
function catOpenKey(shopId,cat){return `${shopId}::${cat}`;}
function categoryIsOpen(shopId,cat,defaultOpen){const key=catOpenKey(shopId,cat); if(openCategoryState[key]===undefined)openCategoryState[key]=!!defaultOpen; return openCategoryState[key];}
window.toggleShopCategory=(shopId,cat)=>{const key=catOpenKey(shopId,cat); openCategoryState[key]=!openCategoryState[key]; renderSelectedShop();};
function categoryFilterFields(cat){return FILTERS_BY_CATEGORY[cat]||["type","sourceSystem","lvl","rarity"];}
function itemPassesViewFilters(shop,cat,item,skipField=''){return categoryFilterFields(cat).every(field=>{if(field===skipField)return true; const v=viewFilters[filterKey(shop.id,cat,field)]||''; return !v||itemFilterValue(item,field)===v;});}
function formatFilterOption(field,value){if(field==='lvl')return 'Lvl '+value; return String(value).replace(/\b\w/g,c=>c.toUpperCase());}
function renderCategoryFilters(shop,cat,items){return `<div class="category-filter-row">${categoryFilterFields(cat).map(field=>{const candidateItems=items.filter(item=>itemPassesViewFilters(shop,cat,item,field)); const vals=[...new Set(candidateItems.map(i=>itemFilterValue(i,field)).filter(Boolean))].sort((a,b)=>field==='lvl'?(Number(a)-Number(b)):String(a).localeCompare(String(b))); if(!vals.length)return ''; const key=filterKey(shop.id,cat,field); const current=viewFilters[key]||''; return `<label><span>${esc(FILTER_LABELS[field]||field)}</span><select onchange="setViewFilter('${shop.id}','${esc(cat).replace(/'/g,'&#39;')}','${field}',this.value)"><option value="">All</option>${vals.map(v=>`<option value="${esc(v)}" ${current===v?'selected':''}>${esc(formatFilterOption(field,v))}</option>`).join('')}</select></label>`;}).join('')}</div>`;}
window.setViewFilter=(shopId,cat,field,value)=>{viewFilters[filterKey(shopId,cat,field)]=value; if(field==='type'&&!value){viewFilters[filterKey(shopId,cat,'secondaryType')]='';} renderSelectedShop();};
function categoryFilteredItems(shop,cat,items){return items.filter(item=>itemPassesViewFilters(shop,cat,item));}
function renderCategoryAccordion(shop,cat,items,defaultOpen){const open=categoryIsOpen(shop.id,cat,defaultOpen); const filtered=categoryFilteredItems(shop,cat,items); return `<div class="shop-category"><button class="shop-category-head" onclick="toggleShopCategory('${shop.id}','${esc(cat).replace(/'/g,'&#39;')}')"><span>${open?'▾':'▸'} ${esc(cat)}</span><span>${filtered.length}/${items.length}</span></button>${open?`<div class="shop-category-body">${renderCategoryFilters(shop,cat,items)}<div class="compact-list">${filtered.length?filtered.map(renderItemRow).join(''):'<div class="empty-msg">No items match these filters.</div>'}</div></div>`:''}</div>`;}
function renderItemRow(item){const buyBtn=`<button class="shop-buy-btn" onclick="event.stopPropagation();buyShopItem('${item.id}')">Buy</button>`; return `<div class="compact-item-row"><button class="item-name-link" onclick="openItemModal('${item.id}')">${esc(item.name)}</button><div class="shop-price-buy"><span class="compact-price">${esc(getDisplayCost(item))}</span>${buyBtn}</div></div>`;}
function isAmmunitionItem(item){return String(item?.category||'').toLowerCase()==='ammunition'||normalizeTags([item?.tags,item?.type]).includes('ammunition');}
function inventoryTagForItem(item){const cat=normalizeCategoryName(item?.category||item?.tags||'Misc'); if(/^weapon$/i.test(cat))return 'Weapons'; if(/^consumables?$/i.test(cat))return 'Food'; if(/^magic item$/i.test(cat))return 'Magic Items'; if(['Weapons','Ranged Weapon','Ammunition','Armor','Gear','Machine','Enchantment','Alchemical Items','Artifacts','Magic Items','Food','Collections','Misc'].includes(cat))return cat; return cat||'Misc';}
function inventorySlotForItem(item){const direct=Number(item?.slotAmount ?? item?.raw?.slotAmount ?? item?.raw?.['slot amount'] ?? item?.slot ?? item?.slots ?? item?.bulk); if(Number.isFinite(direct)&&direct>=0)return direct; return isAmmunitionItem(item)?0.05:1;}
function selectedCharacter(){return userCharacters.find(c=>(c.key||c.id)===selectedCharacterId)||userCharacters.find(c=>c.id===selectedCharacterId)||userCharacters[0]||null;}
function canBuyForSelectedCharacter(){return !!selectedCharacter()&&!!currentUser;}
function displayLabelFromKey(key){return String(key||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function detailKeyNorm(k){return String(k||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');}
const DETAIL_SKIP_KEYS=new Set(['id','itemid','sourceitemid','sourceshopid','sourceshopname','name','raw','tag','tags','taglist','shoptags','filtertags','desc','description','descriptions','shortdescription','longdescription','special','text','notes','note','flavor','flavortext','url','href','link','page','source','sourceurl','sourceurls','source_url','source url','detailurl','detail_url','detail url','detailsurl','details_url','openurl','openlink','aonurl','pfsrdurl','ffdnurl','sourcesystem','sourcesystemname','system','category','shopgroup','filtertag','filtertags','type','subtype','kind','proficiency','usagetype','usage_type','usage type','lvl','level','rarity','cost','price','pricegil','unitpricegil','purchasedforgil','purchasedat','createdat','updatedat']);
const DETAIL_USEFUL_KEYS=['damage','dmg','damageDice','damage_dice','dmgDice','dmg_dice','crit','critical','critRange','crit_range','critMultiplier','crit_multiplier','range','rangeIncrement','range_increment','range inc','reach','usage','activation','action','hands','handed','weight','weightLb','weight_lb','bulk','slotAmount','slot_amount','slotsUsed','slots_used','basePrice','base_price','base price','priceMod','price_mod','price mod','mod','bonus','enhancementBonus','enhancement_bonus','acBonus','ac_bonus','armorBonus','armor_bonus','shieldBonus','shield_bonus','maxDex','max_dex','checkPenalty','check_penalty','spellFailure','spell_failure','capacity','reload','ammo','ammunition','hardness','hp','health','breakDc','break_dc','dc','craftDc','craft_dc','saveDc','save_dc','duration','area','target','targets','effect','save','savingThrow','saving_throw','resistance','resist','charges','uses','usesPerDay','uses_per_day','cl','casterLevel','caster_level','aura','school','weightClass','weaponGroup','weapon_group','armorType','armor_type','speedPenalty','speed_penalty'];
function isUsefulDetailKey(k){const n=detailKeyNorm(k); if(!n||DETAIL_SKIP_KEYS.has(n))return false; return DETAIL_USEFUL_KEYS.map(detailKeyNorm).includes(n)||/(damage|dmg|crit|range|reach|weight|bulk|slotamount|slotsused|hands|bonus|penalty|failure|capacity|reload|ammo|hardness|hp|dc|duration|area|target|save|resist|charges|uses|casterlevel|aura|school|armor|weapon|speed)/i.test(String(k));}
function cleanDetailValue(v){if(v===undefined||v===null)return ''; if(Array.isArray(v))return v.filter(x=>x!==undefined&&x!==null&&String(x).trim()).join(', '); if(typeof v==='object')return ''; return String(v).trim();}
function looksLikeUrl(v){return /^(https?:\/\/|www\.|\/)/i.test(String(v||'').trim());}
function firstDetailValue(item,keys){for(const key of keys){const v=lookupField(item,[key]); const val=cleanDetailValue(v); if(val&&!looksLikeUrl(val)&&val!=='—'&&val.toLowerCase()!=='nan')return val;} return '';}
function armorSpeedValue(item){const direct=firstDetailValue(item,["speed","speedPenalty","speed penalty"]); if(direct)return direct; const s30=firstDetailValue(item,["speed30Ft","speed 30 ft","speed30"]); const s20=firstDetailValue(item,["speed20Ft","speed 20 ft","speed20"]); return [s30?`30 ft: ${s30}`:'',s20?`20 ft: ${s20}`:''].filter(Boolean).join(' / ');}
function collectDisplayFields(item){const rows=[]; const config=DETAIL_FIELDS_BY_CATEGORY[item?.category]||[]; const seen=new Set(); for(const [label,keys] of config){let val=label==='Speed'&&item?.category==='Armor'?armorSpeedValue(item):firstDetailValue(item,keys); if(!val)continue; const sig=`${label}:${val}`.toLowerCase(); if(seen.has(sig))continue; seen.add(sig); rows.push([label,val]);} return rows;}
function itemDetailsHtml(item){const rows=collectDisplayFields(item); if(!rows.length)return ''; return `<h4>Details</h4><div class="item-detail-grid">${rows.map(([k,v])=>`<div class="item-detail-cell"><small>${esc(k)}</small><span>${esc(v)}</span></div>`).join('')}</div>`;}
function buildPurchasedItem(item,qty,total,shop){const tag=inventoryTagForItem(item);const details=collectDisplayFields(item).map(([label,value])=>({label,value}));return {name:item.name||'Unnamed Item',tags:tag,tagList:[tag,item.category,item.shopGroup,item.secondaryType,item.type,item.slot,item.proficiency,item.usageType,item.rarity,item.sourceSystem,item.lvl?`Lvl ${item.lvl}`:''].filter(Boolean),amount:qty,slot:inventorySlotForItem(item),cost:getDisplayCost(item),unitPriceGil:getPrice(item),purchasedForGil:total,equipped:false,details,desc:[item.desc,item.special?`Special: ${item.special}`:''].filter(Boolean).join('\n\n'),link:item.sourceUrl||'',sourceItemId:item.id,sourceCategory:item.category||'',sourceShopId:shop?.id||'',sourceShopName:shop?.name||'',purchasedAt:new Date().toISOString()};}
function mergePurchasedItem(items,purchased){const next=Array.isArray(items)?items.map(i=>({...i})):[];const existing=next.find(i=>!i.equipped&&i.sourceItemId&&i.sourceItemId===purchased.sourceItemId&&i.tags===purchased.tags);if(existing){existing.amount=(Number(existing.amount)||1)+(Number(purchased.amount)||1);existing.purchasedForGil=(Number(existing.purchasedForGil)||0)+(Number(purchased.purchasedForGil)||0);existing.purchasedAt=purchased.purchasedAt;}else next.push(purchased);return next;}
function showPurchaseToast(itemName,total,qty){const old=document.querySelector('.purchase-toast'); if(old)old.remove(); const wrap=document.createElement('div');wrap.className='purchase-toast';wrap.innerHTML=`<div class="purchase-toast-card"><div class="purchase-toast-title">Purchase Complete</div><div class="purchase-toast-lines"><div class="lost">-${Number(total).toLocaleString()} Gil</div><div class="gain">+${qty} ${esc(itemName)}</div></div></div>`;document.body.appendChild(wrap);setTimeout(()=>wrap.remove(),1900);}
async function purchaseShopItem(id,explicitShopId=''){
  if(purchaseInFlight)return;
  purchaseInFlight=true;
  document.body.classList.add('shop-purchase-busy');
  try{
    if(!currentUser)return showAlert('Sign In Required','Sign in before buying items.');
    const ch=selectedCharacter();
    if(!ch)return showAlert('No Character','Choose a character before buying.');
    const item=allShopItemsById.get(id);
    if(!item)return showAlert('Missing Item','This item could not be found in the master database.');
    const unitPrice=getPrice(item);
    if(!unitPrice)return showAlert('Missing Price','This item has no gil price.');
    const qty=await askPurchaseQuantity(item,unitPrice);
    if(!qty)return;
    const total=unitPrice*qty;
    const ownerUid=ch.ownerUid||currentUser.uid;
    const charRef=doc(db,'users',ownerUid,'characters',ch.id);
    const snap=await getDoc(charRef);
    if(!snap.exists())return showAlert('Character Missing','That character no longer exists.');
    const latest={id:ch.id,key:ch.key||`${ownerUid}::${ch.id}`,ownerUid,ownerLabel:ch.ownerLabel,ownerEmail:ch.ownerEmail,...snap.data()};
    const gil=getGil(latest);
    if(gil<total)return showAlert('Not Enough Gil',`${latest.charName||'This character'} has ${gil.toLocaleString()} gil, but this costs ${total.toLocaleString()} gil.`);
    const shop=findShop(explicitShopId)||findShop(selectedShopId());
    const purchased=buildPurchasedItem(item,qty,total,shop);
    const nextItems=mergePurchasedItem(latest.items,purchased);
    const nextGil=gil-total;
    await updateDoc(charRef,{items:nextItems,currency_gil:nextGil,gil:nextGil,updatedAt:new Date()});
    Object.assign(ch,{...latest,items:nextItems,currency_gil:nextGil,gil:nextGil});
    const gilEl=document.getElementById(isShopBuilderMode()?'adminBuyerGil':'characterGil');
    if(gilEl)gilEl.textContent=`Gil: ${nextGil.toLocaleString()}`;
    showPurchaseToast(item.name||'Item',total,qty);
  }catch(error){
    console.error(error);
    showAlert('Purchase Failed',error.message||String(error));
  }finally{
    purchaseInFlight=false;
    document.body.classList.remove('shop-purchase-busy');
  }
}
window.buyShopItem=id=>purchaseShopItem(id,'');
function addTagPill(list,label,value,cls=''){const val=String(value??'').trim(); if(!val)return; const text=label?`${label}: ${val}`:val; const sig=text.toLowerCase(); if(list.some(p=>p.sig===sig))return; list.push({text,value:val,cls,sig});}
function tagValueForField(item,field){return itemField(item,field);}
function itemTagPills(item){const list=[]; const fields=TAGS_BY_CATEGORY[item?.category]||["type","secondaryType","sourceSystem","lvl","rarity"]; fields.forEach(field=>{const label=FILTER_LABELS[field]||displayLabelFromKey(field); const val=tagValueForField(item,field); const cls=field==='sourceSystem'?'info':field==='lvl'?'good':field==='rarity'?'warn':''; addTagPill(list,label,val,cls);}); return list;}
function cleanLongText(v){const s=String(v||'').trim(); if(!s)return ''; return s;}
window.openItemModal=(id)=>{const item=allShopItemsById.get(id); if(!item)return; const buyAction=canBuyForSelectedCharacter()?`<button class="shop-btn buy-modal-btn" onclick="event.stopPropagation();buyShopItem('${item.id}')">Buy</button>`:''; document.getElementById('itemModalTitle').innerHTML=`<span>${esc(item.name||'Item')}</span>${buyAction}`; const title=document.getElementById('itemModalTitle'); if(title)title.className='item-modal-title-row'; const pills=itemTagPills(item); const desc=cleanLongText(item.desc); const special=cleanLongText(item.special); document.getElementById('itemModalBody').innerHTML=`<div class="price-badge modal-price">${esc(getDisplayCost(item))}</div><div class="item-meta modal-meta">${pills.map(p=>`<span class="tag-pill ${esc(p.cls)}">${esc(p.text)}</span>`).join('')}</div>${itemDetailsHtml(item)}${desc?`<h4>Description</h4><p>${esc(desc)}</p>`:''}${special&&special!==desc?`<h4>Special</h4><p>${esc(special)}</p>`:''}${item.sourceUrl?`<p><a href="${esc(item.sourceUrl)}" target="_blank" class="source-link">Open Source</a></p>`:''}`; document.getElementById('itemModal').style.display='flex';};
window.closeItemModal=(event,force=false)=>{if(force||event.target.id==='itemModal'){document.getElementById('itemModal').style.display='none';}};
function renderAdminBuilder(){if(!isAdmin)return; renderCategoryNav(); renderFilterGroups(); renderBuilderItems(); updateShopTagPreview();}
function categoryItemCount(cat){return allShopItems.filter(i=>i.category===cat).length;}
function renderCategoryNav(){const nav=document.getElementById('categoryNav'); if(!nav)return; nav.innerHTML=Object.entries(SHOP_GROUPS).map(([group,cats])=>`<div class="shop-group-title">${esc(group)}</div><div class="category-button-grid">${cats.map(cat=>`<button class="category-btn ${cat===selectedCategory?'active':''}" onclick="setBuilderCategory('${cat}')">${esc(cat)} <span class="cat-count">(${categoryItemCount(cat)})</span></button>`).join('')}</div>`).join('');}
window.setBuilderCategory=(cat)=>{selectedCategory=cat; activeFilters={}; const s=document.getElementById('itemSearchInput'); if(s)s.value=''; renderAdminBuilder();};
function builderCandidateForField(cat,field){return allShopItems.filter(i=>i.category===cat).filter(item=>Object.entries(activeFilters).every(([f,set])=>f===field||!set.size||set.has(itemFilterValue(item,f))));}
function valuesForField(cat,field){const vals=new Set(); builderCandidateForField(cat,field).forEach(i=>{const v=itemFilterValue(i,field); if(v)vals.add(v);}); return [...vals].sort((a,b)=>field==='lvl'?(Number(a)-Number(b)):String(a).localeCompare(String(b)));}
function renderFilterGroups(){const title=document.getElementById('builderTitle'); if(title)title.textContent=selectedCategory; const wrap=document.getElementById('filterGroups'); if(!wrap)return; const fields=FILTERS_BY_CATEGORY[selectedCategory]||['type','lvl','rarity','sourceSystem']; wrap.innerHTML=fields.map(field=>{const vals=valuesForField(selectedCategory,field); if(!vals.length)return ''; const active=activeFilters[field]||new Set(); return `<div class="filter-group"><div class="filter-group-title">${esc(FILTER_LABELS[field]||field)}</div><div class="filter-chip-row">${vals.map(v=>`<button class="filter-chip ${active.has(v)?'active':''}" onclick="toggleFilter('${field}', '${esc(String(v)).replace(/'/g,'&#39;')}')">${esc(field==='lvl'?'Lvl '+v:v)}</button>`).join('')}</div></div>`;}).join(''); updateActiveFilterPills();}
window.toggleFilter=(field,value)=>{if(!activeFilters[field])activeFilters[field]=new Set(); activeFilters[field].has(value)?activeFilters[field].delete(value):activeFilters[field].add(value); renderFilterGroups(); renderBuilderItems();};
window.clearAllFilters=()=>{activeFilters={}; const s=document.getElementById('itemSearchInput'); if(s)s.value=''; renderFilterGroups(); renderBuilderItems();};
function updateActiveFilterPills(){const out=document.getElementById('activeFilterPills'); if(!out)return; const pills=[]; for(const [field,set] of Object.entries(activeFilters)){for(const v of set)pills.push(`<span class="tag-pill info">${esc(FILTER_LABELS[field]||field)}: ${esc(v)}</span>`);} out.innerHTML=pills.join('')||'<span class="shop-note">None</span>';}
function itemMatchesFilters(item){
  if(item.category!==selectedCategory)return false;
  if(builderViewMode==='selected'&&!selectedItemIds.has(item.id))return false;
  for(const [field,set] of Object.entries(activeFilters)){
    if(set.size&&!set.has(itemFilterValue(item,field)))return false;
  }
  const search=String(document.getElementById('itemSearchInput')?.value||'').trim().toLowerCase();
  if(search){
    const blob=[item.name,item.desc,item.special,item.type,item.secondaryType,item.filterTag,item.slot,item.rarity,item.sourceSystem,item.proficiency,item.usageType,item.tier,item.category,item.shopGroup,item.sourceUrl,item.id].join(' ').toLowerCase();
    if(!blob.includes(search))return false;
  }
  return true;
}
function compareBuilderItems(a,b){
  if(builderSort==='gilAsc')return getPrice(a)-getPrice(b)||String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'});
  if(builderSort==='gilDesc')return getPrice(b)-getPrice(a)||String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'});
  return String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'})||getPrice(a)-getPrice(b);
}
window.setBuilderSort=(value)=>{builderSort=value||'nameAsc';renderBuilderItems();};
window.setBuilderViewMode=(mode)=>{
  builderViewMode=mode==='selected'?'selected':'all';
  renderBuilderItems();
};
function syncBuilderViewControls(){
  const allBtn=document.getElementById('builderViewAllBtn');
  const selectedBtn=document.getElementById('builderViewSelectedBtn');
  if(allBtn){
    allBtn.classList.toggle('secondary',builderViewMode!=='all');
  }
  if(selectedBtn){
    selectedBtn.classList.toggle('secondary',builderViewMode!=='selected');
    selectedBtn.textContent=`Selected Only (${selectedItemIds.size})`;
  }
}
function syncBuilderSortControl(){const sortEl=document.getElementById('builderSortInput'); if(sortEl&&sortEl.value!==builderSort)sortEl.value=builderSort;}
function renderBuilderItems(){
  const list=document.getElementById('builderItemList');
  if(!list)return;
  syncBuilderSortControl();
  syncBuilderViewControls();

  const items=allShopItems.filter(itemMatchesFilters).sort(compareBuilderItems);
  visibleBuilderIds=items.map(i=>i.id);

  const count=document.getElementById('builderCount');
  if(count){
    count.textContent=`${items.length.toLocaleString()} visible • ${selectedItemIds.size.toLocaleString()} selected • ${allShopItems.length.toLocaleString()} master`;
  }
  const selectedCount=document.getElementById('gmSelectedItemCount');
  if(selectedCount){
    selectedCount.textContent=`${selectedItemIds.size.toLocaleString()} item${selectedItemIds.size===1?'':'s'} selected`;
  }

  if(!items.length){
    const message=builderViewMode==='selected'
      ? 'No selected items match this category or filter.'
      : 'No items match this category or filter.';
    list.innerHTML=`<div class="empty-msg">${message}<br><br><strong>Loaded category counts:</strong><br>${esc(categoryDebugText())}</div>`;
    return;
  }

  list.innerHTML=items.slice(0,600).map(renderBuilderItemRow).join('')+
    (items.length>600?'<div class="empty-msg">Showing first 600. Use filters or search to narrow the catalog.</div>':'');
}
function renderBuilderItemRow(item){const checked=selectedItemIds.has(item.id); return `<div class="compact-item-row builder-row-item ${checked?'selected':''}"><label><input type="checkbox" ${checked?'checked':''} onchange="toggleItemSelect('${item.id}',this.checked)"><button type="button" class="item-name-link" onclick="event.preventDefault();openItemModal('${item.id}')">${esc(item.name)}</button></label><span class="compact-price">${esc(getDisplayCost(item))}</span></div>`;}
window.toggleItemSelect=(id,checked)=>{checked?selectedItemIds.add(id):selectedItemIds.delete(id); renderBuilderItems();};
window.selectVisibleItems=()=>{visibleBuilderIds.forEach(id=>selectedItemIds.add(id)); renderBuilderItems();};
window.unselectVisibleItems=()=>{visibleBuilderIds.forEach(id=>selectedItemIds.delete(id)); renderBuilderItems();};
window.clearSelection=()=>{selectedItemIds.clear(); renderBuilderItems();};
function updateShopTagPreview(){
  const input=document.getElementById('shopNameInput');
  const tag=normalizeShopTag(input?.value||'');
  const el=document.getElementById('shopTagPreview');
  if(el)el.textContent='';
}
document.getElementById('shopNameInput').addEventListener('input',updateShopTagPreview);
window.cancelEditShop=()=>{
  editingShopId=null;
  selectedItemIds.clear();
  builderViewMode='all';
  const name=document.getElementById('shopNameInput');
  if(name)name.value='';
  const save=document.getElementById('saveShopBtn');
  if(save)save.textContent='Save Shop';
  document.getElementById('editShopNotice')?.classList.add('hidden');
  document.getElementById('adminBuilderBody')?.classList.add('collapsed');
  updateShopTagPreview();
  renderBuilderItems();
};
window.saveShopSession=async()=>{if(!isAdmin)return; const name=document.getElementById('shopNameInput').value.trim(); if(!name)return showAlert('Missing Shop Name','Add a shop name first.'); if(!selectedItemIds.size)return showAlert('No Items Selected','Select at least one item for this shop.'); const payload={name,itemIds:[...selectedItemIds],active:true,updatedAt:new Date(),createdBy:currentUser?.email||''}; if(editingShopId){await updateDoc(doc(db,'shopSessions',editingShopId),{...payload,expiresAt:deleteField()});}else{await addDoc(collection(db,'shopSessions'),{...payload,createdAt:new Date()});} await loadShopData(); const msg=`${editingShopId?'Updated':'Created'} ${name}\nItems: ${selectedItemIds.size}`; cancelEditShop(); showAlert('Shop Saved',msg);};
window.deleteSelectedShop=()=>{const id=selectedShopId(); if(id)deleteShopSession(id);};
window.deleteShopSession=(id)=>showConfirm('Delete Shop','Delete this shop? Master items will stay in the database.',async()=>{await deleteDoc(doc(db,'shopSessions',id));await loadShopData();});
window.reloadMasterCatalog=async()=>{
  if(!isShopBuilderMode())return;
  try{
    await loadShopItems();
    renderAdminBuilder();
    renderSelectedShop();
    renderGmDashboardStats();
    showAlert('Catalog Reloaded',`${allShopItems.length.toLocaleString()} items loaded from ${MASTER_ITEMS_PATH}.`);
  }catch(error){
    console.error(error);
    showAlert('Catalog Load Failed',error.message||String(error));
  }
};

// --- Regions / Party-based shop visibility ---
function draftRegionRuleSet(partyTag){
  const tag=normalizeShopTag(partyTag);
  if(!tag)return new Set();
  if(!regionDraftAccess[tag])regionDraftAccess[tag]=new Set();
  return regionDraftAccess[tag];
}
function regionAccessObject(region){
  const out={};
  (region?.accessRules||[]).forEach(rule=>{
    const tag=normalizeShopTag(rule.partyTag);
    if(tag)out[tag]=new Set((rule.shopIds||[]).map(String));
  });
  return out;
}
function selectedRegion(){
  const id=document.getElementById('adminRegionSelect')?.value||'';
  return allShopRegions.find(region=>region.id===id)||null;
}
function renderRegionShopPicks(){
  const picks=document.getElementById('regionShopPicks');
  if(!picks)return;
  const partyTag=normalizeShopTag(selectedRegionPartyTag||document.getElementById('regionPartySelect')?.value||'');
  if(!partyTag){
    picks.innerHTML='<span class="shop-note">Select a party.</span>';
    return;
  }
  const selected=draftRegionRuleSet(partyTag);
  picks.innerHTML=allShops.length
    ? allShops.map(shop=>`<label><input type="checkbox" value="${esc(shop.id)}" ${selected.has(String(shop.id))?'checked':''} onchange="toggleRegionPartyShop('${esc(shop.id)}',this.checked)"> ${esc(shop.name||'Unnamed Shop')}</label>`).join('')
    : '<span class="shop-note">Create an individual shop first.</span>';
}
function renderRegionManager(){
  if(!isShopBuilderMode())return;
  const regionSelect=document.getElementById('adminRegionSelect');
  if(regionSelect){
    const previous=regionSelect.value;
    regionSelect.innerHTML=allShopRegions.length
      ? allShopRegions.map(region=>`<option value="${esc(region.id)}">${esc(region.name||'Unnamed Region')}</option>`).join('')
      : '<option value="">No regions</option>';
    if(previous && allShopRegions.some(region=>region.id===previous))regionSelect.value=previous;
  }

  const partySelect=document.getElementById('regionPartySelect');
  if(partySelect){
    const previous=selectedRegionPartyTag||partySelect.value;
    partySelect.innerHTML='<option value="">Select a party</option>'+
      allPartyGroups.map(group=>`<option value="${esc(normalizeShopTag(group.name))}">${esc(group.name)}</option>`).join('');
    if(previous && allPartyGroups.some(group=>normalizeShopTag(group.name)===previous)){
      partySelect.value=previous;
      selectedRegionPartyTag=previous;
    }
  }
  renderRegionShopPicks();
}
window.changeRegionParty=value=>{
  selectedRegionPartyTag=normalizeShopTag(value);
  renderRegionShopPicks();
};
window.toggleRegionPartyShop=(shopId,checked)=>{
  const partyTag=normalizeShopTag(selectedRegionPartyTag||document.getElementById('regionPartySelect')?.value||'');
  if(!partyTag)return;
  const selected=draftRegionRuleSet(partyTag);
  checked?selected.add(String(shopId)):selected.delete(String(shopId));
};
window.startCreateRegion=()=>{
  setGmShopTab('region');
  editingRegionId=null;
  regionDraftAccess={};
  const name=document.getElementById('regionNameInput');
  if(name)name.value='';
  selectedRegionPartyTag=normalizeShopTag(allPartyGroups[0]?.name||'');
  const partySelect=document.getElementById('regionPartySelect');
  if(partySelect)partySelect.value=selectedRegionPartyTag;
  document.getElementById('regionEditorPanel')?.classList.remove('collapsed');
  renderRegionShopPicks();
  name?.focus();
};
window.editSelectedRegion=()=>{
  const region=selectedRegion();
  if(!region)return showAlert('No Region','Create or select a region first.');
  setGmShopTab('region');
  editingRegionId=region.id;
  regionDraftAccess=regionAccessObject(region);
  const name=document.getElementById('regionNameInput');
  if(name)name.value=region.name||'';
  selectedRegionPartyTag=Object.keys(regionDraftAccess)[0]||normalizeShopTag(allPartyGroups[0]?.name||'');
  const partySelect=document.getElementById('regionPartySelect');
  if(partySelect)partySelect.value=selectedRegionPartyTag;
  document.getElementById('regionEditorPanel')?.classList.remove('collapsed');
  renderRegionShopPicks();
};
window.cancelRegionEdit=()=>{
  editingRegionId=null;
  regionDraftAccess={};
  selectedRegionPartyTag='';
  const name=document.getElementById('regionNameInput');
  if(name)name.value='';
  document.getElementById('regionEditorPanel')?.classList.add('collapsed');
  renderRegionManager();
};
window.saveRegion=async()=>{
  if(!isShopBuilderMode())return;
  const name=String(document.getElementById('regionNameInput')?.value||'').trim();
  if(!name)return showAlert('Missing Region Name','Enter a region name.');
  const accessRules=Object.entries(regionDraftAccess)
    .map(([partyTag,ids])=>({partyTag:normalizeShopTag(partyTag),shopIds:[...ids].map(String)}))
    .filter(rule=>rule.partyTag && rule.shopIds.length);
  if(!accessRules.length)return showAlert('No Party Access','Choose a party and at least one shop it can see.');
  const shopIds=[...new Set(accessRules.flatMap(rule=>rule.shopIds))];
  const payload={
    name,
    accessRules,
    shopIds,
    regionVersion:1,
    updatedAt:new Date(),
    updatedBy:currentUser?.email||''
  };
  if(editingRegionId){
    await setDoc(doc(db,'shopAccessGroups',editingRegionId),payload,{merge:true});
  }else{
    await addDoc(collection(db,'shopAccessGroups'),{...payload,createdAt:new Date()});
  }
  await loadShopRegions();
  renderRegionManager();
  cancelRegionEdit();
  showAlert('Region Saved',name);
};
window.deleteSelectedRegion=()=>{
  const region=selectedRegion();
  if(!region)return;
  showConfirm('Delete Region',`Delete "${region.name}"? Individual shops remain.`,async()=>{
    await deleteDoc(doc(db,'shopAccessGroups',region.id));
    if(editingRegionId===region.id)editingRegionId=null;
    adminPreviewRegionId='';
    await loadShopRegions();
    renderRegionManager();
    renderSelectedShop();
  });
};

// --- Information Links patch ---
const INFO_LINKS_DOC_ID='config';
const DEFAULT_INFO_LINK_GROUPS=[
  {title:'Name 1',links:[]},
  {title:'Name 2',links:[]},
  {title:'Name 3',links:[]},
  {title:'Name 4',links:[]}
];
let informationLinkGroups=DEFAULT_INFO_LINK_GROUPS.map(g=>({title:g.title,links:[]}));
function normalizeInfoGroups(data){
  const source=Array.isArray(data?.groups)?data.groups:[];
  const groups=[];
  for(let i=0;i<4;i++){
    const g=source[i]||DEFAULT_INFO_LINK_GROUPS[i];
    groups.push({title:String(g?.title||DEFAULT_INFO_LINK_GROUPS[i].title),links:Array.isArray(g?.links)?g.links.map(l=>({name:String(l?.name||'').trim(),url:String(l?.url||'').trim()})).filter(l=>l.name&&l.url):[]});
  }
  return groups;
}
function ensureInfoUrl(url){
  const u=String(url||'').trim();
  if(!u)return '';
  if(/^https?:\/\//i.test(u))return u;
  return 'https://'+u;
}
async function loadInformationLinks(){
  try{
    const snap=await getDoc(doc(db,'informationLinks',INFO_LINKS_DOC_ID));
    informationLinkGroups=normalizeInfoGroups(snap.exists()?snap.data():null);
  }catch(e){console.warn('Information links load failed',e);informationLinkGroups=normalizeInfoGroups(null);}
  renderInformationLinks();
}
async function saveInformationLinks(){
  if(!isAdmin)return;
  await setDoc(doc(db,'informationLinks',INFO_LINKS_DOC_ID),{groups:informationLinkGroups,updatedAt:new Date(),updatedBy:currentUser?.email||''},{merge:true});
  renderInformationLinks();
}
function renderInformationLinks(){
  document.body.classList.toggle('info-admin',!!isAdmin);
  const grid=document.getElementById('informationLinksGrid');
  if(!grid)return;
  grid.innerHTML=informationLinkGroups.map((group,groupIndex)=>`<article class="info-link-card"><div class="info-link-card-head"><div class="info-link-card-title">${esc(group.title||('Name '+(groupIndex+1)))}</div><div class="info-link-card-actions"><button class="info-link-mini-btn" type="button" onclick="renameInfoGroup(${groupIndex})">Rename</button><button class="info-link-mini-btn" type="button" onclick="addInfoLink(${groupIndex})">+ Link</button><button class="info-link-mini-btn" type="button" onclick="sortInfoLinks(${groupIndex})">A-Z</button></div></div><div class="info-link-list">${group.links.length?group.links.map((link,linkIndex)=>`<div class="info-link-item"><a href="${esc(ensureInfoUrl(link.url))}" target="_blank" rel="noopener">${esc(link.name)}</a><div class="info-link-actions"><button class="info-link-mini-btn" type="button" onclick="editInfoLink(${groupIndex},${linkIndex})">Edit</button><button class="info-link-mini-btn" type="button" onclick="deleteInfoLink(${groupIndex},${linkIndex})">Del</button></div></div>`).join(''):'<div class="info-link-empty">No links yet.</div>'}</div></article>`).join('');
}
window.renameInfoGroup=async(groupIndex)=>{
  if(!isAdmin)return;
  const current=informationLinkGroups[groupIndex]?.title||`Name ${groupIndex+1}`;
  const next=prompt('Box name:',current);
  if(next===null)return;
  informationLinkGroups[groupIndex].title=String(next).trim()||current;
  await saveInformationLinks();
};
window.addInfoLink=async(groupIndex)=>{
  if(!isAdmin)return;
  const name=prompt('Link display name:');
  if(name===null||!String(name).trim())return;
  const url=prompt('Link URL:');
  if(url===null||!String(url).trim())return;
  informationLinkGroups[groupIndex].links.push({name:String(name).trim(),url:ensureInfoUrl(url)});
  await saveInformationLinks();
};
window.editInfoLink=async(groupIndex,linkIndex)=>{
  if(!isAdmin)return;
  const link=informationLinkGroups[groupIndex]?.links?.[linkIndex];
  if(!link)return;
  const name=prompt('Link display name:',link.name);
  if(name===null||!String(name).trim())return;
  const url=prompt('Link URL:',link.url);
  if(url===null||!String(url).trim())return;
  informationLinkGroups[groupIndex].links[linkIndex]={name:String(name).trim(),url:ensureInfoUrl(url)};
  await saveInformationLinks();
};
window.deleteInfoLink=(groupIndex,linkIndex)=>{
  if(!isAdmin)return;
  const link=informationLinkGroups[groupIndex]?.links?.[linkIndex];
  if(!link)return;
  showConfirm('Delete Link',`Delete "${link.name}"?`,async()=>{informationLinkGroups[groupIndex].links.splice(linkIndex,1);await saveInformationLinks();});
};
window.sortInfoLinks=async(groupIndex)=>{
  if(!isAdmin)return;
  informationLinkGroups[groupIndex].links.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
  await saveInformationLinks();
};


onAuthStateChanged(auth,async user=>{currentUser=user||null; const link=document.getElementById('authLink'),mLink=document.getElementById('mobileAuthLink'); if(user){link.textContent='My Account';link.href='account.html';mLink.textContent='My Account';mLink.href='account.html';isAdmin=currentUserIsAdmin(user);document.getElementById('adminShopPanel').style.display=(!TOOLS_EMBED_SHOP&&isAdmin)?'block':'none';const ident=document.getElementById('adminIdentityStatus');if(ident)ident.textContent=`Signed in as ${user.email||'no email'} • UID ${user.uid} • Admin ${isAdmin?'yes':'no'}`;}else{link.textContent='Sign In';link.href='signin.html';mLink.textContent='Sign In';mLink.href='signin.html';isAdmin=false;document.getElementById('adminShopPanel').style.display='none';const ident=document.getElementById('adminIdentityStatus');if(ident)ident.textContent='Not signed in.';} document.body.classList.toggle('tools-admin',!TOOLS_EMBED_SHOP&&isAdmin);document.body.classList.toggle('tools-player',!TOOLS_EMBED_SHOP&&!isAdmin);await loadInformationLinks(); if(TOOLS_EMBED_SHOP||isAdmin){await loadShopData();} if(TOOLS_EMBED_SHOP||location.hash==='#shop'||location.hash.includes('shop='))activateTab('shop'); else activateTab('links');});
function activateTab(id){document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.id===id)); if(id==='shop')loadShopData();}
document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>activateTab(btn.dataset.tab)));



// --- v18 restore admin builder controls removed during permanent-shop cleanup ---
window.startCreateShop=()=>{
  if(!isShopBuilderMode())return;
  setGmShopTab('individual');
  editingShopId=null;
  selectedItemIds.clear();
  builderViewMode='all';
  const name=document.getElementById('shopNameInput');
  if(name)name.value='';
  const save=document.getElementById('saveShopBtn');
  if(save)save.textContent='Save Shop';
  const notice=document.getElementById('editShopNotice');
  if(notice){
    notice.classList.remove('hidden');
    notice.textContent='Creating a new shop';
  }
  openAdminBuilder();
  updateShopTagPreview();
  renderAdminBuilder();
  name?.focus();
};
window.previewSelectedShopGm=()=>{
  clearRegionPreview();
  renderSelectedShop();
  document.getElementById('shopView')?.scrollIntoView({behavior:'smooth',block:'start'});
};

window.toggleAdminBuilder=()=>{
  const body=document.getElementById('adminBuilderBody');
  if(!body)return;
  body.classList.toggle('collapsed');
};
function openAdminBuilder(){
  const body=document.getElementById('adminBuilderBody');
  if(!body)return;
  body.classList.remove('collapsed');
}
window.startEditSelectedShop=(id)=>{
  if(!isShopBuilderMode())return;
  setGmShopTab('individual');
  const shop=id?findShop(id):findShop(document.getElementById('adminShopSelect')?.value);
  if(!shop)return showAlert('No Shop Selected','Choose a shop first.');
  editingShopId=shop.id;
  builderViewMode='all';
  selectedItemIds=new Set(Array.isArray(shop.itemIds)?shop.itemIds:[]);
  const name=document.getElementById('shopNameInput');
  if(name)name.value=shop.name||'';
  const save=document.getElementById('saveShopBtn');
  if(save)save.textContent='Save Shop';
  const notice=document.getElementById('editShopNotice');
  if(notice){
    notice.classList.remove('hidden');
    notice.textContent=`Editing: ${shop.name||'Unnamed Shop'} • ${selectedItemIds.size} selected item(s)`;
  }
  openAdminBuilder();
  renderAdminBuilder();
  updateShopTagPreview();
};

// --- Embedded Regions and admin preview ---
const EMBED_CHARACTER_ID_V16 = new URLSearchParams(window.location.search).get('character') || '';
const EMBED_OWNER_UID_V18 = new URLSearchParams(window.location.search).get('owner') || '';
let adminPreviewRegionId='';
let renderingBundleShopIdV16='';
let selectedRegionShop={};

const loadUserCharactersV15=loadUserCharacters;
loadUserCharacters=async function(){
  if(TOOLS_EMBED_SHOP && EMBED_OWNER_UID_V18 && EMBED_CHARACTER_ID_V16 && isAdmin){
    try{
      const targetSnap=await getDoc(doc(db,'users',EMBED_OWNER_UID_V18,'characters',EMBED_CHARACTER_ID_V16));
      if(targetSnap.exists()){
        const data=targetSnap.data()||{};
        userCharacters=[{id:EMBED_CHARACTER_ID_V16,key:`${EMBED_OWNER_UID_V18}::${EMBED_CHARACTER_ID_V16}`,ownerUid:EMBED_OWNER_UID_V18,ownerLabel:'Selected Character',...data}];
        selectedCharacterId=userCharacters[0].key;
        return;
      }
    }catch(error){console.warn('Could not load selected admin preview character',error);}
  }
  await loadUserCharactersV15();
  if(TOOLS_EMBED_SHOP && EMBED_CHARACTER_ID_V16){
    const matched=userCharacters.find(c=>c.id===EMBED_CHARACTER_ID_V16||c.key===EMBED_CHARACTER_ID_V16||c.key===`${currentUser?.uid}::${EMBED_CHARACTER_ID_V16}`);
    if(matched)selectedCharacterId=matched.key||matched.id;
  }
};

const renderCharacterBoxV15=renderCharacterBox;
renderCharacterBox=function(){
  if(!TOOLS_EMBED_SHOP)return renderCharacterBoxV15();
  const sel=document.getElementById('shopCharacterSelect');
  const gilEl=document.getElementById('characterGil');
  const nameEl=document.getElementById('embeddedCharacterName');
  if(!currentUser||!userCharacters.length){
    if(sel)sel.innerHTML='<option>No character available</option>';
    if(gilEl)gilEl.textContent='Gil: 0';
    if(nameEl)nameEl.textContent='No Character';
    return null;
  }
  const selected=selectedCharacter()||userCharacters[0];
  selectedCharacterId=selected?.key||selected?.id||null;
  if(sel)sel.innerHTML=`<option value="${esc(selectedCharacterId||'')}">${esc(selected?.charName||'Character')}</option>`;
  if(nameEl)nameEl.textContent=selected?.charName||'Character';
  if(gilEl)gilEl.textContent=`Gil: ${getGil(selected).toLocaleString()}`;
  return selected;
};

const renderShopDropdownsV15=renderShopDropdowns;
renderShopDropdowns=function(character){
  if(!TOOLS_EMBED_SHOP)return renderShopDropdownsV15(character);
  const sel=document.getElementById('shopSelect');
  if(!sel)return;
  const regions=visibleRegions(character);
  const previous=String(sel.value||'').replace(/^region:/,'');
  sel.innerHTML=regions.length
    ? regions.map(region=>`<option value="region:${esc(region.id)}">${esc(region.name||'Unnamed Region')}</option>`).join('')
    : '<option value="">No regions available</option>';
  if(previous && regions.some(region=>region.id===previous))sel.value=`region:${previous}`;
  else if(regions[0])sel.value=`region:${regions[0].id}`;
};

function regionItemRow(item,shopId){
  const buyBtn=`<button class="shop-buy-btn" onclick="event.stopPropagation();buyShopItemFromRegion('${shopId}','${item.id}')">Buy</button>`;
  return `<div class="compact-item-row"><button class="item-name-link" onclick="openRegionItem('${shopId}','${item.id}')">${esc(item.name)}</button><div class="shop-price-buy"><span class="compact-price">${esc(getDisplayCost(item))}</span>${buyBtn}</div></div>`;
}
const renderItemRowV15=renderItemRow;
renderItemRow=function(item){
  return renderingBundleShopIdV16?regionItemRow(item,renderingBundleShopIdV16):renderItemRowV15(item);
};

function selectedShopForRegion(region,shops){
  if(!shops.length)return null;
  const current=selectedRegionShop[region.id];
  const selected=shops.find(shop=>shop.id===current)||shops[0];
  selectedRegionShop[region.id]=selected.id;
  return selected;
}
window.selectRegionShop=(regionId,shopId)=>{
  selectedRegionShop[regionId]=shopId;
  renderSelectedShop();
};

function renderRegionPreview(region,character,adminView=false){
  const shops=regionShopsForCharacter(region,character);
  const selectedShop=selectedShopForRegion(region,shops);
  const tabs=shops.map(shop=>{
    const active=selectedShop?.id===shop.id;
    return `<button class="shop-tab-v22 ${active?'active':''}" type="button" onclick="selectRegionShop('${esc(region.id)}','${esc(shop.id)}')"><span class="shop-tab-name-v22">${esc(shop.name||'Unnamed Shop')}</span><span class="shop-tab-count-v22">${shopItemsFor(shop).length}</span></button>`;
  }).join('');
  let content='<div class="empty-msg">This party cannot see any shops in this region.</div>';
  if(selectedShop){
    const items=shopItemsFor(selectedShop);
    renderingBundleShopIdV16=selectedShop.id;
    const categories=renderShopCategoriesOnly(selectedShop,items);
    renderingBundleShopIdV16='';
    content=`<div class="shop-stage-summary-v22"><span class="shop-stage-count-v22">${items.length} item${items.length===1?'':'s'}</span></div>${categories}`;
  }
  return `<section class="shop-group-showcase"><div class="shop-group-hero"><div class="shop-group-hero-text"><span class="shop-group-eyebrow">Region</span><h3 class="shop-group-hero-title">${esc(region.name||'Unnamed Region')}</h3></div>${adminView?'<button class="shop-btn secondary shop-group-close" type="button" onclick="clearRegionPreview()">Close</button>':''}</div><div class="shop-group-store-layout-v22"><nav class="shop-tabs-v22" aria-label="Shops in region">${tabs||'<div class="empty-msg">No shops available.</div>'}</nav><section class="shop-stage-v22">${content}</section></div></section>`;
}

window.previewSelectedRegion=()=>{
  const region=selectedRegion();
  if(!region)return showAlert('No Region','Create or select a region first.');
  adminPreviewRegionId=region.id;
  renderSelectedShop();
  document.getElementById('shopView')?.scrollIntoView({behavior:'smooth',block:'start'});
};
window.clearRegionPreview=()=>{
  adminPreviewRegionId='';
  renderSelectedShop();
};

const renderSelectedShopV15=window.renderSelectedShop;
window.renderSelectedShop=()=>{
  const view=document.getElementById('shopView');
  const status=document.getElementById('shopStatus');
  if(TOOLS_EMBED_SHOP){
    const regionId=String(document.getElementById('shopSelect')?.value||'').replace(/^region:/,'');
    const region=allShopRegions.find(item=>item.id===regionId);
    const character=selectedCharacter();
    if(!region||!character){
      if(status)status.textContent='No region is available for this character.';
      if(view)view.innerHTML='';
      return;
    }
    if(status)status.textContent=region.name||'Region';
    if(view)view.innerHTML=renderRegionPreview(region,character,false);
    return;
  }
  if(isShopBuilderMode()&&adminPreviewRegionId){
    const region=allShopRegions.find(item=>item.id===adminPreviewRegionId);
    const character=selectedCharacter();
    if(region&&character){
      if(status)status.textContent=`Preview: ${region.name||'Region'}`;
      if(view)view.innerHTML=renderRegionPreview(region,character,true);
      return;
    }
    adminPreviewRegionId='';
  }
  return renderSelectedShopV15();
};

window.buyShopItemFromRegion=(shopId,itemId)=>purchaseShopItem(itemId,shopId);
window.buyShopItemFromGroupV16=window.buyShopItemFromRegion;
const openItemModalV15=window.openItemModal;
window.openRegionItem=(shopId,itemId)=>{
  openItemModalV15(itemId);
  const button=document.querySelector('#itemModalTitle .buy-modal-btn');
  if(button)button.setAttribute('onclick',`event.stopPropagation();buyShopItemFromRegion('${shopId}','${itemId}')`);
};
window.openBundleItemV16=window.openRegionItem;

/* --- Restaurant-style Food storefront v21 --- */
const renderShopCategoriesOnlyV20 = renderShopCategoriesOnly;
function foodCourseLabelV21(item) {
  const raw = String(itemField(item,'secondaryType') || item?.secondaryType || item?.filterTag || '').trim().toLowerCase().replace(/[–—_]+/g,' ').replace(/\s+/g,' ');
  if (/appeti[sz]er|starter|small plate/.test(raw)) return 'Appetizer';
  if (/dessert|sweet|pastr|cake|confection/.test(raw)) return 'Dessert';
  if (/non\s*[- ]?al(?:co|cho)hol|nonal(?:co|cho)hol|soft drink|juice|coffee|tea|water/.test(raw)) return 'Non-Alcohol';
  if (/al(?:co|cho)hol|beer|wine|liquor|cocktail|spirits?|ale|mead/.test(raw)) return 'Alcohol';
  if (/meal|food|entr[eé]e|main|dish/.test(raw)) return 'Entree';
  return 'Entree';
}
function restaurantItemOpenActionV21(shopId,itemId) {
  if (renderingBundleShopIdV16) return `openBundleItemV16('${shopId}','${itemId}')`;
  return `openItemModal('${itemId}')`;
}
function renderRestaurantFoodMenuV21(shop,items) {
  const order = ['Appetizer','Entree','Dessert','Non-Alcohol','Alcohol'];
  const buckets = Object.fromEntries(order.map(name => [name, []]));
  items.forEach(item => buckets[foodCourseLabelV21(item)].push(item));
  order.forEach(name => buckets[name].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'})));
  const shopId = String(shop?.id || '').replace(/'/g, "\\'");
  const courseHtml = order.map(course => {
    const rows = buckets[course].map(item => {
      const itemId = String(item.id || '').replace(/'/g, "\\'");
      return `<div class="restaurant-menu-row"><button class="restaurant-menu-name" type="button" onclick="${restaurantItemOpenActionV21(shopId,itemId)}">${esc(item.name||'Unnamed Item')}</button><span class="restaurant-menu-dots" aria-hidden="true"></span><span class="restaurant-menu-price">${esc(getDisplayCost(item))}</span></div>`;
    }).join('');
    return `<section class="restaurant-menu-course"><h4 class="restaurant-menu-course-title">${course}</h4><div class="restaurant-menu-rows">${rows || '<div class="restaurant-menu-empty">No selections available</div>'}</div></section>`;
  }).join('');
  return `<div class="restaurant-menu-card"><div class="restaurant-menu-title">Menu</div><div class="restaurant-menu-rule"></div>${courseHtml}</div>`;
}
renderShopCategoriesOnly = function(shop,items) {
  const byCat = {};
  items.forEach(item => { const cat=item.category || 'Misc'; if(!byCat[cat]) byCat[cat]=[]; byCat[cat].push(item); });
  const cats = Object.keys(byCat).sort((a,b)=>{ const ai=CATEGORY_ORDER.indexOf(a), bi=CATEGORY_ORDER.indexOf(b); return (ai<0?999:ai)-(bi<0?999:bi)||String(a).localeCompare(String(b)); });
  const sections = cats.map(cat => {
    if (String(cat).toLowerCase() === 'food') {
      const open = categoryIsOpen(shop.id,cat,false);
      const foodItems = byCat[cat];
      return `<div class="shop-category restaurant-food-category"><button class="shop-category-head" onclick="toggleShopCategory('${shop.id}','${esc(cat).replace(/'/g,'&#39;')}')"><span>${open?'▾':'▸'} Food Menu</span><span>${foodItems.length}</span></button>${open?`<div class="shop-category-body">${renderRestaurantFoodMenuV21(shop,foodItems)}</div>`:''}</div>`;
    }
    return renderCategoryAccordion(shop,cat,byCat[cat],false);
  }).join('');
  return `<div class="clean-shop-body">${sections || '<div class="empty-msg">This shop has no item IDs. Edit the shop and select items.</div>'}</div>`;
};


