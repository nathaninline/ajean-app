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

# --- écriture (UTF-8 sans BOM) --------------------------------------------------
[System.IO.File]::WriteAllText($dst, $html, (New-Object System.Text.UTF8Encoding($false)))

# marked.min.js doit exister côté Pages (jean web le charge en relatif).
$mkSrc = Join-Path $here '..\jean\ui\marked.min.js'
$mkDst = Join-Path $here 'marked.min.js'
if ((Test-Path $mkSrc) -and ((-not (Test-Path $mkDst)) -or ((Get-FileHash $mkSrc).Hash -ne (Get-FileHash $mkDst).Hash))) {
  Copy-Item -Force $mkSrc $mkDst; Write-Host "marked.min.js copié."
}
Write-Host "OK -> $dst"
