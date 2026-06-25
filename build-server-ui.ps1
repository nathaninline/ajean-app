# build-server-ui.ps1 — génère ajean-app/server.html à partir de la VRAIE UI jean web
# (jean/ui/index.html), en reroutant TOUS ses appels /api/* par la boîte noire E2E.
#
# Source de vérité unique = jean/ui/index.html. À chaque MAJ de jean web, relancer ce
# script puis `git push` ajean-app (GitHub Pages redéploie ; pas de rebuild relais).
#
# Deux transformations :
#  1. on remplace la fonction jfetch(u,opts) de jean web par une version qui chiffre
#     tout via e2e.js (chat → /api/e2e/chat streamé ; reste → /api/e2e/req) ;
#  2. on injecte, AVANT le script principal, le bootstrap boîte noire (shim fetch vers
#     le relais, wasm, e2e.js, résolution de la machine ?m=<id>, garde-fou empreinte).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here '..\jean\ui\index.html'
$dst  = Join-Path $here 'server.html'
$ver  = Get-Date -Format 'yyyyMMddHHmmss'   # anti-cache : tamponné sur les assets/URLs

if (-not (Test-Path $src)) { throw "introuvable : $src" }
$html = Get-Content -Raw -Encoding UTF8 $src

# --- 1. Remplacement de jfetch -------------------------------------------------
$newJfetch = @'
async function jfetch(u, opts){
  // BOÎTE NOIRE : tout appel /api/* est chiffré de bout en bout vers TON serveur
  // jean via le relais (qui ne voit que de l'opaque). Remplace le fetch direct de
  // jean web ; la signature/contrat (Response, r.json(), r.body.getReader()) est
  // préservée pour que le reste de l'UI jean web fonctionne sans modification.
  opts = opts || {};
  var method = (opts.method||'GET').toUpperCase();
  var path = u.charAt(0)==='/' ? u : ('/'+u);
  await ensureSession();                       // garantit empreinte + appairage
  if(path.indexOf('/api/chat')===0){           // chat streamé
    var reqObj = opts.body ? JSON.parse(opts.body) : {};
    return e2eChatResponse(reqObj, opts.signal);
  }
  var body = (opts.body!=null) ? JSON.parse(opts.body) : null;
  var env = await e2ecallEnv(MACHINE, method, path, body);   // {status, body}
  return new Response(JSON.stringify(env.body), {status: env.status||200, headers:{'Content-Type':'application/json'}});
}
'@

$rx = [regex]'(?s)async function jfetch\(u, opts\)\{.*?\r?\n\}'
if (-not $rx.IsMatch($html)) { throw "jfetch introuvable dans jean web — la structure a changé, ajuster le script." }
$html = $rx.Replace($html, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newJfetch }, 1)

# --- 2. Bootstrap boîte noire (injecté avant le 1er <script>) -------------------
$bootstrap = @'
<script>
// === BOÎTE NOIRE ajean.link ====================================================
// Cette page EST la vraie UI jean web, servie par GitHub Pages (app.ajean.link, une
// origine que le relais ne contrôle pas). Tous ses appels API vont, chiffrés de bout
// en bout, à TON serveur jean via le relais (ajean.link), qui ne voit que de l'opaque.
var API='https://ajean.link';
(function(){var _f=window.fetch.bind(window);
  window.fetch=function(u,opt){
    if(typeof u==='string'&&u.charAt(0)==='/'&&!/^\/(opaque\.wasm|wasm_exec\.js|marked\.min\.js|e2e\.js)/.test(u)){
      u=API+u;opt=Object.assign({credentials:'include'},opt||{});
    }
    return _f(u,opt);};})();
</script>
<script src="/wasm_exec.js"></script>
<script src="/e2e.js"></script>
<script>
// Modales intégrées (empreinte + code d'appairage) : server.html n'a pas l'UI du
// portail et les confirm()/prompt() natifs sont peu fiables (mobile, contexte async).
// e2e.js (e2eConfirm) utilise window.askConfirm / window.askPrompt si présents.
(function(){
  function mk(inner){var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);display:grid;place-items:center;z-index:2147483647;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
    var box=document.createElement('div');
    box.style.cssText='background:#161b22;border:1px solid #30363d;border-radius:10px;padding:22px;max-width:440px;width:100%;color:#e6edf3;box-shadow:0 10px 40px rgba(0,0,0,.5)';
    box.innerHTML=inner;o.appendChild(box);document.body.appendChild(o);return o;}
  var BTN='border:1px solid #30363d;background:#161b22;color:#e6edf3;border-radius:6px;padding:9px 15px;cursor:pointer;font:inherit;font-size:13px;font-weight:600';
  var BTNP='border:1px solid #1f6feb;background:#1f6feb;color:#fff;border-radius:6px;padding:9px 15px;cursor:pointer;font:inherit;font-size:13px;font-weight:600';
  function esc(s){return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  window.askConfirm=function(opt){opt=opt||{};return new Promise(function(res){
    var o=mk('<h3 style="margin:0 0 12px;color:#58a6ff;font-size:15px">'+esc(opt.title||'Confirmer')+'</h3>'+
      '<p style="margin:0 0 18px;color:#adbac7;font-size:13px;line-height:1.55;word-break:break-word">'+esc(opt.msg||'')+'</p>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button id="_no" style="'+BTN+'">'+esc(opt.no||'Annuler')+'</button>'+
      '<button id="_yes" style="'+BTNP+'">'+esc(opt.yes||'Continuer')+'</button></div>');
    o.querySelector('#_yes').onclick=function(){o.remove();res(true);};
    o.querySelector('#_no').onclick=function(){o.remove();res(false);};});};
  window.askPrompt=function(opt){opt=opt||{};return new Promise(function(res){
    var o=mk('<h3 style="margin:0 0 12px;color:#58a6ff;font-size:15px">'+esc(opt.title||'Saisir')+'</h3>'+
      '<p style="margin:0 0 12px;color:#adbac7;font-size:13px;line-height:1.55;word-break:break-word">'+esc(opt.msg||'')+'</p>'+
      '<input id="_in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="'+esc(opt.placeholder||'')+'" '+
      'style="width:100%;padding:11px 12px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;font:inherit;font-size:16px;margin-bottom:16px">'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button id="_no" style="'+BTN+'">'+esc(opt.no||'Annuler')+'</button>'+
      '<button id="_yes" style="'+BTNP+'">'+esc(opt.yes||'Valider')+'</button></div>');
    var inp=o.querySelector('#_in');setTimeout(function(){inp.focus();},60);
    function ok(){var v=inp.value.trim();o.remove();res(v);}
    inp.onkeydown=function(e){if(e.key==='Enter')ok();};
    o.querySelector('#_yes').onclick=ok;
    o.querySelector('#_no').onclick=function(){o.remove();res('');};});};
})();
// Machine cible (?m=<id>) résolue depuis le compte, puis garde-fou boîte noire
// (empreinte + appairage) demandé UNE fois (partagé avec le portail, même origine).
var MACHINE=null;
var MACHINE_READY=(async function(){
  var mid=new URLSearchParams(location.search).get('m');
  if(!mid){location.href='/';return;}
  var r=await fetch('/app/machines');
  if(r.status===401){location.href='/login.html';return;}
  var list=((await r.json()).machines)||[];
  MACHINE=list.find(function(x){return x.id===mid;});
  if(!MACHINE){alert('Serveur introuvable sur ton compte.');location.href='/';return;}
  document.title='jean — '+(MACHINE.name||mid);
})();
var _sessP=null;
function ensureSession(){if(_sessP)return _sessP;
  _sessP=(async function(){
    await MACHINE_READY;
    if(!MACHINE||!MACHINE.pubkey)throw new Error('boîte noire indisponible (agent sans clé E2E) — mets à jour Jean côté serveur');
    var s=await e2eFor(MACHINE);
    if(!s){var ok=await e2eConfirm(MACHINE);if(ok)s=await e2eFor(MACHINE);}
    if(!s)throw new Error('boîte noire requise : confirme l\'empreinte E2E de ton serveur');
    return s;})();
  _sessP.catch(function(){_sessP=null;});       // un échec ne fige pas la session
  return _sessP;}
// Réponse synthétique pour le chat : ré-émet, DANS l'onglet, les événements SSE
// déchiffrés au format natif que le lecteur de jean web attend (data: {json}\n\n).
function e2eChatResponse(reqObj,signal){
  var stream=new ReadableStream({start:function(controller){
    var enc=new TextEncoder();
    streamE2ERaw(MACHINE,reqObj,function(plain){controller.enqueue(enc.encode('data: '+plain+'\n\n'));},signal)
      .then(function(){try{controller.close();}catch(e){}})
      .catch(function(e){try{controller.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{content:'\n\n⚠️ '+(e&&e.message||e)}}]})+'\n\n'));controller.close();}catch(_){}});
  }});
  return new Response(stream,{status:200,headers:{'Content-Type':'text/event-stream'}});
}
</script>
'@

$marker = '<script src="marked.min.js"></script>'
if (-not $html.Contains($marker)) { throw "marqueur '$marker' introuvable dans jean web." }
$html = $html.Replace($marker, $bootstrap + "`r`n" + $marker)

# anti-cache : versionne e2e.js (chargé par server.html)
$html = $html.Replace('src="/e2e.js"', 'src="/e2e.js?v=' + $ver + '"')

# --- écriture (UTF-8 sans BOM) --------------------------------------------------
[System.IO.File]::WriteAllText($dst, $html, (New-Object System.Text.UTF8Encoding($false)))

# anti-cache : retamponne index.html (e2e.js + var BUILD = la version de navigation
# vers server.html?...&v=). URL versionnée = Safari/CDN ne peuvent plus resservir l'ancien.
$idx = Join-Path $here 'index.html'
$ih  = [System.IO.File]::ReadAllText($idx)
$ih  = [regex]::Replace($ih, 'src="/e2e\.js\?v=[^"]*"', 'src="/e2e.js?v=' + $ver + '"')
$ih  = [regex]::Replace($ih, "var BUILD='[^']*';", "var BUILD='" + $ver + "';")
[System.IO.File]::WriteAllText($idx, $ih, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "version anti-cache = $ver"

# marked.min.js doit exister côté Pages (jean web le charge en relatif).
$mkSrc = Join-Path $here '..\jean\ui\marked.min.js'
$mkDst = Join-Path $here 'marked.min.js'
if ((Test-Path $mkSrc) -and ((-not (Test-Path $mkDst)) -or ((Get-FileHash $mkSrc).Hash -ne (Get-FileHash $mkDst).Hash))) {
  Copy-Item -Force $mkSrc $mkDst; Write-Host "marked.min.js copié."
}
Write-Host "OK -> $dst"
