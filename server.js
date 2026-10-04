const express=require("express");
const path=require("node:path");
const fs=require("node:fs");
const crypto=require("node:crypto");
const multer=require("multer");
const Stripe=require("stripe");
const app=express();
const port=process.env.PORT===undefined?3000:Number(process.env.PORT);
const ADMIN_EMAIL=String(process.env.ADMIN_EMAIL||"cool.bacon323@gmail.com").trim().toLowerCase();
const VERSION="0.5.4";
app.disable("x-powered-by");
const dataDir=path.resolve(process.env.EXTRA_GAMES_DATA_DIR||path.join(__dirname,"data")),uploadDir=path.join(dataDir,"uploads");
fs.mkdirSync(uploadDir,{recursive:true});
const evidenceDir=path.join(dataDir,"evidence");
fs.mkdirSync(evidenceDir,{recursive:true});
const files={users:path.join(dataDir,"users.json"),games:path.join(dataDir,"games.json"),sessions:path.join(dataDir,"sessions.json"),purchases:path.join(dataDir,"purchases.json"),friends:path.join(dataDir,"friends.json"),blocks:path.join(dataDir,"blocks.json"),messages:path.join(dataDir,"messages.json"),reports:path.join(dataDir,"reports.json"),communities:path.join(dataDir,"communities.json"),communityInvites:path.join(dataDir,"community-invites.json")};
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
function writeJson(file,value){const tmp=file+".tmp";fs.writeFileSync(tmp,JSON.stringify(value,null,2),"utf8");fs.renameSync(tmp,file)}
for(const [file,value] of Object.entries(files))if(!fs.existsSync(file))writeJson(file,value);
function cleanUser(u){return{id:u.id,name:u.name,email:u.email,isAdmin:u.email===ADMIN_EMAIL}}
function blockedPair(a,b){const blocks=readJson(files.blocks,[]);return blocks.some(x=>(x.blockerId===a&&x.blockedId===b)||(x.blockerId===b&&x.blockedId===a))}
function friendship(a,b){return readJson(files.friends,[]).find(x=>(x.requesterId===a&&x.recipientId===b)||(x.requesterId===b&&x.recipientId===a))}
function publicProfile(u,extra={}){return{id:u.id,name:u.name,isAdmin:u.email===ADMIN_EMAIL,...extra}}
function getUserById(id){return readJson(files.users,[]).find(u=>u.id===id)||null}
function validVisibility(v){return ["public","private","invite"].includes(v)}
function hashPassword(password){const salt=crypto.randomBytes(16).toString("hex");return salt+":"+crypto.scryptSync(password,salt,64).toString("hex")}
function verifyPassword(password,stored){try{const [salt,hash]=String(stored||"").split(":");if(!salt||!hash)return false;const test=crypto.scryptSync(password,salt,64).toString("hex");return hash.length===test.length&&crypto.timingSafeEqual(Buffer.from(hash,"hex"),Buffer.from(test,"hex"))}catch{return false}}
function cookieToken(req){const m=String(req.headers.cookie||"").match(/(?:^|;\\s*)eg_session=([^;]+)/);return m?m[1]:null}
function getUser(req){const token=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):cookieToken(req);if(!token)return null;const id=readJson(files.sessions,{})[token];return readJson(files.users,[]).find(u=>u.id===id)||null}
function auth(req,res,next){const user=getUser(req);if(!user)return res.status(401).json({error:"You must be logged in."});req.user=user;next()}
function admin(req,res,next){if(req.user?.email!==ADMIN_EMAIL)return res.status(403).json({error:"Admin access required."});next()}
function tokenFor(user){const token=crypto.randomBytes(32).toString("hex");const sessions=readJson(files.sessions,{});sessions[token]=user.id;writeJson(files.sessions,sessions);return token}
function setCookie(res,token){res.setHeader("Set-Cookie","eg_session="+token+"; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000")}
function publicGame(g,owned=new Set()){return{id:g.id,title:g.title,description:g.description,price:g.price,creatorName:g.creatorName,status:g.status,createdAt:g.createdAt,owned:owned.has(g.id)}}
function purchaseExists(userId,gameId){return readJson(files.purchases,[]).some(p=>p.userId===userId&&p.gameId===gameId&&p.status==="paid")}
function grantPurchase({userId,gameId,stripeSessionId=null,paymentIntentId=null}){const purchases=readJson(files.purchases,[]);const existing=purchases.find(p=>p.stripeSessionId===stripeSessionId||(p.userId===userId&&p.gameId===gameId&&p.status==="paid"));if(existing)return existing;const purchase={id:crypto.randomUUID(),userId,gameId,stripeSessionId,paymentIntentId,status:"paid",createdAt:new Date().toISOString()};purchases.push(purchase);writeJson(files.purchases,purchases);return purchase}
function stripeClient(){if(!process.env.STRIPE_SECRET_KEY){const e=new Error("STRIPE_SECRET_KEY is not configured.");e.statusCode=500;throw e}return new Stripe(process.env.STRIPE_SECRET_KEY)}
app.post("/api/stripe/webhook",express.raw({type:"application/json"}),(req,res)=>{try{const stripe=stripeClient();if(!process.env.STRIPE_WEBHOOK_SECRET)return res.status(500).json({error:"STRIPE_WEBHOOK_SECRET is not configured."});const event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET);if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){const session=event.data.object;if(session.payment_status==="paid"||event.type.endsWith("succeeded")){const userId=session.metadata?.userId,gameId=session.metadata?.gameId;if(userId&&gameId)grantPurchase({userId,gameId,stripeSessionId:session.id,paymentIntentId:typeof session.payment_intent==="string"?session.payment_intent:null})}}res.json({received:true})}catch(error){console.error("Stripe webhook:",error.message);res.status(400).json({error:"Invalid Stripe webhook."})}});
app.use(express.json({limit:"2mb"}));
app.use(express.static(__dirname,{index:"index.html",dotfiles:"ignore"}));
app.get("/api/health",(req,res)=>res.json({ok:true,service:"extra-games",version:VERSION}));
app.get("/api/auth/me",(req,res)=>{const user=getUser(req);res.json({user:user?cleanUser(user):null})});
app.post("/api/auth/signup",(req,res)=>{const name=String(req.body?.name||"").trim(),email=String(req.body?.email||"").trim().toLowerCase(),password=req.body?.password;if(!name||name.length>32||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||typeof password!=="string"||password.length<8)return res.status(400).json({error:"Use a valid name, email and password of at least 8 characters."});const users=readJson(files.users,[]);if(users.some(u=>u.email===email))return res.status(409).json({error:"An account with that email already exists."});const user={id:crypto.randomUUID(),name,email,password:hashPassword(password),createdAt:new Date().toISOString()};users.push(user);writeJson(files.users,users);setCookie(res,tokenFor(user));res.json({user:cleanUser(user)})});
app.post("/api/auth/login",(req,res)=>{const email=String(req.body?.email||"").trim().toLowerCase(),user=readJson(files.users,[]).find(u=>u.email===email);if(!user||!verifyPassword(String(req.body?.password||""),user.password))return res.status(401).json({error:"Invalid email or password."});setCookie(res,tokenFor(user));res.json({user:cleanUser(user)})});
app.post("/api/auth/logout",(req,res)=>{const token=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):cookieToken(req);if(token){const sessions=readJson(files.sessions,{});delete sessions[token];writeJson(files.sessions,sessions)}res.setHeader("Set-Cookie","eg_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");res.json({ok:true})});
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:2*1024*1024*1024},fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();cb(ext===".zip"||ext===".exe"?null:new Error("Only .zip and .exe game packages are allowed."))}});

// Social features: friends, messaging, blocking, reports and communities.
app.get("/api/users/search",auth,(req,res)=>{
  const q=String(req.query.q||"").trim().toLowerCase();
  if(q.length<2)return res.json({users:[]});
  const users=readJson(files.users,[]).filter(u=>u.id!==req.user.id&&!blockedPair(req.user.id,u.id)&&u.name.toLowerCase().includes(q)).slice(0,25);
  res.json({users:users.map(u=>{
    const f=friendship(req.user.id,u.id);
    return publicProfile(u,{friendStatus:f?.status||null,friendRequestId:f?.id||null});
  })});
});
app.get("/api/friends",auth,(req,res)=>{
  const rows=readJson(files.friends,[]).filter(x=>x.requesterId===req.user.id||x.recipientId===req.user.id);
  const friends=rows.filter(x=>x.status==="accepted").map(x=>getUserById(x.requesterId===req.user.id?x.recipientId:x.requesterId)).filter(Boolean).map(u=>publicProfile(u));
  const incoming=rows.filter(x=>x.status==="pending"&&x.recipientId===req.user.id).map(x=>({id:x.id,user:publicProfile(getUserById(x.requesterId))}));
  const outgoing=rows.filter(x=>x.status==="pending"&&x.requesterId===req.user.id).map(x=>({id:x.id,user:publicProfile(getUserById(x.recipientId))}));
  res.json({friends,incoming,outgoing});
});
app.post("/api/friends/request",auth,(req,res)=>{
  const targetId=String(req.body?.userId||"");
  const target=getUserById(targetId);
  if(!target||target.id===req.user.id)return res.status(404).json({error:"Player not found."});
  if(blockedPair(req.user.id,target.id))return res.status(403).json({error:"You cannot add this player."});
  const existing=friendship(req.user.id,target.id);
  if(existing){
    if(existing.status==="accepted")return res.status(409).json({error:"You are already friends."});
    if(existing.status==="pending")return res.status(409).json({error:"A friend request already exists."});
  }
  const friends=readJson(files.friends,[]);
  const row={id:crypto.randomUUID(),requesterId:req.user.id,recipientId:target.id,status:"pending",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  friends.push(row);writeJson(files.friends,friends);res.json({requestId:row.id});
});
app.post("/api/friends/:id/accept",auth,(req,res)=>{
  const friends=readJson(files.friends,[]),row=friends.find(x=>x.id===req.params.id&&x.recipientId===req.user.id&&x.status==="pending");
  if(!row)return res.status(404).json({error:"Friend request not found."});
  row.status="accepted";row.updatedAt=new Date().toISOString();writeJson(files.friends,friends);res.json({ok:true});
});
app.post("/api/friends/:id/decline",auth,(req,res)=>{
  const friends=readJson(files.friends,[]),row=friends.find(x=>x.id===req.params.id&&x.recipientId===req.user.id&&x.status==="pending");
  if(!row)return res.status(404).json({error:"Friend request not found."});
  row.status="rejected";row.updatedAt=new Date().toISOString();writeJson(files.friends,friends);res.json({ok:true});
});
app.get("/api/blocks",auth,(req,res)=>{
  const ids=readJson(files.blocks,[]).filter(x=>x.blockerId===req.user.id).map(x=>x.blockedId);
  res.json({users:ids.map(getUserById).filter(Boolean).map(u=>publicProfile(u))});
});
app.post("/api/blocks/:userId",auth,(req,res)=>{
  const target=getUserById(req.params.userId);
  if(!target||target.id===req.user.id)return res.status(404).json({error:"Player not found."});
  const blocks=readJson(files.blocks,[]);
  if(!blocks.some(x=>x.blockerId===req.user.id&&x.blockedId===target.id)){
    blocks.push({id:crypto.randomUUID(),blockerId:req.user.id,blockedId:target.id,createdAt:new Date().toISOString()});
    writeJson(files.blocks,blocks);
  }
  res.json({ok:true});
});
app.delete("/api/blocks/:userId",auth,(req,res)=>{
  const blocks=readJson(files.blocks,[]).filter(x=>!(x.blockerId===req.user.id&&x.blockedId===req.params.userId));
  writeJson(files.blocks,blocks);res.json({ok:true});
});
app.get("/api/messages",auth,(req,res)=>{
  const otherId=String(req.query.userId||"");
  if(!otherId||blockedPair(req.user.id,otherId))return res.json({messages:[]});
  const messages=readJson(files.messages,[]).filter(x=>(x.fromId===req.user.id&&x.toId===otherId)||(x.fromId===otherId&&x.toId===req.user.id)).slice(-200).map(x=>({...x,mine:x.fromId===req.user.id}));
  res.json({messages});
});
app.post("/api/messages",auth,(req,res)=>{
  const toId=String(req.body?.toUserId||""),body=String(req.body?.body||"").trim(),target=getUserById(toId);
  if(!target||target.id===req.user.id)return res.status(404).json({error:"Player not found."});
  if(blockedPair(req.user.id,target.id))return res.status(403).json({error:"Messaging is blocked between these players."});
  if(!body||body.length>2000)return res.status(400).json({error:"Message must be 1–2000 characters."});
  const messages=readJson(files.messages,[]),row={id:crypto.randomUUID(),fromId:req.user.id,toId:target.id,body,createdAt:new Date().toISOString()};
  messages.push(row);writeJson(files.messages,messages);res.json({message:{...row,mine:true}});
});
const evidenceUpload=multer({storage:multer.diskStorage({destination:evidenceDir,filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:50*1024*1024,files:5},fileFilter:(req,file,cb)=>{
  const ext=path.extname(file.originalname).toLowerCase(),ok=[".png",".jpg",".jpeg",".webp",".gif",".mp4"].includes(ext);
  cb(ok?null:new Error("Evidence must be PNG, JPG, JPEG, WEBP, GIF or MP4."));
}});
app.post("/api/reports",auth,evidenceUpload.array("evidence",5),(req,res)=>{
  const targetId=String(req.body?.targetUserId||""),reason=String(req.body?.reason||"").trim(),details=String(req.body?.details||"").trim(),target=getUserById(targetId);
  if(!target||target.id===req.user.id){for(const f of req.files||[])fs.rmSync(f.path,{force:true});return res.status(404).json({error:"Reported player not found."})}
  if(!reason||reason.length>120||details.length>3000){for(const f of req.files||[])fs.rmSync(f.path,{force:true});return res.status(400).json({error:"Add a reason and keep the report details under 3000 characters."})}
  const reports=readJson(files.reports,[]),evidence=(req.files||[]).map(f=>({id:crypto.randomUUID(),filename:f.filename,originalFilename:f.originalname,mimeType:f.mimetype,size:f.size}));
  const row={id:crypto.randomUUID(),reporterId:req.user.id,targetUserId:target.id,reason,details,evidence,status:"open",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  reports.push(row);writeJson(files.reports,reports);res.json({reportId:row.id});
});
app.get("/api/communities",auth,(req,res)=>{
  const q=String(req.query.q||"").trim().toLowerCase(),communities=readJson(files.communities,[]),invites=readJson(files.communityInvites,[]);
  const results=communities.filter(c=>{
    const member=c.members.some(m=>m.userId===req.user.id);
    const invited=invites.some(i=>i.communityId===c.id&&i.userId===req.user.id&&i.status==="pending");
    const visible=c.visibility==="public"||c.visibility==="invite"||member||invited||c.ownerId===req.user.id;
    return visible&&(!q||c.name.toLowerCase().includes(q));
  }).slice(0,50).map(c=>({...c,members:undefined,memberCount:c.members.length,isMember:c.members.some(m=>m.userId===req.user.id),isInvited:invites.some(i=>i.communityId===c.id&&i.userId===req.user.id&&i.status==="pending")}));
  res.json({communities:results});
});
app.post("/api/communities",auth,(req,res)=>{
  const name=String(req.body?.name||"").trim(),description=String(req.body?.description||"").trim(),visibility=String(req.body?.visibility||"public");
  if(name.length<2||name.length>60||description.length>500||!validVisibility(visibility))return res.status(400).json({error:"Enter a valid group name, description and visibility."});
  const communities=readJson(files.communities,[]);
  if(communities.some(c=>c.name.toLowerCase()===name.toLowerCase()))return res.status(409).json({error:"A community with that name already exists."});
  const c={id:crypto.randomUUID(),name,description,visibility,ownerId:req.user.id,ownerName:req.user.name,members:[{userId:req.user.id,role:"owner",joinedAt:new Date().toISOString()}],createdAt:new Date().toISOString()};
  communities.push(c);writeJson(files.communities,communities);res.json({community:{...c,members:undefined,memberCount:1,isMember:true}});
});
app.post("/api/communities/:id/join",auth,(req,res)=>{
  const communities=readJson(files.communities,[]),c=communities.find(x=>x.id===req.params.id);
  if(!c)return res.status(404).json({error:"Community not found."});
  if(c.members.some(m=>m.userId===req.user.id))return res.json({ok:true});
  const invites=readJson(files.communityInvites,[]),invite=invites.find(i=>i.communityId===c.id&&i.userId===req.user.id&&i.status==="pending");
  if(c.visibility!=="public"&&!invite)return res.status(403).json({error:c.visibility==="private"?"This private community is invite-only.":"This community requires an invite."});
  c.members.push({userId:req.user.id,role:"member",joinedAt:new Date().toISOString()});
  if(invite){invite.status="accepted";invite.updatedAt=new Date().toISOString();writeJson(files.communityInvites,invites)}
  writeJson(files.communities,communities);res.json({ok:true});
});
app.post("/api/communities/:id/invite",auth,(req,res)=>{
  const communities=readJson(files.communities,[]),c=communities.find(x=>x.id===req.params.id);
  const target=getUserById(String(req.body?.userId||""));
  if(!c||!target)return res.status(404).json({error:"Community or player not found."});
  const owner=c.members.find(m=>m.userId===req.user.id&&["owner","moderator"].includes(m.role));
  if(!owner)return res.status(403).json({error:"Only the community owner or moderators can invite players."});
  if(c.members.some(m=>m.userId===target.id))return res.status(409).json({error:"That player is already a member."});
  const invites=readJson(files.communityInvites,[]);
  if(!invites.some(i=>i.communityId===c.id&&i.userId===target.id&&i.status==="pending")){
    invites.push({id:crypto.randomUUID(),communityId:c.id,userId:target.id,invitedBy:req.user.id,status:"pending",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    writeJson(files.communityInvites,invites);
  }
  res.json({ok:true});
});
app.get("/api/communities/invites",auth,(req,res)=>{
  const invites=readJson(files.communityInvites,[]).filter(i=>i.userId===req.user.id&&i.status==="pending");
  const communities=readJson(files.communities,[]);
  res.json({invites:invites.map(i=>({id:i.id,community:communities.find(c=>c.id===i.communityId)})).filter(x=>x.community).map(x=>({...x,community:{...x.community,members:undefined,memberCount:x.community.members.length}}))});
});
app.post("/api/communities/invites/:id/decline",auth,(req,res)=>{
  const invites=readJson(files.communityInvites,[]),i=invites.find(x=>x.id===req.params.id&&x.userId===req.user.id&&x.status==="pending");
  if(!i)return res.status(404).json({error:"Invite not found."});i.status="declined";i.updatedAt=new Date().toISOString();writeJson(files.communityInvites,invites);res.json({ok:true});
});
app.post("/api/games/upload",auth,upload.single("game"),(req,res)=>{if(!req.file)return res.status(400).json({error:"Choose a ZIP or EXE game package."});const title=String(req.body?.title||"").trim(),description=String(req.body?.description||"").trim(),price=Number(req.body?.price);if(!title||title.length>80||!description||description.length>2000||!Number.isFinite(price)||price<0||price>999.99){fs.rmSync(req.file.path,{force:true});return res.status(400).json({error:"Enter a valid title, description and price from €0 to €999.99."})}const game={id:crypto.randomUUID(),title,description,price:Math.round(price*100)/100,filename:req.file.filename,originalFilename:req.file.originalname,creatorId:req.user.id,creatorName:req.user.name,status:"pending",createdAt:new Date().toISOString()};const games=readJson(files.games,[]);games.push(game);writeJson(files.games,games);res.json({game:publicGame(game)})});
app.get("/api/games",(req,res)=>{const user=getUser(req),owned=new Set(user?readJson(files.purchases,[]).filter(p=>p.userId===user.id&&p.status==="paid").map(p=>p.gameId):[]);res.json({games:readJson(files.games,[]).filter(g=>g.status==="approved").map(g=>publicGame(g,owned))})});
app.get("/api/library",auth,(req,res)=>{const owned=new Set(readJson(files.purchases,[]).filter(p=>p.userId===req.user.id&&p.status==="paid").map(p=>p.gameId));res.json({games:readJson(files.games,[]).filter(g=>owned.has(g.id)).map(g=>publicGame(g,owned))})});
app.get("/api/admin/reports",auth,admin,(req,res)=>{const users=readJson(files.users,[]);const reports=readJson(files.reports,[]).map(r=>({...r,reporterName:users.find(u=>u.id===r.reporterId)?.name||"Unknown",targetName:users.find(u=>u.id===r.targetUserId)?.name||"Unknown"}));res.json({reports})});
app.get("/api/reports/evidence/:filename",auth,(req,res)=>{const reports=readJson(files.reports,[]),report=reports.find(r=>r.evidence.some(e=>e.filename===req.params.filename));if(!report)return res.status(404).json({error:"Evidence not found."});if(report.reporterId!==req.user.id&&req.user.email!==ADMIN_EMAIL)return res.status(403).json({error:"Not allowed."});const safe=path.basename(req.params.filename),filePath=path.resolve(evidenceDir,safe),root=path.resolve(evidenceDir);if(!filePath.startsWith(root+path.sep)||!fs.existsSync(filePath))return res.status(404).json({error:"Evidence unavailable."});res.sendFile(filePath)});
app.get("/api/admin/games",auth,admin,(req,res)=>res.json({games:readJson(files.games,[]).map(g=>publicGame(g))}));
for(const action of ["approve","reject"])app.post("/api/admin/games/:id/"+action,auth,admin,(req,res)=>{const games=readJson(files.games,[]),game=games.find(g=>g.id===req.params.id);if(!game)return res.status(404).json({error:"Game not found."});game.status=action==="approve"?"approved":"rejected";writeJson(files.games,games);res.json({game:publicGame(game)})});
app.post("/api/create-checkout-session",auth,async(req,res)=>{try{const game=readJson(files.games,[]).find(g=>g.id===String(req.body?.gameId||"")&&g.status==="approved");if(!game)return res.status(404).json({error:"Game not found or not approved."});if(purchaseExists(req.user.id,game.id))return res.status(409).json({error:"You already own this game."});if(game.price===0){grantPurchase({userId:req.user.id,gameId:game.id});return res.json({free:true,gameId:game.id})}const stripe=stripeClient(),origin=process.env.PUBLIC_BASE_URL||req.protocol+"://"+req.get("host");const session=await stripe.checkout.sessions.create({mode:"payment",customer_email:req.user.email,line_items:[{price_data:{currency:"eur",product_data:{name:game.title,description:game.description.slice(0,500)},unit_amount:Math.round(game.price*100)},quantity:1}],metadata:{userId:req.user.id,gameId:game.id},success_url:origin+"/success.html?session_id={CHECKOUT_SESSION_ID}",cancel_url:origin+"/cancel.html"});res.json({url:session.url,sessionId:session.id})}catch(error){console.error("Checkout:",error);res.status(error.statusCode||500).json({error:error.message||"Payment service error."})}});
app.get("/api/purchases/confirm",auth,async(req,res)=>{try{const sessionId=String(req.query.session_id||"");if(!sessionId)return res.status(400).json({error:"Missing session_id."});const session=await stripeClient().checkout.sessions.retrieve(sessionId);if(session.metadata?.userId!==req.user.id||session.payment_status!=="paid")return res.status(403).json({error:"Payment is not confirmed for this account."});const purchase=grantPurchase({userId:req.user.id,gameId:session.metadata.gameId,stripeSessionId:session.id,paymentIntentId:typeof session.payment_intent==="string"?session.payment_intent:null});res.json({ok:true,purchase})}catch(error){res.status(400).json({error:error.message||"Could not confirm payment."})}});
app.get("/api/games/:id/download",auth,(req,res)=>{const game=readJson(files.games,[]).find(g=>g.id===req.params.id&&g.status==="approved");if(!game)return res.status(404).json({error:"Game not found."});if(!purchaseExists(req.user.id,game.id))return res.status(403).json({error:"Purchase this game before downloading it."});const root=path.resolve(uploadDir),filePath=path.resolve(uploadDir,game.filename);if(!filePath.startsWith(root+path.sep)||!fs.existsSync(filePath))return res.status(404).json({error:"Game package is unavailable."});res.download(filePath,game.originalFilename||path.basename(filePath))});
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(400).json({error:err.message||"Request failed."})});
const server=app.listen(port,()=>console.log("Extra Games "+VERSION+" listening on port "+server.address().port));
const ready=new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject)});
module.exports={app,server,ready};