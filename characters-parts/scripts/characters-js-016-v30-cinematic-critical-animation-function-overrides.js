
/* --- v30 Cinematic critical animation function overrides --- */
function cinemaVarStyle(i, total, spread, extra = ''){
  const angle = (Math.PI * 2 * i / Math.max(1,total)) + ((secureRandomInt(52) - 26) * Math.PI / 180);
  const dist = Math.round(spread * (.48 + secureRandomInt(90) / 100));
  const tx = Math.round(Math.cos(angle) * dist);
  const ty = Math.round(Math.sin(angle) * dist);
  const rot = secureRandomInt(1080) - 540;
  const scale = (0.7 + secureRandomInt(105) / 100).toFixed(2);
  const delay = (secureRandomInt(28) / 100).toFixed(2);
  const dur = (2.25 + secureRandomInt(90) / 100).toFixed(2);
  return `--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;--scale:${scale};--delay:${delay}s;--dur:${dur}s;${extra}`;
}
function cinemaConfettiSvg(){
  const shapes = Array.from({length:84},(_,i)=>{
    const x = 500 + secureRandomInt(80) - 40;
    const y = 300 + secureRandomInt(50) - 25;
    const hue = 36 + secureRandomInt(35);
    const style = cinemaVarStyle(i,84,430,`fill:hsl(${hue},96%,${55+secureRandomInt(22)}%);`);
    return i % 3 === 0
      ? `<circle class="cinema-burst" cx="${x}" cy="${y}" r="${4+secureRandomInt(5)}" style="${style}"></circle>`
      : `<rect class="cinema-spin" x="${x}" y="${y}" width="${6+secureRandomInt(7)}" height="${12+secureRandomInt(13)}" rx="2" style="${style}"></rect>`;
  }).join('');
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><radialGradient id="goldFlash" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff7a6" stop-opacity=".95"/><stop offset="45%" stop-color="#ffc83d" stop-opacity=".28"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs><circle class="lightning-flash" cx="500" cy="300" r="95" fill="url(#goldFlash)"></circle>${shapes}<text x="500" y="172" text-anchor="middle" fill="#ffe278" font-size="52" font-weight="900" opacity=".95" style="filter:drop-shadow(0 0 18px #ffd24e);animation:cinemaTitlePunch 1.15s ease-out both;">NAT 20!</text></svg></div>`;
}
function cinemaDragonSvg(){
  const embers = Array.from({length:32},(_,i)=>{
    const style = cinemaVarStyle(i,32,360,`--tx:${220+secureRandomInt(620)}px;--ty:${secureRandomInt(420)-210}px;--delay:${(i*.035).toFixed(2)}s;`);
    return `<circle class="dragon-fire" cx="155" cy="340" r="${4+secureRandomInt(9)}" fill="${i%3?'#ff7a21':'#ffd85e'}" opacity=".95" style="${style}"></circle>`;
  }).join('');
  const smoke = Array.from({length:12},(_,i)=>`<circle class="cinema-cloud" cx="${120+secureRandomInt(120)}" cy="${330+secureRandomInt(80)}" r="${18+secureRandomInt(24)}" fill="#21120b" opacity=".32" style="${cinemaVarStyle(i,12,260)}"></circle>`).join('');
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg dragon-scene" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><filter id="cinemaDragonGlow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ff6b22" flood-opacity=".72"/><feDropShadow dx="0" dy="18" stdDeviation="12" flood-color="#000" flood-opacity=".65"/></filter><radialGradient id="dragonMoon" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffd970" stop-opacity=".42"/><stop offset="100%" stop-color="#ff6b22" stop-opacity="0"/></radialGradient></defs><rect width="1000" height="600" fill="rgba(0,0,0,.12)"></rect><circle cx="500" cy="285" r="230" fill="url(#dragonMoon)" opacity=".7"></circle>${smoke}${embers}<g class="dragon-flyer" fill="#050505"><path d="M52 344 C115 305 174 290 244 296 C318 302 366 342 454 316 C413 366 340 389 265 370 C205 409 134 408 58 382 C86 368 94 354 52 344Z"></path><path class="dragon-wing" d="M236 298 C266 188 372 103 520 70 C481 169 414 257 322 319 Z"></path><path class="dragon-wing" d="M300 322 C409 232 526 217 664 252 C535 296 436 331 320 345 Z"></path><path d="M438 307 C510 279 584 279 660 308 C605 320 562 333 504 332 C474 329 453 321 438 307Z"></path><path d="M641 298 C697 262 752 266 797 304 C764 305 739 312 714 331 C690 325 666 314 641 298Z"></path><path d="M782 297 L843 270 L821 319 L872 336 L806 342 Z"></path><path d="M89 348 C-33 338 -81 294 -143 229 C-57 251 19 274 106 321 Z"></path><circle cx="760" cy="293" r="8" fill="#ffdf5d"></circle></g><text x="500" y="95" text-anchor="middle" fill="#ffdf73" font-size="50" font-weight="900" opacity=".92" style="filter:drop-shadow(0 0 18px #ff742b);animation:cinemaTitlePunch 1s .28s both;">DRAGON ROAR</text></svg></div>`;
}
function cinemaTreasureSvg(){
  const loot = Array.from({length:54},(_,i)=>{
    const x = 500 + secureRandomInt(40) - 20;
    const y = 325 + secureRandomInt(34) - 17;
    const style = cinemaVarStyle(i,54,420);
    if(i%5===0) return `<polygon class="cinema-spin" points="${x},${y-14} ${x+15},${y} ${x},${y+15} ${x-15},${y}" fill="#74e9ff" stroke="#eaffff" stroke-width="2" style="${style}"></polygon>`;
    if(i%5===1) return `<polygon class="cinema-spin" points="${x},${y-14} ${x+13},${y+10} ${x-13},${y+10}" fill="#ff5ccf" stroke="#ffc7ed" stroke-width="2" style="${style}"></polygon>`;
    return `<circle class="cinema-burst" cx="${x}" cy="${y}" r="${9+secureRandomInt(8)}" fill="#f3bc2f" stroke="#fff0a2" stroke-width="3" style="${style}"></circle>`;
  }).join('');
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><radialGradient id="treasureGlow" cx="50%" cy="55%" r="45%"><stop offset="0%" stop-color="#fff2a0" stop-opacity=".95"/><stop offset="55%" stop-color="#f0a926" stop-opacity=".26"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs><circle class="lightning-flash" cx="500" cy="325" r="130" fill="url(#treasureGlow)"></circle><path d="M360 360 Q500 300 640 360 L610 420 Q500 468 390 420 Z" fill="#7a3c18" stroke="#ffd36a" stroke-width="7" opacity=".95" class="cinema-burst" style="--tx:0px;--ty:28px;--rot:0deg;--scale:1.04;--dur:2.3s;"></path>${loot}<text x="500" y="168" text-anchor="middle" fill="#ffe483" font-size="48" font-weight="900" style="filter:drop-shadow(0 0 16px #ffb62c);animation:cinemaTitlePunch 1.1s .12s both;">TREASURE EXPLOSION</text></svg></div>`;
}
function cinemaMagicSvg(){
  const beams = Array.from({length:18},(_,i)=>`<rect class="magic-beam" x="${60+i*52}" y="380" width="16" height="290" rx="8" fill="#ffd95d" opacity=".32" style="--delay:${(i*.025).toFixed(2)}s"></rect>`).join('');
  const runes = ['✦','✧','✹','✷','✺','✶','✧','✦'];
  const runeText = runes.map((r,i)=>`<text x="0" y="-154" text-anchor="middle" fill="#ffe892" font-size="31" font-weight="900" transform="rotate(${i*45})">${r}</text>`).join('');
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><filter id="magicGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${beams}<g class="magic-ring" filter="url(#magicGlow)"><circle cx="0" cy="0" r="160" fill="none" stroke="#ffd95e" stroke-width="5"/><circle cx="0" cy="0" r="104" fill="none" stroke="#fff1a3" stroke-width="2"/><polygon points="0,-135 117,68 -117,68" fill="none" stroke="#ffdf7a" stroke-width="3"/><polygon points="0,135 117,-68 -117,-68" fill="none" stroke="#ffb93e" stroke-width="3"/>${runeText}</g><g class="magic-ring reverse" filter="url(#magicGlow)"><circle cx="0" cy="0" r="230" fill="none" stroke="#fff6b6" stroke-width="3" stroke-dasharray="16 13"/><circle cx="0" cy="0" r="67" fill="rgba(255,220,86,.18)" stroke="#fff0a4" stroke-width="2"/></g><text x="500" y="112" text-anchor="middle" fill="#fff1a3" font-size="50" font-weight="900" style="filter:drop-shadow(0 0 18px #ffd25a);animation:cinemaTitlePunch 1s .2s both;">ARCANE ASCENSION</text></svg></div>`;
}
function cinemaLightningSvg(){
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><filter id="cinemaLightningGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#fff7a6" flood-opacity="1"/><feDropShadow dx="0" dy="0" stdDeviation="18" flood-color="#ffd138" flood-opacity=".9"/></filter><radialGradient id="boltBurst"><stop offset="0%" stop-color="#fff" stop-opacity=".95"/><stop offset="45%" stop-color="#ffe35d" stop-opacity=".38"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs><circle class="lightning-flash" cx="500" cy="318" r="115" fill="url(#boltBurst)"></circle><path class="lightning-main" d="M565 -40 L474 175 L555 175 L414 420 L492 258 L425 258 Z" fill="rgba(255,226,84,.72)" stroke="#fff8b0" stroke-width="11" stroke-linejoin="round"></path><path class="lightning-branch" d="M493 201 L290 310 M512 232 L710 290 M470 288 L318 470 M510 320 L658 455" fill="none" stroke="#fff7a6" stroke-width="8" stroke-linecap="round"></path><text x="500" y="102" text-anchor="middle" fill="#fff49a" font-size="50" font-weight="900" style="filter:drop-shadow(0 0 20px #fff15c);animation:cinemaTitlePunch 1s .15s both;">LIGHTNING STRIKE</text></svg></div>`;
}
function cinemaCracksSvg(){
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><path class="screen-crack" d="M510 -20 L476 102 L528 142 L454 238 L512 278 L432 420 L500 452 L446 620" fill="none" stroke="#ff3030" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"></path><path class="screen-crack" d="M480 148 L282 98 M460 236 L246 262 M505 282 L706 226 M468 388 L253 512 M491 450 L705 560" fill="none" stroke="#8a0000" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path><text x="500" y="125" text-anchor="middle" fill="#ff5a5a" font-size="54" font-weight="900" style="filter:drop-shadow(0 0 17px #a00000);animation:cinemaTitlePunch .95s both;">NAT 1!</text></svg></div>`;
}
function cinemaSlimeSvg(){
  const drops = Array.from({length:18},(_,i)=>`<ellipse class="slime-drop" cx="${35+i*55+secureRandomInt(18)}" cy="-40" rx="${12+secureRandomInt(14)}" ry="${24+secureRandomInt(35)}" fill="${i%2?'#5eff61':'#b5ff43'}" opacity=".84" style="--delay:${(i*.045).toFixed(2)}s;--dur:${(2.15+secureRandomInt(70)/100).toFixed(2)}s"></ellipse>`).join('');
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><filter id="cinemaSlimeGlow"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#60ff52" flood-opacity=".7"/></filter></defs><path class="slime-sheet" d="M0 -130 H1000 V120 C930 160 910 54 842 122 C790 174 754 86 704 140 C646 203 596 73 536 136 C470 207 408 82 354 148 C300 213 252 77 198 130 C135 193 94 75 0 144 Z" fill="#40da4c" opacity=".78"></path>${drops}<text x="500" y="105" text-anchor="middle" fill="#baff58" font-size="50" font-weight="900" style="filter:drop-shadow(0 0 17px #1b7a1d);animation:cinemaTitlePunch 1s .18s both;">SLIME DROP</text></svg></div>`;
}
function cinemaGoblinSvg(){
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><filter id="cinemaGoblinShadow"><feDropShadow dx="0" dy="16" stdDeviation="12" flood-color="#000" flood-opacity=".75"/><feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#7dff41" flood-opacity=".45"/></filter></defs><g class="goblin-face"><polygon points="-150,-25 -285,-105 -192,60" fill="#65a63a" stroke="#1f3a12" stroke-width="7"></polygon><polygon points="150,-25 285,-105 192,60" fill="#65a63a" stroke="#1f3a12" stroke-width="7"></polygon><ellipse cx="0" cy="0" rx="176" ry="132" fill="#79c94b" stroke="#18380f" stroke-width="9"></ellipse><path d="M-112 -25 Q-70 -76 -28 -28" fill="none" stroke="#14250c" stroke-width="12" stroke-linecap="round"></path><path d="M28 -28 Q75 -78 113 -24" fill="none" stroke="#14250c" stroke-width="12" stroke-linecap="round"></path><circle cx="-70" cy="0" r="22" fill="#ff3030"></circle><circle cx="70" cy="0" r="22" fill="#ff3030"></circle><ellipse cx="0" cy="30" rx="28" ry="18" fill="#34651f"></ellipse><path class="goblin-mouth" d="M-80 74 Q0 137 82 74 Q35 102 0 100 Q-39 101 -80 74Z" fill="#210606" stroke="#fff0d0" stroke-width="6"></path><path d="M-42 89 L-24 123 L-9 92 M14 92 L31 123 L48 88" fill="#fff0d0" stroke="#fff0d0" stroke-width="3"></path></g><text class="laugh-text" x="500" y="122" text-anchor="middle" fill="#b7ff5c" font-size="62" font-weight="900" style="filter:drop-shadow(0 0 18px #163d0b);">HEH HEH!</text><text class="laugh-text" x="500" y="520" text-anchor="middle" fill="#ff5d5d" font-size="42" font-weight="900" style="animation-delay:.24s;filter:drop-shadow(0 0 14px #4d0000);">CRITICAL FAILURE</text></svg></div>`;
}
function cinemaSmokeSvg(){
  const clouds = Array.from({length:34},(_,i)=>{
    const x = 500 + secureRandomInt(240) - 120;
    const y = 305 + secureRandomInt(140) - 70;
    const tx = secureRandomInt(900) - 450;
    const ty = secureRandomInt(520) - 260;
    const r = 40 + secureRandomInt(72);
    const dur = (2.1 + secureRandomInt(120)/100).toFixed(2);
    const delay = (secureRandomInt(35)/100).toFixed(2);
    return `<circle class="smoke-core" cx="${x}" cy="${y}" r="${r}" fill="${i%3?'#151515':'#3a3a3a'}" opacity="${(0.45+secureRandomInt(42)/100).toFixed(2)}" style="--tx:${tx}px;--ty:${ty}px;--scale:${(1.5+secureRandomInt(170)/100).toFixed(2)};--delay:${delay}s;--dur:${dur}s"></circle>`;
  }).join('');
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><filter id="cinemaSmokeBlur"><feGaussianBlur stdDeviation="5"/></filter></defs>${clouds}<text x="500" y="126" text-anchor="middle" fill="#d8d8d8" font-size="54" font-weight="900" style="filter:drop-shadow(0 0 16px #000);animation:cinemaTitlePunch 1s .18s both;">SMOKE PUFF</text></svg></div>`;
}
function cinemaPianoSvg(){
  return `<div class="roll-cinematic-layer front"><svg class="roll-cinema-svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><defs><filter id="cinemaPianoShadow"><feDropShadow dx="0" dy="20" stdDeviation="15" flood-color="#000" flood-opacity=".72"/></filter></defs><g class="piano-body"><rect x="-175" y="-76" width="350" height="152" rx="18" fill="#111" stroke="#f0f0f0" stroke-width="7"></rect><rect x="-154" y="-28" width="308" height="70" fill="#f6f6f6"></rect><g fill="#111"><rect x="-132" y="-28" width="26" height="47"></rect><rect x="-82" y="-28" width="26" height="47"></rect><rect x="-31" y="-28" width="26" height="47"></rect><rect x="44" y="-28" width="26" height="47"></rect><rect x="94" y="-28" width="26" height="47"></rect></g><circle cx="-128" cy="-53" r="12" fill="#ffd15d"></circle><circle cx="128" cy="-53" r="12" fill="#ffd15d"></circle></g><g stroke="#ff5a5a" stroke-width="9" stroke-linecap="round" fill="none"><path class="impact-line" d="M354 390 L240 482"></path><path class="impact-line" d="M500 415 L500 560"></path><path class="impact-line" d="M647 390 L760 482"></path><path class="impact-line" d="M378 440 L304 566"></path><path class="impact-line" d="M623 440 L696 566"></path></g><text x="500" y="105" text-anchor="middle" fill="#ff6969" font-size="53" font-weight="900" style="filter:drop-shadow(0 0 16px #530000);animation:cinemaTitlePunch 1s .2s both;">FALLING PIANO</text></svg></div>`;
}
function rollSpecialAnimationHtml(animation, kind){
  const anim = String(animation || '').trim();
  if(kind === 'success'){
    if(anim === 'dragon-roar') return cinemaDragonSvg();
    if(anim === 'treasure-explosion') return cinemaTreasureSvg();
    if(anim === 'magic-circle') return cinemaMagicSvg();
    if(anim === 'lightning-strike') return cinemaLightningSvg();
    return cinemaConfettiSvg();
  }
  if(anim === 'slime-drop') return cinemaSlimeSvg();
  if(anim === 'goblin-laugh') return cinemaGoblinSvg();
  if(anim === 'smoke-puff') return cinemaSmokeSvg();
  if(anim === 'falling-piano') return cinemaPianoSvg();
  return cinemaCracksSvg();
}

function resetMountAetheriaRollOverlayTimers(){
  clearTimeout(window.__mountAetheriaRollOverlayTimer);
  clearTimeout(window.__mountAetheriaRollOverlayWatchdog);
  clearTimeout(window.__mountAetheriaRollOverlayCleanup);
}
function hardHideMountAetheriaRollOverlay(overlay,token){
  if(!overlay)return;
  if(token && overlay.dataset.rollToken!==token)return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden','true');
  window.__mountAetheriaRollOverlayCleanup=setTimeout(()=>{
    if(token && overlay.dataset.rollToken!==token)return;
    overlay.className='roll-result-overlay';
    overlay.innerHTML='';
    delete overlay.dataset.rollToken;
  },260);
}
function scheduleMountAetheriaRollOverlayHide(overlay,duration){
  resetMountAetheriaRollOverlayTimers();
  const token=`roll_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  overlay.dataset.rollToken=token;
  window.__mountAetheriaRollOverlayTimer=setTimeout(()=>hardHideMountAetheriaRollOverlay(overlay,token),duration);
  window.__mountAetheriaRollOverlayWatchdog=setTimeout(()=>hardHideMountAetheriaRollOverlay(overlay,token),Math.max(5000,duration+1300));
}
function showRollOverlay(entry){
  if(!entry || entry.kind !== 'roll') return;
  const overlay = document.getElementById('rollResultOverlay');
  if(!overlay) return;
  resetMountAetheriaRollOverlayTimers();
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden','true');
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
  overlay.innerHTML = `${specialLayer}<div class="roll-overlay-card">
    <div class="roll-overlay-dice-row">${diceHtml}</div>
    ${status}
    <div class="roll-overlay-label">${title}</div>
  </div>`;
  overlay.className = `roll-result-overlay${outcomeKind === 'success' ? ' crit-success' : ''}${outcomeKind === 'fail' ? ' crit-fail' : ''}${animation ? ` anim-${animation}` : ''}`;
  void overlay.offsetWidth;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  scheduleMountAetheriaRollOverlayHide(overlay,outcomeKind ? 3450 : 1650);
}
