async function me(){var r=await j('/app/me');if(!r)return;var d=await r.json();EMAIL=d.email;}
function openAccount(){document.getElementById('acctEmail').textContent=EMAIL;
  document.getElementById('acctSrv').textContent=MACHINES.filter(function(m){return m.online}).length+' en ligne · '+MACHINES.length+' au total';
  var sb=document.getElementById('acctSubBtn');
  if(ACTIVE){sb.textContent='Gérer l\'abonnement';sb.className='btn';sb.onclick=manageSub;}
  else{sb.textContent='S\'abonner';sb.className='btn primary';sb.onclick=function(){closeAcct();openSub();};}
  document.getElementById('acctModal').classList.add('show');loadSessions();}
function closeAcct(){document.getElementById('acctModal').classList.remove('show');}
function ago(ts){if(!ts)return 'à l\'instant';var s=Math.floor(Date.now()/1000)-ts;
  if(s<60)return 'à l\'instant';if(s<3600)return 'il y a '+Math.floor(s/60)+' min';
  if(s<86400)return 'il y a '+Math.floor(s/3600)+' h';return 'il y a '+Math.floor(s/86400)+' j';}
async function loadSessions(){var el=document.getElementById('acctSessions');
  el.innerHTML='<div class="hint">Chargement…</div>';
  var r=await j('/app/sessions');if(!r)return;var ss=((await r.json()).sessions)||[];
  if(!ss.length){el.innerHTML='<div class="hint">Aucune session.</div>';return;}
  el.innerHTML=ss.map(function(s){return '<div class="ses"><div class="sesinfo">'+
    '<b>'+esc(s.device||'Appareil')+(s.current?' <span class="badge">cet appareil</span>':'')+'</b>'+
    '<span class="sub">'+esc(s.ip||'IP inconnue')+' · vu '+ago(s.lastSeen)+'</span></div>'+
    (s.current?'':'<button class="btn danger sm" onclick="revokeSession(\''+s.id+'\')">Déconnecter</button>')+
    '</div>';}).join('');}
async function revokeSession(id){if(!confirm('Déconnecter cet appareil ?'))return;
  await jsonPost('/app/session/revoke',{id:id});toast('Appareil déconnecté');loadSessions();}

/* ---- clés de liaison (1 par serveur) ---- */
function openKeys(){document.getElementById('keyReveal').style.display='none';
  document.getElementById('genBtn').style.display='';loadKeys();
  document.getElementById('keyModal').classList.add('show');}
function closeKeys(){document.getElementById('keyModal').classList.remove('show');}
async function loadKeys(){var r=await j('/app/keys');if(!r)return;var d=await r.json();
  var el=document.getElementById('keyList');
  if(!d.keys.length){el.innerHTML='<p class="muted">Aucune clé. Génère-en une ci-dessus.</p>';return;}
  el.innerHTML='';d.keys.forEach(function(k){var row=document.createElement('div');row.className='keyrow';
    var srv=(k.servers||[]);
    var assoc=srv.length?'<span class="kassoc">🔗 '+srv.map(function(s){return esc(s.name)+(s.online?' ●':'')}).join(', ')+'</span>':'<span class="kfree">libre</span>';
    var names=srv.map(function(s){return s.name}).join(', ');
    row.innerHTML='<div class="kinfo"><span class="km">'+esc(k.mask)+'</span>'+assoc+'</div>'+
      '<span class="kd">'+(k.created||'').slice(0,10)+'</span>'+
      '<button onclick="revokeKey(\''+k.id+'\',\''+esc(names)+'\')">Révoquer</button>';
    el.appendChild(row);});}
async function genKey(){var r=await jsonPost('/app/key/new',{});if(!r)return;var d=await r.json();
  document.getElementById('keyCmd').textContent=d.command;
  document.getElementById('keyReveal').style.display='';
  document.getElementById('genBtn').style.display='none';loadKeys();}
function copyCmd(){var t=document.getElementById('keyCmd').textContent;
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){toast('Commande copiée ✓')});else toast('Copie manuelle');}
async function revokeKey(id,names){var msg=names?('⚠️ Cette clé est utilisée par : '+names+'.\nCe(s) serveur(s) seront déconnectés et devront être re-linkés. Révoquer ?'):'Révoquer cette clé ?';
  if(!confirm(msg))return;
  await jsonPost('/app/key/remove',{id:id});toast('Clé révoquée');loadKeys();}

/* ---- éditer un serveur (renommer / retirer) ---- */
