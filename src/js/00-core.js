var BUILD='20260722095450'; // tamponné par build-server-ui.ps1 (anti-cache)
var MACHINES=[],PROBE={},SCARDS={},SIG_M='',EMAIL='';
var ACTIVE=true; // abonnement actif ? (« payer ou rien » : sinon aucun accès distant)
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},1900);}
function esc(s){return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
async function logout(){localStorage.removeItem('ajk');
  // IMPORTANT : attendre la fin du POST /logout (sinon la navigation l'annule et
  // le cookie de session n'est pas effacé → on reste connecté).
  try{await fetch('/logout',{method:'POST'});}catch(e){}
  location.href='/login.html';}
async function j(u,opt){var r=await fetch(u,opt);if(r.status===401){location.href='/login.html';return null;}return r;}
function jsonPost(u,b){return j(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});}
function machineById(id){return MACHINES.find(function(x){return x.id===id});}
function machineName(id){var m=machineById(id);return m?m.name:id;}

/* ---- petites modales (askConfirm/askPrompt) utilisées aussi par e2e.js ------- */
var _cf=null;
function askConfirm(opt){opt=opt||{};
  document.getElementById('cfTitle').textContent=opt.title||'Confirmer';
  document.getElementById('cfMsg').textContent=opt.msg||'';
  document.getElementById('cfYes').textContent=opt.yes||'Continuer';
  document.getElementById('cfNo').textContent=opt.no||'Annuler';
  document.getElementById('confirmModal').classList.add('show');
  return new Promise(function(r){_cf=r;});}
function cfResolve(v){document.getElementById('confirmModal').classList.remove('show');if(_cf){var f=_cf;_cf=null;f(v);}}
var _pm=null;
function askPrompt(opt){opt=opt||{};
  document.getElementById('pmTitle').textContent=opt.title||'Saisir';
  document.getElementById('pmMsg').textContent=opt.msg||'';
  document.getElementById('pmYes').textContent=opt.yes||'Valider';
  document.getElementById('pmNo').textContent=opt.no||'Annuler';
  var inp=document.getElementById('pmInput');inp.value='';inp.placeholder=opt.placeholder||'';
  document.getElementById('promptModal').classList.add('show');setTimeout(function(){inp.focus();},50);
  return new Promise(function(r){_pm=r;});}
function pmResolve(ok){document.getElementById('promptModal').classList.remove('show');
  var v=ok?document.getElementById('pmInput').value.trim():'';if(_pm){var f=_pm;_pm=null;f(v);}}

/* ---- Mon compte + sessions ---- */
