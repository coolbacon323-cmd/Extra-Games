const views=[...document.querySelectorAll('.view')];
const nav=[...document.querySelectorAll('[data-view]')];
const title=document.querySelector('#title');
const names={home:'Discover something new',library:'Your Library',store:'Store',community:'Community',upload:'Upload Game',account:'Account',settings:'Settings'};
function show(view){views.forEach(v=>v.classList.toggle('active',v.id===view));document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===view));if(title)title.textContent=names[view]||'Extra Games';history.replaceState(null,'','#'+view)}
nav.forEach(n=>n.addEventListener('click',()=>show(n.dataset.view)));
document.querySelectorAll('[data-view]').forEach(n=>n.addEventListener('click',()=>{if(n.dataset.view)show(n.dataset.view)}));

async function api(path,options={}){const r=await fetch(path,options);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Request failed.');return d}
function formData(form){return Object.fromEntries(new FormData(form).entries())}

async function refreshAccount(){
  try{
    const d=await api('/api/auth/me');
    const panel=document.querySelector('#account-panel'),msg=document.querySelector('#account-message');
    if(d.user){
      msg.textContent='Signed in as '+d.user.name+' ('+d.user.email+').';
      panel.hidden=false;
      panel.innerHTML='<strong>Account active</strong><p>You can now upload games and use account-only features.</p><button class="outline" id="logout">Log out</button>';
      document.querySelector('#logout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.reload()};
    }else{panel.hidden=true}
  }catch(e){}
}
document.querySelector('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();const s=document.querySelector('#login-status');s.textContent='Signing in…';
  try{await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formData(e.target))});s.textContent='Logged in.';await refreshAccount()}catch(err){s.textContent=err.message}
});
document.querySelector('#signup-form').addEventListener('submit',async e=>{
  e.preventDefault();const s=document.querySelector('#signup-status');s.textContent='Creating account…';
  try{await api('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formData(e.target))});s.textContent='Account created and signed in.';await refreshAccount()}catch(err){s.textContent=err.message}
});
document.querySelector('#upload-form').addEventListener('submit',async e=>{
  e.preventDefault();const s=document.querySelector('#upload-status');s.textContent='Uploading…';
  try{const d=await api('/api/games/upload',{method:'POST',body:new FormData(e.target)});s.textContent='Uploaded '+d.game.title+'. It is now pending approval.';e.target.reset()}catch(err){s.textContent=err.message}
});
async function startCheckout(productId){
  try{
    const me=await api('/api/auth/me'); if(!me.user){show('account');throw new Error('Log in or create an account before purchasing.')}
    const response=await api('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,email:me.user.email})});
    window.open(response.url,'_blank','noopener,noreferrer');
  }catch(error){alert(error.message)}
}
document.querySelectorAll('[data-buy]').forEach(button=>button.addEventListener('click',()=>startCheckout(button.dataset.buy)));
refreshAccount();
const initial=location.hash.slice(1);show(names[initial]?initial:'home');