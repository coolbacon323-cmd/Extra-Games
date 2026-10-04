const views=[...document.querySelectorAll(".view")],byId=id=>document.getElementById(id),nav=[...document.querySelectorAll(".nav")],title=document.querySelector("#title");
const names={home:"Discover something new",store:"Store",library:"Your Library",wishlist:"Wishlist",community:"Community",messages:"Messages",rules:"Rules",admin:"Admin",news:"News",upload:"Upload Game",account:"Account",settings:"Settings"};
let currentGames=[];
let currentStaffRole="user";
let searchText="";
let gameTypeFilter="all";
const WISHLIST_KEY="extra_games_wishlist_v1";
const LOCAL_USERS_KEY="extra_games_local_users_v1";
const LOCAL_SESSION_KEY="extra_games_local_session_v1";
const ADMIN_EMAIL=(window.EXTRA_GAMES_ADMIN_EMAIL||"cool.bacon323@gmail.com").trim().toLowerCase();
const readWishlist=()=>{try{return JSON.parse(localStorage.getItem(WISHLIST_KEY)||"[]").filter(Boolean)}catch{return[]}};
const saveWishlist=list=>localStorage.setItem(WISHLIST_KEY,JSON.stringify([...new Set(list)]));
const readLocalUsers=()=>{try{return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY)||"[]")}catch{return[]}};
const saveLocalUsers=users=>localStorage.setItem(LOCAL_USERS_KEY,JSON.stringify(users));
const readLocalSession=()=>{try{return JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY)||"null")}catch{return null}};
const saveLocalSession=user=>{if(user)localStorage.setItem(LOCAL_SESSION_KEY,JSON.stringify(user));else localStorage.removeItem(LOCAL_SESSION_KEY)};
const LOCAL_GAMES_DB="extra_games_web_store_v1";
let localGamesDbPromise;
function openLocalGamesDb(){
  if(localGamesDbPromise)return localGamesDbPromise;
  localGamesDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(LOCAL_GAMES_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("games"))db.createObjectStore("games",{keyPath:"id"})};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Local game storage is unavailable."));
  });
  return localGamesDbPromise;
}
async function localGamesAll(){
  const db=await openLocalGamesDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("games","readonly"),req=tx.objectStore("games").getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error||new Error("Could not read local games."));
  });
}
async function localGamePut(game){
  const db=await openLocalGamesDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("games","readwrite");
    tx.objectStore("games").put(game);
    tx.oncomplete=()=>resolve(game);
    tx.onerror=()=>reject(tx.error||new Error("Could not save the game package on this device."));
  });
}
async function localGameGet(id){
  const db=await openLocalGamesDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("games","readonly"),req=tx.objectStore("games").get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error("Could not open the local game."));
  });
}
function localGamePublic(g){
  const session=readLocalSession();
  return {id:g.id,title:g.title,description:g.description,price:Number(g.price||0),creatorName:g.creatorName||"LOCAL CREATOR",status:"approved",createdAt:g.createdAt,owned:!!session&&g.creatorId===session.id,localOnly:true,localCreatorId:g.creatorId,gameType:g.gameType||"desktop",vrRuntime:g.vrRuntime||"",vrHeadsets:g.vrHeadsets||"",vrDevice:g.vrDevice||"",packageType:g.packageType||(g.filename||"").split(".").pop().toLowerCase()};
}
async function localHash(value){const data=new TextEncoder().encode(value),digest=await crypto.subtle.digest("SHA-256",data);return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function localUserView(u){const email=String(u.email||"").toLowerCase();const role=u.role||(email===ADMIN_EMAIL?"owner":"user");return{id:u.id,name:u.name,email:u.email,isAdmin:!!u.isAdmin||role!=="user"||email===ADMIN_EMAIL,role,localOnly:true}}
function show(view){views.forEach(v=>v.classList.toggle("active",v.id===view));nav.forEach(n=>n.classList.toggle("active",n.dataset.view===view));if(title)title.textContent=names[view]||"Extra Games";history.replaceState(null,"","#"+view);if(view==="store")loadStore();if(view==="library")loadLibrary();if(view==="wishlist")loadWishlist();if(view==="community")loadCommunity();if(view==="messages")loadConversations();if(view==="admin")loadAdmin(); }
nav.forEach(n=>n.addEventListener("click",()=>show(n.dataset.view)));
document.querySelectorAll("[data-view]").forEach(n=>n.addEventListener("click",()=>{if(n.dataset.view)show(n.dataset.view)}));
async function api(path,options={}){
  try{
    const r=await fetch(path,options);
    let d={};try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d.error||"Request failed.");
    return d;
  }catch(error){
    const method=String(options.method||"GET").toUpperCase();
    if(path==="/api/auth/me"&&method==="GET"){
      const user=readLocalSession();
      return{user:user?localUserView(user):null,local:true};
    }
    if(path==="/api/auth/signup"&&method==="POST"){
      const body=JSON.parse(options.body||"{}");
      const name=String(body.name||"").trim(),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
      if(!name||name.length>32||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||password.length<8)throw new Error("Use a valid name, email and password of at least 8 characters.");
      const users=readLocalUsers();
      if(users.some(u=>u.email===email))throw new Error("An account with that email already exists on this device.");
      const passwordHash=await localHash(password+"|"+email);
      const owner=email===ADMIN_EMAIL;const user={id:crypto.randomUUID(),name,email,passwordHash,isAdmin:owner,role:owner?"owner":"user",createdAt:new Date().toISOString()};
      users.push(user);saveLocalUsers(users);saveLocalSession(user);
      return{user:localUserView(user),local:true};
    }
    if(path==="/api/auth/login"&&method==="POST"){
      const body=JSON.parse(options.body||"{}"),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
      const user=readLocalUsers().find(u=>u.email===email);
      if(!user)throw new Error("No local account was found. The website backend is currently unavailable.");
      const passwordHash=await localHash(password+"|"+email);
      if(passwordHash!==user.passwordHash)throw new Error("Invalid email or password.");
      saveLocalSession(user);
      return{user:localUserView(user),local:true};
    }
    if(path==="/api/auth/logout"&&method==="POST"){saveLocalSession(null);return{ok:true,local:true}};
    throw new Error("The Extra Games website backend is unavailable. The launcher can still use its built-in server.");
  }
}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function launcherAvailable(){return !!window.launcher}
function launcherVersion(){try{return window.launcher.version()}catch{return"0.5.4"}}
function updateLauncherUI(){const mode=byId("launcher-mode"),desc=byId("launcher-description");if(mode){mode.textContent=launcherAvailable()?"WINDOWS LAUNCHER":"WEB APP";mode.classList.toggle("desktop",launcherAvailable())}if(desc&&launcherAvailable())desc.textContent="Running inside Extra Games Launcher "+launcherVersion()+". This desktop app uses the same Extra Games interface."}
function renderGames(){
  const box=byId("dynamic-games");if(!box)return;
  const matchesType=g=>gameTypeFilter==="all"||(gameTypeFilter==="vr"?(g.gameType==="vr"||g.gameType==="both"):gameTypeFilter==="quest-apk"?g.packageType==="apk":g.gameType===gameTypeFilter);
  const list=currentGames.filter(g=>matchesType(g)&&(String(g.title)+" "+String(g.description)+" "+String(g.creatorName)).toLowerCase().includes(searchText));
  byId("store-count").textContent=list.length+" game"+(list.length===1?"":"s");
  if(!list.length){box.innerHTML="<div class='empty compact'><strong>No games found</strong><p>Try a different search or game-type filter.</p></div>";return}
  const wished=new Set(readWishlist());
  box.innerHTML=list.map(g=>{
    const owned=!!g.owned,vr=g.gameType==="vr"||g.gameType==="both",apk=g.packageType==="apk";
    const typeBadge=g.gameType==="both"?"DESKTOP + VR":vr?"VR":"DESKTOP";
    const packageBadge=apk?"QUEST APK":g.packageType==="exe"?"EXE":g.packageType==="zip"?"ZIP":"PACKAGE";
    const vrMeta=vr?"<div class='vr-meta'><span>VR READY</span>"+(apk?"<span>QUEST APK</span>":"")+(g.vrDevice?"<span>"+escapeHtml(g.vrDevice.replaceAll("-"," ").toUpperCase())+"</span>":"")+(g.vrRuntime?"<span>"+escapeHtml(g.vrRuntime)+"</span>":"")+(g.vrHeadsets?"<small>"+escapeHtml(g.vrHeadsets)+"</small>":"")+"</div>":"";
    return "<article class='game-card "+(vr?"vr-game-card":"")+(apk?" quest-apk-card":"")+"'><div class='game-art'>"+(apk?"QUEST ":"")+(vr&&!apk?"VR ":"")+escapeHtml((g.title||"EX").slice(0,2).toUpperCase())+"</div><div class='game-info'><div class='game-card-badges'><span class='badge'>"+escapeHtml(typeBadge)+"</span><span class='badge package-badge'>"+escapeHtml(packageBadge)+"</span>"+(g.localOnly?"<span class='badge local-badge'>LOCAL</span>":"")+"</div><h3>"+escapeHtml(g.title)+"</h3><p>"+escapeHtml(g.description||"")+"</p>"+vrMeta+"<div class='game-bottom'><strong>"+(g.price===0?"FREE":"€"+Number(g.price).toFixed(2))+"</strong><div><button class='icon-button wish-game' data-id='"+g.id+"' title='Wishlist'>"+(wished.has(g.id)?"♥":"♡")+"</button><button class='gold buy-game' data-id='"+g.id+"'>"+(owned?"Open Library":(g.price===0?"Get Free":"Buy Game"))+"</button></div></div></div></article>"
  }).join("");
  box.querySelectorAll(".wish-game").forEach(b=>b.onclick=()=>toggleWishlist(b.dataset.id));
  box.querySelectorAll(".buy-game").forEach(b=>b.onclick=()=>{const g=currentGames.find(x=>x.id===b.dataset.id);if(g?.owned)show("library");else startCheckout(b.dataset.id)})
}
async function loadStore(){
  const box=byId("dynamic-games");if(!box)return;
  box.innerHTML="<div class='empty compact'><strong>Loading games…</strong></div>";
  let serverGames=[];
  try{const d=await api("/api/games");serverGames=d.games||[]}catch{}
  try{
    const local=await localGamesAll();
    const session=readLocalSession();
    const serverIds=new Set(serverGames.map(g=>g.id));
    const localPublic=local.filter(g=>!!session&&g.creatorId===session.id&&!serverIds.has(g.id)).map(localGamePublic);
    currentGames=[...serverGames,...localPublic];
    renderGames();
    if(!serverGames.length&&localPublic.length){
      box.insertAdjacentHTML("afterbegin","<div class='offline-note'><strong>Local web mode</strong><span>These games are stored securely in this browser. Connect a real website backend to publish them to other users.</span></div>");
    }else if(!serverGames.length&&!localPublic.length){
      box.innerHTML="<div class='empty compact'><strong>No games found</strong><p>Upload a game or connect the website backend to load the public store.</p></div>";
    }
  }catch(e){
    box.innerHTML="<div class='empty compact'><strong>Store unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>";
  }
}
function toggleWishlist(id){const list=readWishlist(),next=list.includes(id)?list.filter(x=>x!==id):[...list,id];saveWishlist(next);renderGames();if(document.querySelector("#wishlist.active"))loadWishlist()}
async function loadWishlist(){const box=byId("wishlist-games");if(!box)return;const ids=new Set(readWishlist());if(!ids.size){box.innerHTML="<div class='empty'><strong>Your wishlist is empty</strong><p>Use ♡ on a store game to add it here.</p><button class='gold' data-view='store'>Browse Store</button></div>";return}try{if(!currentGames.length){const d=await api("/api/games");currentGames=d.games||[]}const list=currentGames.filter(g=>ids.has(g.id));if(!list.length){box.innerHTML="<div class='empty'><strong>No current store matches</strong><p>The saved games may have been removed from the store.</p></div>";return}box.innerHTML=list.map(g=>"<article class='game-card'><div class='game-art'>"+escapeHtml((g.title||"EX").slice(0,2).toUpperCase())+"</div><div class='game-info'><span class='badge'>WISHLIST</span><h3>"+escapeHtml(g.title)+"</h3><p>"+escapeHtml(g.description||"")+"</p><div class='game-bottom'><strong>"+(g.price===0?"FREE":"€"+Number(g.price).toFixed(2))+"</strong><div><button class='outline remove-wish' data-id='"+g.id+"'>Remove</button><button class='gold buy-game' data-id='"+g.id+"'>"+(g.owned?"Open Library":(g.price===0?"Get Free":"Buy Game"))+"</button></div></div></div></article>").join("");box.querySelectorAll(".remove-wish").forEach(b=>b.onclick=()=>toggleWishlist(b.dataset.id));box.querySelectorAll(".buy-game").forEach(b=>b.onclick=()=>{const g=currentGames.find(x=>x.id===b.dataset.id);if(g?.owned)show("library");else startCheckout(b.dataset.id)})}catch(e){box.innerHTML="<div class='empty'><strong>Wishlist unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}}
async function loadLibrary(){
  const box=byId("library-games");if(!box)return;
  box.innerHTML="<div class='empty compact'><strong>Loading library…</strong></div>";
  try{
    const d=await api("/api/library");
    const games=d.games||[];
    box.innerHTML=games.length?games.map(g=>"<article class='game-card'><div class='game-art'>"+escapeHtml((g.title||"EX").slice(0,2).toUpperCase())+"</div><div class='game-info'><span class='badge'>LIBRARY</span><h3>"+escapeHtml(g.title)+"</h3><p>"+escapeHtml(g.description||"")+"</p><div class='game-bottom'><strong>READY</strong><button class='gold download-game' data-id='"+g.id+"'>Download</button></div></div></article>").join(""):"<div class='empty'><strong>Your library is empty</strong><p>Purchase or get a free game from the Store to see it here.</p><button class='gold' data-view='store'>Find Games</button></div>";
    box.querySelectorAll(".download-game").forEach(b=>b.onclick=()=>{location.href="/api/games/"+encodeURIComponent(b.dataset.id)+"/download"});
  }catch{
    const session=readLocalSession();
    if(!session){box.innerHTML="<div class='empty'><strong>Log in to view your library</strong><p>Sign in to access locally stored games.</p><button class='outline' data-view='account'>Open Account</button></div>";return}
    try{
      const local=(await localGamesAll()).filter(g=>g.creatorId===session.id).map(localGamePublic);
      box.innerHTML=local.length?local.map(g=>"<article class='game-card'><div class='game-art'>"+escapeHtml((g.title||"EX").slice(0,2).toUpperCase())+"</div><div class='game-info'><span class='badge'>LOCAL LIBRARY</span><h3>"+escapeHtml(g.title)+"</h3><p>"+escapeHtml(g.description||"")+"</p><div class='game-bottom'><strong>READY</strong><button class='gold local-download' data-id='"+escapeHtml(g.id)+"'>Download</button></div></div></article>").join(""):"<div class='empty'><strong>Your local library is empty</strong><p>Upload a ZIP or EXE to save a game on this device.</p><button class='gold' data-view='upload'>Upload Game</button></div>";
      box.querySelectorAll(".local-download").forEach(b=>b.onclick=async()=>{try{const g=await localGameGet(b.dataset.id);if(!g?.file){throw new Error("Game package not found.")}const url=URL.createObjectURL(g.file);const a=document.createElement("a");a.href=url;a.download=g.filename||g.title;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){alert(e.message)}});
    }catch(e){box.innerHTML="<div class='empty'><strong>Library unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
  }
}
async function refreshAccount(){try{
  const d=await api("/api/auth/me"),panel=byId("account-panel"),msg=byId("account-message"),label=byId("profile-label"),adminNav=document.querySelector(".admin-nav");
  if(!panel||!msg)return;
  if(d.user){
    const role=d.user.role||"user";
    const isStaff=!!d.user.isAdmin||role!=="user"||String(d.user.email||"").trim().toLowerCase()===ADMIN_EMAIL;
    msg.textContent="Signed in as "+d.user.name+" ("+d.user.email+")."+(role!=="user"?" Role: "+role+".":"")+(d.local?" Web-only account stored on this device.":"");
    if(label)label.textContent=d.user.name;
    panel.hidden=false;
    panel.innerHTML="<strong>"+(d.local?"Web account active":"Account active")+"</strong><p>"+(role!=="user"?"Staff role: "+escapeHtml(role)+". ":"")+(d.local?"This site is currently using its local account fallback because its server backend is not connected.":"Upload games, purchase approved games and manage your library.")+"</p><button class='outline' id='logout'>Log out</button>"+(isStaff?"<button class='gold' id='open-admin-account'>Open Admin</button>":"");
    byId("logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.reload()};
    byId("open-admin-account")?.addEventListener("click",()=>show("admin"));
    if(adminNav){adminNav.hidden=!isStaff;adminNav.setAttribute("aria-hidden",String(!isStaff))}
    if(isStaff)loadAdminNotifications();
  }else{
    msg.textContent="Sign in to buy games, manage your library and upload games.";
    if(label)label.textContent="Account";
    panel.hidden=true;
    if(adminNav)adminNav.hidden=true;
  }
}catch{document.querySelector(".admin-nav")?.setAttribute("hidden","hidden")}}
byId("login-form")?.addEventListener("submit",async e=>{e.preventDefault();const s=byId("login-status");s.textContent="Signing in…";try{const d=await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(e.target))});s.textContent=d.local?"Logged in with this browser account.":"Logged in.";await refreshAccount();show("home")}catch(err){s.textContent=err.message}});
byId("signup-form")?.addEventListener("submit",async e=>{e.preventDefault();const s=byId("signup-status");s.textContent="Creating account…";try{const d=await api("/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(e.target))});s.textContent=d.local?"Account created on this device. Connect the website backend later to sync it across devices.":"Account created and signed in.";await refreshAccount();show("home")}catch(err){s.textContent=err.message}});
byId("upload-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const s=byId("upload-status");s.textContent="Uploading…";
  const data=new FormData(e.target),file=data.get("game");
  const gameType=String(data.get("gameType")||"desktop");
  const vrRuntime=String(data.get("vrRuntime")||"").trim();
  const vrDevice=String(data.get("vrDevice")||"").trim();
  const vrHeadsets=data.getAll("vrHeadsets").map(v=>String(v).trim()).filter(Boolean);
  const ext=file instanceof File?file.name.toLowerCase().split(".").pop():"";
  if((gameType==="vr"||gameType==="both")&&!vrRuntime){s.textContent="Enter the VR runtime/technology for this game.";return}
  if(ext==="apk"&&gameType==="desktop"){s.textContent="APK packages must be marked as VR or Desktop + VR.";return}
  if(ext==="apk"&&!vrDevice){s.textContent="Select the VR device target for this APK.";return}
  try{
    const d=await api("/api/games/upload",{method:"POST",body:data});
    s.textContent="Uploaded "+d.game.title+". It is pending admin approval.";
    e.target.reset();setVrUploadFields();return;
  }catch{}
  const session=readLocalSession();
  if(!session){s.textContent="Log in first. When the website backend is offline, uploads are saved securely to this browser.";show("account");return}
  if(!(file instanceof File)||!file.size){s.textContent="Choose a ZIP, EXE or APK game package.";return}
  try{
    const titleValue=String(data.get("title")||"").trim(),description=String(data.get("description")||"").trim(),price=Number(data.get("price")||0);
    if(!titleValue||!description){s.textContent="Enter a game name and description.";return}
    await localGamePut({id:"local-"+crypto.randomUUID(),title:titleValue,description,price,gameType,vrRuntime,vrDevice,vrHeadsets,packageType:ext,creatorId:session.id,creatorName:session.name,filename:file.name,file,fileType:file.type,createdAt:new Date().toISOString()});
    s.textContent="Saved "+titleValue+" locally. It survives browser and launcher updates, but is not published to other users until the real website backend is connected.";
    e.target.reset();setVrUploadFields();await loadStore();await loadLibrary();
  }catch(err){
    s.textContent=err?.name==="QuotaExceededError"?"The browser does not have enough local storage space for this game package.":"Could not save this game locally: "+err.message;
  }
});
async function loadAdmin(){show("account");const panel=byId("account-panel");try{const d=await api("/api/admin/games");panel.innerHTML="<h3>Admin review</h3>"+d.games.map(g=>"<div class='admin-row'><strong>"+escapeHtml(g.title)+"</strong> <span>"+escapeHtml(g.status)+"</span><button class='gold' data-a='approve' data-id='"+g.id+"'>Approve</button><button class='outline' data-a='reject' data-id='"+g.id+"'>Reject</button></div>").join("");panel.hidden=false;panel.querySelectorAll("[data-a]").forEach(b=>b.onclick=async()=>{await api("/api/admin/games/"+b.dataset.id+"/"+b.dataset.a,{method:"POST"});loadAdmin()})}catch(e){panel.innerHTML="<p>"+escapeHtml(e.message)+"</p>"}}
async function startCheckout(gameId){
  try{
    const game=currentGames.find(g=>g.id===gameId);
    if(game?.localOnly&&game?.owned){show("library");return}
    const me=await api("/api/auth/me");
    if(!me.user){show("account");throw new Error("Log in or create an account before purchasing.")}
    if(me.local)throw new Error("The website is in local mode. Your uploaded games are saved on this device; paid purchases need the connected website backend.");
    const d=await api("/api/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({gameId})});
    if(d.free){await loadLibrary();show("library");return}
    window.location.href=d.url
  }catch(e){alert(e.message)}
}
const globalSearch=byId("global-search");globalSearch?.addEventListener("input",e=>{searchText=e.target.value.trim().toLowerCase();if(document.querySelector("#store.active")){renderGames()}else{show("store");renderGames()}});
byId("clear-search")?.addEventListener("click",()=>{searchText="";if(globalSearch)globalSearch.value="";gameTypeFilter="all";if(byId("game-type-filter"))byId("game-type-filter").value="all";renderGames()});
byId("game-type-filter")?.addEventListener("change",e=>{gameTypeFilter=e.target.value;renderGames()});
function setVrUploadFields(){const type=byId("upload-game-type")?.value||"desktop",box=byId("vr-upload-fields");if(box)box.hidden=!(type==="vr"||type==="both")}
byId("upload-game-type")?.addEventListener("change",setVrUploadFields);
setVrUploadFields();
byId("check-updates")?.addEventListener("click",async()=>{const s=byId("update-status");if(!launcherAvailable()){s.textContent="Open the Windows launcher to update it.";return}s.textContent="Checking…";try{const result=await window.launcher.checkForUpdates();s.textContent=result?.updateInfo?"Update found.":"You're up to date."}catch{s.textContent="Update check unavailable."}});
if(launcherAvailable()){window.launcher.onUpdateAvailable(info=>{const s=byId("update-status");if(s)s.textContent="Update "+(info?.version||"available")+" ready to download.";});window.launcher.onUpdateDownloaded(info=>{const s=byId("update-status");if(s)s.textContent="Update downloaded. Restart to install.";});}
async function loadAdmin(){
  const me=await api("/api/auth/me");
  if(!me.user||!me.user.isAdmin){alert("Staff access required.");show("account");return}
  const role=me.user.role||"user";
  currentStaffRole=role;
  byId("admin-current-role").textContent=role;
  byId("admin-role-line").textContent="Signed in as "+me.user.name+" • "+role;
  loadAdminUsers("");
  loadAdminReports();
  loadAdminNotifications();
}
function switchAdminTab(tab){
  document.querySelectorAll(".admin-tab").forEach(b=>b.classList.toggle("active",b.dataset.adminTab===tab));
  document.querySelectorAll(".admin-panel").forEach(p=>p.classList.toggle("active",p.id==="admin-"+tab));
  if(tab==="users")loadAdminUsers(byId("admin-user-search")?.value.trim()||"");
  if(tab==="reports")loadAdminReports();
  if(tab==="notifications")loadAdminNotifications();
}
document.querySelectorAll(".admin-tab").forEach(b=>b.addEventListener("click",()=>switchAdminTab(b.dataset.adminTab)));
function roleOptions(current){
  return ["user","moderator","manager","admin","co-owner"].map(r=>"<option value='"+r+"' "+(r===current?"selected":"")+">"+r+"</option>").join("");
}
async function loadAdminUsers(q){
  const box=byId("admin-user-results");if(!box)return;
  box.innerHTML="<div class='empty compact'><strong>Loading users…</strong></div>";
  try{
    const d=await api("/api/admin/users?q="+encodeURIComponent(q||""));
    if(!d.users?.length){box.innerHTML="<div class='empty compact'><strong>No users found</strong></div>";return}
    box.innerHTML=d.users.map(u=>{
      const owner=u.role==="owner";
      const staffLevels={user:0,moderator:1,manager:2,admin:3,"co-owner":4,owner:5};
      const canAssign=currentStaffRole==="owner";
      const canAct=!owner&&(staffLevels[currentStaffRole]||0)>(staffLevels[u.role]||0);
      const roleControls=canAssign?"<label>Role<select class='admin-role-select' data-id='"+u.id+"'>"+roleOptions(u.role)+"</select></label><button class='gold save-role' data-id='"+u.id+"'>Save Role</button>":"";
      const banControls=canAct?(u.banned?"<button class='outline unban-user' data-id='"+u.id+"'>Unban</button>":"<button class='danger-button ban-user' data-id='"+u.id+"'>Ban</button>"):"";
      return "<article class='admin-user-card'><div class='person-avatar'>"+escapeHtml(u.name.slice(0,2).toUpperCase())+"</div><div class='admin-user-main'><div class='admin-user-head'><div><span class='badge'>"+escapeHtml(u.role.toUpperCase())+"</span><h3>"+escapeHtml(u.name)+"</h3><small>"+escapeHtml(u.email)+"</small></div><span class='ban-state "+(u.banned?"banned":"ok")+"'>"+(u.banned?"BANNED":"ACTIVE")+"</span></div><div class='admin-user-actions'>"+(owner?"<span class='owner-lock'>OWNER ACCOUNT — PROTECTED</span>":roleControls+banControls)+"</div>"+(u.banned&&u.bannedReason?"<p class='ban-reason'>Reason: "+escapeHtml(u.bannedReason)+"</p>":"")+"</div></article>"
    }).join("");
    box.querySelectorAll(".save-role").forEach(b=>b.onclick=async()=>{const select=box.querySelector(".admin-role-select[data-id='"+b.dataset.id+"']");try{await api("/api/admin/users/"+b.dataset.id+"/role",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:select.value})});loadAdminUsers(q)}catch(e){alert(e.message)}});
    box.querySelectorAll(".ban-user").forEach(b=>b.onclick=async()=>{const reason=prompt("Ban reason:","Rule violation");if(reason===null)return;try{await api("/api/admin/users/"+b.dataset.id+"/ban",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})});loadAdminUsers(q)}catch(e){alert(e.message)}});
    box.querySelectorAll(".unban-user").forEach(b=>b.onclick=async()=>{try{await api("/api/admin/users/"+b.dataset.id+"/unban",{method:"POST"});loadAdminUsers(q)}catch(e){alert(e.message)}});
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Admin users unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
byId("admin-user-search-button")?.addEventListener("click",()=>loadAdminUsers(byId("admin-user-search")?.value.trim()||""));
byId("admin-user-search")?.addEventListener("keydown",e=>{if(e.key==="Enter")loadAdminUsers(byId("admin-user-search").value.trim())});
async function loadAdminReports(){
  const box=byId("admin-report-results");if(!box)return;
  try{
    const d=await api("/api/admin/reports");
    const open=d.reports.filter(r=>r.status==="open");
    byId("admin-report-count").textContent=String(open.length);
    if(!d.reports.length){box.innerHTML="<div class='empty compact'><strong>No reports</strong></div>";return}
    box.innerHTML=d.reports.map(r=>{
      const evidence=(r.evidence||[]).map(e=>"<a class='evidence-link' target='_blank' rel='noopener' href='/api/reports/evidence/"+encodeURIComponent(e.filename)+"'>"+escapeHtml(e.originalFilename)+"</a>").join("");
      return "<article class='admin-report-card'><div class='admin-report-head'><span class='badge'>"+escapeHtml(r.status.toUpperCase())+"</span><strong>"+escapeHtml(r.reason)+"</strong><span class='muted'>"+new Date(r.createdAt).toLocaleString()+"</span></div><p><strong>Target:</strong> "+escapeHtml(r.targetName)+" • <strong>Reporter:</strong> "+escapeHtml(r.reporterName)+"</p><p>"+escapeHtml(r.details)+"</p><div class='evidence-list'>"+(evidence||"<span class='muted'>No evidence attached.</span>")+"</div>"+(r.status==="open"?"<button class='outline close-report' data-id='"+r.id+"'>Close Report</button>":"")+"</article>"
    }).join("");
    box.querySelectorAll(".close-report").forEach(b=>b.onclick=async()=>{await api("/api/admin/reports/"+b.dataset.id+"/close",{method:"POST"});loadAdminReports()});
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Reports unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
byId("admin-refresh-reports")?.addEventListener("click",loadAdminReports);
async function loadAdminNotifications(){
  const box=byId("admin-notification-results"),badge=byId("admin-badge"),count=byId("admin-unread-count");if(!box)return;
  try{
    const d=await api("/api/admin/notifications");
    if(count)count.textContent=String(d.unread||0);
    if(badge){badge.textContent=String(d.unread||0);badge.hidden=!d.unread}
    box.innerHTML=d.notifications?.length?d.notifications.map(n=>"<article class='notification-card "+(n.read?"read":"unread")+"'><div><span class='badge'>"+escapeHtml(n.type.toUpperCase())+"</span><h3>"+escapeHtml(n.title)+"</h3><p>"+escapeHtml(n.body)+"</p><small>"+new Date(n.createdAt).toLocaleString()+"</small></div>"+(n.read?"":"<button class='outline mark-notification' data-id='"+n.id+"'>Mark read</button>")+"</article>").join(""):"<div class='empty compact'><strong>No notifications</strong></div>";
    box.querySelectorAll(".mark-notification").forEach(b=>b.onclick=async()=>{await api("/api/admin/notifications/"+b.dataset.id+"/read",{method:"POST"});loadAdminNotifications()});
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Notifications unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
byId("admin-read-all")?.addEventListener("click",async()=>{await api("/api/admin/notifications/read-all",{method:"POST"});loadAdminNotifications()});
byId("admin-refresh-notifications")?.addEventListener("click",loadAdminNotifications);

let selectedMessageUser=null;
async function loadCommunity(){
  document.querySelectorAll(".social-tab").forEach((b,i)=>b.classList.toggle("active",i===0));
  document.querySelectorAll(".social-panel").forEach((p,i)=>p.classList.toggle("active",i===0));
  await Promise.all([loadFriends(),loadCommunities(""),loadCommunityInvites()]);
}
function switchSocialTab(tab){
  document.querySelectorAll(".social-tab").forEach(b=>b.classList.toggle("active",b.dataset.socialTab===tab));
  document.querySelectorAll(".social-panel").forEach(p=>p.classList.toggle("active",p.id==="social-"+tab));
  if(tab==="friends")loadFriends();
  if(tab==="communities")loadCommunities("");
  if(tab==="invites")loadCommunityInvites();
}
document.querySelectorAll(".social-tab").forEach(b=>b.addEventListener("click",()=>switchSocialTab(b.dataset.socialTab)));

async function searchPeople(){
  const q=byId("people-search")?.value.trim()||"";
  const box=byId("people-results");if(!box)return;
  if(q.length<2){box.innerHTML="<div class='empty compact'><strong>Search for a player</strong><p>Enter at least 2 characters of their display name.</p></div>";return}
  box.innerHTML="<div class='empty compact'><strong>Searching…</strong></div>";
  try{
    const d=await api("/api/users/search?q="+encodeURIComponent(q));
    if(!d.users?.length){box.innerHTML="<div class='empty compact'><strong>No players found</strong><p>Try another display name.</p></div>";return}
    box.innerHTML=d.users.map(u=>{
      const status=u.friendStatus;
      const friendButton=status==="accepted"?"<button class='outline' disabled>Friends</button>":status==="pending"?"<button class='outline' disabled>Request pending</button>":"<button class='gold add-friend' data-id='"+u.id+"'>Add Friend</button>";
      return "<article class='person-card'><div class='person-avatar'>"+escapeHtml(u.name.slice(0,2).toUpperCase())+"</div><div class='person-main'><span class='badge'>PLAYER</span><h3>"+escapeHtml(u.name)+"</h3><div class='person-actions'>"+friendButton+"<button class='outline message-user' data-id='"+u.id+"'>Message</button><button class='outline block-user' data-id='"+u.id+"'>Block</button><button class='danger-button report-user' data-id='"+u.id+"' data-name='"+escapeHtml(u.name)+"'>Report</button></div></div></article>"
    }).join("");
    box.querySelectorAll(".add-friend").forEach(b=>b.onclick=async()=>{try{await api("/api/friends/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:b.dataset.id})});searchPeople()}catch(e){alert(e.message)}});
    box.querySelectorAll(".message-user").forEach(b=>b.onclick=()=>openMessageUser(b.dataset.id));
    box.querySelectorAll(".block-user").forEach(b=>b.onclick=()=>blockUser(b.dataset.id));
    box.querySelectorAll(".report-user").forEach(b=>b.onclick=()=>openReportModal(b.dataset.id,b.dataset.name));
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Player search unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
byId("people-search-button")?.addEventListener("click",searchPeople);
byId("people-search")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchPeople()});

async function blockUser(id){
  if(!confirm("Block this player? They will not be able to message or add you while blocked."))return;
  try{await api("/api/blocks/"+encodeURIComponent(id),{method:"POST"});alert("Player blocked.");searchPeople()}catch(e){alert(e.message)}
}
async function loadFriends(){
  const box=byId("friends-list"),requests=byId("friend-requests");if(!box||!requests)return;
  try{
    const d=await api("/api/friends");
    requests.innerHTML=d.incoming?.length?"<div class='subheading'>Incoming requests</div>"+d.incoming.map(x=>"<article class='person-card compact-card'><div><strong>"+escapeHtml(x.user.name)+"</strong><p>Wants to add you.</p></div><div class='person-actions'><button class='gold accept-friend' data-id='"+x.id+"'>Accept</button><button class='outline decline-friend' data-id='"+x.id+"'>Decline</button></div></article>").join(""):"";
    requests.querySelectorAll(".accept-friend").forEach(b=>b.onclick=async()=>{await api("/api/friends/"+b.dataset.id+"/accept",{method:"POST"});loadFriends()});
    requests.querySelectorAll(".decline-friend").forEach(b=>b.onclick=async()=>{await api("/api/friends/"+b.dataset.id+"/decline",{method:"POST"});loadFriends()});
    box.innerHTML=d.friends?.length?d.friends.map(u=>"<article class='person-card compact-card'><div class='person-avatar'>"+escapeHtml(u.name.slice(0,2).toUpperCase())+"</div><div class='person-main'><h3>"+escapeHtml(u.name)+"</h3><div class='person-actions'><button class='outline friend-message' data-id='"+u.id+"'>Message</button><button class='danger-button friend-block' data-id='"+u.id+"'>Block</button></div></div></article>").join(""):"<div class='empty compact'><strong>No friends yet</strong><p>Use People to search display names and send requests.</p></div>";
    box.querySelectorAll(".friend-message").forEach(b=>b.onclick=()=>openMessageUser(b.dataset.id));
    box.querySelectorAll(".friend-block").forEach(b=>b.onclick=()=>blockUser(b.dataset.id));
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Friends unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
async function loadCommunities(q){
  const box=byId("community-results");if(!box)return;
  box.innerHTML="<div class='empty compact'><strong>Loading communities…</strong></div>";
  try{
    const d=await api("/api/communities?q="+encodeURIComponent(q||""));
    if(!d.communities?.length){box.innerHTML="<div class='empty compact'><strong>No communities found</strong><p>Create one or search another group name.</p></div>";return}
    box.innerHTML=d.communities.map(c=>{
      const vis=c.visibility==="public"?"PUBLIC":c.visibility==="private"?"PRIVATE":"INVITE ONLY";
      const join=c.isMember?"<button class='outline' disabled>Joined</button>":"<button class='gold join-community' data-id='"+c.id+"'>"+(c.isInvited?"Accept Invite":"Join")+"</button>";
      const invite=c.canInvite?"<button class='outline invite-community' data-id='"+c.id+"'>Invite Player</button>":"";
      return "<article class='community-result'><div class='community-mark'>◆</div><div class='community-main'><div class='community-head'><span class='badge'>"+vis+"</span><span class='muted'>"+c.memberCount+" member"+(c.memberCount===1?"":"s")+"</span></div><h3>"+escapeHtml(c.name)+"</h3><p>"+escapeHtml(c.description||"No description.")+"</p><div class='person-actions'>"+join+invite+"</div></div></article>"
    }).join("");
    box.querySelectorAll(".join-community").forEach(b=>b.onclick=async()=>{try{await api("/api/communities/"+b.dataset.id+"/join",{method:"POST"});loadCommunities(q);loadCommunityInvites()}catch(e){alert(e.message)}});
    box.querySelectorAll(".invite-community").forEach(b=>b.onclick=()=>inviteToCommunity(b.dataset.id));
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Communities unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
byId("community-search-button")?.addEventListener("click",()=>loadCommunities(byId("community-search")?.value.trim()||""));
byId("community-search")?.addEventListener("keydown",e=>{if(e.key==="Enter")loadCommunities(byId("community-search").value.trim())});
byId("community-create-form")?.addEventListener("submit",async e=>{e.preventDefault();const s=byId("community-create-status");s.textContent="Creating…";try{await api("/api/communities",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(e.target))});s.textContent="Community created.";e.target.reset();loadCommunities("")}catch(err){s.textContent=err.message}});
async function inviteToCommunity(id){
  const name=prompt("Enter the exact display name to invite:");
  if(!name)return;
  try{
    const d=await api("/api/users/search?q="+encodeURIComponent(name.trim()));
    const user=(d.users||[]).find(u=>u.name.toLowerCase()===name.trim().toLowerCase())||d.users?.[0];
    if(!user)throw new Error("Player not found.");
    await api("/api/communities/"+id+"/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id})});
    alert("Invite sent to "+user.name+".");
  }catch(e){alert(e.message)}
}
async function loadCommunityInvites(){
  const box=byId("community-invites");if(!box)return;
  try{
    const d=await api("/api/communities/invites");
    box.innerHTML=d.invites?.length?d.invites.map(x=>"<article class='community-result'><div class='community-mark'>✦</div><div class='community-main'><span class='badge'>INVITE</span><h3>"+escapeHtml(x.community.name)+"</h3><p>"+escapeHtml(x.community.description||"")+"</p><div class='person-actions'><button class='gold accept-community' data-id='"+x.id+"' data-community='"+x.community.id+"'>Join Community</button><button class='outline decline-community' data-id='"+x.id+"'>Decline</button></div></div></article>").join(""):"<div class='empty compact'><strong>No pending invites</strong></div>";
    box.querySelectorAll(".accept-community").forEach(b=>b.onclick=async()=>{try{await api("/api/communities/"+b.dataset.community+"/join",{method:"POST"});loadCommunityInvites();loadCommunities("")}catch(e){alert(e.message)}});
    box.querySelectorAll(".decline-community").forEach(b=>b.onclick=async()=>{await api("/api/communities/invites/"+b.dataset.id+"/decline",{method:"POST"});loadCommunityInvites()});
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Invites unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}

async function loadConversations(){
  const box=byId("conversation-list");if(!box)return;
  try{
    const d=await api("/api/messages/conversations");
    box.innerHTML=d.conversations?.length?d.conversations.map(c=>"<button class='conversation-item' data-id='"+c.user.id+"'><span class='person-avatar'>"+escapeHtml(c.user.name.slice(0,2).toUpperCase())+"</span><span><strong>"+escapeHtml(c.user.name)+"</strong><small>"+escapeHtml(c.lastMessage.slice(0,60))+"</small></span></button>").join(""):"<div class='empty compact'><strong>No conversations yet</strong><p>Search for a player in Community and choose Message.</p></div>";
    box.querySelectorAll(".conversation-item").forEach(b=>b.onclick=()=>openMessageUser(b.dataset.id));
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Messages unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
async function openMessageUser(id){try{const d=await api("/api/users/"+encodeURIComponent(id));const user=d.user;selectedMessageUser=user.id;byId("message-to-user").value=user.id;byId("message-title").textContent="Message "+user.name;show("messages");await loadMessageHistory(user.id,user)}catch(e){alert(e.message)}}
async function loadMessageHistory(id,user){
  try{const d=await api("/api/messages?userId="+encodeURIComponent(id));renderMessageHistory(d.messages||[],user)}catch(e){byId("message-history").innerHTML="<div class='empty compact'><strong>Conversation unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
function renderMessageHistory(messages,user){
  const box=byId("message-history");if(!box)return;
  box.innerHTML=messages.length?messages.map(m=>"<div class='message-bubble "+(m.mine?"mine":"theirs")+"'><span>"+escapeHtml(m.body)+"</span><small>"+new Date(m.createdAt).toLocaleString()+"</small></div>").join(""):"<div class='empty compact'><strong>No messages yet</strong><p>Start the conversation.</p></div>";
  box.scrollTop=box.scrollHeight;
  if(byId("message-to-user"))byId("message-to-user").value=user.id;
}
byId("message-form")?.addEventListener("submit",async e=>{e.preventDefault();const toId=byId("message-to-user")?.value;if(!toId){byId("message-status").textContent="Select a conversation first.";return}try{await api("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({toUserId:toId,body:byId("message-body").value})});byId("message-body").value="";const title=byId("message-title")?.textContent?.replace(/^Message /,"")||"Player";await loadMessageHistory(toId,{id:toId,name:title});loadConversations();byId("message-status").textContent="Sent."}catch(err){byId("message-status").textContent=err.message}});
function openReportModal(targetUserId,targetName){
  let modal=byId("report-modal");
  if(!modal){
    modal=document.createElement("div");modal.id="report-modal";modal.className="modal-backdrop";
    modal.innerHTML="<div class='modal-card'><button class='modal-close' id='report-close'>×</button><span class='eyebrow'>SAFETY REPORT</span><h2>Report "+escapeHtml(targetName)+"</h2><p>Submit a clear report for a possible rule violation. You can attach screenshots, photos, or MP4 video evidence.</p><form id='report-form'><input type='hidden' name='targetUserId' value='"+escapeHtml(targetUserId)+"'><label>Reason<input name='reason' maxlength='120' required placeholder='Harassment, spam, cheating, etc.'></label><label>Details<textarea name='details' maxlength='3000' required placeholder='Explain what happened and when it happened.'></textarea></label><label>Evidence<input name='evidence' type='file' accept='image/png,image/jpeg,image/webp,image/gif,video/mp4' multiple></label><p class='evidence-note'>Up to 5 files, each up to 50 MB. Supported: PNG, JPG, JPEG, WEBP, GIF, MP4.</p><button class='gold' type='submit'>Submit Report</button><p id='report-status' class='form-status'></p></form></div>";
    document.body.appendChild(modal);
    byId("report-close").onclick=()=>modal.remove();
    byId("report-form").onsubmit=async e=>{
      e.preventDefault();const s=byId("report-status");s.textContent="Submitting…";
      const files=byId("report-form").querySelector("input[type=file]").files;
      if(files.length>5){s.textContent="Choose no more than 5 evidence files.";return}
      for(const f of files)if(f.size>50*1024*1024){s.textContent="Each evidence file must be 50 MB or smaller.";return}
      try{await api("/api/reports",{method:"POST",body:new FormData(e.target)});s.textContent="Report submitted for moderation.";setTimeout(()=>modal.remove(),1200)}catch(err){s.textContent=err.message}
    };
  }
}
refreshAccount();updateLauncherUI();
const initial=location.hash.slice(1);show(names[initial]?initial:"home");