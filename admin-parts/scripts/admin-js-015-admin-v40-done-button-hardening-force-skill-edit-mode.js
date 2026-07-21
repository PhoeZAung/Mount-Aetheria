
/* --- Admin v40 Done button hardening: force skill edit mode closed even if older handlers/CSS disagree. --- */
(function(){
  function closeSkillEditorHard(){
    window.__maSkillEditRequested = false;
    document.body.classList.remove('skill-edit-mode');
    document.body.classList.remove('skill-points-unlocked');
    const editor = document.querySelector('#skills .skills-editor-toolbar');
    const view = document.querySelector('#skills .skills-view-toolbar');
    if(editor){ editor.style.display = 'none'; editor.setAttribute('aria-hidden','true'); }
    if(view){ view.style.display = ''; view.removeAttribute('aria-hidden'); }
    document.querySelectorAll('#skillsTableBody .skill-custom-input').forEach(input => { input.readOnly = true; input.setAttribute('aria-readonly','true'); input.tabIndex = -1; });
  }
  const oldToggle = window.toggleSkillEditMode;
  window.toggleSkillEditMode = function(force){
    const result = typeof oldToggle === 'function' ? oldToggle.apply(this, arguments) : undefined;
    const closing = force === false || (force === undefined && !document.body.classList.contains('skill-edit-mode'));
    if(closing) setTimeout(closeSkillEditorHard, 0);
    return result;
  };
  document.addEventListener('click', function(event){
    const done = event.target && event.target.closest && event.target.closest('#skillsExitEditBtn');
    if(done) setTimeout(closeSkillEditorHard, 0);
  }, true);
})();
