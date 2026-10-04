const views=[...document.querySelectorAll(".view")],byId=id=>document.getElementById(id),nav=[...document.querySelectorAll(".nav")],title=document.querySelector("#title");
const names={home:"Discover something new",store:"Store",library:"Your Library",wishlist:"Wishlist",community:"Community",messages:"Messages",rules:"Rules",quest:"Quest App",admin:"Admin",news:"News",upload:"Upload Game",account:"Account",settings:"Settings"};
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
document.addEventListener("click",e=>{
  const target=e.target.closest("[data-view]");
  if(!target)return;
  const view=target.dataset.view;
  if(!view)return;
  e.preventDefault();
  show(view);
});
async function api(path,options={}){
  try{
    const r=await fetch(path,options);
    let d={};try{d=await r.json()}catch{}
    if(!r.ok){const httpError=new Error(d.error||"Request failed.");httpError.isHttp=true;throw httpError;}
    return d;
  }catch(error){
    if(error?.isHttp)throw error;
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
function launcherVersion(){try{return window.launcher.version()}catch{return"0.6.1"}}
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
    const reportButton="<button class='outline report-game' data-id='"+escapeHtml(g.id)+"'>Report</button>";
    const deleteButton=g.creatorId===window.__extraGamesUserId?"<button class='danger-button delete-game' data-id='"+escapeHtml(g.id)+"'>Delete</button>":"";
    const vrMeta=vr?"<div class='vr-meta'><span>VR READY</span>"+(apk?"<span>QUEST APK</span>":"")+(g.vrDevice?"<span>"+escapeHtml(g.vrDevice.replaceAll("-"," ").toUpperCase())+"</span>":"")+(g.vrRuntime?"<span>"+escapeHtml(g.vrRuntime)+"</span>":"")+(g.vrHeadsets?"<small>"+escapeHtml(g.vrHeadsets)+"</small>":"")+"</div>":"";
    return "<article class='game-card "+(vr?"vr-game-card":"")+(apk?" quest-apk-card":"")+"'><div class='game-art'>"+(apk?"QUEST ":"")+(vr&&!apk?"VR ":"")+escapeHtml((g.title||"EX").slice(0,2).toUpperCase())+"</div><div class='game-info'><div class='game-card-badges'><span class='badge'>"+escapeHtml(typeBadge)+"</span><span class='badge package-badge'>"+escapeHtml(packageBadge)+"</span>"+(g.localOnly?"<span class='badge local-badge'>LOCAL</span>":"")+"</div><h3>"+escapeHtml(g.title)+"</h3><p>"+escapeHtml(g.description||"")+"</p>"+vrMeta+"<div class='game-bottom'><strong>"+(g.price===0?"FREE":"€"+Number(g.price).toFixed(2))+"</strong><div><button class='icon-button wish-game' data-id='"+g.id+"' title='Wishlist'>"+(wished.has(g.id)?"♥":"♡")+"</button><button class='gold buy-game' data-id='"+g.id+"'>"+(owned?"Download":(g.price===0?"Get Free":"Buy Game"))+"</button>"+reportButton</div></div></div></article>"
  }).join("");
  box.querySelectorAll(".wish-game").forEach(b=>b.onclick=()=>toggleWishlist(b.dataset.id));
  box.querySelectorAll(".delete-game").forEach(b=>b.onclick=async()=>{
    const g=currentGames.find(x=>x.id===b.dataset.id);
    if(!g||!confirm("Delete "+g.title+"? This removes the game from the public Store."))return;
    try{await api("/api/games/"+encodeURIComponent(g.id),{method:"DELETE"});currentGames=currentGames.filter(x=>x.id!==g.id);renderGames();alert("Game deleted.");}
    catch(e){alert(e.message)}
  });
  box.querySelectorAll(".report-game").forEach(b=>b.onclick=async()=>{
    const me=await api("/api/auth/me");window.__extraGamesUserId=me.user?.id||null;
    if(!me.user){show("account");alert("Log in to report a game.");return}
    const reason=prompt("Why are you reporting this game?","Inappropriate content");
    if(reason===null)return;
    const details=prompt("Add details for the moderation team (optional):","")||"";
    const data=new FormData();
    data.append("targetGameId",b.dataset.id);
    data.append("reason",reason.trim());
    data.append("details",details.trim());
    try{
      await api("/api/reports",{method:"POST",body:data});
      b.textContent="Reported";
      b.disabled=true;
      alert("Game report submitted. Extra Games staff will review it.");
    }catch(e){alert(e.message)}
  });
  box.querySelectorAll(".buy-game").forEach(b=>b.onclick=async()=>{
    const g=currentGames.find(x=>x.id===b.dataset.id);if(!g)return;
    if(g.owned){location.href="/api/games/"+encodeURIComponent(g.id)+"/download";return}
    startCheckout(g.id);
  })
}
async function loadStore(){
  const box=byId("dynamic-games");if(!box)return;
  box.innerHTML="<div class='empty compact'><strong>Loading games…</strong></div>";
  try{
    const d=await api("/api/games");
    currentGames=d.games||[];
    renderGames();
    if(!currentGames.length){
      box.innerHTML="<div class='empty compact'><strong>No games found</strong><p>There are no published games yet.</p></div>";
    }
  }catch(e){
    currentGames=[];
    box.innerHTML="<div class='empty compact'><strong>Store unavailable</strong><p>"+escapeHtml(e.message)+"</p><p>Games are published through the real Extra Games website backend. Nothing is loaded from local browser storage.</p></div>";
  }
}
function toggleWishlist(id){const list=readWishlist(),next=list.includes(id)?list.filter(x=>x!==id):[...list,id];saveWishlist(next);renderGames();if(document.querySelector("#wishlist.active"))loadWishlist()}
async function loadWishlist(){const box=byId("wishlist-games");if(!box)return;const ids=new Set(readWishlist());if(!ids.size){box.innerHTML="<div class='empty'><strong>Your wishlist is empty</strong><p>Use ♡ on a store game to add it here.</p><button class='gold' data-view='store'>Browse Store</button></div>";return}try{if(!currentGames.length){const d=await api("/api/games");currentGames=d.games||[]}const list=currentGames.filter(g=>ids.has(g.id));if(!list.length){box.innerHTML="<div class='empty'><strong>No current store matches</strong><p>The saved games may have been removed from the store.</p></div>";return}box.innerHTML=list.map(g=>"<article class='game-card'><div class='game-art'>"+escapeHtml((g.title||"EX").slice(0,2).toUpperCase())+"</div><div class='game-info'><span class='badge'>WISHLIST</span><h3>"+escapeHtml(g.title)+"</h3><p>"+escapeHtml(g.description||"")+"</p><div class='game-bottom'><strong>"+(g.price===0?"FREE":"€"+Number(g.price).toFixed(2))+"</strong><div><button class='outline remove-wish' data-id='"+g.id+"'>Remove</button><button class='gold buy-game' data-id='"+g.id+"'>"+(g.owned?"Download":(g.price===0?"Get Free":"Buy Game"))+"</button></div></div></div></article>").join("");box.querySelectorAll(".remove-wish").forEach(b=>b.onclick=()=>toggleWishlist(b.dataset.id));box.querySelectorAll(".buy-game").forEach(b=>b.onclick=()=>{const g=currentGames.find(x=>x.id===b.dataset.id);if(g?.owned){location.href="/api/games/"+encodeURIComponent(g.id)+"/download"}else startCheckout(b.dataset.id)})}catch(e){box.innerHTML="<div class='empty'><strong>Wishlist unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}}
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
  const s=byId("upload-status");
  s.textContent="Uploading to Extra Games…";
  const data=new FormData(e.target),file=data.get("game");
  const gameType=String(data.get("gameType")||"desktop");
  const vrRuntime=String(data.get("vrRuntime")||"").trim();
  const vrDevice=String(data.get("vrDevice")||"").trim();
  const vrHeadsets=data.getAll("vrHeadsets").map(v=>String(v).trim()).filter(Boolean);
  const ext=file instanceof File?file.name.toLowerCase().split(".").pop():"";

  if(!(file instanceof File)||!file.size){s.textContent="Choose a ZIP, EXE or APK game package.";return}
  if((gameType==="vr"||gameType==="both")&&!vrRuntime){s.textContent="Enter the VR runtime/technology for this game.";return}
  if(ext==="apk"&&gameType==="desktop"){s.textContent="APK packages must be marked as VR or Desktop + VR.";return}
  if(ext==="apk"&&!vrDevice){s.textContent="Select the VR device target for this APK.";return}

  try{
    const d=await api("/api/games/upload",{method:"POST",body:data});
    if(!d?.game)throw new Error("The server did not confirm the upload.");
    s.textContent="Uploaded "+d.game.title+". It is pending admin approval.";
    e.target.reset();
    setVrUploadFields();
    await loadStore();
    await loadLibrary();
    return;
  }catch(err){
    const message=err?.message||"Upload failed.";
    s.textContent=message.includes("backend is unavailable")
      ?"Upload failed: the Extra Games website backend is unavailable. Nothing was saved locally. Please start/connect the website backend and try again."
      :"Upload failed: "+message;
  }
});
async function startCheckout(gameId){
  try{
    const game=currentGames.find(g=>g.id===gameId);
    if(game?.localOnly&&game?.owned){show("library");return}
    const me=await api("/api/auth/me");window.__extraGamesUserId=me.user?.id||null;
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
  const me=await api("/api/auth/me");window.__extraGamesUserId=me.user?.id||null;
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
let communityRequest=0;

async function loadCommunity(){
  switchSocialTab("people");
  await Promise.allSettled([loadFriends(),loadCommunities(""),loadCommunityInvites()]);
}
function switchSocialTab(tab){
  document.querySelectorAll(".social-tab").forEach(b=>b.classList.toggle("active",b.dataset.socialTab===tab));
  document.querySelectorAll(".social-panel").forEach(p=>p.classList.toggle("active",p.id==="social-"+tab));
  if(tab==="people"&&byId("people-search")?.value.trim())searchPeople();
  if(tab==="friends")loadFriends();
  if(tab==="communities")loadCommunities(byId("community-search")?.value.trim()||"");
  if(tab==="invites")loadCommunityInvites();
}
document.querySelectorAll(".social-tab").forEach(b=>b.addEventListener("click",()=>switchSocialTab(b.dataset.socialTab)));

function personActionsForSearch(u){
  const status=u.friendStatus;
  let friendButton;
  if(status==="accepted"){
    friendButton="<button class='outline remove-friend' data-friend-id='"+escapeHtml(u.friendRequestId||"")+"'>Remove Friend</button>";
  }else if(status==="pending"&&u.friendDirection==="incoming"){
    friendButton="<button class='gold accept-friend' data-id='"+escapeHtml(u.friendRequestId||"")+"'>Accept</button><button class='outline decline-friend' data-id='"+escapeHtml(u.friendRequestId||"")+"'>Decline</button>";
  }else if(status==="pending"){
    friendButton="<button class='outline' disabled>Request pending</button>";
  }else{
    friendButton="<button class='gold add-friend' data-id='"+escapeHtml(u.id)+"'>Add Friend</button>";
  }
  return "<button class=\'outline view-profile\' data-id=\'"+escapeHtml(u.id)+"\'>View Profile</button>"+friendButton+"<button class='outline message-user' data-id='"+escapeHtml(u.id)+"'>Message</button><button class='outline block-user' data-id='"+escapeHtml(u.id)+"'>Block</button><button class='danger-button report-user' data-id='"+escapeHtml(u.id)+"' data-name='"+escapeHtml(u.name)+"'>Report</button>";
}
async function searchPeople(){
  const q=byId("people-search")?.value.trim()||"",box=byId("people-results");if(!box)return;
  if(q.length<2){box.innerHTML="<div class='empty compact'><strong>Search for a player</strong><p>Enter at least 2 characters of their display name.</p></div>";return}
  box.innerHTML="<div class='empty compact'><strong>Searching…</strong></div>";
  try{
    const d=await api("/api/users/search?q="+encodeURIComponent(q));
    if(!d.users?.length){box.innerHTML="<div class='empty compact'><strong>No players found</strong><p>Try another display name.</p></div>";return}
    box.innerHTML=d.users.map(u=>"<article class='person-card'><div class='person-avatar'>"+escapeHtml(u.name.slice(0,2).toUpperCase())+"</div><div class='person-main'><span class='badge'>PLAYER</span><h3>"+escapeHtml(u.name)+"</h3><div class='person-actions'>"+personActionsForSearch(u)+"</div></div></article>").join("");
    bindPersonActions(box);
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Player search unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
function bindPersonActions(box){
  box.querySelectorAll(".view-profile").forEach(b=>b.onclick=async()=>{
    const card=b.closest(".person-card");
    if(!card)return;
    b.disabled=true;
    try{
      const d=await api("/api/users/"+encodeURIComponent(b.dataset.id));
      const u=d.user;
      const joined=u.createdAt?new Date(u.createdAt).toLocaleDateString():"Unknown";
      card.querySelector(".person-main").insertAdjacentHTML("beforeend","<p class='profile-details'>Role: "+escapeHtml(u.role||"user")+" · Joined: "+escapeHtml(joined)+"</p>");
      b.remove();
    }catch(e){b.disabled=false;alert(e.message)}
  });

  box.querySelectorAll(".add-friend").forEach(b=>b.onclick=async()=>{
    b.disabled=true;try{await api("/api/friends/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:b.dataset.id})});searchPeople();loadFriends()}catch(e){b.disabled=false;alert(e.message)}
  });
  box.querySelectorAll(".accept-friend").forEach(b=>b.onclick=async()=>{try{await api("/api/friends/"+b.dataset.id+"/accept",{method:"POST"});searchPeople();loadFriends()}catch(e){alert(e.message)}});
  box.querySelectorAll(".decline-friend").forEach(b=>b.onclick=async()=>{try{await api("/api/friends/"+b.dataset.id+"/decline",{method:"POST"});searchPeople();loadFriends()}catch(e){alert(e.message)}});
  box.querySelectorAll(".remove-friend").forEach(b=>b.onclick=()=>removeFriend(b.dataset.friendId,()=>searchPeople()));
  box.querySelectorAll(".message-user").forEach(b=>b.onclick=()=>openMessageUser(b.dataset.id));
  box.querySelectorAll(".block-user").forEach(b=>b.onclick=()=>blockUser(b.dataset.id));
  box.querySelectorAll(".report-user").forEach(b=>b.onclick=()=>openReportModal(b.dataset.id,b.dataset.name));
}
byId("people-search-button")?.addEventListener("click",searchPeople);
byId("people-search")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchPeople()});

async function removeFriend(id,after){
  if(!id)return;
  if(!confirm("Remove this friendship?"))return;
  try{await api("/api/friends/"+encodeURIComponent(id),{method:"DELETE"});after?.();loadFriends()}catch(e){alert(e.message)}
}
async function blockUser(id){
  if(!confirm("Block this player? Existing friendship/request will also be removed."))return;
  try{await api("/api/blocks/"+encodeURIComponent(id),{method:"POST"});await loadFriends();await searchPeople()}catch(e){alert(e.message)}
}
async function loadFriends(){
  const box=byId("friends-list"),requests=byId("friend-requests"),blocked=byId("blocked-list");if(!box||!requests)return;
  try{
    const d=await api("/api/friends");
    const incoming=d.incoming||[],outgoing=d.outgoing||[];
    requests.innerHTML=(incoming.length||outgoing.length)?
      (incoming.length?"<div class='subheading'>Incoming requests</div>"+incoming.map(x=>"<article class='person-card compact-card'><div class='person-avatar'>"+escapeHtml(x.user.name.slice(0,2).toUpperCase())+"</div><div class='person-main'><strong>"+escapeHtml(x.user.name)+"</strong><p>Wants to add you.</p><div class='person-actions'><button class='gold accept-friend' data-id='"+x.id+"'>Accept</button><button class='outline decline-friend' data-id='"+x.id+"'>Decline</button></div></div></article>").join(""):"")+
      (outgoing.length?"<div class='subheading'>Sent requests</div>"+outgoing.map(x=>"<article class='person-card compact-card'><div><strong>"+escapeHtml(x.user.name)+"</strong><p>Request pending.</p></div><button class='outline cancel-friend' data-id='"+x.id+"'>Cancel</button></article>").join(""):"")
      :"";
    requests.querySelectorAll(".accept-friend").forEach(b=>b.onclick=async()=>{try{await api("/api/friends/"+b.dataset.id+"/accept",{method:"POST"});loadFriends()}catch(e){alert(e.message)}});
    requests.querySelectorAll(".decline-friend").forEach(b=>b.onclick=async()=>{try{await api("/api/friends/"+b.dataset.id+"/decline",{method:"POST"});loadFriends()}catch(e){alert(e.message)}});
    requests.querySelectorAll(".cancel-friend").forEach(b=>b.onclick=async()=>{try{await api("/api/friends/"+b.dataset.id,{method:"DELETE"});loadFriends()}catch(e){alert(e.message)}});

    box.innerHTML=d.friends?.length?d.friends.map(u=>"<article class='person-card compact-card'><div class='person-avatar'>"+escapeHtml(u.name.slice(0,2).toUpperCase())+"</div><div class='person-main'><h3>"+escapeHtml(u.name)+"</h3><div class='person-actions'><button class='outline friend-message' data-id='"+u.id+"'>Message</button><button class='outline friend-remove' data-id='"+u.friendshipId+"'>Remove Friend</button><button class='danger-button friend-block' data-id='"+u.id+"'>Block</button></div></div></article>").join(""):"<div class='empty compact'><strong>No friends yet</strong><p>Use People to search display names and send requests.</p></div>";
    box.querySelectorAll(".friend-message").forEach(b=>b.onclick=()=>openMessageUser(b.dataset.id));
    box.querySelectorAll(".friend-remove").forEach(b=>b.onclick=()=>removeFriend(b.dataset.id,()=>loadFriends()));
    box.querySelectorAll(".friend-block").forEach(b=>b.onclick=()=>blockUser(b.dataset.id));

    if(blocked){
      const bd=await api("/api/blocks");
      blocked.innerHTML=bd.users?.length?bd.users.map(u=>"<article class='person-card compact-card'><div class='person-avatar'>"+escapeHtml(u.name.slice(0,2).toUpperCase())+"</div><div class='person-main'><h3>"+escapeHtml(u.name)+"</h3><div class='person-actions'><button class='outline unblock-user' data-id='"+u.id+"'>Unblock</button></div></div></article>").join(""):"<div class='empty compact'><strong>No blocked players</strong></div>";
      blocked.querySelectorAll(".unblock-user").forEach(b=>b.onclick=async()=>{try{await api("/api/blocks/"+encodeURIComponent(b.dataset.id),{method:"DELETE"});loadFriends()}catch(e){alert(e.message)}});
    }
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Friends unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>";if(requests)requests.innerHTML="";if(blocked)blocked.innerHTML="<div class='empty compact'><strong>Blocked players unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
async function loadCommunities(q){
  const box=byId("community-results");if(!box)return;
  const requestId=++communityRequest;
  box.innerHTML="<div class='empty compact'><strong>Loading communities…</strong></div>";
  try{
    const d=await api("/api/communities?q="+encodeURIComponent(q||""));
    if(requestId!==communityRequest)return;
    if(!d.communities?.length){box.innerHTML="<div class='empty compact'><strong>No communities found</strong><p>Create one or search another group name.</p></div>";return}
    box.innerHTML=d.communities.map(c=>{
      const vis=c.visibility==="public"?"PUBLIC":c.visibility==="private"?"PRIVATE":"INVITE ONLY";
      let actions="";
      if(c.isMember){
        actions+="<button class='outline' disabled>Joined</button>";
        if(!c.isOwner)actions+="<button class='outline leave-community' data-id='"+c.id+"'>Leave</button>";
      }else actions+="<button class='gold join-community' data-id='"+c.id+"'>"+(c.isInvited?"Accept Invite":"Join")+"</button>";
      if(c.canInvite)actions+="<button class='outline invite-community' data-id='"+c.id+"'>Invite Player</button>";
      if(c.canManage)actions+="<button class='outline manage-community' data-id='"+c.id+"'>Manage</button><button class='danger-button delete-community' data-id='"+c.id+"'>Delete</button>";
      return "<article class='community-result'><div class='community-mark'>◆</div><div class='community-main'><div class='community-head'><span class='badge'>"+vis+"</span><span class='muted'>"+c.memberCount+" member"+(c.memberCount===1?"":"s")+"</span></div><h3>"+escapeHtml(c.name)+"</h3><p>"+escapeHtml(c.description||"No description.")+"</p><div class='person-actions'>"+actions+"</div></div></article>";
    }).join("");
    box.querySelectorAll(".join-community").forEach(b=>b.onclick=async()=>{try{await api("/api/communities/"+b.dataset.id+"/join",{method:"POST"});await loadCommunities(q);await loadCommunityInvites()}catch(e){alert(e.message)}});
    box.querySelectorAll(".leave-community").forEach(b=>b.onclick=async()=>{if(!confirm("Leave this community?"))return;try{await api("/api/communities/"+b.dataset.id+"/leave",{method:"POST"});await loadCommunities(q)}catch(e){alert(e.message)}});
    box.querySelectorAll(".delete-community").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this community permanently? This cannot be undone."))return;try{await api("/api/communities/"+b.dataset.id,{method:"DELETE"});await loadCommunities(q)}catch(e){alert(e.message)}});
    box.querySelectorAll(".invite-community").forEach(b=>b.onclick=()=>inviteToCommunity(b.dataset.id));
    box.querySelectorAll(".manage-community").forEach(b=>b.onclick=()=>manageCommunity(b.dataset.id));
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Communities unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
byId("community-search-button")?.addEventListener("click",()=>loadCommunities(byId("community-search")?.value.trim()||""));
byId("community-search")?.addEventListener("keydown",e=>{if(e.key==="Enter")loadCommunities(byId("community-search").value.trim())});
byId("community-create-form")?.addEventListener("submit",async e=>{
  e.preventDefault();const s=byId("community-create-status"),button=e.target.querySelector("button[type=submit]");
  s.textContent="Creating…";if(button)button.disabled=true;
  try{await api("/api/communities",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(e.target))});s.textContent="Community created.";e.target.reset();await loadCommunities("")}
  catch(err){s.textContent=err.message}
  finally{if(button)button.disabled=false}
});
async function inviteToCommunity(id){
  const name=prompt("Enter the exact display name to invite:");
  if(!name?.trim())return;
  try{
    const d=await api("/api/users/search?q="+encodeURIComponent(name.trim()));
    const matches=(d.users||[]).filter(u=>u.name.toLowerCase()===name.trim().toLowerCase());
    if(matches.length!==1)throw new Error(matches.length?"Multiple players have matching names. Search for the player in People and use the exact account.":"Player not found.");
    await api("/api/communities/"+id+"/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:matches[0].id})});
    alert("Invite sent to "+matches[0].name+".");await loadCommunityInvites();await loadCommunities(byId("community-search")?.value.trim()||"");
  }catch(e){alert(e.message)}
}
async function loadCommunityInvites(){
  const box=byId("community-invites");if(!box)return;
  try{
    const d=await api("/api/communities/invites");
    box.innerHTML=d.invites?.length?d.invites.map(x=>"<article class='community-result'><div class='community-mark'>✦</div><div class='community-main'><span class='badge'>INVITE</span><h3>"+escapeHtml(x.community.name)+"</h3><p>"+escapeHtml(x.community.description||"")+"</p><div class='person-actions'><button class='gold accept-community' data-id='"+x.id+"' data-community='"+x.community.id+"'>Join Community</button><button class='outline decline-community' data-id='"+x.id+"'>Decline</button></div></div></article>").join(""):"<div class='empty compact'><strong>No pending invites</strong></div>";
    box.querySelectorAll(".accept-community").forEach(b=>b.onclick=async()=>{try{await api("/api/communities/"+b.dataset.community+"/join",{method:"POST"});await loadCommunityInvites();await loadCommunities("")}catch(e){alert(e.message)}});
    box.querySelectorAll(".decline-community").forEach(b=>b.onclick=async()=>{try{await api("/api/communities/invites/"+b.dataset.id+"/decline",{method:"POST"});await loadCommunityInvites()}catch(e){alert(e.message)}});
  }catch(e){box.innerHTML="<div class='empty compact'><strong>Invites unavailable</strong><p>"+escapeHtml(e.message)+"</p></div>"}
}
async function manageCommunity(id){
  let modal=byId("community-manage-modal");
  if(modal)modal.remove();
  try{
    const d=await api("/api/communities/"+encodeURIComponent(id)+"/members");
    const c=d.community, members=d.members||[];
    modal=document.createElement("div");modal.id="community-manage-modal";modal.className="modal-backdrop";
    modal.innerHTML="<div class='modal-card'><button class='modal-close' id='community-manage-close'>×</button><span class='eyebrow'>COMMUNITY MANAGEMENT</span><h2>"+escapeHtml(c.name)+"</h2><p>Manage members and community moderators.</p><div class='community-member-list'>"+(members.length?members.map(m=>{
      const owner=m.role==="owner",roleOptions=owner?"<span class='badge'>OWNER</span>":"<select class='community-role-select' data-user-id='"+m.id+"'><option value='member' "+(m.role==="member"?"selected":"")+">Member</option><option value='moderator' "+(m.role==="moderator"?"selected":"")+">Moderator</option></select><button class='outline save-community-role' data-user-id='"+m.id+"'>Save</button><button class='danger-button remove-community-member' data-user-id='"+m.id+"'>Remove</button>";
      return "<article class='person-card compact-card'><div class='person-avatar'>"+escapeHtml(m.name.slice(0,2).toUpperCase())+"</div><div class='person-main'><h3>"+escapeHtml(m.name)+"</h3><div class='person-actions'>"+roleOptions+"</div></div></article>";
    }).join(""):"<div class='empty compact'><strong>No members</strong></div>")+"</div></div>";
    document.body.appendChild(modal);
    byId("community-manage-close").onclick=()=>modal.remove();
    modal.addEventListener("click",e=>{if(e.target===modal)modal.remove()});
    modal.querySelectorAll(".save-community-role").forEach(b=>b.onclick=async()=>{
      const select=modal.querySelector(".community-role-select[data-user-id='"+b.dataset.userId+"']");
      try{await api("/api/communities/"+id+"/members/"+b.dataset.userId+"/role",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:select.value})});await manageCommunity(id)}catch(e){alert(e.message)}
    });
    modal.querySelectorAll(".remove-community-member").forEach(b=>b.onclick=async()=>{
      if(!confirm("Remove this member from the community?"))return;
      try{await api("/api/communities/"+id+"/members/"+b.dataset.userId,{method:"DELETE"});await manageCommunity(id);await loadCommunities(byId("community-search")?.value.trim()||"")}catch(e){alert(e.message)}
    });
  }catch(e){alert(e.message)}
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