/* e2e.js — primitives de la BOÎTE NOIRE ajean.link, partagées par le portail
   (index.html) et la vue serveur (server.html = la vraie UI jean web servie à
   distance). Le relais ne transporte que de l'opaque : tout le contenu (chat ET
   contrôle) est chiffré de bout en bout dans le navigateur, authentifié, et lié à
   l'empreinte de l'agent (anti-MITM) + à l'appairage (anti-injection).

   Dépend des exports WASM (opaque.wasm) : e2eAuthKey / e2eUserPub / e2eSeal, et de
   wasm_exec.js (global Go). Aucune dépendance UI : e2eConfirm utilise window.askConfirm
   / window.askPrompt s'ils existent (jolies modales du portail), sinon confirm/prompt. */

var _wasm=null,_te=new TextEncoder(),_td=new TextDecoder(),E2E={};
function b64e(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
function b64d(str){var s=atob(str),b=new Uint8Array(s.length);for(var i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
function sha256b(bytes){return crypto.subtle.digest('SHA-256',bytes).then(function(d){return new Uint8Array(d);});}
function concatB(a,b){var o=new Uint8Array(a.length+b.length);o.set(a,0);o.set(b,a.length);return o;}
function hexOf(bytes){return Array.from(bytes).map(function(x){return x.toString(16).padStart(2,'0')}).join('');}

// ?v= versionne le wasm : un nouveau déploiement = nouvelle URL = pas de vieux cache
// (sinon un opaque.wasm périmé manque les exports récents → « not defined »).
function e2eInit(){if(_wasm)return _wasm;if(typeof Go==='undefined')return Promise.reject('wasm indisponible');
  var go=new Go();_wasm=WebAssembly.instantiateStreaming(fetch('/opaque.wasm?v=20260624-authchan'),go.importObject).then(function(res){go.run(res.instance);});return _wasm;}

// Racine R = SHA256(exportKey || "ajean-e2e-root"). L'exportKey OPAQUE vient du login
// (dérivée du mot de passe côté navigateur, jamais transmise), stockée en localStorage.
function e2eRoot(){var raw=localStorage.getItem('ajk');if(!raw)return Promise.resolve(null);
  return sha256b(concatB(b64d(raw),_te.encode('ajean-e2e-root')));}

// Empreinte lisible de la clé publique de l'agent (à comparer avec « jean link »).
async function fpOfPub(pubHex){var b=new Uint8Array(pubHex.match(/../g).map(function(h){return parseInt(h,16)}));
  var s=hexOf((await sha256b(b)).slice(0,8)).toUpperCase(),p=[];
  for(var i=0;i<s.length;i+=4)p.push(s.slice(i,i+4));return p.join('-');}

// e2eFor : session du canal AUTHENTIFIÉ pour une machine (objet {id,pubkey,...}).
// Exige (1) empreinte confirmée ET (2) navigateur appairé. Clé = SHA256(ECDH(uPriv,
// agentPub) || "authchan") : seul ce navigateur (uPriv dérivé du mot de passe) la calcule.
async function e2eFor(m){if(!m||!m.pubkey)return null;
  var fp=await fpOfPub(m.pubkey);if(localStorage.getItem('fp:'+m.id)!==fp)return null;
  if(localStorage.getItem('pair:'+m.id)!=='1')return null;
  if(E2E[m.id]&&E2E[m.id].pub===m.pubkey)return E2E[m.id];
  try{await e2eInit();}catch(e){return null;}
  var R=await e2eRoot();if(!R)return null;
  var res=e2eAuthKey(m.pubkey,b64e(R));if(!res||!res.ok)return null;
  var key=await crypto.subtle.importKey('raw',b64d(res.key),{name:'AES-GCM'},false,['encrypt','decrypt']);
  E2E[m.id]={pub:m.pubkey,upub:res.upub,key:key};return E2E[m.id];}

// e2ePair : appaire CE navigateur à l'agent. Scelle {upub, code} vers la clé publique
// de l'agent (le relais ne peut ni l'ouvrir ni connaître le code, affiché seulement
// dans le log « jean link »). En cas de succès l'agent autorise uPub.
async function e2ePair(m,code){
  await e2eInit();
  var R=await e2eRoot();if(!R)throw new Error('clé absente (reconnecte-toi)');
  var up=e2eUserPub(b64e(R));if(!up||!up.ok)throw new Error('identité');
  var payload=_te.encode(JSON.stringify({upub:up.upub,code:code}));
  var sealed=e2eSeal(m.pubkey,b64e(payload));if(!sealed||!sealed.ok)throw new Error('scellement');
  var r=await fetch('/m/'+m.id+'/api/e2e/pair',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sealed:sealed.sealed})});
  if(r.status===401){location.href='/login.html';throw new Error('session');}
  if(!r.ok)throw new Error(r.status===403?'code incorrect':('erreur '+r.status));}

// Petites invites : utilisent les modales du portail si présentes, sinon le natif.
function _ask(opt){if(typeof window.askConfirm==='function')return window.askConfirm(opt);
  return Promise.resolve(window.confirm((opt.title?opt.title+'\n\n':'')+(opt.msg||'')));}
function _prompt(opt){if(typeof window.askPrompt==='function')return window.askPrompt(opt);
  return Promise.resolve(window.prompt((opt.title?opt.title+'\n\n':'')+(opt.msg||''),'')||'');}
function _toast(m){if(typeof window.toast==='function')window.toast(m);}

// e2eConfirm : active la boîte noire en 2 temps (empreinte + appairage). Une fois par
// machine ; ne fait rien si déjà active. Renvoie true si la boîte noire est active.
async function e2eConfirm(m){if(!m||!m.pubkey)return false;
  var fp=await fpOfPub(m.pubkey);
  var fpOk=localStorage.getItem('fp:'+m.id)===fp;
  if(fpOk&&localStorage.getItem('pair:'+m.id)==='1')return true;
  if(!fpOk){
    var ok=await _ask({title:'Activer la boîte noire (1/2)',
      msg:'Vérifie que cette empreinte est bien celle affichée par « jean link » sur ton serveur : '+fp,
      yes:'Elle correspond',no:'Plus tard'});
    if(!ok)return false;
    localStorage.setItem('fp:'+m.id,fp);
  }
  if(localStorage.getItem('pair:'+m.id)!=='1'){
    var code=await _prompt({title:'Activer la boîte noire (2/2)',
      msg:'Saisis le code d\'appairage affiché par « jean link » sur ton serveur (juste sous l\'empreinte).',
      placeholder:'ex: K7QZ9F2A',yes:'Appairer',no:'Plus tard'});
    if(!code)return false;
    try{await e2ePair(m,code);localStorage.setItem('pair:'+m.id,'1');_toast('Boîte noire activée 🔒');}
    catch(e){_toast('Appairage échoué : '+(e&&e.message||e));return false;}
  }
  return true;}

// e2ecallEnv : appel d'API de CONTRÔLE chiffré (presets, VRAM, skills, service…).
// Renvoie l'enveloppe {status, body} déchiffrée. Lève « e2e-unconfirmed » si pas de
// session (empreinte/appairage manquants).
async function e2ecallEnv(m,method,path,body){
  var sess=await e2eFor(m);
  if(!sess)throw new Error('e2e-unconfirmed');
  var reqObj={method:method,path:path,body:(body===undefined?null:body)};
  var ts=Date.now();
  var iv=crypto.getRandomValues(new Uint8Array(12));
  var aad=_te.encode(sess.upub+'|'+ts);
  var ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv,additionalData:aad},sess.key,_te.encode(JSON.stringify(reqObj)));
  var r=await fetch('/m/'+m.id+'/api/e2e/req',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({upub:sess.upub,ts:ts,iv:b64e(iv),ct:b64e(new Uint8Array(ct))})});
  if(r.status===401){location.href='/login.html';throw new Error('session');}
  if(!r.ok)throw new Error('e2e-req '+r.status);
  var raw=b64d((await r.text()).trim()),nc=raw.slice(0,12),cc=raw.slice(12);
  var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:nc},sess.key,cc);
  return JSON.parse(_td.decode(pt)); /* {status, body} */}

// e2ecall : variante qui renvoie directement le corps déchiffré (compat portail).
async function e2ecall(m,method,path,body){return (await e2ecallEnv(m,method,path,body)).body;}

// streamE2ERaw : chat chiffré streamé. Invoque onPlain(<JSON SSE déchiffré>) pour
// chaque événement — la chaîne EST exactement l'événement /api/chat d'origine
// ({"choices":[{"delta":{...}}]}), donc ré-injectable tel quel dans un lecteur jean web.
async function streamE2ERaw(m,reqObj,onPlain,signal){
  var sess=await e2eFor(m);if(!sess)throw new Error('e2e-unconfirmed');
  var ts0=Date.now();
  var iv0=crypto.getRandomValues(new Uint8Array(12));
  var aad0=_te.encode(sess.upub+'|'+ts0);
  var ct0=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv0,additionalData:aad0},sess.key,_te.encode(JSON.stringify(reqObj)));
  var r=await fetch('/m/'+m.id+'/api/e2e/chat',{method:'POST',signal:signal,
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({upub:sess.upub,ts:ts0,iv:b64e(iv0),ct:b64e(new Uint8Array(ct0))})});
  if(!r.ok)throw new Error('e2e-chat '+r.status);
  var reader=r.body.getReader(),dec=new TextDecoder(),buf='';
  while(true){var rd=await reader.read();if(rd.done)break;buf+=dec.decode(rd.value,{stream:true});
    var idx;while((idx=buf.indexOf('\n\n'))>=0){var chunk=buf.slice(0,idx).trim();buf=buf.slice(idx+2);
      if(chunk.indexOf('data:')!==0)continue;var data=chunk.slice(5).trim();
      if(!data||data==='[DONE]')continue;
      try{var rawev=b64d(data),nc=rawev.slice(0,12),cc=rawev.slice(12);
        var ptev=await crypto.subtle.decrypt({name:'AES-GCM',iv:nc},sess.key,cc);
        onPlain(_td.decode(ptev));
      }catch(e){}}}
}
