const express=require('express');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const multer=require('multer');
const {createCheckoutSession}=require('./api/create-checkout-session');

const app=express();
const port=Number(process.env.PORT)||3000;
app.disable('x-powered-by');
const dataDir=path.join(__dirname,'data');
const uploadDir=path.join(__dirname,'uploads');
fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(uploadDir,{recursive:true});
const usersFile=path.join(dataDir,'users.json'),gamesFile=path.join(dataDir,'games.json'),sessionsFile=path.join(dataDir,'sessions.json');
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function writeJson(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2))}
for(const [f,v] of [[usersFile,[]],[gamesFile,[]],[sessionsFile,{}]])if(!fs.existsSync(f))writeJson(f,v);

app.use(express.static(__dirname));
app.use(express.json());

function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(password,salt,64).toString('hex');return salt+':'+hash}
function verifyPassword(password,stored){try{const [salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;const test=crypto.scryptSync(password,salt,64).toString('hex');return hash.length===test.length&&crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(test,'hex'))}catch{return false}}
function cleanUser(u){return {id:u.id,name:u.name,email:u.email}}
function cookieToken(req){const raw=req.headers.cookie||'';const m=raw.match(/(?:^|;\s*)eg_session=([^;]+)/);return m?m[1]:null}
function auth(req,res,next){
  const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):cookieToken(req);
  const sessions=readJson(sessionsFile,{}),userId=token?sessions[token]:null;
  const users=readJson(usersFile,[]),user=users.find(x=>x.id===userId);
  if(!user)return res.status(401).json({error:'You must be logged in.'});
  req.user=user;next();
}
function tokenFor(user){const token=crypto.randomBytes(32).toString('hex');const sessions=readJson(sessionsFile,{});sessions[token]=user.id;writeJson(sessionsFile,sessions);return token}
function setCookie(res,token){res.setHeader('Set-Cookie','eg_session='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000')}

app.get('/api/auth/me',(req,res)=>{
  const raw=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):cookieToken(req);
  const sessions=readJson(sessionsFile,{}),users=readJson(usersFile,[]);
  const user=raw?users.find(x=>x.id===sessions[raw]):null;
  res.json({user:user?cleanUser(user):null});
});
app.post('/api/auth/signup',(req,res)=>{
  const {name,email,password}=req.body||{};const normalized=String(email||'').trim().toLowerCase();
  if(!name||name.length>32||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)||typeof password!=='string'||password.length<8)return res.status(400).json({error:'Use a valid name, email and password of at least 8 characters.'});
  const users=readJson(usersFile,[]);if(users.some(u=>u.email===normalized))return res.status(409).json({error:'An account with that email already exists.'});
  const user={id:crypto.randomUUID(),name:String(name).trim(),email:normalized,password:hashPassword(password),createdAt:new Date().toISOString()};users.push(user);writeJson(usersFile,users);const token=tokenFor(user);setCookie(res,token);res.json({user:cleanUser(user)});
});
app.post('/api/auth/login',(req,res)=>{
  const {email,password}=req.body||{},normalized=String(email||'').trim().toLowerCase();const user=readJson(usersFile,[]).find(u=>u.email===normalized);
  if(!user||!verifyPassword(String(password||''),user.password))return res.status(401).json({error:'Invalid email or password.'});
  const token=tokenFor(user);setCookie(res,token);res.json({user:cleanUser(user)});
});
app.post('/api/auth/logout',(req,res)=>{res.setHeader('Set-Cookie','eg_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.json({ok:true})});

const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:2*1024*1024*1024},fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();cb(ext==='.zip'||ext==='.exe'?null:new Error('Only .zip and .exe game packages are allowed.'))}});
app.post('/api/games/upload',auth,upload.single('game'),(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Choose a ZIP or EXE game package.'});
  const title=String(req.body.title||'').trim(),description=String(req.body.description||'').trim(),price=Number(req.body.price||0);
  if(!title||!description||!Number.isFinite(price)||price<0)return res.status(400).json({error:'Game name, description and a valid price are required.'});
  const games=readJson(gamesFile,[]);const game={id:crypto.randomUUID(),title,description,price:Math.round(price*100)/100,filename:req.file.filename,originalFilename:req.file.originalname,creatorId:req.user.id,creatorName:req.user.name,status:'pending',createdAt:new Date().toISOString()};
  games.push(game);writeJson(gamesFile,games);res.json({game:{id:game.id,title:game.title,status:game.status}});
});
app.get('/api/games',(req,res)=>res.json({games:readJson(gamesFile,[]).filter(g=>g.status==='approved').map(({filename,...g})=>g)}));

app.post('/api/create-checkout-session',async(req,res)=>{
  try{const origin=req.protocol+'://'+req.get('host');res.json(await createCheckoutSession(req.body||{},origin))}
  catch(error){console.error(error);res.status(error.statusCode||500).json({error:error.message||'Payment service error.'})}
});
app.get('/success.html',(req,res)=>res.sendFile(path.join(__dirname,'success.html')));
app.get('/cancel.html',(req,res)=>res.sendFile(path.join(__dirname,'cancel.html')));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'extra-games',version:'0.3.0'}));
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(400).json({error:err.message||'Request failed.'})});
app.listen(port,()=>console.log('Extra Games server listening on port '+port));