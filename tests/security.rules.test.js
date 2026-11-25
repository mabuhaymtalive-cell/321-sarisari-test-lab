
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require("@firebase/rules-unit-testing");

const {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  deleteDoc,
  serverTimestamp
} = require("firebase/firestore");

const fs = require("fs");

const PROJECT_ID = "demo-321-sarisari-test-lab";
const OWNER = "ViCadvue0IM7qWO7br5gm0Wzyng1";
const JUAN = "vkDTVuur2lNKXwPd5KhxCFeHYV52";
const MARIA = "yp8q5f2V92VM4DU6WCq2zJuEpBA3";

const ORDER = "m10-security-test-order";
let env;

const rider = (uid, name, role) => ({
  uid,
  name,
  role,
  approvalStatus: "Approved",
  status: "Active"
});

const dbFor = (uid, provider = "password") =>
  env.authenticatedContext(uid, {
    firebase: { sign_in_provider: provider }
  }).firestore();

const ownerDb = () => dbFor(OWNER);
const juanDb = () => dbFor(JUAN);
const mariaDb = () => dbFor(MARIA);
const customerDb = uid => dbFor(uid, "anonymous");

function orderData(uid, paymentMethod = "COD") {
  const online = paymentMethod !== "COD";

  return {
    customerUid: uid,

    customer: {
      name: "Test Buyer",
      phone: "09123456789",
      address: "Test Street",
      area: "San Carlos City Proper"
    },

    items: [{
      productId: "rice-1",
      name: "Rice",
      unit: "Kilo",
      quantity: 1,
      unitPrice: 64,
      lineTotal: 64
    }],

    subtotal: 64,
    deliveryFee: 30,

    paymentMethod,
    paymentStatus: "Pending",
    paymentSenderName: online ? "Test Sender" : "",
    paymentSenderNumber: online ? "09123456789" : "",
    buyerPaymentReference: online ? "BUYER-123456" : "",
    paymentAmount: 0,

    notes: "",
    status: "New",
    riderId: "",
    riderName: "",
    salesAttributionStatus: "Pending owner review",
    createdAt: serverTimestamp(),
    source: "online"
  };
}

async function seed() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();

    await setDoc(doc(db, "publicCatalog", "rice-1"), {
      active: true,
      name: "Rice",
      unit: "Kilo",
      price: 64
    });

    await setDoc(
      doc(db, "riderProfiles", JUAN),
      rider(JUAN, "Juan dela Cruz", "Rider")
    );

    await setDoc(
      doc(db, "riderProfiles", MARIA),
      rider(MARIA, "Maria dela Cruz", "Rider/Salesman")
    );

    await setDoc(
      doc(db, "customerOrders", ORDER),
      orderData("seed-customer")
    );
  });
}

async function createOrder(uid, paymentMethod = "COD", id = "new-order") {
  const db = customerDb(uid);

  await assertSucceeds(
    setDoc(
      doc(db, "customerOrders", id),
      orderData(uid, paymentMethod)
    )
  );

  return doc(db, "customerOrders", id);
}

async function ownerConfirmsFee(ref, fee = 30) {
  await updateDoc(ref, {
    deliveryFee: fee,
    deliveryFeeConfirmedAt: serverTimestamp()
  });
}

async function customerAcceptsQuote(uid, ref, online = false) {
  const fields = {
    deliveryFeeAccepted: true,
    deliveryFeeAcceptedAt: serverTimestamp()
  };

  if (online) {
    fields.paymentAmount = 94;
    fields.postQuotePaymentReference = "FINAL-123456";
  }

  await updateDoc(
    doc(customerDb(uid), "customerOrders", ref.id),
    fields
  );
}

async function ownerConfirmsOrder(ref) {
  await updateDoc(ref, {
    status: "Confirmed",
    ownerConfirmedAt: serverTimestamp()
  });
}

async function prepareConfirmedOrder(uid = "seed-customer") {
  const ref = doc(ownerDb(), "customerOrders", ORDER);

  await ownerConfirmsFee(ref);
  await customerAcceptsQuote(uid, ref);
  await ownerConfirmsOrder(ref);

  return ref;
}

async function assignJuan() {
  const ref = await prepareConfirmedOrder();

  await updateDoc(ref, {
    status: "Assigned",
    riderId: JUAN,
    riderName: "Juan dela Cruz",
    riderRole: "Rider",
    assignedAt: serverTimestamp(),
    salesAttributionStatus: "Assigned to rider"
  });

  return ref;
}

describe("321 Sari-Sari Store — M10 TEST LAB Rules", function () {
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8")
      }
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed();
  });

  after(async () => {
    if (env) await env.cleanup();
  });

  it("T01 Owner can read Juan's rider profile", () =>
    assertSucceeds(
      getDoc(doc(ownerDb(), "riderProfiles", JUAN))
    )
  );

  it("T02 Rider cannot read own rider profile", () =>
    assertFails(
      getDoc(doc(juanDb(), "riderProfiles", JUAN))
    )
  );

  it("T03 Rider cannot list customer orders", () =>
    assertFails(
      getDocs(collection(juanDb(), "customerOrders"))
    )
  );

  it("T04 Rider cannot read customer order", () =>
    assertFails(
      getDoc(doc(juanDb(), "customerOrders", ORDER))
    )
  );

  it("T05 Rider cannot change order status", () =>
    assertFails(
      updateDoc(
        doc(juanDb(), "customerOrders", ORDER),
        { status: "Delivered" }
      )
    )
  );

  it("T06 Rider cannot create customer order", () =>
    assertFails(
      setDoc(
        doc(juanDb(), "customerOrders", "rider-order"),
        orderData(JUAN)
      )
    )
  );

  it("T07 Rider cannot read riderOrders", () =>
    assertFails(
      getDoc(doc(juanDb(), "riderOrders", ORDER))
    )
  );

  it("T08 Owner cannot read riderOrders in Stage 1", () =>
    assertFails(
      getDoc(doc(ownerDb(), "riderOrders", ORDER))
    )
  );

  it("T09 Owner cannot read deliverySecrets", () =>
    assertFails(
      getDoc(doc(ownerDb(), "deliverySecrets", ORDER))
    )
  );

  it("T10 Owner cannot create deliverySecrets", () =>
    assertFails(
      setDoc(
        doc(ownerDb(), "deliverySecrets", ORDER),
        { pin: "1234" }
      )
    )
  );

  it("T11 Owner cannot delete customer orders", () =>
    assertFails(
      deleteDoc(doc(ownerDb(), "customerOrders", ORDER))
    )
  );

  it("T12 Owner can list customer orders", () =>
    assertSucceeds(
      getDocs(collection(ownerDb(), "customerOrders"))
    )
  );

  it("T13 Anonymous customer can create valid COD order", async () => {
    await createOrder("customer-cod", "COD", "valid-cod");
  });

  it("T14 Anonymous customer can create valid GCash order", async () => {
    await createOrder("customer-gcash", "GCash", "valid-gcash");
  });

  it("T15 Anonymous customer can create valid BDO order", async () => {
    await createOrder(
      "customer-bdo",
      "BDO Bank Transfer",
      "valid-bdo"
    );
  });

  it("T16 Customer cannot create order for another UID", async () => {
    const data = orderData("someone-else");

    await assertFails(
      setDoc(
        doc(customerDb("customer-wrong"), "customerOrders", "wrong-owner"),
        data
      )
    );
  });

  it("T17 Customer cannot create order with unknown product", async () => {
    const data = orderData("customer-bad-product");
    data.items[0].productId = "missing-product";

    await assertFails(
      setDoc(
        doc(customerDb("customer-bad-product"), "customerOrders", "bad-product"),
        data
      )
    );
  });

  it("T18 Customer cannot create order with incorrect subtotal", async () => {
    const data = orderData("customer-bad-total");
    data.subtotal = 999;

    await assertFails(
      setDoc(
        doc(customerDb("customer-bad-total"), "customerOrders", "bad-total"),
        data
      )
    );
  });

  it("T19 Customer cannot create order with incorrect initial fee", async () => {
    const data = orderData("customer-bad-fee");
    data.deliveryFee = 40;

    await assertFails(
      setDoc(
        doc(customerDb("customer-bad-fee"), "customerOrders", "bad-fee"),
        data
      )
    );
  });

  it("T20 Customer cannot create order with nonzero initial paymentAmount", async () => {
    const data = orderData("customer-bad-payment");
    data.paymentAmount = 94;

    await assertFails(
      setDoc(
        doc(customerDb("customer-bad-payment"), "customerOrders", "bad-payment"),
        data
      )
    );
  });

  it("T21 Customer can read own order", async () => {
    const ref = await createOrder(
      "customer-own",
      "COD",
      "customer-own-order"
    );

    await assertSucceeds(
      getDoc(doc(customerDb("customer-own"), "customerOrders", "customer-own-order"))
    );
  });

  it("T22 Customer cannot read another customer's order", async () => {
    await createOrder(
      "customer-owner",
      "COD",
      "private-order"
    );

    await assertFails(
      getDoc(
        doc(customerDb("customer-outsider"), "customerOrders", "private-order")
      )
    );
  });

  it("T23 Owner can confirm final delivery fee", async () => {
    await assertSucceeds(
      ownerConfirmsFee(doc(ownerDb(), "customerOrders", ORDER), 40)
    );
  });

  it("T24 Owner cannot change subtotal during fee update", () =>
    assertFails(
      updateDoc(
        doc(ownerDb(), "customerOrders", ORDER),
        {
          deliveryFee: 40,
          deliveryFeeConfirmedAt: serverTimestamp(),
          subtotal: 999
        }
      )
    )
  );

  it("T25 Store Pickup fee must remain zero", async () => {
    const data = orderData("pickup-customer");
    data.customer.area = "Store Pickup";
    data.customer.address = "";
    data.deliveryFee = 0;

    await assertSucceeds(
      setDoc(
        doc(customerDb("pickup-customer"), "customerOrders", "pickup-order"),
        data
      )
    );
  });

  it("T26 Customer can accept confirmed COD fee quote", async () => {
    const ref = doc(ownerDb(), "customerOrders", ORDER);

    await ownerConfirmsFee(ref);

    await assertSucceeds(
      customerAcceptsQuote("seed-customer", ref, false)
    );
  });

  it("T27 Customer can accept confirmed online fee quote and submit final reference", async () => {
    const ref = await createOrder(
      "quote-gcash",
      "GCash",
      "quote-gcash-order"
    );

    await ownerConfirmsFee(
      doc(ownerDb(), "customerOrders", "quote-gcash-order")
    );

    await assertSucceeds(
      customerAcceptsQuote(
        "quote-gcash",
        { id: "quote-gcash-order" },
        true
      )
    );
  });

  it("T28 Customer cannot accept quote before Owner confirms fee", () =>
    assertFails(
      updateDoc(
        doc(customerDb("seed-customer"), "customerOrders", ORDER),
        {
          deliveryFeeAccepted: true,
          deliveryFeeAcceptedAt: serverTimestamp()
        }
      )
    )
  );

  it("T29 Customer cannot change buyer reference after order creation", () =>
    assertFails(
      updateDoc(
        doc(customerDb("seed-customer"), "customerOrders", ORDER),
        { buyerPaymentReference: "CHANGED-REFERENCE" }
      )
    )
  );

  it("T30 Owner can manually verify online payment after quote acceptance", async () => {
    const ref = await createOrder(
      "verify-customer",
      "GCash",
      "verify-order"
    );

    const ownerRef = doc(ownerDb(), "customerOrders", "verify-order");

    await ownerConfirmsFee(ownerRef);

    await customerAcceptsQuote(
      "verify-customer",
      { id: "verify-order" },
      true
    );

    await assertSucceeds(
      updateDoc(ownerRef, {
        paymentStatus: "Verified",
        paymentVerifiedReference: "RECIPIENT-123456",
        paymentVerifiedAt: serverTimestamp(),
        paymentVerifiedBy: OWNER
      })
    );
  });

  it("T31 Customer cannot mark own online payment Verified", async () => {
    const ref = await createOrder(
      "verify-customer-2",
      "BDO Bank Transfer",
      "verify-order-2"
    );

    const ownerRef = doc(ownerDb(), "customerOrders", "verify-order-2");

    await ownerConfirmsFee(ownerRef);

    await customerAcceptsQuote(
      "verify-customer-2",
      { id: "verify-order-2" },
      true
    );

    await assertFails(
      updateDoc(
        doc(customerDb("verify-customer-2"), "customerOrders", "verify-order-2"),
        {
          paymentStatus: "Verified",
          paymentVerifiedReference: "FAKE-123456",
          paymentVerifiedAt: serverTimestamp(),
          paymentVerifiedBy: "verify-customer-2"
        }
      )
    );
  });

  it("T32 Owner cannot confirm COD order before customer accepts fee", () =>
    assertFails(
      updateDoc(
        doc(ownerDb(), "customerOrders", ORDER),
        {
          status: "Confirmed",
          ownerConfirmedAt: serverTimestamp()
        }
      )
    )
  );

    it("T33 Owner can confirm COD order after fee acceptance", async () => {
    const ref = doc(ownerDb(), "customerOrders", ORDER);

    await ownerConfirmsFee(ref);
    await customerAcceptsQuote("seed-customer", ref, false);

    await assertSucceeds(ownerConfirmsOrder(ref));

    const snapshot = await getDoc(ref);

    if (!snapshot.exists() || snapshot.data().status !== "Confirmed") {
      throw new Error("Order was not successfully confirmed.");
    }
  });

  it("T34 Owner can assign approved active Juan", async () => {
    const ref = await prepareConfirmedOrder();

    await assertSucceeds(
      updateDoc(ref, {
        status: "Assigned",
        riderId: JUAN,
        riderName: "Juan dela Cruz",
        riderRole: "Rider",
        assignedAt: serverTimestamp(),
        salesAttributionStatus: "Assigned to rider"
      })
    );
  });

  it("T35 Owner can assign approved active Maria", async () => {
    const ref = await prepareConfirmedOrder();

    await assertSucceeds(
      updateDoc(ref, {
        status: "Assigned",
        riderId: MARIA,
        riderName: "Maria dela Cruz",
        riderRole: "Rider/Salesman",
        assignedAt: serverTimestamp(),
        salesAttributionStatus: "Assigned to rider"
      })
    );
  });

  it("T36 Owner cannot assign unknown rider", async () => {
    const ref = await prepareConfirmedOrder();

    await assertFails(
      updateDoc(ref, {
        status: "Assigned",
        riderId: "unknown-rider",
        riderName: "Unknown Rider",
        riderRole: "Rider",
        assignedAt: serverTimestamp(),
        salesAttributionStatus: "Assigned to rider"
      })
    );
  });

  it("T37 Owner cannot assign Jane dummy as an eligible rider", async () => {
    const ref = await prepareConfirmedOrder();

    await assertFails(
      updateDoc(ref, {
        status: "Assigned",
        riderId: "jane-dummy",
        riderName: "Jane Dummy",
        riderRole: "Rider",
        assignedAt: serverTimestamp(),
        salesAttributionStatus: "Assigned to rider"
      })
    );
  });

  it("T38 Owner can reassign Juan to Maria", async () => {
    const ref = await assignJuan();

    await assertSucceeds(
      updateDoc(ref, {
        riderId: MARIA,
        riderName: "Maria dela Cruz",
        riderRole: "Rider/Salesman",
        assignedAt: serverTimestamp(),
        salesAttributionStatus: "Assigned to rider"
      })
    );
  });

  it("T39 Owner cannot jump New directly to Assigned", () =>
    assertFails(
      updateDoc(
        doc(ownerDb(), "customerOrders", ORDER),
        {
          status: "Assigned",
          riderId: JUAN,
          riderName: "Juan dela Cruz",
          riderRole: "Rider",
          assignedAt: serverTimestamp(),
          salesAttributionStatus: "Assigned to rider"
        }
      )
    )
  );

  it("T40 Rider cannot mark order Delivered", async () => {
    const ref = await assignJuan();

    await assertFails(
      updateDoc(
        doc(juanDb(), "customerOrders", ORDER),
        {
          status: "Delivered",
          deliveredAt: serverTimestamp()
        }
      )
    );
  });

  it("T41 Owner can perform Out for Delivery transition", async () => {
    const ref = await assignJuan();

    await assertSucceeds(
      updateDoc(ref, {
        status: "Out for Delivery",
        outForDeliveryAt: serverTimestamp()
      })
    );
  });

  it("T42 Owner can mark Delivered through owner transition only", async () => {
    const ref = await assignJuan();

    await updateDoc(ref, {
      status: "Out for Delivery",
      outForDeliveryAt: serverTimestamp()
    });

    await assertSucceeds(
      updateDoc(ref, {
        status: "Delivered",
        deliveredAt: serverTimestamp(),
        salesAttributionStatus: "Delivered — owner review required"
      })
    );
  });

  it("T43 Owner cannot change customer ownership", () =>
    assertFails(
      updateDoc(
        doc(ownerDb(), "customerOrders", ORDER),
        { customerUid: "another-customer" }
      )
    )
  );

    it("T44 Owner cannot permanently delete rider profile", async () => {
    const riderRef = doc(ownerDb(), "riderProfiles", JUAN);

    await assertFails(deleteDoc(riderRef));

    await assertSucceeds(getDoc(riderRef));
  });
  it("T45 Owner can archive rider profile without deleting it", async () => {
    const riderRef = doc(ownerDb(), "riderProfiles", JUAN);

    await assertSucceeds(
      updateDoc(riderRef, {
        status: "Archived"
      })
    );

    const snapshot = await getDoc(riderRef);

    if (!snapshot.exists() || snapshot.data().status !== "Archived") {
      throw new Error("Rider profile was not successfully archived.");
    }
  });
});
