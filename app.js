import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

// قائمة الشركات والأقسام
const BRANDS = [
  ["Apple", "#4b5563", "🍏"],
  ["Samsung", "#1d4ed8", "📱"],
  ["Xiaomi", "#ea580c", "⚡"],
  ["Huawei", "#dc2626", "🔴"],
  ["Oppo", "#16a34a", "🟢"]
];
const CATS = ["الشاشة", "البطارية", "فلات التوصيل", "مكبر الصوت", "قطع أخرى"];
const LOW = 2, AUTOLOCK = 5 * 60 * 1000;

// تهيئة Firebase
const fb = initializeApp(firebaseConfig), db = getFirestore(fb), auth = getAuth(fb);

// حالة التطبيق
const S = { brand: null, cat: null, items: [], authed: false, q: "", adding: false, busy: false, msg: "", dlg: false, pending: null, ready: false };
const A = document.getElementById("app");
let lockTimer;

// دوال مساعدة
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const total = (b, c) => S.items.filter(i => i.brand === b && (c == null || i.cat === c)).reduce((n, i) => n + (+i.qty || 0), 0);

/* ---------- نظام القفل (يُطلب فقط عند التعديل) ---------- */
function need(fn) { 
  if (S.authed) fn(); 
  else { S.pending = fn; S.dlg = true; S.msg = ""; render(); } 
}

function touch() { 
  clearTimeout(lockTimer); 
  if (S.authed) lockTimer = setTimeout(() => signOut(auth), AUTOLOCK); 
}

onAuthStateChanged(auth, u => { S.authed = !!u; touch(); render(); });

async function submitPin() {
  const pin = document.getElementById("pin").value;
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pin);
    S.dlg = false; 
    const f = S.pending; 
    S.pending = null; 
    if (f) f();
  } catch (e) { 
    S.msg = "الرمز غير صحيح"; 
    render(); 
  }
}

/* ---------- عمليات قاعدة البيانات ---------- */
const ref = id => doc(db, "items", id);
const change = (id, d) => need(() => updateDoc(ref(id), { qty: increment(d) }).catch(() => {}));
const remove = id => need(() => { if (confirm("حذف هذه القطعة؟")) deleteDoc(ref(id)).catch(() => {}); });

// ضغط الصورة قبل الرفع لتوفير المساحة
function shrink(file) {
  return new Promise((ok, no) => {
    const r = new FileReader(); 
    r.onerror = no;
    r.onload = () => {
      const im = new Image(); 
      im.onerror = no; 
      im.onload = () => {
        const k = Math.min(1, 600 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * k); 
        c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); 
        ok(c.toDataURL("image/jpeg", .7));
      }; 
      im.src = r.result;
    }; 
    r.readAsDataURL(file);
  });
}

async function save() {
  const name = document.getElementById("n").value.trim(), qty = +document.getElementById("c").value || 0, f = document.getElementById("p").files[0];
  if (!name) { S.msg = "اكتب اسم القطعة"; return render(); }
  S.busy = true; S.msg = ""; render();
  try {
    const img = f ? await shrink(f) : null;
    await addDoc(collection(db, "items"), { brand: S.brand, cat: CATS[S.cat], name, qty, img });
    S.adding = false;
  } catch (e) { S.msg = "تعذّر الحفظ، حاول مرة أخرى"; }
  S.busy = false; render();
}

/* ---------- بناء الواجهة ---------- */
function home() {
  return '<p class="mu" style="margin-bottom:12px">اختر الماركة</p><div style="display:flex;flex-direction:column;gap:10px;">' +
    BRANDS.map((b, i) => `
      <button class="tile" data-a="brand" data-i="${i}" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;text-align:right;width:100%;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="dot" style="background:${b[1]};display:flex;align-items:center;justify-content:center;font-size:18px;">${b[2]}</span>
          <b style="font-size:16px;">${b[0]}</b>
        </div>
        <small style="background:rgba(255,255,255,0.1);padding:4px 10px;border-radius:12px;">${total(b[0])} قطعة</small>
      </button>
    `).join("") + '</div>';
}

function brandView() {
  return '<div class="grid">' + CATS.map((c, i) =>
    `<button class="tile" data-a="cat" data-i="${i}"><b>${c}</b><small>${total(S.brand, c)} قطعة</small></button>`).join("") + '</div>';
}

function catView() {
  const L = S.items.filter(i => i.brand === S.brand && i.cat === CATS[S.cat] && (!S.q || String(i.name).toLowerCase().includes(S.q.toLowerCase())));
  const rows = L.length ? L.map(i => {
    const q = +i.qty || 0;
    return `<div class="row">${i.img ? `<img class="th" src="${i.img}" alt="">` : '<span class="th">📦</span>'}
    <div class="nm"><b>${esc(i.name)}</b><small class="${q <= LOW ? "low" : "ok"}">${q <= 0 ? "نفدت الكمية" : q <= LOW ? "كمية قليلة" : "متوفر"}</small></div>
    <div class="q"><button data-a="dec" data-id="${i.id}">−</button><span>${q}</span><button data-a="inc" data-id="${i.id}">+</button></div>
    <button class="ib" data-a="del" data-id="${i.id}" aria-label="حذف">🗑</button></div>`
  }).join("") : '<p class="mu" style="padding:14px 0;text-align:center">لا توجد قطع بعد</p>';

  const form = S.adding ?
    `<div class="card f">
       <input id="n" type="text" placeholder="اسم القطعة أو الموديل">
       <input id="c" type="number" min="0" value="1" inputmode="numeric">
       <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
         <label style="font-size:13px;color:var(--muted);">صورة القطعة (اختياري):</label>
         <input id="p" type="file" accept="image/*" style="color:var(--text);">
       </div>
       <div class="err">${esc(S.msg)}</div>
       <button class="btn" data-a="save" ${S.busy ? "disabled" : ""}>${S.busy ? "جارٍ الحفظ…" : "حفظ"}</button>
       <button class="btn g" data-a="cancel">إلغاء</button>
     </div>`
    : '<button class="btn" data-a="add">+ إضافة قطعة</button>';

  return `<div class="bar"><input id="q" type="text" placeholder="بحث" value="${esc(S.q)}"></div><div class="card">${rows}</div><div style="margin-top:12px">${form}</div>`;
}

function render() {
  const title = !S.brand ? "المستودع" : S.cat != null ? `${S.brand} · ${CATS[S.cat]}` : S.brand;
  const body = !S.ready ? '<p class="mu" style="text-align:center;margin-top:40px">جارٍ التحميل…</p>' : !S.brand ? home() : S.cat == null ? brandView() : catView();
  
  A.innerHTML = `<div class="top">${S.brand ? '<button class="ib" data-a="back" aria-label="رجوع">→</button>' : ''}<h1>${esc(title)}</h1><span class="sp"></span><button class="ib" data-a="lock" aria-label="قفل">${S.authed ? "🔓" : "🔒"}</button></div>${body}` +
    (S.dlg ? `<div class="dlg"><div class="card f"><div style="font-size:36px;text-align:center;margin-bottom:10px;">🔒</div><b style="text-align:center;display:block;margin-bottom:10px;">أدخل رمز التعديل</b><input id="pin" type="password" inputmode="numeric" autocomplete="off"><div class="err">${esc(S.msg)}</div><button class="btn" data-a="pin">تأكيد</button><button class="btn g" data-a="close">إلغاء</button></div></div>` : "");
  
  if (S.dlg) document.getElementById("pin").focus();
}

/* ---------- الأحداث (Events) ---------- */
A.addEventListener("click", e => {
  touch(); 
  const t = e.target.closest("[data-a]"); 
  if (!t) return;
  const { a, i, id } = t.dataset;
  
  if (a === "pin") return submitPin();
  if (a === "save") return save();
  if (a === "brand") { S.brand = BRANDS[i][0]; S.cat = null; }
  else if (a === "cat") { S.cat = +i; S.q = ""; S.adding = false; }
  else if (a === "back") { if (S.cat != null) { S.cat = null; S.adding = false; } else S.brand = null; }
  else if (a === "add") return need(() => { S.adding = true; S.msg = ""; render(); });
  else if (a === "cancel") { S.adding = false; S.msg = ""; }
  else if (a === "close") { S.dlg = false; S.pending = null; }
  else if (a === "lock") { if (S.authed) return signOut(auth); return need(() => {}); }
  else if (a === "inc") return change(id, 1);
  else if (a === "dec") { const it = S.items.find(x => x.id === id); if (it && (+it.qty || 0) > 0) change(id, -1); return; }
  else if (a === "del") return remove(id);
  
  render();
});

A.addEventListener("input", e => {
  if (e.target.id !== "q") return; 
  S.q = e.target.value; 
  const p = e.target.selectionStart; 
  render();
  const el = document.getElementById("q"); 
  if(el) { el.focus(); el.setSelectionRange(p, p); }
});

A.addEventListener("keydown", e => { 
  if (e.key === "Enter" && e.target.id === "pin") submitPin(); 
});

/* ---------- مزامنة البيانات (Firebase) ---------- */
onSnapshot(collection(db, "items"), snap => {
  S.items = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
  S.ready = true;
  if (!/^(n|c|p|q|pin)$/.test(document.activeElement?.id || "")) render();
}, () => { S.ready = true; render(); });

// بدء التطبيق
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
