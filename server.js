const express=require('express');
const path=require('node:path');
const {createCheckoutSession}=require('./api/create-checkout-session');
const app=express();
const port=process.env.PORT||3000;
app.use(express.static(__dirname));
app.post('/api/create-checkout-session',express.json(),async(req,res)=>{
  try{
    const origin=req.protocol+'://'+req.get('host');
    const result=await createCheckoutSession(req.body||{},origin);
    res.json(result);
  }catch(error){
    console.error(error);
    res.status(error.statusCode||500).json({error:error.message||'Payment service error.'});
  }
});
app.get('/success.html',(req,res)=>res.sendFile(path.join(__dirname,'success.html')));
app.get('/cancel.html',(req,res)=>res.sendFile(path.join(__dirname,'cancel.html')));
app.listen(port,()=>console.log('Extra Games server listening on port '+port));