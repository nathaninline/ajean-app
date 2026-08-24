function editServer(id,name){document.getElementById('sId').value=id;document.getElementById('sName').value=name;
  document.getElementById('srvModal').classList.add('show');}
function closeSrv(){document.getElementById('srvModal').classList.remove('show');}
async function saveServer(){var id=document.getElementById('sId').value,name=document.getElementById('sName').value.trim();
  if(!name){toast('Donne un nom');return;}
  await jsonPost('/app/machine/rename',{id:id,name:name});closeSrv();toast('Enregistré ✓');load();}
async function delServer(){var id=document.getElementById('sId').value,name=document.getElementById('sName').value;
  if(!confirm('Retirer « '+name+' » du compte ?'))return;
  await jsonPost('/app/machine/remove',{id:id});closeSrv();toast('Retiré');load();}

/* ---- cartes serveur : statut/modèle/VRAM via la boîte noire (e2ecall) -------- */
async function probe(m){var out={};
  try{var s=await e2ecall(m,'GET','/api/status');out.health=s.health;out.ctx=s.ctx;}
  catch(e){if(String(e).indexOf('e2e-unconfirmed')>=0)out.locked=true;return out;}
  try{var ps=await e2ecall(m,'GET','/api/presets');var a=(ps||[]).find(function(p){return p.active});if(a){out.model=a.name;out.quant=a.quant;}}catch(e){}
  try{var g=await e2ecall(m,'GET','/api/vram');if(g&&g.length)out.gpus=g;}catch(e){}
  return out;}
function probeSkeleton(){return '<div class="body">'+
  '<div class="modelrow" style="display:none"><span class="mbadge"></span></div>'+
  '<div class="vram" style="display:none"></div></div>';}
function updateProbe(card,p){var b=card.querySelector('.body');if(!b)return;
  var st=card.querySelector('.st-t');if(st)st.textContent=p.health?'prêt':'démarrage';
  var mr=b.querySelector('.modelrow'),mb=b.querySelector('.mbadge');
  if(mr){if(p.model){mb.textContent=p.model+(p.quant?' · '+p.quant:'');mr.style.display='';}else mr.style.display='none';}
  var vr=b.querySelector('.vram');
  if(vr){var gs=p.gpus||[];
    if(vr.children.length!==gs.length)
      vr.innerHTML=gs.map(function(){return '<div class="gline"><div class="gbar"><i style="width:0"></i></div><span class="vlabel"></span></div>';}).join('');
    gs.forEach(function(g,i){var ln=vr.children[i];if(!ln)return;
      var pct=g.total?Math.round(100*g.used/g.total):0;
      ln.querySelector('i').style.width=pct+'%';
      var nm=(gs.length>1&&g.name)?(g.name.replace(/NVIDIA |GeForce /g,'')+' · '):'';
      ln.querySelector('.vlabel').textContent=nm+(g.used/1024).toFixed(1)+'/'+(g.total/1024).toFixed(0)+' GiB · '+pct+'%'+(g.util?' · ⚡'+g.util+'%':'');});
    vr.style.display=gs.length?'':'none';}}
function fillProbe(m,card){probe(m).then(function(p){PROBE[m.id]=p;updateProbe(card,p);
  if(p.locked){var st=card.querySelector('.st-t');if(st){st.textContent='🔒 confirmer la boîte noire';st.style.cursor='pointer';st.title='Vérifier l\'empreinte E2E pour voir l\'état';
    st.onclick=function(e){e.stopPropagation();e2eConfirm(m).then(function(){fillProbe(m,card);});};}}});}

function serverCard(m){var d=document.createElement('div');d.className='tile srv'+(m.online?'':' off');
  var body=m.online?probeSkeleton():'<div class="body"><div class="offhint">Clique pour renommer ou retirer</div></div>';
  var status=m.online?'connexion…':'hors ligne';
  d.innerHTML='<div class="top">'+
      '<span class="hcol"><span class="name">'+esc(m.name)+'</span>'+
      '<span class="subln"><span class="host">'+esc(m.hostname||m.id.slice(0,8))+'</span><span class="st-t">'+status+'</span></span></span>'+
      '<span class="dot '+(m.online?'on':'')+'"></span></div>'+body;
  // Serveur en ligne → on l'ouvre dans la vraie UI jean web (boîte noire). Hors ligne → édition.
  // On MÉMORISE le dernier serveur ouvert : au prochain lancement de la PWA on y
  // retourne direct (voir maybeAutoOpen), au lieu de repasser par « Mes serveurs ».
  d.onclick=function(){if(m.online){try{localStorage.setItem('ajk-home',m.id);}catch(e){}location.href='server.html?m='+encodeURIComponent(m.id)+'&v='+BUILD;}else editServer(m.id,m.name);};
  if(m.online&&PROBE[m.id])updateProbe(d,PROBE[m.id]);
  return d;}

function renderServers(){var g=document.getElementById('grid');g.innerHTML='';SCARDS={};
  if(!MACHINES.length){g.innerHTML='<div class="empty">Aucun serveur connecté.<br>Clique « Gérer les clés » pour générer une clé de liaison.</div>';return;}
  MACHINES.forEach(function(m){var c=serverCard(m);SCARDS[m.id]=c;g.appendChild(c);});}

async function load(){
  var rm=await j('/app/machines');if(!rm)return;MACHINES=(await rm.json()).machines;
  document.getElementById('srvCt').textContent=MACHINES.length;
  // rafraîchit l'état d'abonnement (mur d'abonnement si inactif)
  try{var ru=await j('/app/usage');if(ru){ACTIVE=(await ru.json()).active;}}catch(e){}
  var sigM=JSON.stringify(MACHINES.map(function(m){return [m.id,m.online,m.name,m.hostname]}));
  if(sigM!==SIG_M){SIG_M=sigM;renderServers();}
  MACHINES.forEach(function(m){if(m.online&&SCARDS[m.id])fillProbe(m,SCARDS[m.id]);});
}

/* ---- onglets ---- */
function tab(v){document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('on',t.dataset.v===v);});
  document.querySelectorAll('.tabview').forEach(function(x){x.classList.toggle('on',x.id==='view-'+v);});
  if(v==='help')loadArticles();
  if(v==='support')loadSupport();}

/* ---- Aide / FAQ (articles publiés) ---- */
