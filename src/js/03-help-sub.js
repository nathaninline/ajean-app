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
    if(s.active){ACTIVE=true;document.getElementById('subModal').classList.remove('show');showShell(true);welcome();await load();return;}}
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
  // reste connecté (il peut s'abonner ou se déconnecter),
  // mais un mur d'abonnement s'affiche. /app/me → 401 si non connecté (→ login).
  var st;try{st=await fetch('/app/me');}catch(e){location.href='/login.html';return;}
  if(st.status===401){location.href='/login.html';return;}
  var s={};try{s=await st.json();}catch(e){}
  EMAIL=s.email||'';ACTIVE=!!s.active;
  var back=(new URLSearchParams(location.search)).get('sub')==='ok';
  if(!ACTIVE){
    // « Payer ou rien » : mur TOTAL. Tant que l'abonnement n'est pas actif, aucun
    // contenu (serveurs) n'est chargé ni affiché. L'écran d'abonnement
    // est bloquant (pas de « Plus tard ») — seule issue : payer ou se déconnecter.
    showShell(false);
    if(back)pollActivation(); else openSub();
    return;
  }
  showShell(true);
  if(back)welcome();
  await load();
  maybeAutoOpen();}          // PWA installée : file droit sur le dernier serveur
// maybeAutoOpen : au LANCEMENT de la PWA (écran d'accueil), ouvre directement le
// dernier serveur utilisé au lieu de rester sur « Mes serveurs ». Contraintes :
//  - UNIQUEMENT en PWA installée (standalone) — dans un navigateur on garde la liste ;
//  - une seule fois PAR SESSION (drapeau sessionStorage) : si on revient à la liste
//    (swipe-retour iOS, possible car on navigue en location.href = historique), on
//    n'est pas re-catapulté ; un nouveau lancement à froid ré-ouvre le serveur ;
//  - pas si ?pick=1 (retour explicite à la liste) ni ?sub=ok (retour de paiement) ;
//  - seulement si le serveur mémorisé existe et est EN LIGNE, sinon on montre la liste.
function maybeAutoOpen(){
  try{
    if(sessionStorage.getItem('ajk-autoopen'))return;
    var sp=new URLSearchParams(location.search);
    if(sp.get('pick')==='1'||sp.get('sub')==='ok')return;
    var standalone=(navigator.standalone===true)||(window.matchMedia&&window.matchMedia('(display-mode:standalone)').matches);
    if(!standalone)return;
    var id=localStorage.getItem('ajk-home');if(!id)return;
    var m=machineById(id);if(!m||!m.online)return;
    sessionStorage.setItem('ajk-autoopen','1');
    location.href='server.html?m='+encodeURIComponent(id)+'&v='+BUILD;
  }catch(e){}
}
// showShell : masque le contenu + bouton compte tant que le mur est en place.
function showShell(on){
  var wr=document.querySelector('.wrap'),ab=document.getElementById('acctBtn');
  if(wr)wr.style.display=on?'':'none';
  if(ab)ab.style.display=on?'':'none';
}
boot();
setInterval(function(){if(!ACTIVE)return;if(document.querySelector('.modal.show'))return;load();},15000);
