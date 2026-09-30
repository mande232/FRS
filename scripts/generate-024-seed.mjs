import fs from "node:fs";

const rows = [
  ["5-label", "5 Label", "", "Whisky", 18000, 0, "VIP Bar", "5L", false, true, null, "unit", "Bottle"],
  ["7-up", "7UP", "", "Soft Drinks", 120, 0, "Main Bar", "7U", false, true, 300, "unit", "Bottle"],
  ["absolute-elyx", "Absolute Elyx", "", "Whisky", 16000, 0, "VIP Bar", "AE", false, true, null, "unit", "Bottle"],
  ["acacia", "Acacia Wayne", "", "Weyn", 80, 0, "Main Bar", "A", false, true, 200, "unit", "Bottle"],
  ["amarula", "Amarula", "", "Whisky", 20000, 0, "VIP Bar", "A", false, true, 600, "unit", "Bottle"],
  ["ambuha", "Ambuha", "", "Weyn", 80, 0, "Main Bar", "A", false, true, 200, "unit", "Bottle"],
  ["arada", "Arada", "", "Beer", 140, 0, "Main Bar", "AR", false, true, 300, "unit", "Bottle"],
  ["areki", "Telba Juice", "Telba Juice", "Other Drinks", 150, 0, "Kitchen", "TJ", false, true, 200, "unit", "Bottle"],
  ["ater-fitfit", "Ater Fitfit", "", "Fasting", 350, 0, "Kitchen", "AF", false, true, 500, "unit", "Plate"],
  ["awash", "Awash Wayne", "", "Weyn", 80, 0, "Main Bar", "A", false, true, 200, "unit", "Bottle"],
  ["axumit", "Axumit Wayne", "", "Weyn", 80, 0, "Main Bar", "A", false, true, 200, "unit", "Bottle"],
  ["bacardi-075l", "Bacardi 0.75L", "", "Whisky", 12000, 0, "VIP Bar", "B", false, true, null, "unit", "Bottle"],
  ["bacardi-1l", "Bacardi 1L", "", "Whisky", 16000, 0, "VIP Bar", "B", false, true, null, "unit", "Bottle"],
  ["ballantines", "Ballantine's", "", "Whisky", 20000, 0, "VIP Bar", "B", false, true, null, "unit", "Bottle"],
  ["bedeli", "Bedelle", "", "Beer", 140, 0, "Main Bar", "B", false, true, 300, "unit", "Bottle"],
  ["beehive-vsop", "Beehive VSOP", "", "Whisky", 25000, 0, "VIP Bar", "BV", false, true, null, "unit", "Bottle"],
  ["beyaynet", "Beyaynet", "", "Fasting", 400, 0, "Kitchen", "BY", false, true, 500, "unit", "Plate"],
  ["black-label", "Black Label", "", "Whisky", 16000, 0, "VIP Bar", "BL", false, true, 700, "unit", "Bottle"],
  ["black-label-2l", "Black Label 2L", "", "Whisky", 35000, 0, "VIP Bar", "BL", false, true, null, "unit", "Bottle"],
  ["black-ruby", "Black Ruby", "", "Whisky", 20000, 0, "VIP Bar", "BR", false, true, null, "unit", "Bottle"],
  ["blue-label", "Blue Label", "", "Whisky", 80000, 0, "VIP Bar", "BL", false, true, null, "unit", "Bottle"],
  ["camino-tequila", "Camino Tequila", "", "Whisky", 15000, 0, "VIP Bar", "CT", false, true, 500, "unit", "Bottle"],
  ["camus-vsop", "Camus VSOP", "", "Whisky", 30000, 0, "VIP Bar", "CV", false, true, null, "unit", "Bottle"],
  ["captain-morgan", "Captain Morgan", "", "Whisky", 16000, 0, "VIP Bar", "CM", false, true, null, "unit", "Bottle"],
  ["casamigos", "Casamigos", "", "Whisky", 45000, 0, "VIP Bar", "C", false, true, 1200, "unit", "Bottle"],
  ["castel-beer", "Castel", "", "Beer", 120, 0, "Main Bar", "CB", false, true, 300, "unit", "Bottle"],
  ["castel-champagne", "Castel Champagne", "", "Whisky", 6000, 0, "VIP Bar", "CC", false, true, null, "unit", "Bottle"],
  ["castel-wine", "Castel Wine", "", "Whisky", 6000, 0, "VIP Bar", "CW", false, true, null, "unit", "Bottle"],
  ["chianti", "Chianti", "", "Whisky", 18000, 0, "VIP Bar", "C", false, true, null, "unit", "Bottle"],
  ["chivas-12", "Chivas 12", "", "Whisky", 17000, 0, "VIP Bar", "C", false, true, null, "unit", "Bottle"],
  ["chivas-18", "Chivas 18", "", "Whisky", 33000, 0, "VIP Bar", "C", false, true, null, "unit", "Bottle"],
  ["ciroc", "Ciroc", "", "Whisky", 9500, 0, "VIP Bar", "C", false, true, null, "unit", "Bottle"],
  ["coca-cola", "Coca-Cola", "", "Soft Drinks", 120, 0, "Main Bar", "CC", false, true, 300, "unit", "Bottle"],
  ["collection-yefyel", "Collection Yefyel", "", "Meat", 4000, 0, "Butcher House", "CY", false, true, 5000, "unit", "Portion"],
  ["courvoisier-vs", "Courvoisier VS", "", "Whisky", 22000, 0, "VIP Bar", "CV", false, true, null, "unit", "Bottle"],
  ["dashen", "Dashen", "", "Beer", 120, 0, "Main Bar", "D", false, true, 300, "unit", "Bottle"],
  ["dech-vodka", "Dech Vodka", "", "Whisky", 11000, 0, "VIP Bar", "DV", false, true, null, "unit", "Bottle"],
  ["delamain-cognac", "Delamain Cognac", "", "Whisky", 45000, 0, "VIP Bar", "DC", false, true, null, "unit", "Bottle"],
  ["derek-enjera", "Derek Enjera", "", "Starters", 30, 0, "Kitchen", "DE", false, true, 30, "unit", "Piece"],
  ["dimple", "Dimple", "", "Whisky", 30000, 0, "VIP Bar", "D", false, true, null, "unit", "Bottle"],
  ["disaronno", "Disaronno", "", "Whisky", 25000, 0, "VIP Bar", "D", false, true, null, "unit", "Bottle"],
  ["don-julio", "Don Julio", "", "Whisky", 80000, 0, "VIP Bar", "DJ", false, true, null, "unit", "Bottle"],
  ["don-julio-small", "Don Julio Small", "", "Whisky", 18000, 0, "VIP Bar", "DJS", false, true, null, "unit", "Bottle"],
  ["double-black", "Double Black", "", "Whisky", 16000, 0, "VIP Bar", "DB", false, true, 600, "unit", "Bottle"],
  ["draft-beer", "Draft Beer", "", "Beer", 70, 0, "Main Bar", "DB", false, true, 150, "unit", "Bottle"],
  ["drekosh-firfir", "Drekosh Firfir", "", "Fasting", 350, 0, "Kitchen", "DF", false, true, 500, "unit", "Plate"],
  ["dulet", "Dulet", "", "Meat", 700, 0, "Butcher House", "D", false, true, 1000, "unit", "Plate"],
  ["fanta", "Fanta", "", "Soft Drinks", 120, 0, "Main Bar", "F", false, true, 300, "unit", "Bottle"],
  ["fernet-branca", "Fernet Branca", "", "Whisky", 6000, 0, "VIP Bar", "FB", false, true, null, "unit", "Bottle"],
  ["foyel", "Foyel", "", "Extra", 100, 0, "Kitchen", "FY", false, true, 100, "unit", "Piece"],
  ["gaz-layt", "Gaz Layt", "", "Meat", 4000, 0, "Butcher House", "GL", false, true, 5000, "unit", "Portion"],
  ["gebeta-2l", "Gebeta 2L", "", "Whisky", 12000, 0, "VIP Bar", "G2", false, true, 700, "unit", "Bottle"],
  ["gebeta-water", "Gebeta Wayne", "", "Weyn", 1200, 0, "Main Bar", "GW", false, true, 2000, "unit", "Bottle"],
  ["glass-wine", "Glass Wine", "", "Whisky", 0, 0, "VIP Bar", "GW", false, true, null, "unit", "Glass"],
  ["glenfiddich-12", "Glenfiddich 12", "", "Whisky", 18000, 0, "VIP Bar", "G", false, true, null, "unit", "Bottle"],
  ["glenfiddich-15", "Glenfiddich 15", "", "Whisky", 25000, 0, "VIP Bar", "G", false, true, null, "unit", "Bottle"],
  ["glenfiddich-18", "Glenfiddich 18", "", "Whisky", 33000, 0, "VIP Bar", "G", false, true, null, "unit", "Bottle"],
  ["godfather", "Godfather", "", "Whisky", 25000, 0, "VIP Bar", "G", false, true, null, "unit", "Bottle"],
  ["godn", "Godn", "", "Meat", 4000, 0, "Butcher House", "G", false, true, 5000, "unit", "Portion"],
  ["gold", "Gold", "", "Whisky", 23000, 0, "VIP Bar", "G", false, true, null, "unit", "Bottle"],
  ["gomen-kitfo", "Gomen Kitfo", "", "Fasting", 400, 0, "Kitchen", "GK", false, true, 500, "unit", "Plate"],
  ["gomen-tibs", "Gomen Tibs", "", "Fasting", 400, 0, "Kitchen", "GT", false, true, 500, "unit", "Plate"],
  ["gordons", "Gordon's", "", "Whisky", 10000, 0, "VIP Bar", "G", false, true, 600, "unit", "Bottle"],
  ["grey-goose", "Grey Goose", "", "Whisky", 17000, 0, "VIP Bar", "GG", false, true, null, "unit", "Bottle"],
  ["grill-tibs", "Grill Tibs", "", "Meat", 4000, 0, "Butcher House", "GT", false, true, 5000, "unit", "Portion"],
  ["gubet", "Gubet", "", "Meat", 1200, 0, "Butcher House", "G", false, true, null, "unit", "Plate"],
  ["guder", "Guder Wayne", "", "Weyn", 1500, 0, "Main Bar", "G", false, true, 2000, "unit", "Bottle"],
  ["habesha", "Habesha", "", "Beer", 120, 0, "Main Bar", "HA", false, true, 300, "unit", "Bottle"],
  ["haf-haaf", "Haf Haaf", "", "Fasting", 400, 0, "Kitchen", "HH", false, true, 500, "unit", "Plate"],
  ["half-liter-water", "0.5 Liter Water", "", "Soft Drinks", 60, 0, "Main Bar", "H", false, true, 100, "unit", "Bottle"],
  ["harar", "Harar", "", "Beer", 120, 0, "Main Bar", "HR", false, true, 300, "unit", "Bottle"],
  ["heineken", "Heineken", "", "Beer", 140, 0, "Main Bar", "HE", false, true, 300, "unit", "Bottle"],
  ["hendricks", "Hendrick's", "", "Whisky", 18000, 0, "VIP Bar", "H", false, true, null, "unit", "Bottle"],
  ["hennessy-vs", "Hennessy VS", "", "Whisky", 26000, 0, "VIP Bar", "HV", false, true, null, "unit", "Bottle"],
  ["hennessy-vsop", "Hennessy VSOP", "", "Whisky", 35000, 0, "VIP Bar", "HV", false, true, null, "unit", "Bottle"],
  ["jack-daniels", "Jack Daniel's", "", "Whisky", 18000, 0, "VIP Bar", "JD", false, true, null, "unit", "Bottle"],
  ["jagermeister", "Jagermeister", "", "Whisky", 16000, 0, "VIP Bar", "J", false, true, 500, "unit", "Bottle"],
  ["jb", "J&B", "", "Whisky", 15000, 0, "VIP Bar", "JB", false, true, null, "unit", "Bottle"],
  ["jc-palace", "J.C. Palace", "", "Whisky", 14000, 0, "VIP Bar", "JCP", false, true, null, "unit", "Bottle"],
  ["jim-beam", "Jim Beam", "", "Whisky", 14000, 0, "VIP Bar", "JB", false, true, null, "unit", "Bottle"],
  ["katelo", "Katelo", "", "Meat", 4000, 0, "Butcher House", "K", false, true, 5000, "unit", "Portion"],
  ["kemila", "Kemila Wayne", "", "Weyn", 2000, 0, "Main Bar", "K", false, true, 3000, "unit", "Bottle"],
  ["kik-bedst", "Kik Bedst", "", "Fasting", 350, 0, "Kitchen", "KB", false, true, 500, "unit", "Plate"],
  ["m1782738284927", "Keshir", "Keshir", "Hot Drinks", 70, 0, "Coffee House", "KS", false, true, null, "unit", "pcs"],
  ["m1782738316675", "Lewuz", "", "Hot Drinks", 100, 0, "Coffee House", "LW", false, true, null, "unit", "pcs"],
  ["m1782738339804", "Wetet", "", "Hot Drinks", 0, 0, "Coffee House", "WT", false, true, null, "unit", "pcs"],
  ["m1782738368138", "Tea", "", "Hot Drinks", 50, 0, "Coffee House", "TA", false, true, null, "unit", "pcs"],
  ["m1782738395794", "Lemon Tea", "", "Hot Drinks", 50, 0, "Coffee House", "LT", false, true, null, "unit", "pcs"],
  ["m1782752284800", "Coffee", "", "Hot Drinks", 50, 0, "Coffee House", "CF", false, true, null, "unit", "pcs"],
  ["m1783096985489", "Areki", "Areki", "Traditional Drink", 100, 0, "Main Bar", "ARK", false, true, 200, "unit", "Bottle"],
  ["m1783247247589", "2 liter water", "", "Soft Drinks", 120, 0, "Main Bar", "2LW", false, true, 150, "unit", "Bottle"],
  ["m1783247305621", "Kikl", "Kikl", "Meat", 800, 0, "Kitchen", "KKL", false, true, 1000, "unit", "Plate"],
  ["m1783247372901", "Injera", "Injera", "Extra", 60, 0, "Kitchen", "IJ", false, true, 60, "unit", "pcs"],
  ["m1783247422205", "Dabo", "Dabo", "Extra", 30, 0, "Kitchen", "BR", false, true, 30, "unit", "pcs"],
  ["m1783247482334", "Kocho", "Kocho", "Extra", 30, 0, "Kitchen", "KO", false, true, 30, "unit", "pcs"],
  ["mango-juice", "Mango Juice", "", "Whisky", 1000, 0, "VIP Bar", "MJ", false, true, null, "unit", "Bottle"],
  ["martini", "Martini", "", "Whisky", 15000, 0, "VIP Bar", "M", false, true, null, "unit", "Bottle"],
  ["mekoreni-be-atkilt", "Mekoreni be Atkilt", "", "Fasting", 350, 0, "Kitchen", "MKA", false, true, 500, "unit", "Plate"],
  ["mekoreni-be-sgo", "Mekoreni be Sgo", "", "Fasting", 350, 0, "Kitchen", "MKS", false, true, 500, "unit", "Plate"],
  ["metbesh-shiro", "Metbesh Shiro", "", "Fasting", 400, 0, "Kitchen", "MSH", false, true, 500, "unit", "Plate"],
  ["mirinda", "Mirinda", "", "Soft Drinks", 120, 0, "Main Bar", "M", false, true, 300, "unit", "Bottle"],
  ["misir-wet", "Misir Wet", "", "Fasting", 400, 0, "Kitchen", "MW", false, true, 500, "unit", "Plate"],
  ["mlas-sember", "Mlas Sember", "", "Meat", 2000, 0, "Butcher House", "MS", false, true, null, "unit", "Plate"],
  ["monkey-shoulder", "Monkey Shoulder", "", "Whisky", 18000, 0, "VIP Bar", "MS", false, true, null, "unit", "Bottle"],
  ["ngus", "Ngus", "", "Beer", 120, 0, "Main Bar", "N", false, true, 300, "unit", "Bottle"],
  ["normal-firfir", "Normal Firfir", "", "Fasting", 350, 0, "Kitchen", "NF", false, true, 500, "unit", "Plate"],
  ["one-liter-water", "1 Liter Water", "", "Soft Drinks", 80, 0, "Main Bar", "O", false, true, 100, "unit", "Bottle"],
  ["pasta-be-atkilt", "Pasta be Atkilt", "", "Fasting", 350, 0, "Kitchen", "PBA", false, true, 500, "unit", "Plate"],
  ["pasta-be-sgo", "Pasta be Sgo", "", "Fasting", 350, 0, "Kitchen", "PBS", false, true, 500, "unit", "Plate"],
  ["platinum", "Platinum", "", "Whisky", 35000, 0, "VIP Bar", "P", false, true, null, "unit", "Bottle"],
  ["premium", "Premium", "", "Whisky", 35000, 0, "VIP Bar", "P", false, true, 1100, "unit", "Bottle"],
  ["red-bull", "Red Bull", "", "Whisky", 1000, 0, "VIP Bar", "RB", false, true, null, "unit", "Bottle"],
  ["red-label", "Red Label", "", "Whisky", 12000, 0, "VIP Bar", "RL", false, true, null, "unit", "Bottle"],
  ["refi-valley", "Refi Valley Wayne", "", "Weyn", 1500, 0, "Main Bar", "RV", false, true, 2000, "unit", "Bottle"],
  ["roberto-cavalli-vodka", "Roberto Cavalli Vodka", "", "Whisky", 20000, 0, "VIP Bar", "RCV", false, true, null, "unit", "Bottle"],
  ["sambuca", "Sambuca", "", "Whisky", 15000, 0, "VIP Bar", "S", false, true, 500, "unit", "Bottle"],
  ["selata", "Selata", "", "Starters", 350, 0, "Kitchen", "SE", false, true, 500, "unit", "Plate"],
  ["shekla", "Shekla", "", "Meat", 4000, 0, "Butcher House", "S", false, true, 5000, "unit", "Portion"],
  ["singleton", "Singleton", "", "Whisky", 20000, 0, "VIP Bar", "S", false, true, null, "unit", "Bottle"],
  ["small-jagermeister", "Small Jagermeister", "", "Whisky", 2000, 0, "VIP Bar", "SJ", false, true, null, "unit", "Bottle"],
  ["small-vodka", "Small Vodka", "", "Whisky", 1500, 0, "VIP Bar", "SV", false, true, null, "unit", "Bottle"],
  ["smirnoff", "Smirnoff", "", "Whisky", 30000, 0, "Main Bar", "S", false, true, null, "unit", "Bottle"],
  ["sprite", "Sprite", "", "Soft Drinks", 120, 0, "Main Bar", "S", false, true, 300, "unit", "Bottle"],
  ["st-george", "St. George", "", "Beer", 120, 0, "Main Bar", "SG", false, true, 300, "unit", "Bottle"],
  ["st-remi-1l", "St. Remi 1L", "", "Whisky", 0, 0, "VIP Bar", "SR", false, true, null, "unit", "Bottle"],
  ["stockinia-05l", "Stockinia 0.5L", "", "Whisky", 4500, 0, "VIP Bar", "S", false, true, null, "unit", "Bottle"],
  ["stockinia-1l", "Stockinia 1L", "", "Whisky", 9000, 0, "VIP Bar", "S", false, true, null, "unit", "Bottle"],
  ["suf-fitfit", "Suf Fitfit", "", "Fasting", 350, 0, "Kitchen", "SF", false, true, 500, "unit", "Plate"],
  ["tebit", "Tebit", "", "Meat", 0, 0, "Butcher House", "T", false, true, null, "unit", "Portion"],
  ["telba-fitfit", "Telba Fitfit", "", "Fasting", 350, 0, "Kitchen", "TF", false, true, 500, "unit", "Plate"],
  ["telba-juice", "Telba Juice", "", "Drinks", 100, 0, "Main Bar", "TJ", false, true, 150, "unit", "Glass"],
  ["tequila", "Tequila", "", "Whisky", 0, 0, "VIP Bar", "T", false, true, null, "unit", "Bottle"],
  ["timatim-kurt", "Timatim Kurt", "", "Starters", 350, 0, "Kitchen", "TK", false, true, 500, "unit", "Plate"],
  ["timatim-lebleb", "Timatim Lebleb", "", "Starters", 350, 0, "Kitchen", "TL", false, true, 500, "unit", "Plate"],
  ["tri-sga", "Tri Sga", "", "Meat", 4000, 0, "Butcher House", "TS", false, true, 5000, "unit", "Portion"],
  ["vecchia-romagna", "Vecchia Romagna", "", "Whisky", 20000, 0, "VIP Bar", "VR", false, true, null, "unit", "Bottle"],
  ["white-horse", "White Horse", "", "Whisky", 14000, 0, "VIP Bar", "WH", false, true, null, "unit", "Bottle"],
  ["winter-05l", "Winter 0.5L", "", "Whisky", 5000, 0, "VIP Bar", "W", false, true, null, "unit", "Bottle"],
  ["wolando", "Wolando", "", "Meat", 4000, 0, "Butcher House", "W", false, true, 5000, "unit", "Portion"],
  ["xo-hennessy", "XO Hennessy", "", "Whisky", 100000, 0, "Main Bar", "XH", false, true, null, "unit", "Bottle"],
  ["ye-fyel-dulet", "Ye Fyel Dulet", "", "Meat", 1000, 0, "Butcher House", "YFD", false, true, 1250, "unit", "Plate"],
  ["yeberi-dulet", "Yeberi Dulet", "", "Meat", 1500, 0, "Butcher House", "YD", false, true, 2000, "unit", "Plate"],
  ["yefyel", "Yefyel", "", "Meat", 4000, 0, "Butcher House", "Y", false, true, 5000, "unit", "Portion"],
  ["zlzl", "Zlzl", "", "Meat", 4000, 0, "Butcher House", "Z", false, true, 5000, "unit", "Portion"],
  ["zonin-wine", "Zonin Wine", "", "Whisky", 2000, 0, "Main Bar", "ZW", false, true, null, "unit", "Bottle"],
];

const LINKED = new Set([
  "Whisky",
  "Beer",
  "Soft Drinks",
  "Weyn",
  "Meat",
  "Hot Drinks",
  "Coffee",
  "Traditional Drink",
  "Drinks",
  "Other Drinks",
]);

function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlNum(v) {
  return v == null ? "null" : Number(v).toFixed(2);
}
function sqlNullStr(v) {
  return v == null || v === "" ? "null" : sqlStr(v);
}

function stockCategory(cat) {
  if (cat === "Whisky") return "Whisky";
  if (cat === "Beer") return "Beer";
  if (["Soft Drinks", "Weyn", "Drinks", "Other Drinks", "Traditional Drink"].includes(cat)) return "Soft Drink";
  if (cat === "Meat") return "Meat";
  if (["Hot Drinks", "Coffee"].includes(cat)) return "Coffee House";
  return "Kitchen";
}

function baseUnit(unitLabel, cat) {
  const u = (unitLabel || "").toLowerCase();
  if (u === "bottle" || u === "glass") return "bottle";
  if (u === "kg") return "kg";
  if (cat === "Meat") return "pcs";
  return "pcs";
}

function stockLoc(station) {
  if (station === "Butcher House") return "Butcher";
  if (station === "Bar") return "Main Bar";
  return station;
}

function purchase(price, cat) {
  const floor =
    cat === "Beer"
      ? 120
      : ["Soft Drinks", "Weyn"].includes(cat)
        ? 60
        : cat === "Meat"
          ? 700
          : cat === "Whisky"
            ? 1000
            : 35;
  const p = Math.max(price, floor);
  const ratio =
    cat === "Whisky"
      ? 0.55
      : cat === "Beer"
        ? 0.5
        : ["Soft Drinks", "Weyn", "Drinks", "Other Drinks", "Traditional Drink"].includes(cat)
          ? 0.4
          : cat === "Meat"
            ? 0.6
            : ["Hot Drinks", "Coffee"].includes(cat)
              ? 0.35
              : 0.45;
  return Math.round(p * ratio);
}

function storeQty(cat, id) {
  const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 12;
  if (cat === "Whisky") return 24 + h;
  if (cat === "Beer") return 240 + h;
  if (["Soft Drinks", "Weyn", "Drinks", "Other Drinks", "Traditional Drink"].includes(cat)) return 96 + h;
  if (cat === "Meat") return 40 + h;
  if (["Hot Drinks", "Coffee"].includes(cat)) return 20 + h;
  return 50 + h;
}

function deptQty(cat) {
  if (cat === "Whisky") return 6;
  if (cat === "Beer") return 48;
  if (["Soft Drinks", "Weyn", "Drinks", "Other Drinks", "Traditional Drink"].includes(cat)) return 24;
  if (cat === "Meat") return 12;
  if (["Hot Drinks", "Coffee"].includes(cat)) return 10;
  return 15;
}

function reorder(cat) {
  if (cat === "Whisky") return 6;
  if (cat === "Beer") return 48;
  if (["Soft Drinks", "Weyn"].includes(cat)) return 24;
  if (cat === "Meat") return 10;
  if (["Hot Drinks", "Coffee"].includes(cat)) return 8;
  return 12;
}

function supplier(cat) {
  if (cat === "Beer") return "Dashen Brewery";
  if (["Soft Drinks", "Weyn"].includes(cat)) return "Ambo Mineral Water";
  if (cat === "Meat") return "Merkato Fresh Supplies";
  if (["Hot Drinks", "Coffee"].includes(cat)) return "Sidama Coffee Union";
  return "Addis Beverage Supply";
}

const active = rows.filter((r) => r[9] === true);

const menuValues = active
  .map((r) => {
    const [id, name, nameAm, cat, price, cost, station, emoji, , , vip, mode, unit] = r;
    const linked = LINKED.has(cat);
    const sku = linked ? `stk-${id}` : "";
    return `(${[
      sqlStr(id),
      sqlStr(name),
      sqlStr(nameAm),
      sqlStr(cat),
      sqlNum(price),
      sqlNum(cost),
      sqlStr(station),
      sqlStr(emoji),
      "false",
      "true",
      sqlNum(vip),
      sqlStr(mode),
      sqlStr(unit || "pcs"),
      "1",
      "1",
      sqlStr(sku),
    ].join(", ")})`;
  })
  .join(",\n  ");

const stockRows = active
  .filter((r) => LINKED.has(r[3]))
  .map((r) => {
    const [id, name, , cat, price, , station, , , , vip, , unit] = r;
    const sc = stockCategory(cat);
    const bu = baseUnit(unit, cat);
    const loc = stockLoc(station);
    const pp = purchase(price, cat);
    const vipP = vip && vip > 0 ? vip : price > 0 ? Math.round(price * 1.12) : 0;
    return {
      id: `stk-${id}`,
      name,
      sc,
      bu,
      loc,
      pp,
      price,
      vipP,
      open: storeQty(cat, id),
      dq: deptQty(cat),
      supplier: supplier(cat),
      reorder: reorder(cat),
    };
  });

const invValues = stockRows
  .map(
    (s) =>
      `('${s.id}', ${sqlStr(s.name)}, '${s.sc}', '${s.bu}', ${s.pp.toFixed(2)}, ${Number(s.price).toFixed(2)}, ${s.vipP.toFixed(2)}, ${(Math.round(s.pp * 0.98 * 100) / 100).toFixed(2)}, ${s.reorder}, 'Store 1', ${sqlStr(s.supplier)}, '[]'::jsonb, false, 'Stock-first demo catalog seed', ${s.open}, true, now(), now())`,
  )
  .join(",\n  ");

const storeLedger = stockRows
  .map(
    (s) =>
      `('seed-ob-store1-${s.id}', 'OPENING_BALANCE', current_date, '${s.id}', ${sqlStr(s.name)}, '${s.sc}', 'Store 1', ${s.open}, '${s.bu}', ${s.pp.toFixed(2)}, ${(s.open * s.pp).toFixed(2)}, ${s.open}, 0, 'Catalog Seed', 'Store 1 opening balance', 'SEED-OB-STORE1-${s.id}', true, now())`,
  )
  .join(",\n  ");

const deptLedger = stockRows
  .filter((s) => s.dq > 0)
  .map((s) => {
    const locKey = s.loc.replace(/ /g, "-");
    return `('seed-ob-dept-${locKey}-${s.id}', 'OPENING_BALANCE', current_date, '${s.id}', ${sqlStr(s.name)}, '${s.sc}', '${s.loc}', ${s.dq}, '${s.bu}', ${s.pp.toFixed(2)}, ${(s.dq * s.pp).toFixed(2)}, ${s.dq}, 0, 'Catalog Seed', '${s.loc} opening balance for POS', 'SEED-OB-DEPT-${locKey}-${s.id}', true, now())`;
  })
  .join(",\n  ");

const cats = [...new Set(active.map((r) => r[3]))];
const catInsert = cats.map((c, i) => `(${sqlStr(c)}, ${i})`).join(",\n  ");

const sql = `-- Stock-first demo catalog seed from authoritative menu export.
--
-- Operator checklist after applying:
-- 1. Hard refresh the app (or clear site local data if module_records stay cached).
-- 2. Confirm Stock Master shows priced items and Store 1 quantities.
-- 3. Confirm POS cards show Sellable (Main Bar|VIP Bar|Butcher|Kitchen|Coffee House) > 0.
-- 4. Confirm menu_items.stock_sku matches inventory_items.id (stk-*).
--
-- Flow: clear demo catalog -> seed inventory_items -> OPENING_BALANCE ledger -> menu_items with stock_sku.
-- Opening qty (same scale as prior 024): Store 1 beer ~240, soft ~96, whisky ~24, meat ~40;
-- department POS qty: beer 48, soft 24, whisky 6, meat 12, coffee 10.

-- ---------------------------------------------------------------------------
-- 0. Schema guards
-- ---------------------------------------------------------------------------
alter table public.menu_items
  add column if not exists vip_price numeric(12, 2),
  add column if not exists pricing_mode text not null default 'unit',
  add column if not exists default_qty numeric(12, 3) not null default 1,
  add column if not exists qty_step numeric(12, 3) not null default 1,
  add column if not exists stock_sku text not null default '',
  add column if not exists unit_label text;

update public.production_stations
set active = false, updated_at = now()
where name not in ('Main Bar', 'VIP Bar', 'Kitchen', 'Butcher', 'Coffee House', 'Butcher House');

insert into public.production_stations (name, position)
values
  ('Kitchen', 0),
  ('Main Bar', 1),
  ('Butcher', 2),
  ('Coffee House', 3),
  ('VIP Bar', 4),
  ('Butcher House', 5)
on conflict (name) do update set
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 1. Clear previous demo catalog artifacts
-- ---------------------------------------------------------------------------
alter table public.inventory_ledger disable trigger inventory_ledger_immutable;

delete from public.inventory_ledger
where reference_no like 'SEED-OB-%'
   or entered_by = 'Catalog Seed';

update public.menu_items set active = false, updated_at = now();
update public.inventory_items set active = false, updated_at = now();

delete from public.module_records
where module_key in (
  'stock-items',
  'stock-ledger',
  'stock-lots',
  'stock-location-policies'
);

alter table public.inventory_ledger enable trigger inventory_ledger_immutable;

-- ---------------------------------------------------------------------------
-- 2. Menu categories
-- ---------------------------------------------------------------------------
insert into public.menu_categories (name, position)
values
  ${catInsert}
on conflict (name) do update set
  position = excluded.position,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Inventory items (stock first) — preferred_location Store 1; POS qty via ledger
-- ---------------------------------------------------------------------------
insert into public.inventory_items (
  id, name, category, base_unit, purchase_price, selling_price, vip_selling_price,
  standard_cost, reorder_level, preferred_location, supplier_name, conversions,
  track_batch_expiry, notes, opening_stock, active, created_at, updated_at
)
values
  ${invValues}
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  base_unit = excluded.base_unit,
  purchase_price = excluded.purchase_price,
  selling_price = excluded.selling_price,
  vip_selling_price = excluded.vip_selling_price,
  standard_cost = excluded.standard_cost,
  reorder_level = excluded.reorder_level,
  opening_stock = excluded.opening_stock,
  preferred_location = excluded.preferred_location,
  supplier_name = excluded.supplier_name,
  notes = excluded.notes,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Opening balances: Store 1 + department sellable qty
-- ---------------------------------------------------------------------------
alter table public.inventory_ledger disable trigger inventory_ledger_immutable;

insert into public.inventory_ledger (
  id, entry_type, entry_date, item_id, item_name, category, location,
  quantity, unit, unit_price, total_cost, quantity_in, quantity_out,
  entered_by, notes, reference_no, immutable, transaction_at
)
values
  ${storeLedger}
on conflict (id) do nothing;

insert into public.inventory_ledger (
  id, entry_type, entry_date, item_id, item_name, category, location,
  quantity, unit, unit_price, total_cost, quantity_in, quantity_out,
  entered_by, notes, reference_no, immutable, transaction_at
)
values
  ${deptLedger}
on conflict (id) do nothing;

alter table public.inventory_ledger enable trigger inventory_ledger_immutable;

-- ---------------------------------------------------------------------------
-- 5. Menu items with stock_sku = inventory id for linked sellables
-- ---------------------------------------------------------------------------
insert into public.menu_items (
  id, name_en, name_am, category, price, cost, station, emoji, veg, active,
  vip_price, pricing_mode, unit_label, default_qty, qty_step, stock_sku
)
values
  ${menuValues}
on conflict (id) do update set
  name_en = excluded.name_en,
  name_am = excluded.name_am,
  category = excluded.category,
  price = excluded.price,
  cost = excluded.cost,
  station = excluded.station,
  emoji = excluded.emoji,
  vip_price = excluded.vip_price,
  pricing_mode = excluded.pricing_mode,
  unit_label = excluded.unit_label,
  default_qty = excluded.default_qty,
  qty_step = excluded.qty_step,
  stock_sku = excluded.stock_sku,
  active = true,
  updated_at = now();
`;

const out = "d:/ethioPlate_pro/supabase/migrations/024_seed_stock_then_menu_demo_catalog.sql";
fs.writeFileSync(out, sql);
console.log(`Wrote ${out}`);
console.log(`menu active=${active.length} stock=${stockRows.length}`);
