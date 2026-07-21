
            ['str','dex','con','int','wis','cha'].forEach(s => {
                document.write(`<tr style="border-top:1px solid #333;"><td class="ability-roll-link" data-stat="${s}" onclick="sendAbilityCheck('${s}')" style="font-weight:bold; color:var(--accent); text-transform:uppercase;">${s}</td><td style="padding:8px;"><input type="number" id="${s}" class="live-field calc-trigger" style="text-align:center; background:#111; border:1px solid #444; color:#fff; border-radius:4px;"></td><td id="mod-${s}">+0</td></tr>`);
            });
        
setTimeout(() => {
    try {
        if (!blankSheetTemplate) blankSheetTemplate = captureBlankSheetTemplate();
    } catch (e) {
        console.warn('Blank template capture failed', e);
    }
}, 0);

