const Stripe=require('stripe');
const PRODUCTS={
  demo_game:{
    name:'Extra Games Demo Game',
    description:'Replace this catalog entry with an approved game from Extra Games.',
    amount:499,
    currency:'eur'
  }
};
function getStripe(){
  if(!process.env.STRIPE_SECRET_KEY){
    const error=new Error('STRIPE_SECRET_KEY is not configured on the server.');
    error.statusCode=500;
    throw error;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
async function createCheckoutSession(body,origin){
  const productId=body&&body.productId;
  const email=body&&body.email;
  const product=PRODUCTS[productId];
  if(!product){const error=new Error('Unknown game.');error.statusCode=400;throw error;}
  if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)){
    const error=new Error('A valid email address is required.');error.statusCode=400;throw error;
  }
  const stripe=getStripe();
  const session=await stripe.checkout.sessions.create({
    mode:'payment',
    customer_email:email,
    line_items:[{
      price_data:{
        currency:product.currency,
        product_data:{name:product.name,description:product.description},
        unit_amount:product.amount
      },
      quantity:1
    }],
    metadata:{productId},
    success_url:origin+'/success.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:origin+'/cancel.html'
  });
  return {url:session.url,sessionId:session.id};
}
module.exports={createCheckoutSession,PRODUCTS};