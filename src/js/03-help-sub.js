var ARTS=[];
function mdRender(s){try{var h=marked.parse(s||'');
  return h.replace(/<table>/g,'<div class="tw"><table>').replace(/<\/table>/g,'</table></div>');
}catch(e){return esc(s||'');}}
function stripMd(s){return (s||'').replace(/[#*`>_\-]/g,' ').replace(/\s+/g,' ').trim();}
async function loadArticles(){var r=await j('/app/help/articles');if(!r)return;ARTS=(await r.json()).articles||[];
  closeArticle();
  var el=document.getElementById('artList');
  el.innerHTML=ARTS.length?ARTS.map(function(a){
    return '<div class="artcard" onclick="openArticle(\''+a.id+'\')">'+
      '<span class="qm">?</span><div class="ac"><b>'+esc(a.title)+'</b>'+
      '<div class="ex">'+esc(stripMd(a.body).slice(0,150))+'</div></div>'+
      '<span class="chev">→</span></div>';
  }).join(''):'<div class="empty">Aucun article pour le moment.</div>';}
function openArticle(id){var a=ARTS.find(function(x){return x.id===id;});if(!a)return;
  document.getElementById('artList').classList.add('hidden');
  document.getElementById('afTitle').textContent=a.title;
  document.getElementById('afBody').innerHTML=mdRender(a.body);
  document.getElementById('artFull').classList.remove('hidden');window.scrollTo(0,0);}
function closeArticle(){document.getElementById('artFull').classList.add('hidden');
  document.getElementById('artList').classList.remove('hidden');}

/* ---- Support (chat membre ↔ opérateur ; EN CLAIR, hors boîte noire) ---- */
var SUP_SIG='';
async function loadSupport(){var r=await j('/app/support/thread');if(!r)return;var t=await r.json();renderSupport(t.msgs||[]);
  document.getElementById('supBadge').classList.add('hidden');
  try{fetch('/app/support/seen',{method:'POST'});}catch(e){}
}
function renderSupport(msgs){var c=document.getElementById('supChat');
  var sig=JSON.stringify(msgs);if(sig===SUP_SIG)return;SUP_SIG=sig;
  if(!msgs.length){c.innerHTML='<div class="empty2">Aucun message.<br>Pose ta question, je te réponds dès que possible.</div>';return;}
  c.innerHTML=msgs.map(function(m){return '<div class="msg '+m.from+'">'+esc(m.text)+'<span class="mt">'+ago(m.ts)+'</span></div>';}).join('');
  c.scrollTop=c.scrollHeight;}
async function sendSupport(){var el=document.getElementById('supInput'),txt=el.value.trim();if(!txt)return;
  el.value='';var r=await jsonPost('/app/support/send',{text:txt});if(!r||!r.ok&&r.status>=400){toast('Envoi impossible');return;}
  try{var t=await r.json();renderSupport(t.msgs||[]);}catch(e){loadSupport();}}
// badge de non-lus : sondé au chargement et au polling global
async function pollSupportBadge(){try{var r=await fetch('/app/support/thread');if(!r.ok)return;var t=await r.json();
  var b=document.getElementById('supBadge');var onSup=document.querySelector('.tab.on')&&document.querySelector('.tab.on').dataset.v==='support';
  if(onSup){renderSupport(t.msgs||[]);b.classList.add('hidden');try{fetch('/app/support/seen',{method:'POST'});}catch(e){}}
  else if(t.unread){b.textContent=t.unread;b.classList.remove('hidden');}
  else b.classList.add('hidden');
}catch(e){}}

/* ---- mur d'abonnement (« payer ou rien ») ---- */
function openSub(){document.getElementById('subModal').classList.add('show');}
function closeSub(){document.getElementById('subModal').classList.remove('show');}

/* ---- abonnement Stripe (4,80 €/mois) ---- */
async function startCheckout(){var b=document.getElementById('subBtn');b.disabled=true;b.textContent='Redirection…';
  var r=await fetch('/billing/checkout',{method:'POST'});
  if(!r.ok){b.disabled=false;b.textContent="S'abonner →";toast('Paiement indisponible pour le moment');return;}
  var d=await r.json();location.href=d.url;}
async function pollActivation(){for(var i=0;i<12;i++){await new Promise(function(r){setTimeout(r,2000);});
    var r=await fetch('/billing/status');if(!r.ok)break;var s=await r.json();
    if(s.active){ACTIVE=true;document.getElementById('subModal').classList.remove('show');showShell(true);welcome();await load();pollSupportBadge();return;}}
  document.getElementById('subMsg').textContent='Paiement bien pris en compte. Si l\'accès ne s\'ouvre pas, recharge la page dans une minute.';}
// Écran de remerciement après paiement ; nettoie l'URL (?sub=ok) pour ne pas
// ré-afficher au rechargement.
function welcome(){try{history.replaceState({},'',location.pathname);}catch(e){}
  document.getElementById('welcomeModal').classList.add('show');}
function closeWelcome(){document.getElementById('welcomeModal').classList.remove('show');}
async function manageSub(){var r=await fetch('/billing/portal',{method:'POST'});
  if(!r.ok){toast('Gestion indisponible');return;}var d=await r.json();location.href=d.url;}

/* ---- Thème clair / sombre (mêmes couleurs que jean web, mémorisé) ---- */
var ICON_SUN='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
var ICON_MOON='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>';
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);
  try{localStorage.setItem('jean-theme',t);}catch(e){}
  var b=document.getElementById('themeBtn');if(b)b.innerHTML=(t==='light')?ICON_MOON:ICON_SUN;}
function toggleTheme(){var cur=(document.documentElement.getAttribute('data-theme')==='light')?'light':'dark';
  applyTheme(cur==='light'?'dark':'light');}
applyTheme(document.documentElement.getAttribute('data-theme')==='light'?'light':'dark');

async function boot(){
  // « Payer ou rien » : sans abonnement actif, l'accès distant est fermé. Le compte
  // reste connecté (il peut consulter l'aide, contacter le support et s'abonner),
  // mais un mur d'abonnement s'affiche. /app/me → 401 si non connecté (→ login).
  var st;try{st=await fetch('/app/me');}catch(e){location.href='/login.html';return;}
  if(st.status===401){location.href='/login.html';return;}
  var s={};try{s=await st.json();}catch(e){}
  EMAIL=s.email||'';ACTIVE=!!s.active;
  var back=(new URLSearchParams(location.search)).get('sub')==='ok';
  if(!ACTIVE){
    // « Payer ou rien » : mur TOTAL. Tant que l'abonnement n'est pas actif, aucun
    // contenu (serveurs, aide, support) n'est chargé ni affiché. L'écran d'abonnement
    // est bloquant (pas de « Plus tard ») — seule issue : payer ou se déconnecter.
    showShell(false);
    if(back)pollActivation(); else openSub();
    return;
  }
  showShell(true);
  if(back)welcome();
  await load();
  pollSupportBadge();}
// showShell : masque tabs + contenu + bouton compte tant que le mur est en place.
function showShell(on){
  var tb=document.querySelector('nav.tabs'),wr=document.querySelector('.wrap'),ab=document.getElementById('acctBtn');
  if(tb)tb.style.display=on?'':'none';
  if(wr)wr.style.display=on?'':'none';
  if(ab)ab.style.display=on?'':'none';
}
boot();
setInterval(function(){if(!ACTIVE)return;if(document.querySelector('.modal.show'))return;load();pollSupportBadge();},15000);
