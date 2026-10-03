const views=[...document.querySelectorAll('.view')];
const nav=[...document.querySelectorAll('[data-view]')];
const title=document.querySelector('#title');
const names={home:'Discover something new',library:'Your Library',store:'Store',community:'Community',settings:'Settings'};
function show(view){views.forEach(v=>v.classList.toggle('active',v.id===view));document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===view));if(title)title.textContent=names[view]||'Extra Games';history.replaceState(null,'','#'+view)}
nav.forEach(n=>n.addEventListener('click',()=>show(n.dataset.view)));
document.querySelectorAll('[data-view]').forEach(n=>n.addEventListener('click',()=>{if(n.dataset.view)show(n.dataset.view)}));
const storeButton=document.querySelector('#web-store');
if(storeButton)storeButton.addEventListener('click',()=>{if(window.extraGames?.storeOrigin){window.open(window.extraGames.storeOrigin,'_blank','noopener,noreferrer')}else{window.location.hash='store'}});
async function startCheckout(productId){
  const email=prompt('Enter the email you want attached to this purchase:');
  if(!email)return;
  const button=document.querySelector('[data-buy="'+productId+'"]');
  if(button){button.disabled=true;button.textContent='Opening checkout…';}
  try{
    const base=window.extraGames?.storeOrigin||window.location.origin;
    const response=await fetch(new URL('/api/create-checkout-session',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,email})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unable to create checkout session.');
    window.open(data.url,'_blank','noopener,noreferrer');
  }catch(error){alert(error.message);}
  finally{if(button){button.disabled=false;button.textContent='Buy now';}}
}
document.querySelectorAll('[data-buy]').forEach(button=>button.addEventListener('click',()=>startCheckout(button.dataset.buy)));
const initial=location.hash.slice(1);
show(names[initial]?initial:'home');