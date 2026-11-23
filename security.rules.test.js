const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp, Timestamp } = require("firebase/firestore");
const fs = require("fs");

const PROJECT_ID = "demo-321-sarisari-test-lab";
const OWNER = "ViCadvue0IM7qWO7br5gm0Wzyng1";
const JUAN = "vkDTVuur2lNKXwPd5KhxCFeHYV52";
const MARIA = "yp8q5f2V92VM4DU6WCq2zJuEpBA3";
const ORDER = "auto-test-order";
let env;

const rider = (uid, name, role) => ({uid, name, role, approvalStatus:"Approved", status:"Active"});
async function seed() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db,"publicCatalog","rice-1"), {active:true,name:"Rice",unit:"Kilo",price:64});
    await setDoc(doc(db,"riderProfiles",JUAN), rider(JUAN,"Juan dela Cruz","Rider"));
    await setDoc(doc(db,"riderProfiles",MARIA), rider(MARIA,"Maria dela Cruz","Rider/Salesman"));
    await setDoc(doc(db,"customerOrders",ORDER), {
      customerUid:"customer-uid",
      customer:{name:"Tyche",phone:"09669011211",address:"SCC",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],
      subtotal:64,deliveryFee:0,paymentMethod:"COD",paymentStatus:"Pending",paymentSenderName:"",paymentSenderNumber:"",buyerPaymentReference:"",paymentAmount:0,notes:"",
      status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",
      createdAt:Timestamp.now(),source:"online"
    });
  });
}
const dbFor = (uid, provider="password") => env.authenticatedContext(uid,{firebase:{sign_in_provider:provider}}).firestore();
const ownerDb = () => dbFor(OWNER);
const juanDb = () => dbFor(JUAN);
const customerDb = uid => dbFor(uid,"anonymous");
async function acceptCodQuote() {
  await updateDoc(doc(customerDb("customer-uid"),"customerOrders",ORDER),{
    deliveryFeeAccepted:true,deliveryFeeAcceptedAt:serverTimestamp()
  });
}
async function confirmOrder(db) {
  const ref=doc(db,"customerOrders",ORDER);
  await updateDoc(ref,{deliveryFee:30,deliveryFeeConfirmedAt:serverTimestamp()});
  await acceptCodQuote();
  await updateDoc(ref,{status:"Confirmed",ownerConfirmedAt:serverTimestamp()});
  return ref;
}
async function assignJuan(db) {
  const ref=await confirmOrder(db);
  await updateDoc(ref,{status:"Assigned",riderId:JUAN,riderName:"Juan dela Cruz",riderRole:"Rider",assignedAt:serverTimestamp(),salesAttributionStatus:"Assigned to rider"});
  return ref;
}

describe("321 TEST LAB — Firestore M10 candidate rules", function() {
  before(async()=>{
    env=await initializeTestEnvironment({
      projectId:PROJECT_ID,
      firestore:{rules:fs.readFileSync("firestore.rules","utf8")}
    });
  });
  beforeEach(async()=>{await env.clearFirestore(); await seed();});
  after(async()=>{if(env) await env.cleanup();});

  it("T01 Owner can read rider profile",()=>assertSucceeds(getDoc(doc(ownerDb(),"riderProfiles",JUAN))));
  it("T02 Rider cannot read own profile",()=>assertFails(getDoc(doc(juanDb(),"riderProfiles",JUAN))));
  it("T03 Rider cannot list customer orders",()=>assertFails(getDocs(collection(juanDb(),"customerOrders"))));
  it("T04 Rider cannot read customer order",()=>assertFails(getDoc(doc(juanDb(),"customerOrders",ORDER))));
  it("T05 Rider cannot update order status",()=>assertFails(updateDoc(doc(juanDb(),"customerOrders",ORDER),{status:"Delivered"})));
  it("T06 Rider cannot create customer order",()=>assertFails(setDoc(doc(juanDb(),"customerOrders","rider-created"),{status:"New"})));
  it("T07 Rider cannot read riderOrders",()=>assertFails(getDoc(doc(juanDb(),"riderOrders",ORDER))));
  it("T08 Owner cannot read riderOrders",()=>assertFails(getDoc(doc(ownerDb(),"riderOrders",ORDER))));
  it("T09 Owner cannot read deliverySecrets",()=>assertFails(getDoc(doc(ownerDb(),"deliverySecrets",ORDER))));
  it("T10 Owner cannot create deliverySecrets",()=>assertFails(setDoc(doc(ownerDb(),"deliverySecrets",ORDER),{pin:"1234"})));
  it("T11 Owner cannot delete customer orders",()=>assertFails(deleteDoc(doc(ownerDb(),"customerOrders",ORDER))));
  it("T12 Owner can list customer orders",()=>assertSucceeds(getDocs(collection(ownerDb(),"customerOrders"))));

  it("T13 Anonymous customer can create valid COD order",async()=>{
    const db=customerDb("cust-valid-1");
    await assertSucceeds(setDoc(doc(db,"customerOrders","valid-cod"),{
      customerUid:"cust-valid-1",
      customer:{name:"Test Buyer",phone:"09123456789",address:"Test Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],
      subtotal:64,deliveryFee:30,paymentMethod:"COD",paymentStatus:"Pending",paymentSenderName:"",paymentSenderNumber:"",buyerPaymentReference:"",paymentAmount:0,notes:"",
      status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",
      createdAt:serverTimestamp(),source:"online"
    }));
  });
  it("T14 Customer cannot create order for another UID",async()=>{
    const db=customerDb("cust-valid-2");
    await assertFails(setDoc(doc(db,"customerOrders","wrong-owner"),{
      customerUid:"someone-else",
      customer:{name:"Test Buyer",phone:"09123456789",address:"Test Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],
      subtotal:64,deliveryFee:30,paymentMethod:"COD",paymentStatus:"Pending",paymentSenderName:"",paymentSenderNumber:"",buyerPaymentReference:"",paymentAmount:0,notes:"",
      status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",
      createdAt:serverTimestamp(),source:"online"
    }));
  });
  it("T15 Customer cannot order unknown product",async()=>{
    const db=customerDb("cust-valid-3");
    await assertFails(setDoc(doc(db,"customerOrders","bad-product"),{
      customerUid:"cust-valid-3",
      customer:{name:"Test Buyer",phone:"09123456789",address:"Test Street",area:"San Carlos City Proper"},
      items:[{productId:"missing",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],
      subtotal:64,deliveryFee:30,paymentMethod:"COD",paymentStatus:"Pending",paymentSenderName:"",paymentSenderNumber:"",buyerPaymentReference:"",paymentAmount:0,notes:"",
      status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",
      createdAt:serverTimestamp(),source:"online"
    }));
  });
  it("T23 Anonymous customer can create valid GCash order with structured buyer reference",async()=>{
    const db=customerDb("cust-gcash-1");
    await assertSucceeds(setDoc(doc(db,"customerOrders","valid-gcash"),{
      customerUid:"cust-gcash-1", customer:{name:"GCash Buyer",phone:"09123456789",address:"Test Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],
      subtotal:64,deliveryFee:30,paymentMethod:"GCash",paymentStatus:"Pending",paymentSenderName:"Test Sender",paymentSenderNumber:"09123456789",buyerPaymentReference:"BUYER1234",paymentAmount:94,notes:"",status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",createdAt:serverTimestamp(),source:"online"
    }));
  });
  it("T24 Anonymous customer can create valid BDO transfer order",async()=>{
    const db=customerDb("cust-bdo-1");
    await assertSucceeds(setDoc(doc(db,"customerOrders","valid-bdo"),{
      customerUid:"cust-bdo-1", customer:{name:"BDO Buyer",phone:"09123456789",address:"Test Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],
      subtotal:64,deliveryFee:30,paymentMethod:"BDO Bank Transfer",paymentStatus:"Pending",paymentSenderName:"Test Sender",paymentSenderNumber:"",buyerPaymentReference:"BDO12345",paymentAmount:94,notes:"",status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",createdAt:serverTimestamp(),source:"online"
    }));
  });
  it("T25 Customer cannot read another customer's order",async()=>{
    await assertFails(getDoc(doc(customerDb("different-customer"),"customerOrders",ORDER)));
  });
  it("T26 Owner can verify GCash with a separate recipient-side reference",async()=>{
    await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),"customerOrders","verify-gcash"),{
      customerUid:"cust-gcash",customer:{name:"GCash Buyer",phone:"09123456789",address:"Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],subtotal:64,deliveryFee:30,
      paymentMethod:"GCash",paymentStatus:"Pending",paymentSenderName:"Buyer",paymentSenderNumber:"09123456789",buyerPaymentReference:"BUYER1234",paymentAmount:94,notes:"",status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",createdAt:Timestamp.now(),source:"online"
    }));
    await assertSucceeds(updateDoc(doc(customerDb("cust-gcash"),"customerOrders","verify-gcash"),{deliveryFeeAccepted:true,deliveryFeeAcceptedAt:serverTimestamp(),paymentAmount:94,postQuotePaymentReference:"FINAL1234"}));
    await assertSucceeds(updateDoc(doc(ownerDb(),"customerOrders","verify-gcash"),{paymentStatus:"Verified",paymentVerifiedReference:"RECIPIENT123",paymentVerifiedBy:OWNER,paymentVerifiedAt:serverTimestamp()}));
  });
  it("T27 Owner cannot verify COD payment",async()=>{
    await assertFails(updateDoc(doc(ownerDb(),"customerOrders",ORDER),{paymentStatus:"Verified",paymentVerifiedReference:"RECIPIENT123",paymentVerifiedBy:OWNER,paymentVerifiedAt:serverTimestamp()}));
  });
  it("T28 Buyer payment reference is immutable after order creation",async()=>{
    await assertFails(updateDoc(doc(ownerDb(),"customerOrders",ORDER),{buyerPaymentReference:"CHANGED123"}));
  });
  it("T30 Owner can reconfirm an unchanged San Carlos fee of 30",async()=>{
    await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),"customerOrders","fee-already-30"),{
      customerUid:"cust-fee",customer:{name:"Fee Buyer",phone:"09123456789",address:"Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],subtotal:64,deliveryFee:30,
      paymentMethod:"COD",paymentStatus:"Pending",paymentSenderName:"",paymentSenderNumber:"",buyerPaymentReference:"",paymentAmount:0,notes:"",status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",createdAt:Timestamp.now(),source:"online"
    }));
    await assertSucceeds(updateDoc(doc(ownerDb(),"customerOrders","fee-already-30"),{deliveryFee:30,deliveryFeeConfirmedAt:serverTimestamp()}));
  });
  it("T31 Owner can verify BDO transfer with recipient-side reference",async()=>{
    await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),"customerOrders","verify-bdo"),{
      customerUid:"cust-bdo",customer:{name:"BDO Buyer",phone:"09123456789",address:"Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],subtotal:64,deliveryFee:30,
      paymentMethod:"BDO Bank Transfer",paymentStatus:"Pending",paymentSenderName:"Buyer",paymentSenderNumber:"",buyerPaymentReference:"BUYERBDO123",paymentAmount:94,notes:"",status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",createdAt:Timestamp.now(),source:"online"
    }));
    await assertSucceeds(updateDoc(doc(customerDb("cust-bdo"),"customerOrders","verify-bdo"),{deliveryFeeAccepted:true,deliveryFeeAcceptedAt:serverTimestamp(),paymentAmount:94,postQuotePaymentReference:"FINALBDO123"}));
    await assertSucceeds(updateDoc(doc(ownerDb(),"customerOrders","verify-bdo"),{paymentStatus:"Verified",paymentVerifiedReference:"RECIPIENTBDO123",paymentVerifiedBy:OWNER,paymentVerifiedAt:serverTimestamp()}));
  });
  it("T29 San Carlos City Proper order cannot be created with zero delivery estimate",async()=>{
    const db=customerDb("cust-zero-fee");
    await assertFails(setDoc(doc(db,"customerOrders","bad-estimate"),{
      customerUid:"cust-zero-fee",customer:{name:"Test Buyer",phone:"09123456789",address:"Test Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],subtotal:64,deliveryFee:0,
      paymentMethod:"COD",paymentStatus:"Pending",paymentSenderName:"",paymentSenderNumber:"",buyerPaymentReference:"",paymentAmount:0,notes:"",status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",createdAt:serverTimestamp(),source:"online"
    }));
  });
  it("T32 Customer can accept a confirmed COD delivery fee quote",async()=>{
    await updateDoc(doc(ownerDb(),"customerOrders",ORDER),{deliveryFee:40,deliveryFeeConfirmedAt:serverTimestamp()});
    await assertSucceeds(updateDoc(doc(customerDb("customer-uid"),"customerOrders",ORDER),{deliveryFeeAccepted:true,deliveryFeeAcceptedAt:serverTimestamp()}));
  });
  it("T33 Customer cannot accept another customer's delivery fee quote",async()=>{
    await updateDoc(doc(ownerDb(),"customerOrders",ORDER),{deliveryFee:40,deliveryFeeConfirmedAt:serverTimestamp()});
    await assertFails(updateDoc(doc(customerDb("wrong-customer"),"customerOrders",ORDER),{deliveryFeeAccepted:true,deliveryFeeAcceptedAt:serverTimestamp()}));
  });
  it("T34 Owner cannot change delivery fee after customer acceptance",async()=>{
    await updateDoc(doc(ownerDb(),"customerOrders",ORDER),{deliveryFee:40,deliveryFeeConfirmedAt:serverTimestamp()});
    await acceptCodQuote();
    await assertFails(updateDoc(doc(ownerDb(),"customerOrders",ORDER),{deliveryFee:50,deliveryFeeConfirmedAt:serverTimestamp()}));
  });
  it("T35 Online customer acceptance requires final amount and reference",async()=>{
    await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),"customerOrders","quote-online"),{
      customerUid:"quote-buyer",customer:{name:"Buyer",phone:"09123456789",address:"Street",area:"San Carlos City Proper"},
      items:[{productId:"rice-1",name:"Rice",unit:"Kilo",quantity:1,unitPrice:64,lineTotal:64}],subtotal:64,deliveryFee:30,
      paymentMethod:"GCash",paymentStatus:"Pending",paymentSenderName:"Buyer",paymentSenderNumber:"09123456789",buyerPaymentReference:"INITIAL123",paymentAmount:94,notes:"",status:"New",riderId:"",riderName:"",salesAttributionStatus:"Pending owner review",createdAt:Timestamp.now(),source:"online",deliveryFeeConfirmedAt:Timestamp.now()
    }));
    await assertFails(updateDoc(doc(customerDb("quote-buyer"),"customerOrders","quote-online"),{deliveryFeeAccepted:true,deliveryFeeAcceptedAt:serverTimestamp(),paymentAmount:94,postQuotePaymentReference:""}));
    await assertSucceeds(updateDoc(doc(customerDb("quote-buyer"),"customerOrders","quote-online"),{deliveryFeeAccepted:true,deliveryFeeAcceptedAt:serverTimestamp(),paymentAmount:94,postQuotePaymentReference:"FINAL1234"}));
  });

  it("T16 Owner can confirm New order after fee confirmation",async()=>{
    const db=ownerDb(), ref=doc(db,"customerOrders",ORDER);
    await updateDoc(ref,{deliveryFee:30,deliveryFeeConfirmedAt:serverTimestamp()});
    await acceptCodQuote();
    await assertSucceeds(updateDoc(ref,{status:"Confirmed",ownerConfirmedAt:serverTimestamp()}));
  });
  it("T17 Owner cannot change subtotal during fee update",()=>assertFails(updateDoc(doc(ownerDb(),"customerOrders",ORDER),{
    deliveryFee:30,deliveryFeeConfirmedAt:serverTimestamp(),subtotal:999
  })));
  it("T18 Owner can assign approved active rider",async()=>{
    const ref=await confirmOrder(ownerDb());
    await assertSucceeds(updateDoc(ref,{status:"Assigned",riderId:JUAN,riderName:"Juan dela Cruz",riderRole:"Rider",assignedAt:serverTimestamp(),salesAttributionStatus:"Assigned to rider"}));
  });
  it("T19 Owner cannot assign unknown rider",async()=>{
    const ref=await confirmOrder(ownerDb());
    await assertFails(updateDoc(ref,{status:"Assigned",riderId:"not-approved",riderName:"Unknown",riderRole:"Rider",assignedAt:serverTimestamp(),salesAttributionStatus:"Assigned to rider"}));
  });
  it("T20 Owner can reassign to another approved active rider",async()=>{
    const ref=await assignJuan(ownerDb());
    await assertSucceeds(updateDoc(ref,{riderId:MARIA,riderName:"Maria dela Cruz",riderRole:"Rider/Salesman",assignedAt:serverTimestamp(),salesAttributionStatus:"Assigned to rider"}));
  });
  it("T21 Owner cannot jump New directly to Assigned",()=>assertFails(updateDoc(doc(ownerDb(),"customerOrders",ORDER),{
    status:"Assigned",riderId:JUAN,riderName:"Juan dela Cruz",riderRole:"Rider",assignedAt:serverTimestamp(),salesAttributionStatus:"Assigned to rider"
  })));
  it("T22 Owner can mark Delivered only through owner transition (no rider PIN proof)",async()=>{
    const ref=await assignJuan(ownerDb());
    await updateDoc(ref,{status:"Out for Delivery",outForDeliveryAt:serverTimestamp()});
    await assertSucceeds(updateDoc(ref,{status:"Delivered",deliveredAt:serverTimestamp(),salesAttributionStatus:"Delivered — owner review required"}));
  });
});
