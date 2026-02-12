// seed.js — Run once to load initial homes into Firestore
// Usage: node scripts/seed.js

const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

// ╔══════════════════════════════════════════════════════════╗
// ║  PASTE YOUR FIREBASE CONFIG BELOW                        ║
// ║  Find it at: Firebase Console → Project Settings         ║
// ║  → Your apps → SDK setup and configuration               ║
// ╚══════════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey: "AIzaSyAIItpT-SoHxB2Y6jhGtUmy2o6s2z_HiAM",
  authDomain: "home-search-hq.firebaseapp.com",
  projectId: "home-search-hq",
  storageBucket: "home-search-hq.firebasestorage.app",
  messagingSenderId: "631504248905",
  appId: "1:631504248905:web:d4fbdc6f73580904445f98"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SEED = [
  {address:"6003 E 28th Avenue",commute:16,style:"Townhouse",city:"Denver",neighborhood:"Central Park",price:300000,sqft:852,downPayment:80000,hoa:445,bed:2,bath:1,kitchen:"Closed",parking:"Reserved (1)",link:"",photoUrl:null,added:null,tourStatus:"Toured",michelleRating:6,peterRating:6.5,notes:"Bidding(?)",status:"Hmm..."},
  {address:"10595 N Paris Street #9B",commute:10,style:"Townhouse",city:"Denver",neighborhood:"Montbello",price:332500,sqft:1512,downPayment:null,hoa:365,bed:3,bath:2.5,kitchen:"Halfway",parking:"Garage (2)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:7,peterRating:5.5,notes:"",status:"Good"},
  {address:"1416 Willow Street",commute:22,style:"House",city:"Denver",neighborhood:"",price:409000,sqft:797,downPayment:107000,hoa:0,bed:2,bath:1,kitchen:"Open",parking:"Garage (1)",link:"",photoUrl:null,added:"2026-02-04",tourStatus:"Toured",michelleRating:5,peterRating:6,notes:"COLFAX",status:"Hmm..."},
  {address:"3302 Jasmine Street",commute:18,style:"Townhouse",city:"Denver",neighborhood:"Central Park",price:415000,sqft:921,downPayment:null,hoa:0,bed:2,bath:1,kitchen:"Open",parking:"Reserved (2)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:4,peterRating:5,notes:"",status:"Meh"},
  {address:"1475 S Quebec Way Unit J48",commute:21,style:"Townhouse",city:"Denver",neighborhood:"Glendale",price:360000,sqft:2100,downPayment:null,hoa:350,bed:3,bath:2,kitchen:"Closed",parking:"Garage (1)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:6,peterRating:5,notes:"",status:"Hmm..."},
  {address:"1421 Oneida Street #7",commute:16,style:"Townhouse",city:"Denver",neighborhood:"",price:380000,sqft:1085,downPayment:null,hoa:396,bed:2,bath:1,kitchen:"Closed",parking:"Garage (1)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:4,peterRating:4.5,notes:"",status:"Out"},
  {address:"3551 Olive Street",commute:12,style:"Townhouse",city:"Denver",neighborhood:"Central Park",price:344000,sqft:807,downPayment:null,hoa:0,bed:2,bath:1,kitchen:"Closed",parking:"Garage (1)",link:"",photoUrl:null,added:"2026-02-03",tourStatus:"",michelleRating:null,peterRating:null,notes:"",status:"Waiting"},
  {address:"1569 Wabash Street",commute:14,style:"House",city:"Denver",neighborhood:"Central Park",price:270000,sqft:674,downPayment:95000,hoa:0,bed:2,bath:1,kitchen:"Halfway",parking:"None",link:"",photoUrl:null,added:"2026-02-04",tourStatus:"",michelleRating:null,peterRating:5.5,notes:"",status:"Hmm..."},
  {address:"1700 Xenia Street",commute:13,style:"House",city:"Denver",neighborhood:"Central Park",price:395000,sqft:762,downPayment:95000,hoa:0,bed:2,bath:1,kitchen:"Halfway",parking:"Garage (1)",link:"",photoUrl:null,added:"2026-02-10",tourStatus:"",michelleRating:5,peterRating:5,notes:"",status:"Hmm..."},
  {address:"3335 Dexter Street",commute:15,style:"House",city:"Denver",neighborhood:"",price:399000,sqft:697,downPayment:95000,hoa:0,bed:2,bath:1,kitchen:"Halfway",parking:"Reserved (2)",link:"",photoUrl:null,added:"2026-02-10",tourStatus:"",michelleRating:5,peterRating:5,notes:"",status:"Hmm..."},
  {address:"555 E 10th Avenue #10",commute:20,style:"Townhouse",city:"Denver",neighborhood:"Capital Hill",price:289900,sqft:918,downPayment:null,hoa:528,bed:2,bath:1,kitchen:"Closed",parking:"Reserved (1)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:5,peterRating:null,notes:"",status:"Meh"},
  {address:"1150 Inca Street #27",commute:25,style:"Townhouse",city:"Denver",neighborhood:"Downtown",price:349900,sqft:881,downPayment:null,hoa:337,bed:2,bath:1,kitchen:"Closed",parking:"Reserved (1)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:4,peterRating:null,notes:"",status:"Meh"},
  {address:"41000 Albion Street #519",commute:12,style:"Condo",city:"Denver",neighborhood:"Central Park",price:320000,sqft:1066,downPayment:null,hoa:590,bed:2,bath:2,kitchen:"Open",parking:"Garage (1)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:null,peterRating:4.5,notes:"",status:"Out"},
  {address:"1159 S Waco Street Unit C",commute:8,style:"Townhouse",city:"Aurora",neighborhood:"",price:310000,sqft:1148,downPayment:95000,hoa:480,bed:3,bath:2.5,kitchen:"Closed",parking:"Reserved (1)",link:"",photoUrl:null,added:"2026-02-04",tourStatus:"",michelleRating:null,peterRating:6,notes:"",status:"Good"},
  {address:"1060 S Parker Road #23",commute:18,style:"Townhouse",city:"Denver",neighborhood:"Cherry Creek",price:260000,sqft:1080,downPayment:95000,hoa:405,bed:2,bath:1.5,kitchen:"Closed",parking:"Reserved (1)",link:"",photoUrl:null,added:"2026-02-05",tourStatus:"",michelleRating:6,peterRating:5,notes:"",status:"Good"},
  {address:"4999 N Yampa Street",commute:12,style:"House",city:"Denver",neighborhood:"Green Valley",price:380000,sqft:967,downPayment:95000,hoa:75,bed:2,bath:2,kitchen:"Halfway",parking:"Reserved (2)",link:"",photoUrl:null,added:"2026-02-05",tourStatus:"",michelleRating:6,peterRating:5.5,notes:"",status:"Good"},
  {address:"9105 E Lehigh Avenue #77",commute:14,style:"Townhouse",city:"Denver",neighborhood:"Cherry Creek",price:280000,sqft:837,downPayment:95000,hoa:425,bed:2,bath:1,kitchen:"Halfway",parking:"Garage (1)",link:"",photoUrl:null,added:"2026-02-05",tourStatus:"",michelleRating:5,peterRating:5.5,notes:"",status:"Hmm..."},
  {address:"5796 Biscay Street",commute:11,style:"Townhouse",city:"Denver",neighborhood:"Green Valley",price:369000,sqft:1401,downPayment:95000,hoa:265,bed:2,bath:3,kitchen:"Open",parking:"Garage (1)",link:"",photoUrl:null,added:"2026-02-05",tourStatus:"",michelleRating:null,peterRating:null,notes:"",status:"Waiting"},
  {address:"12474 E Kansas Place",commute:10,style:"Townhouse",city:"Aurora",neighborhood:"",price:342950,sqft:1392,downPayment:null,hoa:380,bed:4,bath:3,kitchen:"Open",parking:"Garage (2)",link:"",photoUrl:null,added:null,tourStatus:"",michelleRating:4,peterRating:null,notes:"",status:"Meh"},
  {address:"2708 Syracuse Street #111",commute:13,style:"Townhouse",city:"Denver",neighborhood:"Central Park",price:340000,sqft:817,downPayment:null,hoa:298,bed:2,bath:1,kitchen:"Closed",parking:"Reserved (1)",link:"",photoUrl:null,added:null,tourStatus:"PENDING",michelleRating:4,peterRating:6,notes:"",status:"Hmm..."},
  {address:"3080 Wilson Court #3",commute:18,style:"Townhouse",city:"Denver",neighborhood:"Clayton Park",price:283244,sqft:1080,downPayment:165000,hoa:297,bed:3,bath:3,kitchen:"Open",parking:"Reserved (2)",link:"",photoUrl:null,added:null,tourStatus:"Toured; LARGE DOWN",michelleRating:7,peterRating:null,notes:"ECLT",status:"Good"},
  {address:"6325 Martin Luther King Jr Blvd",commute:15,style:"House",city:"Denver",neighborhood:"",price:326000,sqft:1581,downPayment:160000,hoa:0,bed:3,bath:2,kitchen:"Open",parking:"None",link:"",photoUrl:null,added:null,tourStatus:"LARGE DOWN",michelleRating:5,peterRating:null,notes:"ECLT",status:"Hmm..."},
  {address:"3271 Krameria Street",commute:16,style:"Townhouse",city:"Denver",neighborhood:"",price:299000,sqft:927,downPayment:178000,hoa:311,bed:2,bath:1,kitchen:"Open",parking:"Reserved (1)",link:"",photoUrl:null,added:null,tourStatus:"LARGE DOWN",michelleRating:5,peterRating:null,notes:"ECLT",status:"Hmm..."},
  {address:"3575 Chestnut Place #403",commute:22,style:"Condo",city:"Denver",neighborhood:"",price:240000,sqft:650,downPayment:125000,hoa:288,bed:2,bath:1,kitchen:"Open",parking:"None",link:"",photoUrl:null,added:null,tourStatus:"LARGE DOWN",michelleRating:null,peterRating:null,notes:"ECLT",status:"Waiting"},
  {address:"709 27th Street",commute:25,style:"Townhouse",city:"Denver",neighborhood:"Downtown",price:439900,sqft:1226,downPayment:null,hoa:200,bed:2,bath:1,kitchen:"Closed",parking:"None",link:"",photoUrl:null,added:null,tourStatus:"EXPENSIVE",michelleRating:5,peterRating:null,notes:"",status:"Out"},
  {address:"2620 S Federal Blvd Unit B",commute:30,style:"Townhouse",city:"Denver",neighborhood:"South Denver",price:230000,sqft:944,downPayment:null,hoa:360,bed:2,bath:2,kitchen:"Open",parking:"Garage (1)",link:"",photoUrl:null,added:null,tourStatus:"PENDING",michelleRating:6,peterRating:null,notes:"",status:"Hmm..."}
];

async function seed() {
  console.log("Seeding " + SEED.length + " homes into Firestore...\n");
  for (var i = 0; i < SEED.length; i++) {
    var home = SEED[i];
    await addDoc(collection(db, "homes"), home);
    console.log("  ✓ " + (i + 1) + "/" + SEED.length + " — " + home.address);
  }
  console.log("\nDone! All " + SEED.length + " homes added.");
  process.exit(0);
}

seed().catch(function(e) {
  console.error("Seed failed:", e);
  process.exit(1);
});
