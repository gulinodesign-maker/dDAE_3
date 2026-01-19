/* global API_BASE_URL, API_KEY */

/**
 * Build: incrementa questa stringa alla prossima modifica (es. 1.001)
 */
const BUILD_VERSION = "dDAE_2.049";


function __parseBuildVersion(v){
  try{
    const m = String(v||'').match(/dDAE_(\d+)\.(\d+)/);
    if(!m) return null;
    return {maj:Number(m[1]), min:Number(m[2])};
  }catch(_){ return null; }
}
function __isRemoteNewer(remote, local){
  const r = __parseBuildVersion(remote);
  const l = __parseBuildVersion(local);
  if(!r || !l) return String(remote).trim() !== String(local).trim();
  if(r.maj !== l.maj) return r.maj > l.maj;
  return r.min > l.min;
}

// =========================
// AUTH + SESSION (dDAE_2.019)
// =========================

const __SESSION_KEY = "dDAE_session_v2";
const __YEAR_KEY = "dDAE_exerciseYear";

function loadSession(){
  try{
    const raw = localStorage.getItem(__SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.user_id) return null;
    return s;
  } catch(_){ return null; }
}

function saveSession(session){
  try{ localStorage.setItem(__SESSION_KEY, JSON.stringify(session || null)); } catch(_){ }
}

function clearSession(){
  try{ localStorage.removeItem(__SESSION_KEY); } catch(_){ }
}

function loadExerciseYear(){
  try{
    const v = String(localStorage.getItem(__YEAR_KEY) || "").trim();
    const n = Number(v);
    if (isFinite(n) && n >= 2000 && n <= 2100) return String(n);
  } catch(_){ }
  return String(new Date().getFullYear());
}

function saveExerciseYear(year){
  try{ localStorage.setItem(__YEAR_KEY, String(year || "")); } catch(_){ }
}

function updateYearPill(){
  const pill = document.getElementById("yearPill");
  if (!pill) return;
  const y = state.exerciseYear;
  if (!y){ pill.hidden = true; return; }
  pill.textContent = `${y}`;
  pill.hidden = false;
  try{ updateSettingsTabs(); }catch(_){ }
}

function updateSettingsTabs(){
  try{
    const yEl = document.getElementById("settingsYearTab");
    const aEl = document.getElementById("settingsAccountTab");

    if (yEl){
      const y = String(state.exerciseYear || "").trim();
      yEl.textContent = y ? `${y}` : "—";
    }

    if (aEl){
      const s = state.session || {};
      const raw = (s.username || s.user || s.nome || s.name || s.email || "").toString().trim();
      const label = raw ? raw : "—";
      aEl.textContent = `${label}`;
    }
  }catch(_){ }
}


// Mostra la build a runtime (se il JS è vecchio, lo vedi subito)
(function syncBuildLabel(){
  try{
    const el = document.getElementById("buildText");
    if (el) el.textContent = BUILD_VERSION;
  }catch(_){}
})();
// Aggiornamento "hard" anti-cache iOS:
// Legge ./version.json (sempre no-store) e se il build remoto è diverso
// svuota cache, deregistra SW e ricarica con cache-bust.
async function hardUpdateCheck(){
  try{
    const res = await fetch(`./version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const remote = String(data?.build || "").trim();
    if (!remote || !__isRemoteNewer(remote, BUILD_VERSION)) return;

    try{ toast(`Aggiornamento ${remote}…`); } catch(_) {}

    try{
      if ("serviceWorker" in navigator){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    }catch(_){}

    try{
      if (window.caches){
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    }catch(_){}

    location.href = `./?v=${encodeURIComponent(remote)}&r=${Date.now()}`;
  }catch(_){}
}
// ===== Performance mode (iOS/Safari PWA) =====
const IS_IOS = (() => {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);
  return iOS || iPadOS;
})();

// Marca l'ambiente iOS (utile per CSS mirati)
try{ document.documentElement.classList.toggle("is-ios", IS_IOS); }catch(_){ }

function applyPerfMode(){
  try{
    const saved = localStorage.getItem("ddae_perf_mode"); // "full" | "lite"
    const mode = saved ? saved : (IS_IOS ? "lite" : "full");
    document.body.classList.toggle("perf-lite", mode === "lite");
  } catch(_){
    // fallback: su iOS attiva comunque lite
    if (IS_IOS) document.body.classList.add("perf-lite");
  }
}




// ===== Stato UI: evita "torna in HOME" quando iOS aggiorna il Service Worker =====
const __RESTORE_KEY = "__ddae_restore_state";
const __LAST_PAGE_KEY = "__ddae_last_page";
const __HASH_PREFIX = "#p=";

function __sanitizePage(p){
  try{
    if (!p) return null;
    const page = String(p).trim();
    if (!page) return null;
    const el = document.getElementById(`page-${page}`);
    return el ? page : null;
  } catch(_) { return null; }
}

function __readHashPage(){
  try{
    const h = (location.hash || "").trim();
    if (!h.startsWith(__HASH_PREFIX)) return null;
    const p = decodeURIComponent(h.slice(__HASH_PREFIX.length));
    return __sanitizePage(p);
  } catch(_) { return null; }
}

function __writeHashPage(page){
  try{
    const p = __sanitizePage(page) || "home";
    const newHash = __HASH_PREFIX + encodeURIComponent(p);
    if (location.hash !== newHash){
      history.replaceState(null, document.title, newHash);
    }
  } catch(_) {}
}

function __readRestoreState(){
  try{
    // 1) restore "one-shot" (session -> local)
    let raw = null;
    try { raw = sessionStorage.getItem(__RESTORE_KEY); } catch(_) {}
    if (!raw){
      try { raw = localStorage.getItem(__RESTORE_KEY); } catch(_) {}
    }
    if (raw){
      try { sessionStorage.removeItem(__RESTORE_KEY); } catch(_) {}
      try { localStorage.removeItem(__RESTORE_KEY); } catch(_) {}
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object"){
        if (!obj.page){
          let last = null;
          try { last = __sanitizePage(localStorage.getItem(__LAST_PAGE_KEY)); } catch(_) {}
          obj.page = __readHashPage() || last || "home";
        } else {
          obj.page = __sanitizePage(obj.page) || "home";
        }
        return obj;
      }
    }

    // 2) fallback: hash / last page (persistente)
    const pHash = __readHashPage();
    if (pHash) return { page: pHash };
    let pLast = null;
    try { pLast = __sanitizePage(localStorage.getItem(__LAST_PAGE_KEY)); } catch(_) {}
    if (pLast) return { page: pLast };
    return null;
  } catch(_) { return null; }
}

function __writeRestoreState(obj){
  const o = (obj && typeof obj === "object") ? obj : {};
  const page = __sanitizePage(o.page) || __sanitizePage(state.page) || "home";
  o.page = page;

  // 1) one-shot restore for SW reload (session + local for iOS reliability)
  try { sessionStorage.setItem(__RESTORE_KEY, JSON.stringify(o)); } catch(_) {}
  try { localStorage.setItem(__RESTORE_KEY, JSON.stringify(o)); } catch(_) {}

  // 2) persistent page memory (so even if iOS drops sessionStorage we stay on page)
  try { localStorage.setItem(__LAST_PAGE_KEY, page); } catch(_) {}
  __writeHashPage(page);
}

function __rememberPage(page){
  const p = __sanitizePage(page) || "home";
  try { localStorage.setItem(__LAST_PAGE_KEY, p); } catch(_) {}
  __writeHashPage(p);
}


// ===== Service Worker reload "safe": non interrompere i caricamenti DB =====
let __SW_RELOAD_PENDING = false;
let __SW_RELOADING = false;

function __performSwReload(){
  if (__SW_RELOADING) return;
  __SW_RELOADING = true;
  try { __writeRestoreState(__captureUiState()); } catch (_) {}
  location.reload();
}

function __requestSwReload(){
  try { __writeRestoreState(__captureUiState()); } catch (_) {}
  // Se stiamo caricando dati (API), rimanda il reload a fine richieste
  if (loadingState && loadingState.requestCount > 0){
    __SW_RELOAD_PENDING = true;
    return;
  }
  __performSwReload();
}

function __captureFormValue(id){
  try {
    const el = document.getElementById(id);
    if (!el) return null;
    return (el.type === "checkbox") ? !!el.checked : (el.value ?? "");
  } catch (_) { return null; }
}

function __applyFormValue(id, v){
  try {
    const el = document.getElementById(id);
    if (!el || v == null) return;
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = String(v);
  } catch (_) {}
}

function __captureUiState(){
  // IMPORTANT:
  // Salviamo lo stato della scheda ospite SOLO se l'utente e' davvero nella pagina "ospite".
  // Su iOS/PWA un reload/restore puo' riportare in primo piano una scheda vecchia (mode/view + layout diverso)
  // anche se non e' stata richiamata.
  const shouldPersistGuest = (state.page === "ospite");

  const out = {
    page: state.page || "home",
    period: state.period || { from:"", to:"" },
    preset: state.periodPreset || "this_month",
    guest: shouldPersistGuest ? {
      mode: state.guestMode || "create",
      editId: state.guestEditId || null,
      depositType: state.guestDepositType || "contante",
      saldoType: state.guestSaldoType || "contante",
      depositReceipt: !!state.guestDepositReceipt,
      saldoReceipt: !!state.guestSaldoReceipt,
      marriage: !!state.guestMarriage,
      rooms: Array.from(state.guestRooms || []),
      lettiPerStanza: state.lettiPerStanza || {},
      form: {
        guestName: __captureFormValue("guestName"),
        guestAdults: __captureFormValue("guestAdults"),
        guestKidsU10: __captureFormValue("guestKidsU10"),
        guestCheckIn: __captureFormValue("guestCheckIn"),
        guestCheckOut: __captureFormValue("guestCheckOut"),
        guestTotal: __captureFormValue("guestTotal"),
        guestBooking: __captureFormValue("guestBooking"),
        guestDeposit: __captureFormValue("guestDeposit"),
        guestSaldo: __captureFormValue("guestSaldo"),
      }
    } : null,
    calendar: {
      anchor: (state.calendar && state.calendar.anchor) ? toISO(state.calendar.anchor) : ""
    }
  };
  return out;
}

function __applyUiState(restore){
  if (!restore || typeof restore !== "object") return;

  try {
    // periodo
    const p = restore.period || null;
    if (p && p.from && p.to) {
      setPeriod(p.from, p.to);
    }

    if (restore.preset) setPresetValue(restore.preset);

    // calendario
    if (restore.calendar?.anchor) {
      if (!state.calendar) state.calendar = { anchor: new Date(), ready:false, guests:[], rangeKey:"" };
      state.calendar.anchor = new Date(restore.calendar.anchor + "T00:00:00");
      state.calendar.ready = false;
    }

    // ospite (solo se eri in quella sezione)
    if (restore.guest) {
      state.guestMode = restore.guest.mode || state.guestMode;
      state.guestEditId = restore.guest.editId || state.guestEditId;
      state.guestDepositType = restore.guest.depositType || state.guestDepositType;
      state.guestSaldoType = restore.guest.saldoType || state.guestSaldoType;
      state.guestDepositReceipt = !!restore.guest.depositReceipt;
      state.guestSaldoReceipt = !!restore.guest.saldoReceipt;
      state.guestMarriage = !!restore.guest.marriage;

      // stanze selezionate
      try {
        state.guestRooms = new Set((restore.guest.rooms || []).map(n=>parseInt(n,10)).filter(n=>isFinite(n)));
        state.lettiPerStanza = restore.guest.lettiPerStanza || {};
      } catch (_) {}

      // campi form
      const f = restore.guest.form || {};
      __applyFormValue("guestName", f.guestName);
      __applyFormValue("guestAdults", f.guestAdults);
      __applyFormValue("guestKidsU10", f.guestKidsU10);
      __applyFormValue("guestCheckIn", f.guestCheckIn);
      __applyFormValue("guestCheckOut", f.guestCheckOut);
      __applyFormValue("guestTotal", f.guestTotal);
      __applyFormValue("guestBooking", f.guestBooking);
      __applyFormValue("guestDeposit", f.guestDeposit);
      __applyFormValue("guestSaldo", f.guestSaldo);
      try { updateGuestRemaining(); } catch (_) {}

      // UI rooms + pills
      try {
        document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
          const n = parseInt(btn.getAttribute("data-room"), 10);
          const on = state.guestRooms.has(n);
          btn.classList.toggle("selected", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
      } catch (_) {}
      try { setPayType("depositType", state.guestDepositType); } catch (_) {}
      try { setPayType("saldoType", state.guestSaldoType); } catch (_) {}
      try { setPayReceipt("depositType", state.guestDepositReceipt); } catch (_) {}
      try { setPayReceipt("saldoType", state.guestSaldoReceipt); } catch (_) {}
      try { setMarriage(state.guestMarriage); } catch (_) {}
    }

  } catch (_) {}
}


function genId(prefix){
  return `${prefix}_${Date.now()}_${Math.floor(Math.random()*1000000)}`;
}

const $ = (sel) => document.querySelector(sel);

function setMarriage(on){
  state.guestMarriage = !!on;
  const btn = document.getElementById("roomMarriage");
  if (!btn) return;
  btn.classList.toggle("selected", state.guestMarriage);
  btn.setAttribute("aria-pressed", state.guestMarriage ? "true" : "false");
}


function setPayType(containerId, type){
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const t = (type || "contante").toString().toLowerCase();
  wrap.querySelectorAll(".pay-dot[data-type]").forEach(b => {
    const v = (b.getAttribute("data-type") || "").toLowerCase();
    const on = v === t;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}


function setPayReceipt(containerId, on){
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const btn = wrap.querySelector('.pay-dot[data-receipt]');
  if (!btn) return;
  const active = !!on;
  btn.classList.toggle("selected", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}



function setRegFlag(containerId, flag, on){
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const btn = wrap.querySelector(`.pay-dot[data-flag="${flag}"]`);
  if (!btn) return;
  const active = !!on;
  btn.classList.toggle("selected", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}

function setRegFlags(containerId, psOn, istatOn){
  setRegFlag(containerId, "ps", psOn);
  setRegFlag(containerId, "istat", istatOn);
}

function truthy(v){
  if (v === true) return true;
  if (v === false || v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return (s === "1" || s === "true" || s === "yes" || s === "si" || s === "on");
}

// dDAE_2.019 — error overlay: evita blocchi silenziosi su iPhone PWA
window.addEventListener("error", (e) => {
  try {
    const msg = (e?.message || "Errore JS") + (e?.filename ? ` @ ${e.filename.split("/").pop()}:${e.lineno||0}` : "");
    console.error("JS error", e?.error || e);
    toast(msg);
  } catch (_) {}
});
window.addEventListener("unhandledrejection", (e) => {
  try {
    console.error("Unhandled promise rejection", e?.reason || e);
    const msg = (e?.reason?.message || e?.reason || "Promise rejection").toString();
    toast("Errore: " + msg);
  } catch (_) {}
});

const state = {
  navId: 0,
  cleanDay: null,

  motivazioni: [],
  spese: [],
  report: null,
  _dataKey: "",
  period: { from: "", to: "" },
  periodPreset: "this_month",
  page: "home",
  speseView: "list",
  guests: [],
  stanzeRows: [],
  stanzeByKey: {},
  guestRooms: new Set(),
  guestDepositType: "contante",
  guestEditId: null,
  guestMode: "create",
  lettiPerStanza: {},
    bedsDirty: false,
  stanzeSnapshotOriginal: "",
guestMarriage: false,
  guestSaldoType: "contante",
  guestPSRegistered: false,
  guestISTATRegistered: false,
  // Scheda ospite (sola lettura): ultimo ospite aperto
  guestViewItem: null,

  // Lavanderia (resoconti settimanali)
  laundry: { list: [], current: null },
  // Impostazioni (foglio "impostazioni")
  settings: { loaded: false, byKey: {}, rows: [], loadedAt: 0 },

  // Auth/session + anno esercizio
  session: null,
  exerciseYear: null,
};

const COLORS = {
  CONTANTI: "#2b7cb4",          // palette
  TASSA_SOGGIORNO: "#bfbea9",   // palette
  IVA_22: "#c9772b",            // palette
  IVA_10: "#6fb7d6",            // palette
  IVA_4: "#4d9cc5",             // palette
};


// Loader globale (gestisce richieste parallele + anti-flicker)
const loadingState = {
  requestCount: 0,
  showTimer: null,
  hideTimer: null,
  shownAt: 0,
  isVisible: false,
  delayMs: 800,       // evita loader per richieste brevi
  minVisibleMs: 450,  // se compare, resta un minimo (evita “lampeggi”)
  hideGraceMs: 260,   // unisce richieste sequenziali (evita molte comparse)
};

function showLoading(){
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.hidden = false;
  loadingState.isVisible = true;
  loadingState.shownAt = performance.now();
}

function hideLoading(){
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.hidden = true;
  loadingState.isVisible = false;
}

function beginRequest(){
  loadingState.requestCount += 1;
  if (loadingState.requestCount !== 1) return;

  // Se stavamo per nascondere il loader, annulla: richieste ravvicinate = una sola sessione di loading
  if (loadingState.hideTimer){
    clearTimeout(loadingState.hideTimer);
    loadingState.hideTimer = null;
  }

  // Programma la comparsa dopo delayMs
  if (loadingState.showTimer) clearTimeout(loadingState.showTimer);
  loadingState.showTimer = setTimeout(() => {
    if (loadingState.requestCount > 0 && !loadingState.isVisible) {
      showLoading();
    }
  }, loadingState.delayMs);
}

function endRequest(){
  loadingState.requestCount = Math.max(0, loadingState.requestCount - 1);
  if (loadingState.requestCount !== 0) return;

  if (loadingState.showTimer) {
    clearTimeout(loadingState.showTimer);
    loadingState.showTimer = null;
  }

  // Se il SW ha chiesto un reload mentre caricavamo, fallo ora che siamo "idle"
  if (__SW_RELOAD_PENDING && !__SW_RELOADING){
    __SW_RELOAD_PENDING = false;
    // micro-delay: lascia aggiornare UI/loader
    setTimeout(() => __performSwReload(), 50);
    // non serve gestire ulteriormente il loader
    return;
  }

  // Se non è mai comparso, fine.
  if (!loadingState.isVisible) return;

  const elapsed = performance.now() - (loadingState.shownAt || performance.now());
  const minRemain = loadingState.minVisibleMs - elapsed;
  const delay = Math.max(loadingState.hideGraceMs || 0, minRemain > 0 ? minRemain : 0);

  if (loadingState.hideTimer) {
    clearTimeout(loadingState.hideTimer);
    loadingState.hideTimer = null;
  }

  loadingState.hideTimer = setTimeout(() => {
    loadingState.hideTimer = null;
    if (loadingState.requestCount === 0) hideLoading();
  }, delay);
}

function euro(n){
  const x = Number(n || 0);
  return x.toLocaleString("it-IT", { style:"currency", currency:"EUR" });
}

let __toastTimer = null;
function toast(msg, kind){
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  // kind: "blue" | "orange" | "" (default)
  t.dataset.kind = kind ? String(kind) : "";
  t.classList.add("show");
  try{ if (__toastTimer) clearTimeout(__toastTimer); }catch(_ ){}
  __toastTimer = setTimeout(() => {
    t.classList.remove("show");
    t.dataset.kind = "";
  }, 1700);
}

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

// --- Guest status LED (scheda ospiti) ---
function _dayNumFromISO(iso){
  if (!iso || typeof iso !== 'string') return null;

  // ISO datetime (es: 2026-01-05T23:00:00.000Z) -> converti in data locale (YYYY-MM-DD)
  if (iso.includes("T")) {
    const dt = new Date(iso);
    if (!isNaN(dt)) {
      return Math.floor(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000);
    }
    iso = iso.split("T")[0];
  }

  // Support both YYYY-MM-DD and DD/MM/YYYY
  if (iso.includes('/')) {
    const parts = iso.split('/').map(n=>parseInt(n,10));
    if (parts.length === 3 && parts.every(n=>isFinite(n))) {
      const [dd,mm,yy] = parts;
      return Math.floor(Date.UTC(yy, mm-1, dd) / 86400000);
    }
  }

  const parts = iso.split('-').map(n=>parseInt(n,10));
  if (parts.length !== 3 || parts.some(n=>!isFinite(n))) return null;
  const [y,m,d] = parts;
  // day number in UTC to avoid DST issues
  return Math.floor(Date.UTC(y, m-1, d) / 86400000);
}

function guestLedStatus(item){
  const ci = item?.check_in || item?.checkIn || "";
  const co = item?.check_out || item?.checkOut || "";

  const t = _dayNumFromISO(todayISO());
  const dIn = _dayNumFromISO(ci);
  const dOut = _dayNumFromISO(co);

  const isOneNight = (dIn != null && dOut != null && (dOut - dIn) === 1);

  if (t == null) return { cls: "led-gray", label: "Nessuna scadenza" };

  // Priorità: check-out (rosso) > giorno prima check-out (arancione) > dopo check-in (verde) > grigio
  if (dOut != null) {
    if (t === dOut) return { cls: "led-red", label: "Check-out oggi" };
    if (t > dOut) return { cls: "led-red", label: "Check-out passato" };

    // Giorno prima del check-out
    if (t === (dOut - 1)) {
      // Caso speciale: 1 notte -> il giorno prima del check-out coincide col check-in
      if (isOneNight && dIn === (dOut - 1)) {
        return { cls: "led-yellow", label: "1 notte: arrivo oggi (LED giallo)" };
      }
      return { cls: "led-orange", label: "Check-out domani" };
    }
  }

  if (dIn != null) {
    if (t === dIn) return { cls: "led-green", label: "Check-in oggi" };
    if (t > dIn) return { cls: "led-green", label: "In soggiorno" };
    return { cls: "led-gray", label: "In arrivo" };
  }

  return { cls: "led-gray", label: "Nessuna data" };
}





function toISO(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatISODateLocal(value){
  if (!value) return "";
  const s = String(value);

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO datetime -> local date
  if (s.includes("T")) {
    const dt = new Date(s);
    if (!isNaN(dt)) return toISO(dt); // toISO usa date locale
    return s.split("T")[0];
  }

  // Fallback: DD/MM/YYYY
  if (s.includes("/")) {
    const parts = s.split("/").map(x=>parseInt(x,10));
    if (parts.length === 3 && parts.every(n=>isFinite(n))) {
      const [dd,mm,yy] = parts;
      const dt = new Date(yy, mm-1, dd);
      return toISO(dt);
    }
  }

  // Last resort: cut
  return s.slice(0,10);
}

// 2026-01-01 -> "1 Gennaio 2026" (mese con iniziale maiuscola)
function formatLongDateIT(value){
  const iso = formatISODateLocal(value);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y,m,d] = iso.split("-").map(n=>parseInt(n,10));
  const dt = new Date(y, (m-1), d);
  if (isNaN(dt)) return "";
  const s = dt.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  // capitalizza il mese (in it-IT normalmente è minuscolo)
  // es: "1 gennaio 2026" -> "1 Gennaio 2026"
  const parts = s.split(" ");
  if (parts.length >= 3) {
    parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    return parts.join(" ");
  }
  return s;
}

function formatShortDateIT(input){
  try{
    if (!input) return "";
    const s = String(input).trim();

    // ISO datetime (con T/Z): non usare slice(0,10) perché può "scalare" di 1 giorno
    if (s.includes("T")) {
      const dt = new Date(s);
      if (!isNaN(dt)){
        const dd = String(dt.getDate()).padStart(2,"0");
        const mm = String(dt.getMonth()+1).padStart(2,"0");
        const yy = String(dt.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
      }
    }

    // YYYY-MM-DD
    const iso = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)){
      const [y,m,d] = iso.split("-");
      return `${d}/${m}/${y.slice(-2)}`;
    }

    // fallback Date parse
    const dt = new Date(s);
    if (!isNaN(dt)){
      const dd = String(dt.getDate()).padStart(2,"0");
      const mm = String(dt.getMonth()+1).padStart(2,"0");
      const yy = String(dt.getFullYear()).slice(-2);
      return `${dd}/${mm}/${yy}`;
    }
    return iso;
  }catch(_){
    return "";
  }
}


function formatFullDateIT(d){
  try{
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return "";
    const months = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    const weekdays = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
    const wd = weekdays[dt.getDay()] || "";
    const day = dt.getDate();
    const month = months[dt.getMonth()];
    const year = dt.getFullYear();
    return `${wd} ${day} ${month} ${year}`;
  }catch(_){ return ""; }
}

function startOfLocalDay(d){
  const dt = (d instanceof Date) ? new Date(d) : new Date(d);
  dt.setHours(0,0,0,0);
  return dt;
}

function toISODateLocal(d){
  const dt = startOfLocalDay(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const da = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}



function spesaCategoryClass(s){
  // "campo X": categoria (fallback: aliquotaIva)
  const catRaw = (s?.categoria ?? s?.cat ?? "").toString().trim().toLowerCase();
  const aliq = (s?.aliquotaIva ?? s?.aliquota_iva ?? "").toString().trim();

  // Normalizza varianti
  if (catRaw.includes("contant")) return "spesa-bg-contanti";
  if (catRaw.includes("tassa") && catRaw.includes("sogg")) return "spesa-bg-tassa";

  // IVA
  if (catRaw.includes("iva")){
    if (catRaw.includes("22")) return "spesa-bg-iva22";
    if (catRaw.includes("10")) return "spesa-bg-iva10";
    if (catRaw.includes("4")) return "spesa-bg-iva4";
  }

  // Fallback su aliquota numerica
  const n = parseFloat(String(aliq).replace(",", "."));
  if (!isNaN(n)){
    if (n >= 21.5) return "spesa-bg-iva22";
    if (n >= 9.5 && n < 11.5) return "spesa-bg-iva10";
    if (n >= 3.5 && n < 5.5) return "spesa-bg-iva4";
  }

  return ""; // nessun colore
}





function calcStayNights(ospite){
  // Calcola le notti tra check-in e check-out (date ISO), robusto per Safari/iOS (usa Date.UTC)
  const inRaw  = ospite?.check_in ?? ospite?.checkIn ?? "";
  const outRaw = ospite?.check_out ?? ospite?.checkOut ?? "";
  const inISO  = formatISODateLocal(inRaw);
  const outISO = formatISODateLocal(outRaw);

  if (!inISO || !outISO) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inISO) || !/^\d{4}-\d{2}-\d{2}$/.test(outISO)) return null;

  const [yi, mi, di] = inISO.split("-").map(n => parseInt(n, 10));
  const [yo, mo, do_] = outISO.split("-").map(n => parseInt(n, 10));

  const tIn  = Date.UTC(yi, mi - 1, di);
  const tOut = Date.UTC(yo, mo - 1, do_);

  const diff = Math.round((tOut - tIn) / 86400000);
  if (!isFinite(diff) || diff <= 0) return null;
  return diff;
}

function formatEUR(value){
  const n = Number(value || 0);
  try{
    return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  }catch(_){
    // fallback
    return "€" + (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
  }
}

function calcTouristTax(ospite, nights){
  // Tassa di soggiorno: per persona > 10 anni (usa 'adulti'), max 3 giorni consecutivi
  const adultsRaw = ospite?.adulti ?? ospite?.adults ?? 0;
  const adults = Math.max(0, parseInt(adultsRaw, 10) || 0);

  const nNights = Math.max(0, parseInt(nights, 10) || 0);
  const taxableDays = Math.min(nNights, 3);

  const rate = (state.settings && state.settings.loaded) ? getSettingNumber("tassa_soggiorno", (typeof TOURIST_TAX_EUR_PPN !== "undefined" ? TOURIST_TAX_EUR_PPN : 0)) : ((typeof TOURIST_TAX_EUR_PPN !== "undefined") ? Number(TOURIST_TAX_EUR_PPN) : 0);
  const r = isFinite(rate) ? Math.max(0, rate) : 0;

  const total = adults * taxableDays * r;
  return { total, adults, taxableDays, rate: r };
}


function monthRangeISO(date = new Date()){
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m+1, 0);
  return [toISO(start), toISO(end)];
}


// Period preset (scroll picker iOS) — nessuna API extra
let periodSyncLock = 0;
let presetSyncLock = 0;

function addDaysISO(iso, delta){
  const [y,m,d] = iso.split("-").map(n=>parseInt(n,10));
  const dt = new Date(y, (m-1), d);
  dt.setDate(dt.getDate() + delta);
  return toISO(dt);
}

function monthRangeFromYM(ym){
  const [yy,mm] = ym.split("-").map(n=>parseInt(n,10));
  const start = new Date(yy, mm-1, 1);
  const end = new Date(yy, mm, 0);
  return [toISO(start), toISO(end)];
}

function recentMonths(n=8){
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i=0;i<n;i++){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth()-1);
  }
  return out;
}

function buildPeriodPresetOptions(){
  const opts = [
    { value:"this_month", label:"Questo mese" },
    { value:"last_month", label:"Mese scorso" },
    { value:"last_7", label:"Ultimi 7 giorni" },
    { value:"last_30", label:"Ultimi 30 giorni" },
    { value:"ytd", label:"Anno corrente" },
    { value:"all", label:"Tutto" },
  ];
  for (const ym of recentMonths(8)){
    opts.push({ value:`month:${ym}`, label: ym });
  }
  opts.push({ value:"custom", label:"Personalizzato" });
  return opts;
}

function fillPresetSelect(selectEl){
  if (!selectEl) return;
  const opts = buildPeriodPresetOptions();
  selectEl.innerHTML = "";
  for (const o of opts){
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  }
}

function setPresetValue(value){
  state.periodPreset = value;
  presetSyncLock += 1;
  try {
    const sels = ["#periodPreset1","#periodPreset2","#periodPreset3"]
      .map(s => document.querySelector(s))
      .filter(Boolean);
    for (const s of sels) s.value = value;
  } finally {
    presetSyncLock -= 1;
  }
}

function presetToRange(value){
  const today = todayISO();
  if (value === "this_month") return monthRangeISO(new Date());
  if (value === "last_month"){
    const d = new Date();
    d.setMonth(d.getMonth()-1);
    return monthRangeISO(d);
  }
  if (value === "last_7") return [addDaysISO(today, -6), today];
  if (value === "last_30") return [addDaysISO(today, -29), today];
  if (value === "ytd"){
    const y = new Date().getFullYear();
    return [`${y}-01-01`, today];
  }
  if (value === "all") return ["2000-01-01", today];
  if (value && value.startsWith("month:")){
    const ym = value.split(":")[1];
    return monthRangeFromYM(ym);
  }
  return null;
}

function bindPresetSelect(sel){
  const el = document.querySelector(sel);
  if (!el) return;
  fillPresetSelect(el);
  el.value = state.periodPreset || "this_month";

  el.addEventListener("change", async () => {
    if (presetSyncLock > 0) return;
    const v = el.value;
    const range = presetToRange(v);
    setPresetValue(v);
    if (!range) return;
    const [from,to] = range;

    setPeriod(from,to);

    try { await onPeriodChanged({ showLoader:false }); } catch (e) { toast(e.message); }
  });
}

function categoriaLabel(cat){
  return ({
    CONTANTI: "Contanti",
    TASSA_SOGGIORNO: "Tassa soggiorno",
    IVA_22: "IVA 22%",
    IVA_10: "IVA 10%",
    IVA_4: "IVA 4%",
  })[cat] || cat;
}

async function api(action, { method="GET", params={}, body=null, showLoader=true } = {}){
  if (showLoader) beginRequest();
  try {
  if (!API_BASE_URL || API_BASE_URL.includes("INCOLLA_QUI")) {
    throw new Error("Config mancante: imposta API_BASE_URL in config.js");
  }

  const url = new URL(API_BASE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("apiKey", API_KEY);
  // Cache-busting for iOS/Safari aggressive caching
  url.searchParams.set("_ts", String(Date.now()));

  // Context multi-account (user + anno)
  try{
    if (state && state.session && state.session.user_id && action !== "utenti" && action !== "ping"){
      if (!params) params = {};
      if (params.user_id === undefined || params.user_id === null || String(params.user_id).trim() === "") {
        params.user_id = String(state.session.user_id);
      }
      if (params.anno === undefined || params.anno === null || String(params.anno).trim() === "") {
        params.anno = String(state.exerciseYear || "");
      }
    }
  }catch(_){ }

  Object.entries(params || {}).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).length) url.searchParams.set(k, v);
  });

  let realMethod = method;
  if (method === "PUT" || method === "DELETE") {
    url.searchParams.set("_method", method);
    realMethod = "POST";
  }

  // Timeout concreto: evita loader infinito su iOS quando la rete “si pianta”
const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 15000);

const fetchOpts = {
  method: realMethod,
  signal: controller.signal,
  cache: "no-store",
};

// Headers/body solo quando serve (riduce rischi di preflight su Safari iOS)
if (realMethod !== "GET") {
  fetchOpts.headers = { "Content-Type": "text/plain;charset=utf-8" };
  let payload = body;
  // Inietta user_id/anno su POST/PUT (se mancano)
  try{
    if (state && state.session && state.session.user_id && action !== "utenti"){
      const uid = String(state.session.user_id);
      const yr = String(state.exerciseYear || "");
      const addCtx = (o)=>{
        if (!o || typeof o !== "object") return o;
        if (o.user_id === undefined || o.user_id === null || String(o.user_id).trim() === "") o.user_id = uid;
        if (o.anno === undefined || o.anno === null || String(o.anno).trim() === "") o.anno = yr;
        return o;
      };

      const deep = (x, depth = 0)=>{
        if (!x || typeof x !== "object") return x;
        if (Array.isArray(x)) return x.map(v => deep(v, depth));
        addCtx(x);
        if (depth >= 1) return x;
        // pattern comuni: bulk payloads
        ["rows","items","records","data","list"].forEach((k)=>{
          const v = x[k];
          if (Array.isArray(v)) x[k] = v.map(r => deep(r, depth + 1));
        });
        return x;
      };

      payload = deep(payload, 0);
    }
  }catch(_){ }
  fetchOpts.body = payload ? JSON.stringify(payload) : "{}";
}

let res;
try {
  try {
  res = await fetch(url.toString(), fetchOpts);
} catch (err) {
  const msg = String(err && err.message || err || "");
  if (msg.toLowerCase().includes("failed to fetch")) {
    throw new Error("Failed to fetch (API). Verifica: 1) Web App Apps Script distribuita come 'Chiunque', 2) URL /exec corretto, 3) rete iPhone ok. Se hai appena aggiornato lo script, ridistribuisci una nuova versione.");
  }
  throw err;
}
} finally {
  clearTimeout(t);
}

let json;
try {
  json = await res.json();
} catch (_) {
  throw new Error("Risposta non valida dal server");
}

if (!json.ok) throw new Error(json.error || "API error");
return json.data;
  } finally { if (showLoader) endRequest(); }
}


// =========================
// IMPOSTAZIONI (foglio Google "impostazioni")
// Chiavi usate:
// - operatori  -> colonne operatore_1/2/3
// - tariffa_oraria -> value (number)
// - costo_benzina  -> value (number)
// - tassa_soggiorno -> value (number)
// =========================

function __normKey(k) {
  return String(k || "").trim().toLowerCase();
}

function __parseSettingsRows(rows) {
  const byKey = {};
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const key = __normKey(r?.key ?? r?.Key ?? r?.KEY);
    if (!key) return;
    byKey[key] = r;
  });
  return byKey;
}

function getSettingRow(key) {
  const k = __normKey(key);
  return (state.settings && state.settings.byKey && state.settings.byKey[k]) ? state.settings.byKey[k] : null;
}

function getSettingText(key, fallback = "") {
  const row = getSettingRow(key);
  const v = row ? (row.value ?? row.Value ?? row.val ?? "") : "";
  const s = String(v ?? "").trim();
  return s ? s : String(fallback ?? "");
}

function getSettingNumber(key, fallback = 0) {
  const row = getSettingRow(key);
  let v = row ? (row.value ?? row.Value ?? row.val ?? "") : "";
  if (v === null || v === undefined) v = "";
  const s = String(v).trim().replace(",", ".");
  if (!s) return Number(fallback) || 0;
  const n = Number(s);
  return isFinite(n) ? n : (Number(fallback) || 0);
}

function getOperatorNamesFromSettings() {
  const row = getSettingRow("operatori");
  const op1 = String(row?.operatore_1 ?? row?.Operatore_1 ?? row?.operatore1 ?? "").trim();
  const op2 = String(row?.operatore_2 ?? row?.Operatore_2 ?? row?.operatore2 ?? "").trim();
  const op3 = String(row?.operatore_3 ?? row?.Operatore_3 ?? row?.operatore3 ?? "").trim();
  return [op1, op2, op3];
}

async function ensureSettingsLoaded({ force = false, showLoader = false } = {}) {
  try {
    if (!force && state.settings?.loaded) return state.settings;
    const data = await api("impostazioni", { method: "GET", showLoader });
    const rows = data?.rows || data?.items || [];
    state.settings.rows = Array.isArray(rows) ? rows : [];
    state.settings.byKey = __parseSettingsRows(state.settings.rows);
    state.settings.loaded = true;
    state.settings.loadedAt = Date.now();

    // Se esistono campi operatori (pulizie), mostra i nomi salvati (non editabili)
    try {
      const names = getOperatorNamesFromSettings(); // [op1, op2, op3]
const ids = ["op1Name","op2Name","op3Name"];
ids.forEach((id, idx) => {
  const el = document.getElementById(id);
  if (!el) return;
  const name = String(names[idx] || "").trim();

  // Nascondi completamente l'operatore se non è impostato
  const row = el.closest ? el.closest(".clean-op-row") : null;
  if (!name) {
    if (row) row.style.display = "none";
    el.textContent = "";
    el.classList.remove("is-placeholder");
    return;
  } else {
    if (row) row.style.display = "";
  }

  // Se è un input (compat), rendilo readOnly e compila
  if (String(el.tagName || "").toUpperCase() === "INPUT") {
    el.readOnly = true;
    el.setAttribute("readonly", "");
    el.value = name;
    return;
  }

  // Altrimenti è un testo (div/span)
  el.textContent = name;
  el.classList.remove("is-placeholder");
});

refreshFloatingLabels();
    } catch(_) {}

    return state.settings;
  } catch (e) {
    // Non bloccare l'app se il foglio non è ancora pronto
    console.warn("Impostazioni: load failed", e);
    return state.settings;
  }
}

async function loadImpostazioniPage({ force = false } = {}) {
  await ensureSettingsLoaded({ force, showLoader: true });
  try {
    const rOps = getSettingRow("operatori") || {};
    const op1 = String(rOps.operatore_1 ?? "").trim();
    const op2 = String(rOps.operatore_2 ?? "").trim();
    const op3 = String(rOps.operatore_3 ?? "").trim();

    const el1 = document.getElementById("setOp1");
    const el2 = document.getElementById("setOp2");
    const el3 = document.getElementById("setOp3");
    if (el1) el1.value = op1;
    if (el2) el2.value = op2;
    if (el3) el3.value = op3;

    const t = document.getElementById("setTariffa");
    const b = document.getElementById("setBenzina");
    const ts = document.getElementById("setTassa");

    if (t) t.value = String(getSettingNumber("tariffa_oraria", 0) || "");
    if (b) b.value = String(getSettingNumber("costo_benzina", 0) || "");
    if (ts) ts.value = String(getSettingNumber("tassa_soggiorno", (typeof TOURIST_TAX_EUR_PPN !== "undefined" ? TOURIST_TAX_EUR_PPN : 0)) || "");

    refreshFloatingLabels();
  } catch (e) {
    toast(e.message);
  }
}

function __readNumInput(id) {
  const el = document.getElementById(id);
  const raw = el ? String(el.value || "").trim() : "";
  if (!raw) return "";
  const n = Number(raw.replace(",", "."));
  if (!isFinite(n) || n < 0) return "";
  return Math.round(n * 100) / 100;
}

async function saveImpostazioniPage() {
  const op1 = String(document.getElementById("setOp1")?.value || "").trim();
  const op2 = String(document.getElementById("setOp2")?.value || "").trim();
  const op3 = String(document.getElementById("setOp3")?.value || "").trim();

  const tariffa = __readNumInput("setTariffa");
  const benzina = __readNumInput("setBenzina");
  const tassa = __readNumInput("setTassa");

  const payload = {
    operatori: [op1, op2, op3],
    tariffa_oraria: tariffa,
    costo_benzina: benzina,
    tassa_soggiorno: tassa,
  };

  await api("impostazioni", { method: "POST", body: payload, showLoader: true });
  await ensureSettingsLoaded({ force: true, showLoader: false });

  toast("Impostazioni salvate");
}

function setupImpostazioni() {
  const back = document.getElementById("settingsBackBtn");
  if (back) back.addEventListener("click", () => showPage("home"));

  const save = document.getElementById("settingsSaveBtn");
  if (save) save.addEventListener("click", async () => {
    try { await saveImpostazioniPage(); } catch (e) { toast(e.message); }
  });

  const reload = document.getElementById("settingsReloadBtn");
  if (reload) reload.addEventListener("click", async () => {
    try { await loadImpostazioniPage({ force: true }); toast("Impostazioni ricaricate"); } catch (e) { toast(e.message); }
  });

  const del = document.getElementById("settingsDeleteBtn");
  if (del) bindFastTap(del, async () => {
    try{
      const s = state.session || loadSession();
      if (!s || !s.username){ toast("Nessun account"); return; }

      const ok = confirm("Eliminare definitivamente questo account e tutti i suoi dati?");
      if (!ok) return;

      const pwd = prompt("Password dell'account da eliminare:");
      if (pwd === null) return;
      const password = String(pwd || "");
      if (!password) { toast("Password mancante"); return; }

      await api("utenti", { method:"POST", body:{ op:"delete", username: String(s.username||"").trim(), password } , showLoader:true });

      try{ clearSession(); }catch(_){ }
      try{ state.session = null; }catch(_){ }
      try{ invalidateApiCache(); }catch(_){ }
      try{ __lsClearAll(); }catch(_){ }
      toast("Account eliminato");
      try{ showPage("auth"); }catch(_){ }
    }catch(e){ toast(e.message || "Errore"); }
  });

  const logout = document.getElementById("settingsLogoutBtn");
  if (logout) logout.addEventListener("click", () => {
    try{ clearSession(); }catch(_){ }
    try{ state.session = null; }catch(_){ }
    try{ invalidateApiCache(); }catch(_){ }
    try{ showPage("auth"); }catch(_){ }
  });


  // Anno di esercizio
  const selAnno = document.getElementById("setAnno");
  if (selAnno){
    const cy = new Date().getFullYear();
    const years = [];
    for (let y = cy - 3; y <= cy + 2; y++) years.push(String(y));
    selAnno.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    selAnno.value = String(state.exerciseYear || loadExerciseYear());
    selAnno.addEventListener("change", () => {
      state.exerciseYear = String(selAnno.value || "");
      saveExerciseYear(state.exerciseYear);
      updateYearPill();
      invalidateApiCache();
    });
  }
}


function setupAuth(){
  const u = document.getElementById("authUsername");
  const p = document.getElementById("authPassword");
  const hint = document.getElementById("authHint");

  const extra = document.getElementById("authExtra");
  const nome = document.getElementById("authNome");
  const tel = document.getElementById("authTelefono");
  const email = document.getElementById("authEmail");
  const p2 = document.getElementById("authPassword2");
  const p2Wrap = document.getElementById("authConfirmPasswordWrap");
  const np = document.getElementById("authNewPassword");
  const np2 = document.getElementById("authNewPassword2");
  const npWrap = document.getElementById("authNewPasswordWrap");

  const setHint = (msg)=>{ try{ if (hint) hint.textContent = msg || ""; }catch(_){ } };

  const btnCreate = document.getElementById("btnCreateAccount");
  const btnEdit = document.getElementById("btnEditAccount");
  const btnLogin = document.getElementById("btnLogin");

  let mode = "login"; // login | create | edit

  const setMode = (m)=>{
    mode = m;
    // active button styling
    try{
      [btnCreate, btnEdit, btnLogin].forEach(b=>b && b.classList.remove("is-active"));
      if (m === "create" && btnCreate) btnCreate.classList.add("is-active");
      if (m === "edit" && btnEdit) btnEdit.classList.add("is-active");
      if (m === "login" && btnLogin) btnLogin.classList.add("is-active");
    }catch(_){ }

    // show/hide extra form
    const needExtra = (m === "create" || m === "edit");
    if (extra) extra.hidden = !needExtra;

    if (p2Wrap) p2Wrap.hidden = (m !== "create");
    if (npWrap) npWrap.hidden = (m !== "edit");

    // reset fields that don't apply
    if (m !== "create" && p2) p2.value = "";
    if (m !== "edit"){
      if (np) np.value = "";
      if (np2) np2.value = "";
    }

    if (m === "login") setHint("");
    if (m === "create") setHint("Inserisci i dati e premi di nuovo: crea account");
    if (m === "edit") setHint("Inserisci i dati e premi di nuovo: modifica account");
  };

  const readCreds = ()=>({
    username: String(u?.value||"").trim(),
    password: String(p?.value||"")
  });

  const readProfile = ()=>({
    nome: String(nome?.value||"").trim(),
    telefono: String(tel?.value||"").trim(),
    email: String(email?.value||"").trim(),
  });

  // default state
  setMode("login");

  if (btnCreate) bindFastTap(btnCreate, async ()=>{
    if (mode !== "create"){
      setMode("create");
      try{ u && u.focus(); }catch(_){ }
      return;
    }

    const {username, password} = readCreds();
    const profile = readProfile();
    const confirm = String(p2?.value||"");

    if (!username || !password) { setHint("Inserisci username e password"); return; }
    if (password !== confirm) { setHint("Le password non coincidono"); return; }

    try{
      setHint("...");
      const data = await api("utenti", { method:"POST", body:{ op:"create", username, password, ...profile } });
      setHint("Account creato");
      if (data && data.user){
        state.session = data.user;
        saveSession(state.session);
        state.exerciseYear = loadExerciseYear();
        updateYearPill();
        showPage("home");
      }
    } catch(e){ setHint(e.message || "Errore"); }
  });

  if (btnEdit) bindFastTap(btnEdit, async ()=>{
    if (mode !== "edit"){
      setMode("edit");
      try{ u && u.focus(); }catch(_){ }
      return;
    }

    const {username, password} = readCreds();
    const profile = readProfile();
    const newPassword = String(np?.value||"");
    const newPassword2 = String(np2?.value||"");

    if (!username || !password) { setHint("Inserisci username e password"); return; }
    if ((newPassword || newPassword2) && newPassword !== newPassword2) { setHint("Le nuove password non coincidono"); return; }

    try{
      setHint("...");
      const data = await api("utenti", { method:"POST", body:{ op:"update", username, password, newPassword, ...profile } });
      setHint("Account aggiornato");
      if (data && data.user){
        state.session = data.user;
        saveSession(state.session);
      }
    } catch(e){ setHint(e.message || "Errore"); }
  });

  if (btnLogin) bindFastTap(btnLogin, async ()=>{
    if (mode !== "login"){
      setMode("login");
      try{ u && u.focus(); }catch(_){ }
      return;
    }

    const {username, password} = readCreds();
    if (!username || !password) { setHint("Inserisci username e password"); return; }
    try{
      setHint("...");
      const data = await api("utenti", { method:"POST", body:{ op:"login", username, password } });
      if (!data || !data.user) throw new Error("Credenziali non valide");
      state.session = data.user;
      saveSession(state.session);
      try{ invalidateApiCache(); }catch(_){ }
      state.exerciseYear = loadExerciseYear();
      updateYearPill();
      setHint("");
      showPage("home");
    } catch(e){ setHint(e.message || "Errore"); }
  });
}


// ===== API Cache (speed + dedupe richieste) =====
const __apiCache = new Map();      // key -> { t:number, data:any }
const __apiInflight = new Map();   // key -> Promise

function __applyCtxToParams(action, params){
  const p = Object.assign({}, params || {});
  try{
    if (state && state.session && state.session.user_id && action !== "utenti" && action !== "ping"){
      if (p.user_id === undefined || p.user_id === null || String(p.user_id).trim() === "") {
        p.user_id = String(state.session.user_id);
      }
      if (p.anno === undefined || p.anno === null || String(p.anno).trim() === "") {
        p.anno = String(state.exerciseYear || "");
      }
    }
  }catch(_){ }
  return p;
}

function __cacheKey(action, params){
  try { return action + "|" + JSON.stringify(params || {}); }
  catch (_) { return action + "|{}"; }
}

function invalidateApiCache(prefix){
  try{
    for (const k of Array.from(__apiCache.keys())){
      if (!prefix || k.startsWith(prefix)) __apiCache.delete(k);
    }
  } catch (_) {}
  try{ __lsClearAll(); }catch(_){ }
}

// ===== LocalStorage cache (perceived speed on iOS) =====
const __lsPrefix = "ddae_cache_v1:";
function __lsClearAll(){
  try{
    const keys = [];
    for (let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(__lsPrefix)) keys.push(k);
    }
    keys.forEach(k => { try{ localStorage.removeItem(k); }catch(_){ } });
  } catch(_){ }
}
function __lsGet(key){
  try{
    const raw = localStorage.getItem(__lsPrefix + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(_){ return null; }
}
function __lsSet(key, data){
  try{
    localStorage.setItem(__lsPrefix + key, JSON.stringify({ t: Date.now(), data }));
  } catch(_){}
}



// GET con cache in-memory (non tocca SW): evita chiamate duplicate e loader continui
async function cachedGet(action, params = {}, { ttlMs = 30000, swrMs = null, showLoader = true, force = false } = {}){
  const ctxParams = __applyCtxToParams(action, params);
  const key = __cacheKey(action, ctxParams);
  const now = Date.now();
  const swrWindow = (swrMs === null || swrMs === undefined) ? ttlMs : swrMs;

  if (!force) {
    const hit = __apiCache.get(key);
    if (hit) {
      const age = now - hit.t;
      if (age < ttlMs) return hit.data;

      // Stale-while-revalidate: torna subito il dato “stale” e aggiorna in background
      if (age < swrWindow) {
        if (!__apiInflight.has(key)) {
          const bg = (async () => {
            const data = await api(action, { params: ctxParams, showLoader:false });
            __apiCache.set(key, { t: Date.now(), data });
            return data;
          })();
          __apiInflight.set(key, bg);
          bg.finally(() => { try{ __apiInflight.delete(key); }catch(_){ } });
        }
        return hit.data;
      }
    }
  }

  if (__apiInflight.has(key)) return __apiInflight.get(key);

  const p = (async () => {
    const data = await api(action, { params: ctxParams, showLoader });
    __apiCache.set(key, { t: Date.now(), data });
    return data;
  })();

  __apiInflight.set(key, p);

  try {
    return await p;
  } finally {
    __apiInflight.delete(key);
  }
}

/* Launcher modal (popup) */



// iOS/PWA: elimina i “tap” persi (click non sempre affidabile su Safari PWA)
function bindFastTap(el, fn){
  if (!el) return;
  let last = 0;
  const handler = (e)=>{
    const now = Date.now();
    if (now - last < 450) return;
    last = now;
    try{ e.preventDefault(); }catch(_){ }
    try{ e.stopPropagation(); }catch(_){ }
    fn();
  };

  // In PWA iOS/Safari: evita doppi trigger (touch/pointer/click)
  const usePointer = (typeof window !== "undefined") && ("PointerEvent" in window);
  const events = usePointer ? ["pointerup", "click"] : ["touchend", "click"];

  for (const evt of events){
    try{ el.addEventListener(evt, handler, { passive:false }); }
    catch(_){ el.addEventListener(evt, handler); }
  }
}

let launcherDelegationBound = false;
let homeDelegationBound = false;
function bindHomeDelegation(){
  if (homeDelegationBound) return;
  homeDelegationBound = true;
  document.addEventListener("click", (e)=>{
    const o = e.target.closest && e.target.closest("#goOspite");
    if (o){ hideLauncher(); showPage("ospiti"); return; }
    const cal = e.target.closest && e.target.closest("#goCalendario");
    if (cal){ hideLauncher(); showPage("calendario"); return; }
    const tassa = e.target.closest && e.target.closest("#goTassaSoggiorno");
    if (tassa){
      hideLauncher();
      (async ()=>{ try{ await ensureSettingsLoaded({ force:false, showLoader:false }); }catch(_){} showPage("tassa"); try{ initTassaPage(); }catch(_){} })();
      return;
    }
    const pul = e.target.closest && e.target.closest("#goPulizie");
    if (pul){ hideLauncher(); showPage("pulizie"); return; }
        const opcal = e.target.closest && e.target.closest("#goOrePulizia") || e.target.closest("#goOrePuliziaTop");
    if (opcal){ hideLauncher(); showPage("orepulizia"); return; }

const lav = e.target.closest && e.target.closest("#goLavanderia") || e.target.closest("#goLavanderiaTop");
    if (lav){ hideLauncher(); showPage("lavanderia"); return; }

    const imp = e.target.closest && e.target.closest("#goImpostazioni");
    if (imp){ hideLauncher(); showPage("impostazioni"); return; }

    const g = e.target.closest && e.target.closest("#goStatistiche");
    if (g){ hideLauncher(); showPage("statistiche"); return; }

    // STATISTICHE (icone)
    const s1 = e.target.closest && e.target.closest("#goStatGen");
    if (s1){ hideLauncher(); showPage("statgen"); return; }
    const s2 = e.target.closest && e.target.closest("#goStatMensili");
    if (s2){ hideLauncher(); showPage("statmensili"); return; }
    const s3 = e.target.closest && e.target.closest("#goStatSpese");
    if (s3){ hideLauncher(); showPage("statspese"); return; }
    const s4 = e.target.closest && e.target.closest("#goStatPrenotazioni");
    if (s4){ hideLauncher(); showPage("statprenotazioni"); return; }

  });
}

function bindLauncherDelegation(){
  if (launcherDelegationBound) return;
  launcherDelegationBound = true;

  document.addEventListener("click", (e) => {
    const goBtn = e.target.closest && e.target.closest("#launcherModal [data-go]");
    if (goBtn){
      const page = goBtn.getAttribute("data-go");
      hideLauncher();
      showPage(page);
      return;
    }
    const close = e.target.closest && e.target.closest("#launcherModal [data-close], #closeLauncher");
    if (close){
      hideLauncher();
    }
  });
}

function showLauncher(){
  const m = document.getElementById("launcherModal");
  if (!m) return;
  m.hidden = false;
  m.setAttribute("aria-hidden", "false");
}
function hideLauncher(){
  const m = document.getElementById("launcherModal");
  if (!m) return;
  m.hidden = true;
  m.setAttribute("aria-hidden", "true");
}


function setSpeseView(view, { render=false } = {}){
  state.speseView = view;
  const list = document.getElementById("speseViewList");
  const ins = document.getElementById("speseViewInsights");
  if (list) list.hidden = (view !== "list");
  if (ins) ins.hidden = (view !== "insights");

  const btn = document.getElementById("btnSpeseInsights");
  if (btn){
    btn.setAttribute("aria-pressed", view === "insights" ? "true" : "false");
    btn.classList.toggle("is-active", view === "insights");
  }

  if (render){
    if (view === "list") {
      try{ renderSpese(); }catch(_){}
    } else {
      try{ renderRiepilogo(); }catch(_){}
      try{ renderGrafico(); }catch(_){}
    }
  }
}

/* NAV pages (5 pagine interne: home + 4 funzioni) */
function showPage(page){
  // Redirect: grafico/riepilogo ora sono dentro "Spese" (videata unica)
  if (page === "riepilogo" || page === "grafico"){
    page = "spese";
    state.speseView = "insights";
  }
  if (page === "spese" && !state.speseView) state.speseView = "list";

  // Gate: senza sessione si rimane in AUTH
  try{
    if (page !== "auth" && (!state.session || !state.session.user_id)) {
      page = "auth";
    }
  }catch(_){ page = "auth"; }


  // Token navigazione: impedisce render/loader fuori contesto quando cambi pagina durante fetch
  const navId = ++state.navId;

  const prevPage = state.page;
  if (page === "calendario" && prevPage && prevPage !== "calendario") {
    state._calendarPrev = prevPage;
  }

state.page = page;
  document.body.dataset.page = page;

  try { __rememberPage(page); } catch (_) {}
  document.querySelectorAll(".page").forEach(s => s.hidden = true);
  const el = $(`#page-${page}`);
  if (el) el.hidden = false;

  // Impostazioni: aggiorna tabs (account + anno)
  if (page === "impostazioni"){
    try{ updateSettingsTabs(); }catch(_){ }
  }

  // Sotto-viste della pagina Spese (lista ↔ grafico+riepilogo)
  if (page === "spese") {
    try { setSpeseView(state.speseView || "list"); } catch (_) {}
  }

  // Period chip: nascosto in HOME (per rispettare "nessun altro testo" sulla home)
  const chip = $("#periodChip");
  if (chip){
    if (page === "home" || page === "ospite" || page === "ospiti") {
      chip.hidden = true;
    } else {
      chip.hidden = false;
      chip.textContent = `${state.period.from} → ${state.period.to}`;
    }
  }


  // Top back button (Ore pulizia + Calendario)
  const backBtnTop = $("#backBtnTop");
  if (backBtnTop){
    backBtnTop.hidden = !(page === "orepulizia" || page === "calendario");
  }


  // Top tools (solo Pulizie) — lavanderia + ore lavoro accanto al tasto Home
  const pulizieTopTools = $("#pulizieTopTools");
  if (pulizieTopTools){
    pulizieTopTools.hidden = (page !== "pulizie");
  }


  // Top tools (Ospiti) — nuovo ospite + calendario accanto al tasto Home
  const ospitiTopTools = $("#ospitiTopTools");
  if (ospitiTopTools){
    ospitiTopTools.hidden = (page !== "ospiti");
  }

  
  // Top tools (Spese) — + e grafico accanto al tasto Home
  const speseTopTools = $("#speseTopTools");
  if (speseTopTools){
    speseTopTools.hidden = (page !== "spese");
  }

  // Top tools (Statistiche → Conteggio generale)
  const statGenTopTools = $("#statGenTopTools");
  if (statGenTopTools){
    statGenTopTools.hidden = (page !== "statgen");
  }

  // Top tools (Statistiche → Fatturati mensili)
  const statMensiliTopTools = $("#statMensiliTopTools");
  if (statMensiliTopTools){
    statMensiliTopTools.hidden = (page !== "statmensili");
  }

  // Top tools (Statistiche → Spese generali)
  const statSpeseTopTools = $("#statSpeseTopTools");
  if (statSpeseTopTools){
    statSpeseTopTools.hidden = (page !== "statspese");
  }

  const statPrenTopTools = $("#statPrenTopTools");
  if (statPrenTopTools){
    statPrenTopTools.hidden = (page !== "statprenotazioni");
  }

// render on demand
  if (page === "spese") {
    const _nav = navId;
    ensurePeriodData({ showLoader:true })
      .then(()=>{ if (state.navId !== _nav || state.page !== "spese") return; renderSpese(); })
      .catch(e=>toast(e.message));
  }
  if (page === "riepilogo") {
    const _nav = navId;
    ensurePeriodData({ showLoader:true })
      .then(()=>{ if (state.navId !== _nav || state.page !== "riepilogo") return; renderRiepilogo(); })
      .catch(e=>toast(e.message));
  }
  if (page === "grafico") {
    const _nav = navId;
    ensurePeriodData({ showLoader:true })
      .then(()=>{ if (state.navId !== _nav || state.page !== "grafico") return; renderGrafico(); })
      .catch(e=>toast(e.message));
  }
  if (page === "calendario") {
    const _nav = navId;
    // Entrando in Calendario vogliamo SEMPRE dati freschi.
    // 1) invalida lo stato "ready" e bypassa la cache in-memory (ttl) con force:true.
    try{ if (state.calendar) state.calendar.ready = false; }catch(_){ }
    ensureCalendarData({ force:true, showLoader:false })
      .then(()=>{ if (state.navId !== _nav || state.page !== "calendario") return; renderCalendario(); })
      .catch(e=>toast(e.message));
  }
  if (page === "ospiti") {
    // Difesa anti-stato sporco: quando torno alla lista, la scheda ospite NON deve restare in "view"
    // (layout diverso) o con valori vecchi.
    try { enterGuestCreateMode(); } catch (_) {}
    loadOspiti(state.period || {}).catch(e => toast(e.message));
  }
  if (page === "lavanderia") loadLavanderia().catch(e => toast(e.message));

  if (page === "statistiche") {
    try{ closeStatPieModal(); }catch(_){ }
    try{ closeStatSpesePieModal(); }catch(_){ }
    try{ closeStatMensiliPieModal(); }catch(_){ }
  }

  if (page === "statgen") {
    const _nav = navId;
    Promise.all([
      ensurePeriodData({ showLoader:true }),
      loadOspiti({ ...(state.period || {}), force:false }),
    ])
      .then(()=>{ if (state.navId !== _nav || state.page !== "statgen") return; renderStatGen(); })
      .catch(e=>toast(e.message));
  }

  if (page === "statmensili") {
    const _nav = navId;
    Promise.all([
      ensurePeriodData({ showLoader:true }),
      loadOspiti({ ...(state.period || {}), force:false }),
    ])
      .then(()=>{ if (state.navId !== _nav || state.page !== "statmensili") return; renderStatMensili(); })
      .catch(e=>toast(e.message));
  }


  if (page === "statspese") {
    const _nav = navId;
    ensurePeriodData({ showLoader:true })
      .then(()=>{ if (state.navId !== _nav || state.page !== "statspese") return; renderStatSpese(); })
      .catch(e=>toast(e.message));
  }

  if (page === "statprenotazioni") {
    const _nav = navId;
    Promise.all([
      ensurePeriodData({ showLoader:true }),
      loadOspiti({ ...(state.period || {}), force:false }),
    ])
      .then(()=>{ if (state.navId !== _nav || state.page !== "statprenotazioni") return; renderStatPrenotazioni(); })
      .catch(e=>toast(e.message));
  }

  if (page === "orepulizia") { initOrePuliziaPage().catch(e=>toast(e.message)); }


  // dDAE_2.019: fallback visualizzazione Pulizie
  try{
    if (page === "pulizie"){
      const el = document.getElementById("page-pulizie");
      if (el) el.style.display = "block";
    }
  }catch(_){}

}

function setupHeader(){
  const hb = $("#hamburgerBtn");
  if (hb) hb.addEventListener("click", () => { hideLauncher(); showPage("home"); });

  // Back (ore pulizia + calendario)
  const bb = $("#backBtnTop");
  if (bb) bb.addEventListener("click", () => {
    if (state.page === "orepulizia") { showPage("pulizie"); return; }
    if (state.page === "calendario") { showPage("ospiti"); return; }
    showPage("home");
  });
}
function setupHome(){
  bindLauncherDelegation();
  // stampa build
  const build = $("#buildText");
  if (build) build.textContent = `${BUILD_VERSION}`;

  // SPESE: pulsante + (nuova spesa) e pulsante grafico+riepilogo
  const btnAdd = $("#btnAddSpesa");
  if (btnAdd){
    bindFastTap(btnAdd, () => { hideLauncher(); showPage("inserisci"); });
  }
  const btnInsights = $("#btnSpeseInsights");
  if (btnInsights){
    bindFastTap(btnInsights, async () => {
      // toggle vista
      const next = (state.speseView === "insights") ? "list" : "insights";
      if (next === "insights"){
        try{
          await ensurePeriodData({ showLoader:true });
          setSpeseView("insights", { render:true });
        }catch(e){ toast(e.message); }
      } else {
        setSpeseView("list");
      }
    });
  }


  // HOME: tasto Spese apre direttamente la pagina "spese" (senza launcher)
  const openBtn = $("#openLauncher");
  if (openBtn){
    bindFastTap(openBtn, () => { try{ setSpeseView("list"); }catch(_){} hideLauncher(); showPage("spese"); });
  }

  // HOME: icona Ospite va alla pagina ospite
  const goO = $("#goOspite");
  if (goO){
    bindFastTap(goO, () => { hideLauncher(); showPage("ospiti"); });
  }
  // HOME: icona Ospiti va alla pagina elenco ospiti
  const goOs = $("#goOspiti");
  if (goOs){
    bindFastTap(goOs, () => { hideLauncher(); showPage("ospiti"); });
  }


// OSPITI: pulsante + (nuovo ospite)
const btnNewGuestOspiti = $("#btnNewGuestOspiti");
if (btnNewGuestOspiti){
  btnNewGuestOspiti.addEventListener("click", () => { enterGuestCreateMode(); showPage("ospite"); });
}


// OSPITI: topbar — nuovo ospite + calendario
const btnNewGuestTop = $("#btnNewGuestTop");
if (btnNewGuestTop){
  btnNewGuestTop.addEventListener("click", () => { enterGuestCreateMode(); showPage("ospite"); });
}
const goCalendarioTopOspiti = $("#goCalendarioTopOspiti");
if (goCalendarioTopOspiti){
  bindFastTap(goCalendarioTopOspiti, () => showPage("calendario"));
}



  // HOME: icona Impostazioni
  const goImp = $("#goImpostazioni");
  if (goImp){
    bindFastTap(goImp, () => showPage("impostazioni"));
  }

  // HOME: icona Calendario (tap-safe su iOS PWA)
  const goCal = $("#goCalendario");
  if (goCal){
    goCal.disabled = false;
    goCal.removeAttribute("aria-disabled");
    bindFastTap(goCal, () => { hideLauncher(); showPage("calendario"); });
  }

  // HOME: icona Pulizie
  const goPul = $("#goPulizie");
  if (goPul){
    bindFastTap(goPul, () => { hideLauncher(); showPage("pulizie"); });
  }

  // HOME: icona Lavanderia (anche pulsante top)
  const goLav = $("#goLavanderia");
  if (goLav){
    bindFastTap(goLav, () => { hideLauncher(); showPage("lavanderia"); });
  }
  const goLavTop = $("#goLavanderiaTop");
  if (goLavTop){
    bindFastTap(goLavTop, () => { hideLauncher(); showPage("lavanderia"); });
  }

  // HOME: ore pulizie (se presente)
  const goOrePul = $("#goOrePulizia");
  if (goOrePul){
    bindFastTap(goOrePul, () => { hideLauncher(); showPage("orepulizia"); });
  }
  const goOrePulTop = $("#goOrePuliziaTop");
  if (goOrePulTop){
    bindFastTap(goOrePulTop, () => { hideLauncher(); showPage("orepulizia"); });
  }

  // HOME: tassa soggiorno (se presente)
  const goTassa = $("#goTassaSoggiorno");
  if (goTassa){
    bindFastTap(goTassa, async () => {
      hideLauncher();
      try{ await ensureSettingsLoaded({ force:false, showLoader:false }); }catch(_){ }
      showPage("tassa");
      try{ initTassaPage(); }catch(_){ }
    });
  }

  // HOME: Statistiche
  const goG = $("#goStatistiche");
  if (goG){
    bindFastTap(goG, () => { hideLauncher(); showPage("statistiche"); });
  }

  // STATISTICHE: icone
  const s1 = $("#goStatGen");
  if (s1){ bindFastTap(s1, () => { hideLauncher(); showPage("statgen"); }); }
  const s2 = $("#goStatMensili");
  if (s2){ bindFastTap(s2, () => { hideLauncher(); showPage("statmensili"); }); }
  const s3 = $("#goStatSpese");
  if (s3){ bindFastTap(s3, () => { hideLauncher(); showPage("statspese"); }); }
  const s4 = $("#goStatPrenotazioni");
  if (s4){ bindFastTap(s4, () => { hideLauncher(); showPage("statprenotazioni"); }); }

  // STATGEN: topbar tools
  const btnBackStats = $("#btnBackStatistiche");
  if (btnBackStats){ bindFastTap(btnBackStats, () => { closeStatPieModal(); showPage("statistiche"); }); }
  // STATMENSILI: topbar tools
  const btnBackStatsMensili = $("#btnBackStatisticheMensili");
  if (btnBackStatsMensili){ bindFastTap(btnBackStatsMensili, () => { closeStatMensiliPieModal(); showPage("statistiche"); }); }

  const btnPieMensili = $("#btnStatMensiliPie");
  if (btnPieMensili){ bindFastTap(btnPieMensili, () => { openStatMensiliPieModal(); }); }
  const statMensiliPieClose = $("#statMensiliPieClose");
  if (statMensiliPieClose){ bindFastTap(statMensiliPieClose, () => closeStatMensiliPieModal()); }
  const statMensiliPieModal = $("#statMensiliPieModal");
  if (statMensiliPieModal){
    statMensiliPieModal.addEventListener("click", (e)=>{
      if (e.target === statMensiliPieModal) closeStatMensiliPieModal();
    });
  }




  const btnPie = $("#btnStatPie");
  if (btnPie){ bindFastTap(btnPie, () => { openStatPieModal(); }); }
  const statPieClose = $("#statPieClose");
  if (statPieClose){ bindFastTap(statPieClose, () => closeStatPieModal()); }
  const statPieModal = $("#statPieModal");
  if (statPieModal){
    statPieModal.addEventListener("click", (e)=>{
      if (e.target === statPieModal) closeStatPieModal();
    });
  }

  // STATISTICHE: Spese generali topbar tools
  const btnBackStatsSpese = $("#btnBackStatisticheSpese");
  if (btnBackStatsSpese){ bindFastTap(btnBackStatsSpese, () => { closeStatSpesePieModal(); showPage("statistiche"); }); }
  const btnBackStatsPren = $("#btnBackStatistichePrenotazioni");
  if (btnBackStatsPren){ bindFastTap(btnBackStatsPren, () => { showPage("statistiche"); }); }
  const btnPieSpese = $("#btnStatSpesePie");
  if (btnPieSpese){ bindFastTap(btnPieSpese, () => { openStatSpesePieModal(); }); }

  const statSpesePieClose = $("#statSpesePieClose");
  if (statSpesePieClose){ bindFastTap(statSpesePieClose, () => closeStatSpesePieModal()); }
  const statSpesePieModal = $("#statSpesePieModal");
  if (statSpesePieModal){
    statSpesePieModal.addEventListener("click", (e)=>{
      if (e.target === statSpesePieModal) closeStatSpesePieModal();
    });
  }


  // Escape chiude il launcher
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideLauncher();
  });
}


function setupGuestListControls(){
  const sortSel = $("#guestSortBy");
  const dirBtn = $("#guestSortDir");
  const todayBtn = $("#guestToday");
  if (!sortSel) return;

  const savedBy = localStorage.getItem("dDAE_guestSortBy");
  const savedDir = localStorage.getItem("dDAE_guestSortDir");
  state.guestSortBy = savedBy || state.guestSortBy || "arrivo";
  state.guestSortDir = savedDir || state.guestSortDir || "asc";

  try { sortSel.value = state.guestSortBy; } catch(_) {}

  const paintDir = () => {
    if (!dirBtn) return;
    const asc = (state.guestSortDir !== "desc");
    dirBtn.textContent = asc ? "↑" : "↓";
    dirBtn.setAttribute("aria-pressed", asc ? "false" : "true");
  };
  paintDir();
  // Filtro rapido: Oggi (arrivo = oggi)
  const savedToday = localStorage.getItem("dDAE_guestTodayOnly");
  state.guestTodayOnly = (savedToday === "1") ? true : (savedToday === "0") ? false : (state.guestTodayOnly || false);

  const paintToday = () => {
    if (!todayBtn) return;
    todayBtn.classList.toggle("is-active", !!state.guestTodayOnly);
    todayBtn.setAttribute("aria-pressed", state.guestTodayOnly ? "true" : "false");
  };
  paintToday();

  if (todayBtn){
    todayBtn.addEventListener("click", () => {
      state.guestTodayOnly = !state.guestTodayOnly;
      try { localStorage.setItem("dDAE_guestTodayOnly", state.guestTodayOnly ? "1" : "0"); } catch(_){}
      paintToday();
      renderGuestCards();
    });
  }


  sortSel.addEventListener("change", () => {
    state.guestSortBy = sortSel.value;
    try { localStorage.setItem("dDAE_guestSortBy", state.guestSortBy); } catch(_){}
    renderGuestCards();
  });

  if (dirBtn){
    dirBtn.addEventListener("click", () => {
      state.guestSortDir = (state.guestSortDir === "desc") ? "asc" : "desc";
      try { localStorage.setItem("dDAE_guestSortDir", state.guestSortDir); } catch(_){}
      paintDir();
      renderGuestCards();
    });
  }
}

function guestIdOf(g){
  return String(g?.id ?? g?.ID ?? g?.ospite_id ?? g?.ospiteId ?? g?.guest_id ?? g?.guestId ?? "").trim();
}

function parseDateTs(v){
  const s = String(v ?? "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function computeInsertionMap(guests){
  const arr = (guests || []).map((g, idx) => {
    const id = guestIdOf(g);
    const c = g?.created_at ?? g?.createdAt ?? "";
    const t = parseDateTs(c);
    return { id, idx, t };
  });

  arr.sort((a,b) => {
    const at = a.t, bt = b.t;
    if (at != null && bt != null) return at - bt;
    if (at != null) return -1;
    if (bt != null) return 1;
    return a.idx - b.idx;
  });

  const map = {};
  let n = 1;
  for (const x of arr){
    if (!x.id) continue;
    map[x.id] = n++;
  }
  return map;
}

function sortGuestsList(items){
  const by = state.guestSortBy || "arrivo";
  const dir = (state.guestSortDir === "desc") ? -1 : 1;
  const nameKey = (s) => String(s ?? "").trim().toLowerCase();

  const out = items.slice();
  out.sort((a,b) => {
    if (by === "nome") {
      return nameKey(a.nome).localeCompare(nameKey(b.nome), "it") * dir;
    }
    if (by === "inserimento") {
      const aa = Number(a._insNo) || 1e18;
      const bb = Number(b._insNo) || 1e18;
      return (aa - bb) * dir;
    }
    const ta = parseDateTs(a.check_in ?? a.checkIn);
    const tb = parseDateTs(b.check_in ?? b.checkIn);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return (ta - tb) * dir;
  });
  return out;
}

/* PERIOD SYNC */
function setPeriod(from, to){
  state.period = { from, to };

  periodSyncLock += 1;
  try {
    const map = [
      ["#fromDate", "#toDate"],
      ["#fromDate2", "#toDate2"],
      ["#fromDate3", "#toDate3"],
      ["#fromDate4", "#toDate4"],
    ];
    for (const [fSel,tSel] of map){
      const f = $(fSel), t = $(tSel);
      if (f) f.value = from;
      if (t) t.value = to;
    }
  } finally {
    periodSyncLock -= 1;
  }

  const chip = $("#periodChip");
  if (chip && state.page !== "home") chip.textContent = `${from} → ${to}`;
}


async function onPeriodChanged({ showLoader=false } = {}){
  // Quando cambia il periodo, i dati “period-based” vanno considerati obsoleti
  state._dataKey = "";

  // Aggiorna solo ciò che serve (evita chiamate inutili e loader continui)
  if (state.page === "ospiti") {
    await loadOspiti({ ...(state.period || {}), force:true });
    return;
  }
  if (state.page === "calendario") {
    if (state.calendar) state.calendar.ready = false;
    await ensureCalendarData();
    renderCalendario();
    return;
  }
  if (state.page === "spese") {
    await ensurePeriodData({ showLoader });
    // Se siamo nella sotto-vista "grafico+riepilogo", aggiorna anche quella
    if (state.speseView === "insights") {
      renderRiepilogo();
      renderGrafico();
    } else {
      renderSpese();
    }
    return;
  }
  if (state.page === "riepilogo") {
    await ensurePeriodData({ showLoader });
    renderRiepilogo();
    return;
  }
  if (state.page === "grafico") {
    await ensurePeriodData({ showLoader });
    renderGrafico();
    return;
  }
}

/* DATA LOAD */
async function loadMotivazioni(){
  const data = await cachedGet("motivazioni", {}, { showLoader:false, ttlMs: 5*60*1000 });
  state.motivazioni = data;

  const list = $("#motivazioniList");
  if (list) {
    list.innerHTML = "";
    data.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.motivazione;
      list.appendChild(opt);
    });
  }
}


async function load({ showLoader=true } = {}){
  // Prefill rapido da cache locale (aiuta dopo reload PWA)
  if (!state.stanzeRows || !state.stanzeRows.length){
    const hit = __lsGet("stanze");
    if (hit && Array.isArray(hit.data) && hit.data.length){
      try{
        const rows0 = hit.data;
        state.stanzeRows = rows0;
        // ricostruisci indicizzazione
        const map0 = {};
        for (const r of rows0){
          const gid = String(r.ospite_id ?? r.ospiteId ?? r.guest_id ?? r.guestId ?? "").trim();
          const sn = String(r.stanza_num ?? r.stanzaNum ?? r.room_number ?? r.roomNumber ?? r.stanza ?? r.room ?? "").trim();
          if (!gid || !sn) continue;
          const key = `${gid}:${sn}`;
          map0[key] = {
            letto_m: Number(r.letto_m ?? r.lettoM ?? 0) || 0,
            letto_s: Number(r.letto_s ?? r.lettoS ?? 0) || 0,
            culla: Number(r.culla ?? r.crib ?? 0) || 0,
          };
        }
        state.stanzeByKey = map0;
      } catch(_){}
    }
  }
  const data = await cachedGet("stanze", {}, { showLoader, ttlMs: 60*1000 });
  const rows = Array.isArray(data) ? data : [];
  state.stanzeRows = rows;

  // indicizza per ospite_id + stanza_num
  const map = {};
  for (const r of rows){
    const gid = String(r.ospite_id ?? r.ospiteId ?? r.guest_id ?? r.guestId ?? "").trim();
    const sn = String(r.stanza_num ?? r.stanzaNum ?? r.room_number ?? r.roomNumber ?? r.stanza ?? r.room ?? "").trim();
    if (!gid || !sn) continue;
    const key = `${gid}:${sn}`;
    map[key] = {
      letto_m: Number(r.letto_m ?? r.lettoM ?? 0) || 0,
      letto_s: Number(r.letto_s ?? r.lettoS ?? 0) || 0,
      culla: Number(r.culla ?? r.crib ?? 0) || 0,
    };
  }
  state.stanzeByKey = map;
  __lsSet("stanze", rows);
}

async function loadOspiti({ from="", to="", force=false } = {}){
  // Prefill rapido da cache locale (poi refresh in background)
  const lsKey = `ospiti|${from}|${to}`;
  const hit = __lsGet(lsKey);
  if (hit && Array.isArray(hit.data) && hit.data.length){
    state.guests = hit.data;
    // render subito (perceived speed)
    try{ requestAnimationFrame(renderGuestCards); } catch(_){ renderGuestCards(); }
  }

  // ✅ Necessario per mostrare i "pallini letti" stanza-per-stanza nelle schede ospiti
  const p = load({ showLoader:false });
  const hasLocal = !!(hit && Array.isArray(hit.data) && hit.data.length);

  // Se ho già dati locali, aggiorna in background (senza loader e senza bloccare la navigazione)
  const refresh = async () => {
    const data = await cachedGet("ospiti", { from, to }, {
      showLoader: !hasLocal,
      ttlMs: 2*60*1000,
      swrMs: 10*60*1000,
      force,
    });
    return data;
  };

  if (hasLocal && !force) {
    // fire-and-forget
    Promise.all([p, refresh()])
      .then(([ , data ]) => {
        // aggiorna solo se l'utente è ancora nella lista ospiti
        if (state.page !== "ospiti") return;
        state.guests = Array.isArray(data) ? data : [];
        __lsSet(lsKey, state.guests);
        try{ requestAnimationFrame(renderGuestCards); }catch(_){ renderGuestCards(); }
      })
      .catch(() => {});
    return;
  }

  const [ , data ] = await Promise.all([p, refresh()]);
  state.guests = Array.isArray(data) ? data : [];
  __lsSet(lsKey, state.guests);
  renderGuestCards();
}


async function ensurePeriodData({ showLoader=true, force=false } = {}){
  const { from, to } = state.period;
  const key = `${from}|${to}`;

  if (!force && state._dataKey === key && state.report && Array.isArray(state.spese)) {
    return;
  }

  // Prefill immediato da cache locale (perceived speed) — poi refresh SWR
  const lsSpeseKey = `spese|${from}|${to}`;
  const lsReportKey = `report|${from}|${to}`;
  const hitS = !force ? __lsGet(lsSpeseKey) : null;
  const hitR = !force ? __lsGet(lsReportKey) : null;
  const hasLocal = !!((hitS && hitS.data) || (hitR && hitR.data));

  if (!force) {
    if (hitS && Array.isArray(hitS.data)) state.spese = hitS.data;
    if (hitR && hitR.data) state.report = hitR.data;
    if (hasLocal) state._dataKey = key;
  }

  const fetchAll = () => Promise.all([
    cachedGet("report", { from, to }, { showLoader: showLoader && !hasLocal, ttlMs: 2*60*1000, swrMs: 10*60*1000, force }),
    cachedGet("spese", { from, to }, { showLoader: showLoader && !hasLocal, ttlMs: 2*60*1000, swrMs: 10*60*1000, force }),
  ]);

  // Se ho cache locale e non forzo, non bloccare la navigazione: aggiorna in background
  if (hasLocal && !force) {
    fetchAll()
      .then(([report, spese]) => {
        const kNow = `${state.period.from}|${state.period.to}`;
        if (kNow !== key) return;
        state.report = report;
        state.spese = Array.isArray(spese) ? spese : [];
        state._dataKey = key;
        __lsSet(lsReportKey, report);
        __lsSet(lsSpeseKey, state.spese);

        // refresh UI se siamo su pagine che dipendono da questi dati
        try{
          if (state.page === "spese") {
            if (state.speseView === "list") renderSpese();
            else { renderRiepilogo(); renderGrafico(); }
          }
          if (state.page === "statgen") renderStatGen();
          if (state.page === "statmensili") renderStatMensili();
          if (state.page === "statspese") renderStatSpese();
        }catch(_){ }
      })
      .catch(() => {});
    return;
  }

  const [report, spese] = await fetchAll();
  state.report = report;
  state.spese = Array.isArray(spese) ? spese : [];
  state._dataKey = key;
  __lsSet(lsReportKey, report);
  __lsSet(lsSpeseKey, state.spese);
}

// Compat: vecchi call-site
async function loadData({ showLoader=true } = {}){
  return ensurePeriodData({ showLoader });
}


/* 1) INSERISCI */
function resetInserisci(){
  $("#spesaImporto").value = "";
  $("#spesaMotivazione").value = "";
  $("#spesaCategoria").value = "";
  $("#spesaData").value = todayISO();

  // Motivazione: se l'utente scrive una variante già esistente, usa la versione canonica
  const mot = $("#spesaMotivazione");
  if (mot) {
    mot.addEventListener("blur", () => {
      const v = collapseSpaces((mot.value || "").trim());
      if (!v) return;
      const canonical = findCanonicalMotivazione(v);
      if (canonical) mot.value = canonical;
      else mot.value = v; // pulizia spazi multipli
    });
  } // lascia oggi
}


function collapseSpaces(s){
  return String(s || "").replace(/\s+/g, " ");
}

// Normalizza SOLO per confronto (non altera la stringa salvata se già esistente)
function normalizeMotivazioneForCompare(s){
  let x = collapseSpaces(String(s || "").trim()).toLowerCase();
  // rimuove accenti SOLO per confronto
  try {
    x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  return x;
}

function findCanonicalMotivazione(input){
  const needle = normalizeMotivazioneForCompare(input);
  for (const m of (state.motivazioni || [])){
    const val = m?.motivazione ?? "";
    if (normalizeMotivazioneForCompare(val) === needle) return val;
  }
  return null;
}

async function saveSpesa(){
  const dataSpesa = $("#spesaData").value;
  const categoria = $("#spesaCategoria").value;
  const importoLordo = Number($("#spesaImporto").value);
  const motivazione = ($("#spesaMotivazione").value || "").trim();

  if (!isFinite(importoLordo) || importoLordo <= 0) return toast("Importo non valido");
  if (!motivazione) return toast("Motivazione obbligatoria");
  if (!dataSpesa) return toast("Data obbligatoria");
  if (!categoria) return toast("Categoria obbligatoria");

  // se motivazione nuova => salva per futuro
  const canonical = findCanonicalMotivazione(motivazione);
  // Se esiste già (spazi/case/accenti diversi), non salvare duplicati
  if (canonical) {
    $("#spesaMotivazione").value = canonical; // versione canonica
  } else {
    try {
      await api("motivazioni", { method:"POST", body:{ motivazione }, showLoader:false });
      await loadMotivazioni();
    } catch (_) {}
  }

  await api("spese", { method:"POST", body:{ dataSpesa, categoria, motivazione, importoLordo, note: "" } });

  toast("Salvato");
  resetInserisci();

  // aggiorna dati
  try {
    invalidateApiCache("spese|");
    invalidateApiCache("report|");
    await ensurePeriodData({ showLoader:false, force:true });
    if (state.page === "spese") renderSpese();
    if (state.page === "riepilogo") renderRiepilogo();
    if (state.page === "grafico") renderGrafico();
  } catch(_) {}


  // Dopo salvataggio: torna alla pagina Spese
  try { setSpeseView("list"); } catch (_) {}
  try { showPage("spese"); } catch (_) {}

}

/* 2) SPESE */
function renderSpese(){
  const list = document.getElementById("speseList");
  if (!list) return;
  list.innerHTML = "";

  const items = Array.isArray(state.spese) ? state.spese : [];
  if (!items.length){
    list.innerHTML = '<div style="font-size:13px; opacity:.75; padding:8px 2px;">Nessuna spesa nel periodo.</div>';
    return;
  }

  items.forEach(s => {
    const el = document.createElement("div");
    el.className = "item";

    const importo = Number(s.importoLordo || 0);
    const data = formatShortDateIT(s.dataSpesa || s.data || s.data_spesa || "");
    const motivo = escapeHtml((s.motivazione || s.motivo || "").toString());

    el.innerHTML = `
      <div class="item-top">
        <div class="spesa-line" title="${motivo}">
          <span class="spesa-imp">${euro(importo)}</span>
          <span class="spesa-sep">·</span>
          <span class="spesa-date">${data}</span>
          <span class="spesa-sep">·</span>
          <span class="spesa-motivo">${motivo}</span>
        </div>
        <button class="delbtn delbtn-x" type="button" aria-label="Elimina record" data-del="${s.id}">Elimina</button>
      </div>
    `;

    const btn = el.querySelector("[data-del]");
    if (btn){
      btn.addEventListener("click", async () => {
        if (!confirm("Eliminare definitivamente questa spesa?")) return;
        await api("spese", { method:"DELETE", params:{ id: s.id } });
        toast("Spesa eliminata");
        invalidateApiCache("spese|");
        invalidateApiCache("report|");
        await ensurePeriodData({ showLoader:false, force:true });
        renderSpese();
      });
    }

    list.appendChild(el);
  });
}


/* 3) RIEPILOGO */
function renderRiepilogo(){
  const r = state.report;
  if (!r) return;

  $("#kpiTotSpese").textContent = euro(r.totals.importoLordo);
  $("#kpiIvaDetraibile").textContent = euro(r.totals.ivaDetraibile);
  $("#kpiImponibile").textContent = euro(r.totals.imponibile);

  // Lista semplice: 5 righe (categoria + totale lordo)
  const container = $("#byCat");
  if (!container) return;

  const by = r.byCategoria || {};
  const order = ["CONTANTI","TASSA_SOGGIORNO","IVA_22","IVA_10","IVA_4"];

  container.innerHTML = "";
  for (const k of order){
    const o = by[k] || { importoLordo: 0 };
    const row = document.createElement("div");
    row.className = "catitem";
    row.innerHTML = `
      <div class="catitem-left">
        <span class="badge" style="background:${hexToRgba(COLORS[k] || "#d8bd97", 0.20)}">${categoriaLabel(k)}</span>
        <div class="catitem-name">Totale</div>
      </div>
      <div class="catitem-total">${euro(o.importoLordo)}</div>
    `;
    container.appendChild(row);
  }
}

/* 4) GRAFICO */
function renderGrafico(){
  const r = state.report;
  if (!r) return;

  const by = r.byCategoria || {};
  const order = ["CONTANTI","TASSA_SOGGIORNO","IVA_22","IVA_10","IVA_4"];
  const values = order.map(k => Number(by[k]?.importoLordo || 0));
  const total = values.reduce((a,b)=>a+b,0);

  drawPie("pieCanvas", order.map((k,i)=>({
    key: k,
    label: categoriaLabel(k),
    value: values[i],
    color: COLORS[k] || "#999999"
  })));

  const leg = $("#pieLegend");
  if (!leg) return;
  leg.innerHTML = "";

  order.forEach((k,i) => {
    const v = values[i];
    const pct = total > 0 ? (v/total*100) : 0;
    const row = document.createElement("div");
    row.className = "legrow";
    row.innerHTML = `
      <div class="legleft">
        <div class="dot" style="background:${COLORS[k] || "#999"}"></div>
        <div class="legname">${categoriaLabel(k)}</div>
      </div>
      <div class="legright">${pct.toFixed(1)}% · ${euro(v)}</div>
    `;
    leg.appendChild(row);
  });
}

/* PIE DRAW (no librerie) */
function drawPie(canvasId, slices){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const cssSize = Math.min(320, Math.floor(window.innerWidth * 0.78));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssSize + "px";
  canvas.style.height = cssSize + "px";
  canvas.width = Math.floor(cssSize * dpr);
  canvas.height = Math.floor(cssSize * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssSize,cssSize);

  const total = slices.reduce((a,s)=>a+Math.max(0,Number(s.value||0)),0);
  const cx = cssSize/2, cy = cssSize/2;
  const r = cssSize/2 - 10;

  // Glass ring background
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.stroke();

  let ang = -Math.PI/2;
  if (total <= 0){
    ctx.beginPath();
    ctx.arc(cx, cy, r-8, 0, Math.PI*2);
    ctx.fillStyle = "rgba(43,124,180,0.10)";
    ctx.fill();
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.font = "600 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Nessun dato", cx, cy+4);
    return;
  }

  slices.forEach(s => {
    const v = Math.max(0, Number(s.value||0));
    const a = (v/total) * Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r-8,ang,ang+a);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ang += a;
  });

  // inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, r*0.58, 0, Math.PI*2);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // center label
  ctx.fillStyle = "rgba(15,23,42,0.75)";
  ctx.font = "900 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Totale", cx, cy-4);
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.font = "950 14px system-ui";
  ctx.fillText(euro(total), cx, cy+14);
}

/* Helpers */
function hexToRgba(hex, a){
  const h = (hex || "").replace("#","");
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

// =========================
// STATISTICHE (dDAE_2.019)
// =========================

function computeStatGen(){
  const guests = Array.isArray(state.guests) ? state.guests : [];
  const report = state.report || null;

  const money = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v).trim();
    if (!s) return 0;
    // Normalizza numeri tipo "1.234,56" o "1234,56"
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };

  // Fatturato totale = somma di tutte le voci "importo prenotazione"
  let fatturato = 0;

  // Giacenza in cassa = somma di tutti gli importi "acconto + saldo"
  let giacenza = 0;

  // (Restano utili per le righe con/senza ricevuta)
  let conRicevuta = 0;
  let senzaRicevuta = 0;

  for (const g of guests){
    const pren = money(g?.importo_prenotazione ?? g?.importo_prenota ?? g?.importoPrenotazione ?? g?.importoPrenota ?? 0);
    fatturato += pren;

    const dep = money(g?.acconto_importo ?? g?.accontoImporto ?? 0);
    const saldo = money(g?.saldo_pagato ?? g?.saldoPagato ?? g?.saldo ?? 0);

    giacenza += (dep + saldo);

    // receipt flags
    const depRec = truthy(g?.acconto_ricevuta ?? g?.accontoRicevuta ?? g?.ricevuta_acconto ?? g?.ricevutaAcconto ?? g?.acconto_ricevutain);
    const saldoRec = truthy(g?.saldo_ricevuta ?? g?.saldoRicevuta ?? g?.ricevuta_saldo ?? g?.ricevutaSaldo ?? g?.saldo_ricevutain);

    if (dep > 0){
      if (depRec) conRicevuta += dep;
      else senzaRicevuta += dep;
    }
    if (saldo > 0){
      if (saldoRec) conRicevuta += saldo;
      else senzaRicevuta += saldo;
    }
  }

  const speseTot = money(report?.totals?.importoLordo ?? 0);

  // IVA da versare = (10% del fatturato alloggi) - (somma IVA di tutte le spese al 4/10/22)
  let ivaSpese = money(report?.totals?.iva ?? 0);
  if (!isFinite(ivaSpese) || ivaSpese === 0){
    ivaSpese = money(report?.totals?.ivaDetraibile ?? 0);
  }

  if (!isFinite(ivaSpese) || ivaSpese === 0){
    try{
      const items = Array.isArray(state.spese) ? state.spese : [];
      let sum = 0;
      for (const s of items){
        // Se c'e' gia' un campo iva, usa quello
        const ivaField = money(s?.iva ?? s?.IVA ?? 0);
        if (ivaField > 0){
          sum += ivaField;
          continue;
        }

        const lordo = money(s?.importoLordo ?? s?.lordo ?? 0);
        if (!isFinite(lordo) || lordo <= 0) continue;

        const catRaw = (s?.categoria ?? s?.cat ?? "").toString().trim().toLowerCase();
        let rate = 0;
        if (catRaw.includes("iva")) {
          if (catRaw.includes("22")) rate = 22;
          else if (catRaw.includes("10")) rate = 10;
          else if (catRaw.includes("4")) rate = 4;
        } else {
          const n = parseFloat(String(s?.aliquotaIva ?? s?.aliquota_iva ?? "").replace(",", "."));
          if (!isNaN(n)) {
            if (n >= 21.5) rate = 22;
            else if (n >= 9.5 && n < 11.5) rate = 10;
            else if (n >= 3.5 && n < 5.5) rate = 4;
          }
        }

        if (rate > 0){
          const imponibile = lordo / (1 + rate/100);
          const iva = lordo - imponibile;
          if (isFinite(iva)) sum += iva;
        }
      }
      if (sum > 0) ivaSpese = sum;
    }catch(_){ }
  }

  const ivaDaVersare = (fatturato * 0.10) - (money(ivaSpese) || 0);
  const guadagno = fatturato - speseTot;

  return {
    fatturatoTotale: fatturato,
    speseTotali: speseTot,
    senzaRicevuta,
    conRicevuta,
    ivaDaVersare,
    guadagnoTotale: guadagno,
    giacenzaCassa: giacenza,
  };
}

function renderStatGen(){
  const s = computeStatGen();
  state.statGen = s;

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = euro(Number(v || 0));
  };

  set("sgFatturato", s.fatturatoTotale);
  set("sgSpese", s.speseTotali);
  set("sgNoRicevuta", s.senzaRicevuta);
  set("sgRicevuta", s.conRicevuta);
  set("sgIva", s.ivaDaVersare);
  set("sgGuadagno", s.guadagnoTotale);
  set("sgCassa", s.giacenzaCassa);
}



// ===== Statistiche: Fatturati mensili =====
function __hslToHex(h, s, l){
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2*l - 1)) * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));

  let r1 = 0, g1 = 0, b1 = 0;
  if (0 <= hh && hh < 1){ r1 = c; g1 = x; b1 = 0; }
  else if (1 <= hh && hh < 2){ r1 = x; g1 = c; b1 = 0; }
  else if (2 <= hh && hh < 3){ r1 = 0; g1 = c; b1 = x; }
  else if (3 <= hh && hh < 4){ r1 = 0; g1 = x; b1 = c; }
  else if (4 <= hh && hh < 5){ r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  const m = l - c/2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  const toHex = (n) => {
    const v = Math.max(0, Math.min(255, n|0));
    return v.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function __mensiliPalette12(){
  if (__mensiliPalette12._cache) return __mensiliPalette12._cache;
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const pick = (name, fallback) => {
    try{
      const v = (cs.getPropertyValue(name) || "").trim();
      return v || fallback;
    }catch(_){ return fallback; }
  };

  // Palette coerente con l'app (CSS variables in :root)
  const base = [
    pick("--p1", "#2B7CB4"),
    pick("--p2", "#4D9CC5"),
    pick("--p3", "#6FB7D6"),
    pick("--p4", "#96BFC7"),
    pick("--p5", "#BFBEA9"),
    pick("--p6", "#D6B286"),
    pick("--p7", "#CF9458"),
    pick("--p8", "#C9772B"),
  ];

  const out = [];
  for (let i = 0; i < 12; i++) out.push(base[i % base.length]);
  __mensiliPalette12._cache = out;
  return out;
}

const __MONTHS_IT = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"
];

function computeStatMensili(){
  const guests = Array.isArray(state.guests) ? state.guests : [];
  const byMonth = new Array(12).fill(0);

  const money = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v).trim();
    if (!s) return 0;
    // Normalizza numeri tipo "1.234,56" o "1234,56"
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };

  for (const gg of guests){
    let iso = "";
    try{
      if (typeof __parseDateFlexibleToISO === "function"){
        iso = __parseDateFlexibleToISO(gg?.check_in ?? gg?.checkIn ?? gg?.arrivo ?? gg?.data_arrivo ?? gg?.checkin ?? "");
      }
    }catch(_){ iso = ""; }

    if (!iso){
      // fallback: prova check-out se manca check-in
      try{
        if (typeof __parseDateFlexibleToISO === "function"){
          iso = __parseDateFlexibleToISO(gg?.check_out ?? gg?.checkOut ?? gg?.partenza ?? gg?.data_partenza ?? "");
        }
      }catch(_){ iso = ""; }
    }

    if (!iso || !/^(\d{4})-(\d{2})-(\d{2})$/.test(iso)) continue;
    const mm = parseInt(iso.slice(5,7), 10);
    if (!Number.isFinite(mm) || mm < 1 || mm > 12) continue;

    // Fatturati mensili = somma di tutte le voci "importo prenotazione" (stessa regola del fatturato totale)
    const pren = money(gg?.importo_prenotazione ?? gg?.importo_prenota ?? gg?.importoPrenotazione ?? gg?.importoPrenota ?? 0);
    if (!isFinite(pren) || pren === 0) continue;

    byMonth[mm - 1] += pren;
  }

  return { byMonth };
}

function renderStatMensili(){
  const wrap = document.getElementById("smList");
  if (!wrap) return;

  const s = computeStatMensili();
  state.statMensili = s;

  const months = s.byMonth || new Array(12).fill(0);
  const max = Math.max(0, ...months.map(v => Number(v || 0)));
  const colors = __mensiliPalette12();

  wrap.innerHTML = "";

  const fills = [];
  for (let i = 0; i < 12; i++){
    const val = Number(months[i] || 0) || 0;
    const pct = (max > 0) ? Math.max(0, Math.min(100, (val / max) * 100)) : 0;

    const row = document.createElement("div");
    row.className = "month-row";
    row.style.setProperty("--mcol", colors[i] || "#ff3b30");
    row.innerHTML = `
      <div class="month-head">
        <div class="month-name">${escapeHtml(__MONTHS_IT[i] || ("Mese " + (i+1)))}</div>
        <div class="month-val">${euro(val)}</div>
      </div>
      <div class="month-bar">
        <div class="month-fill" style="width:0%"></div>
      </div>
    `;

    wrap.appendChild(row);
    const fill = row.querySelector(".month-fill");
    if (fill) fills.push({ el: fill, pct });
  }

  // animazione riempimento
  requestAnimationFrame(() => {
    for (const f of fills){
      try{ f.el.style.width = `${f.pct.toFixed(2)}%`; }catch(_){ }
    }
  });
}


// ===== Statistiche: Prenotazioni (booking compilato vs non compilato) =====
function computeStatPrenotazioni(){
  const guests = Array.isArray(state.guests) ? state.guests : [];

  const money = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v).trim();
    if (!s) return 0;
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };

  let withBooking = 0;
  let withoutBooking = 0;

  for (const g of guests){
    const pren = money(g?.importo_prenotazione ?? g?.importo_prenota ?? g?.importoPrenotazione ?? g?.importoPrenota ?? 0);
    const rawBooking = (g?.importo_booking ?? g?.importoBooking ?? g?.booking ?? null);
    const bookingVal = money(rawBooking);
    const bookingFilled = bookingVal > 0;
    if (bookingFilled) withBooking += pren;
    else withoutBooking += pren;
  }

  return { withBooking, withoutBooking };
}

function renderStatPrenotazioni(){
  const s = computeStatPrenotazioni();
  state.statPrenotazioni = s;

  const slices = [
    { label: "Con importo booking", value: s.withBooking, color: "#2b7cb4" },
    { label: "Senza importo booking", value: s.withoutBooking, color: "#cf9458" },
  ];

  drawPie("statPrenCanvas", slices);

  const leg = document.getElementById("statPrenLegend");
  if (leg){
    const total = slices.reduce((a,x)=>a+Math.max(0,Number(x.value||0)),0);
    leg.innerHTML = "";
    slices.forEach((sl)=>{
      const v = Math.max(0, Number(sl.value || 0));
      const pct = total > 0 ? (v/total*100) : 0;
      const row = document.createElement("div");
      row.className = "legrow";
      row.innerHTML = `
        <div class="legleft">
          <div class="dot" style="background:${sl.color}"></div>
          <div class="legname">${escapeHtml(sl.label)}</div>
        </div>
        <div class="legright">${pct.toFixed(1)}% · ${euro(v)}</div>
      `;
      leg.appendChild(row);
    });
  }
}
function openStatPieModal(){
  try{
    if (!state.statGen) state.statGen = computeStatGen();
  }catch(_){ state.statGen = state.statGen || null; }

  const m = document.getElementById("statPieModal");
  if (!m) return;
  m.hidden = false;
  m.setAttribute("aria-hidden", "false");

  const s = state.statGen || computeStatGen();
  const slices = [
    { label: "Fatturato totale", value: s.fatturatoTotale, color: "#2b7cb4" },
    { label: "Spese totali", value: s.speseTotali, color: "#4d9cc5" },
    { label: "Importo senza ricevuta", value: s.noRicevuta, color: "#6fb7d6" },
    { label: "Importo con ricevuta", value: s.ricevuta, color: "#96bfc7" },
    { label: "IVA da versare", value: s.ivaDaVersare, color: "#bfbea9" },
    { label: "Guadagno totale", value: s.guadagnoTotale, color: "#cf9458" },
    { label: "Giacenza in cassa", value: s.cassa, color: "#c9772b" },
  ];

  drawPie("statPieCanvas", slices);

  const leg = document.getElementById("statPieLegend");
  if (leg){
    const total = slices.reduce((a,x)=>a+Math.max(0,Number(x.value||0)),0);
    leg.innerHTML = "";
    slices.forEach((sl)=>{
      const v = Math.max(0, Number(sl.value || 0));
      const pct = total > 0 ? (v/total*100) : 0;
      const row = document.createElement("div");
      row.className = "legrow";
      row.innerHTML = `
        <div class="legleft">
          <div class="dot" style="background:${sl.color}"></div>
          <div class="legname">${escapeHtml(sl.label)}</div>
        </div>
        <div class="legright">${pct.toFixed(1)}% · ${euro(v)}</div>
      `;
      leg.appendChild(row);
    });
  }
}

function closeStatPieModal(){
  const m = document.getElementById("statPieModal");
  if (!m) return;
  m.hidden = true;
  m.setAttribute("aria-hidden", "true");
}



function openStatMensiliPieModal(){
  try{
    if (!state.statMensili) state.statMensili = computeStatMensili();
  }catch(_){ state.statMensili = state.statMensili || null; }

  const m = document.getElementById("statMensiliPieModal");
  if (!m) return;
  m.hidden = false;
  m.setAttribute("aria-hidden", "false");

  const s = state.statMensili || computeStatMensili();
  const months = (s.byMonth && Array.isArray(s.byMonth)) ? s.byMonth : new Array(12).fill(0);
  const colors = __mensiliPalette12();
  const slices = months.map((v,i)=>({
    label: __MONTHS_IT[i] || ("Mese " + (i+1)),
    value: Number(v || 0) || 0,
    color: colors[i] || "#2b7cb4"
  }));

  drawPie("statMensiliPieCanvas", slices);

  const leg = document.getElementById("statMensiliPieLegend");
  if (leg){
    leg.innerHTML = "";
    leg.style.display = "none";
    leg.setAttribute("aria-hidden", "true");
  }
}

function closeStatMensiliPieModal(){
  const m = document.getElementById("statMensiliPieModal");
  if (!m) return;
  m.hidden = true;
  m.setAttribute("aria-hidden", "true");
}

function computeStatSpese(){
  const r = state.report || null;
  const by = (r && r.byCategoria) ? r.byCategoria : null;

  const get = (k) => {
    try{ return Number(by?.[k]?.importoLordo || 0) || 0; }catch(_){ return 0; }
  };

  let contanti = get("CONTANTI");
  let tassa = get("TASSA_SOGGIORNO");
  let iva22 = get("IVA_22");
  let iva10 = get("IVA_10");
  let iva4 = get("IVA_4");

  // Fallback: se il report non ha la breakdown, aggrega dalle spese
  if (!by){
    const items = Array.isArray(state.spese) ? state.spese : [];
    const acc = { CONTANTI:0, TASSA_SOGGIORNO:0, IVA_22:0, IVA_10:0, IVA_4:0 };

    for (const s of items){
      const lordo = Number(s?.importoLordo || 0) || 0;
      if (!isFinite(lordo) || lordo === 0) continue;

      const catRaw = (s?.categoria ?? s?.cat ?? "").toString().trim().toLowerCase();

      if (catRaw.includes("contant")) { acc.CONTANTI += lordo; continue; }
      if (catRaw.includes("tassa") && catRaw.includes("sogg")) { acc.TASSA_SOGGIORNO += lordo; continue; }

      if (catRaw.includes("iva")){
        if (catRaw.includes("22")) { acc.IVA_22 += lordo; continue; }
        if (catRaw.includes("10")) { acc.IVA_10 += lordo; continue; }
        if (catRaw.includes("4")) { acc.IVA_4 += lordo; continue; }
      }

      // fallback su aliquota numerica
      const n = parseFloat(String(s?.aliquotaIva ?? s?.aliquota_iva ?? "").replace(",","."));
      if (!isNaN(n)){
        if (n >= 21.5) acc.IVA_22 += lordo;
        else if (n >= 9.5 && n < 11.5) acc.IVA_10 += lordo;
        else if (n >= 3.5 && n < 5.5) acc.IVA_4 += lordo;
      }
    }

    contanti = acc.CONTANTI;
    tassa = acc.TASSA_SOGGIORNO;
    iva22 = acc.IVA_22;
    iva10 = acc.IVA_10;
    iva4 = acc.IVA_4;
  }

  return {
    contanti,
    tassaSoggiorno: tassa,
    iva22,
    iva10,
    iva4,
  };
}

function renderStatSpese(){
  const s = computeStatSpese();
  state.statSpese = s;

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = euro(Number(v || 0));
  };

  set("ssContanti", s.contanti);
  set("ssTassa", s.tassaSoggiorno);
  set("ssIva22", s.iva22);
  set("ssIva10", s.iva10);
  set("ssIva4", s.iva4);
}

function openStatSpesePieModal(){
  try{
    if (!state.statSpese) state.statSpese = computeStatSpese();
  }catch(_){ state.statSpese = state.statSpese || null; }

  const m = document.getElementById("statSpesePieModal");
  if (!m) return;
  m.hidden = false;
  m.setAttribute("aria-hidden", "false");

  const s = state.statSpese || computeStatSpese();
  const slices = [
    { key:"CONTANTI", label: categoriaLabel("CONTANTI"), value:s.contanti, color:(COLORS.CONTANTI || "#2b7cb4") },
    { key:"TASSA_SOGGIORNO", label: categoriaLabel("TASSA_SOGGIORNO"), value:s.tassaSoggiorno, color:(COLORS.TASSA_SOGGIORNO || "#d8bd97") },
    { key:"IVA_22", label: categoriaLabel("IVA_22"), value:s.iva22, color:(COLORS.IVA_22 || "#c9772b") },
    { key:"IVA_10", label: categoriaLabel("IVA_10"), value:s.iva10, color:(COLORS.IVA_10 || "#7ac0db") },
    { key:"IVA_4", label: categoriaLabel("IVA_4"), value:s.iva4, color:(COLORS.IVA_4 || "#1f2937") },
  ];

  drawPie("statSpesePieCanvas", slices);

  const leg = document.getElementById("statSpesePieLegend");
  if (leg){
    const total = slices.reduce((a,x)=>a+Math.max(0,Number(x.value||0)),0);
    leg.innerHTML = "";
    slices.forEach((sl)=>{
      const v = Math.max(0, Number(sl.value || 0));
      const pct = total > 0 ? (v/total*100) : 0;
      const row = document.createElement("div");
      row.className = "legrow";
      row.innerHTML = `
        <div class="legleft">
          <div class="dot" style="background:${sl.color}"></div>
          <div class="legname">${escapeHtml(sl.label)}</div>
        </div>
        <div class="legright">${pct.toFixed(1)}% · ${euro(v)}</div>
      `;
      leg.appendChild(row);
    });
  }
}

function closeStatSpesePieModal(){
  const m = document.getElementById("statSpesePieModal");
  if (!m) return;
  m.hidden = true;
  m.setAttribute("aria-hidden", "true");
}

/* Wire buttons */


function bindPeriodAuto(fromSel, toSel){
  const fromEl = document.querySelector(fromSel);
  const toEl = document.querySelector(toSel);
  if (!fromEl || !toEl) return;

  let timer = null;

  const schedule = () => {
    if (periodSyncLock > 0) return; // update programmatici: ignora
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (periodSyncLock > 0) return;
      const from = fromEl.value;
      const to = toEl.value;

      if (!from || !to) return;
      if (from > to) {
        toast("Periodo non valido");
        return;
      }

      setPresetValue("custom");
      setPeriod(from, to);

      try { await onPeriodChanged({ showLoader:false }); } catch (e) { toast(e.message); }
    }, 220);
  };

  fromEl.addEventListener("change", schedule);
  toEl.addEventListener("change", schedule);
}

function bindPeriodAutoGuests(fromSel, toSel){
  const fromEl = document.querySelector(fromSel);
  const toEl = document.querySelector(toSel);
  if (!fromEl || !toEl) return;

  let timer = null;

  const schedule = () => {
    if (periodSyncLock > 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (periodSyncLock > 0) return;
      const from = fromEl.value;
      const to = toEl.value;
      if (!from || !to) return;

      // valida
      if (from > to){
        toast("Periodo non valido");
        return;
      }

      setPresetValue("custom");
      setPeriod(from, to);

      try { await loadOspiti({ from, to }); } catch (e) { toast(e.message); }
    }, 220);
  };

  fromEl.addEventListener("change", schedule);
  toEl.addEventListener("change", schedule);
}






function updateGuestRemaining(){
  const out = document.getElementById("guestRemaining");
  if (!out) return;

  const totalEl = document.getElementById("guestTotal");
  const depEl = document.getElementById("guestDeposit");
  const saldoEl = document.getElementById("guestSaldo");

  const totalStr = (totalEl?.value ?? "");
  const depStr = (depEl?.value ?? "");
  const saldoStr = (saldoEl?.value ?? "");

  const anyFilled = [totalStr, depStr, saldoStr].some(s => String(s).trim().length > 0);
  if (!anyFilled) {
    out.value = "";
    try { refreshFloatingLabels(); } catch (_) {}
    return;
  }

  const total = parseFloat(totalStr || "0") || 0;
  const deposit = parseFloat(depStr || "0") || 0;
  const saldo = parseFloat(saldoStr || "0") || 0;
  const remaining = total - deposit - saldo;

  out.value = (isFinite(remaining) ? remaining.toFixed(2) : "");
  try { refreshFloatingLabels(); } catch (_) {}
}

function updateGuestPriceVisibility(){
  try{
    const hide = (String(state.guestMode || '').toLowerCase() === 'create' && !!state.guestCreateFromGroup);

    // Campi prezzi: nascondi l'intera riga/campo
    ['guestTotal','guestBooking','guestDeposit','guestSaldo'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const field = el.closest('.field');
      if (field) field.hidden = hide;
    });

    // Rimanenza: in create-from-group nascondi l'intera riga (niente pillole registrazioni)
    const rem = document.getElementById('guestRemaining');
    if (rem){
      const row = rem.closest('.field.two-col.payment-row');
      if (row) row.hidden = hide;
      else {
        const sub = rem.closest('.subfield');
        if (sub) sub.hidden = hide;
      }
    }

    // Multi prenotazioni: quando si crea un nuovo gruppo dentro una prenotazione esistente,
    // non mostrare le pillole (Acconto/Saldo/Registrazioni).
    ['depositType','saldoType','regTags'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const row = el.closest('.field.two-col.payment-row');
      if (row) row.hidden = hide;
    });
  }catch(_){ }
}


function enterGuestCreateMode(){
  setGuestFormViewOnly(false);

  state.guestViewItem = null;

  // Multi prenotazioni: quando si crea da un gruppo esistente, possiamo nascondere i prezzi
  state.guestCreateFromGroup = false;

  // Multi prenotazioni: reset contesto
  state.guestGroupBookings = null;
  state.guestGroupActiveId = null;
  state.guestGroupKey = null;
  try{ clearGuestMulti(); }catch(_){ }

  state.guestMode = "create";
  try{ updateGuestFormModeClass(); }catch(_){ }
  state.guestEditId = null;
  state.guestEditCreatedAt = null;

  const title = document.getElementById("ospiteFormTitle");
  if (title) title.textContent = "Nuovo ospite";
  const btn = document.getElementById("createGuestCard");
  if (btn) btn.textContent = "Crea ospite";

  // reset fields
  const fields = ["guestName","guestAdults","guestKidsU10","guestCheckOut","guestTotal","guestBooking","guestDeposit","guestSaldo","guestRemaining"];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  try { updateGuestRemaining(); } catch (_) {}

  const ci = document.getElementById("guestCheckIn");
  if (ci) ci.value = todayISO();

  setMarriage(false);
  state.guestRooms = state.guestRooms || new Set();
  state.guestRooms.clear();
  state.lettiPerStanza = {};
  state.bedsDirty = false;
  state.stanzeSnapshotOriginal = "";

  // Pagamenti (pillole): default contanti + ricevuta OFF
  state.guestDepositType = "contante";
  state.guestSaldoType = "contante";
  state.guestDepositReceipt = false;
  state.guestSaldoReceipt = false;

  setPayType("depositType", state.guestDepositType);
  setPayType("saldoType", state.guestSaldoType);
  setPayReceipt("depositType", state.guestDepositReceipt);
  setPayReceipt("saldoType", state.guestSaldoReceipt);


  // Registrazioni (PS/ISTAT): default OFF
  state.guestPSRegistered = false;
  state.guestISTATRegistered = false;
  setRegFlags("regTags", state.guestPSRegistered, state.guestISTATRegistered);
  // refresh rooms UI if present
  try {
    document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
      btn.classList.remove("selected");
      btn.setAttribute("aria-pressed", "false");
    });
  } catch (_) {}
  try { updateOspiteHdActions(); } catch (_) {}


  try { updateGuestPriceVisibility(); } catch (_) {}

  // (Create mode) nulla da fare sulle stanze: la disponibilita' si aggiorna quando l'utente inserisce le date.
}

function enterGuestEditMode(ospite){
  setGuestFormViewOnly(false);

  state.guestCreateFromGroup = false;

  state.guestViewItem = null;

  // ✅ FIX dDAE: evita "leak" delle stanze tra prenotazioni multiple (multi booking).
  // Quando si passa da un gruppo all'altro, se il nuovo record non ha 'stanze' valorizzate,
  // lo stato precedente poteva rimanere e finire dentro il nuovo salvataggio.
  try {
    state.guestRooms = state.guestRooms || new Set();
    state.guestRooms.clear();
    state.lettiPerStanza = {};
    state.bedsDirty = false;
    state.stanzeSnapshotOriginal = "";
    document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
      if (btn.id === "roomMarriage") return;
      btn.classList.remove("selected");
      btn.setAttribute("aria-pressed", "false");
    });
  } catch (_) {}

  state.guestMode = "edit";
  try{ updateGuestFormModeClass(); }catch(_){ }
  state.guestEditId = ospite?.id ?? null;
  state.guestEditCreatedAt = (ospite?.created_at ?? ospite?.createdAt ?? null);

  const title = document.getElementById("ospiteFormTitle");
  if (title) title.textContent = "Modifica ospite";
  const btn = document.getElementById("createGuestCard");
  if (btn) btn.textContent = "Salva modifiche";

  document.getElementById("guestName").value = ospite.nome || ospite.name || "";
  document.getElementById("guestAdults").value = ospite.adulti ?? ospite.adults ?? 0;
  document.getElementById("guestKidsU10").value = ospite.bambini_u10 ?? ospite.kidsU10 ?? 0;
  document.getElementById("guestCheckIn").value = formatISODateLocal(ospite.check_in || ospite.checkIn || "") || "";
  document.getElementById("guestCheckOut").value = formatISODateLocal(ospite.check_out || ospite.checkOut || "") || "";
  document.getElementById("guestTotal").value = ospite.importo_prenotazione ?? ospite.total ?? 0;
  document.getElementById("guestBooking").value = ospite.importo_booking ?? ospite.booking ?? 0;
  document.getElementById("guestDeposit").value = ospite.acconto_importo ?? ospite.deposit ?? 0;
  document.getElementById("guestSaldo").value = ospite.saldo_pagato ?? ospite.saldoPagato ?? ospite.saldo ?? 0;

  // matrimonio
  const mEl = document.getElementById("guestMarriage");
  if (mEl) mEl.checked = !!(ospite.matrimonio);
  refreshFloatingLabels();
  try { updateGuestRemaining(); } catch (_) {}


  // deposit type (se disponibile)
  const dt = ospite.acconto_tipo || ospite.depositType || "contante";
  state.guestDepositType = dt;
  setPayType("depositType", dt);

  const st = ospite.saldo_tipo || ospite.saldoTipo || "contante";
  state.guestSaldoType = st;
  setPayType("saldoType", st);

  // ricevuta fiscale (toggle indipendente)
  const depRec = truthy(ospite.acconto_ricevuta ?? ospite.accontoRicevuta ?? ospite.ricevuta_acconto ?? ospite.ricevutaAcconto ?? ospite.acconto_ricevutain);
  const saldoRec = truthy(ospite.saldo_ricevuta ?? ospite.saldoRicevuta ?? ospite.ricevuta_saldo ?? ospite.ricevutaSaldo ?? ospite.saldo_ricevutain);
  state.guestDepositReceipt = depRec;
  state.guestSaldoReceipt = saldoRec;
  setPayReceipt("depositType", depRec);
  setPayReceipt("saldoType", saldoRec);



  // registrazioni PS/ISTAT
  const psReg = truthy(ospite.ps_registrato ?? ospite.psRegistrato);
  const istatReg = truthy(ospite.istat_registrato ?? ospite.istatRegistrato);
  state.guestPSRegistered = psReg;
  state.guestISTATRegistered = istatReg;
  setRegFlags("regTags", psReg, istatReg);
  // stanze: in lettura possono arrivare in vari formati (legacy, JSON, date-convertite da Sheets)
  try {
    const roomsArr = _parseRoomsArr(ospite?.stanze);
    if (roomsArr.length){
      state.guestRooms = new Set(roomsArr);
      document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
        const n = parseInt(btn.getAttribute("data-room"), 10);
        const on = state.guestRooms.has(n);
        btn.classList.toggle("selected", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  } catch (_) {}

  // --- FIX A+B (dDAE): preserva la configurazione letti esistente e non riscrivere "stanze" se non è cambiata ---
  try {
    state.bedsDirty = false;

    // Ricostruisci lettiPerStanza dai dati già salvati sul foglio "stanze" (state.stanzeByKey)
    const gid = String(guestIdOf(ospite) || ospite?.id || "").trim();
    const next = {};
    const roomsNow = Array.from(state.guestRooms || []).map(n=>parseInt(n,10)).filter(n=>isFinite(n));
    for (const rn of roomsNow){
      const key = `${gid}:${String(rn)}`;
      const d = (state.stanzeByKey && state.stanzeByKey[key]) ? state.stanzeByKey[key] : {};
      next[String(rn)] = {
        matrimoniale: !!(d.letto_m),
        singoli: parseInt(d.letto_s || 0, 10) || 0,
        culla: !!(d.culla),
        note: ""
      };
    }
    state.lettiPerStanza = next;

    // Snapshot originale per evitare riscritture inutili su salvataggio
    state.stanzeSnapshotOriginal = JSON.stringify(buildArrayFromState());
  } catch (_) {}

  try { updateOspiteHdActions(); } catch (_) {}

  // ✅ FIX dDAE: entrando in modifica con date gia' valorizzate, ricalcola subito disponibilita' stanze.
  // In iOS/Safari PWA gli handler input/change dei campi date possono non partire finche' l'utente non li tocca.
  // refreshRoomsAvailability/renderRooms sono definiti in setupOspite: li esponiamo su window e li richiamiamo qui.
  try {
    state._roomsAvailKey = "";
    const run = () => {
      try { window.__ddae_renderRooms && window.__ddae_renderRooms(); } catch (_) {}
      try { window.__ddae_refreshRoomsAvailability && window.__ddae_refreshRoomsAvailability(); } catch (_) {}
    };
    setTimeout(run, 50);
    setTimeout(run, 180);
  } catch (_) {}

  // Multi prenotazioni: in modifica mostra sempre il riquadro (anche se singolo) + tasto +
  try{
    // Se non abbiamo contesto gruppo, ricostruiscilo dal dataset corrente
    if (!Array.isArray(state.guestGroupBookings) || !state.guestGroupBookings.length){
      const items = Array.isArray(state.ospiti) && state.ospiti.length ? state.ospiti : (Array.isArray(state.guests) ? state.guests : []);
      const groups = groupGuestsByName(items || []);
      const nk = normalizeGuestNameKey(ospite?.nome ?? ospite?.name ?? "");
      const g = nk ? groups.find(x => String(x.key) === nk) : null;
      if (g && Array.isArray(g.bookings) && g.bookings.length){
        state.guestGroupBookings = g.bookings;
        state.guestGroupKey = g.key;
      } else {
        state.guestGroupBookings = [ospite];
        state.guestGroupKey = nk || null;
      }
    } else if (!state.guestGroupKey){
      const nk = normalizeGuestNameKey(ospite?.nome ?? ospite?.name ?? "");
      state.guestGroupKey = nk || state.guestGroupKey || null;
    }

    state.guestGroupActiveId = guestIdOf(ospite);
    renderGuestMulti({ mode: "edit" });
  }catch(_){ }


  try { updateGuestPriceVisibility(); } catch (_) {}
}

function _guestIdOf(item){
  return String(item?.id || item?.ID || item?.ospite_id || item?.ospiteId || item?.guest_id || item?.guestId || "").trim();
}

function _parseRoomsArr(stanzeField){
  // Restituisce sempre un array unico/sortato di stanze [1..6]
  const norm = (arr) => Array.from(new Set((arr || [])
    .map(n => parseInt(n, 10))
    .filter(n => isFinite(n) && n >= 1 && n <= 6)))
    .sort((a,b) => a - b);

  const fromDateParts = (d, m, y) => {
    const dd = parseInt(d, 10);
    const mm = parseInt(m, 10);
    let yy = parseInt(y, 10);
    if (!isFinite(dd) || !isFinite(mm) || !isFinite(yy)) return null;
    if (yy >= 100) yy = yy % 100;
    if (dd >= 1 && dd <= 6 && mm >= 1 && mm <= 6 && yy >= 1 && yy <= 6) return [dd, mm, yy];
    return null;
  };

  try {
    if (Array.isArray(stanzeField)) return norm(stanzeField);
    if (stanzeField == null) return [];

    // Date object (da Sheets)
    if (stanzeField instanceof Date){
      const parts = fromDateParts(stanzeField.getDate(), stanzeField.getMonth() + 1, stanzeField.getFullYear());
      return parts ? norm(parts) : [];
    }

    let s = String(stanzeField).trim();
    if (!s) return [];

    // JSON array: [2,3,4]
    if (s[0] === "["){
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return norm(arr);
      } catch (_) {}
    }

    // JSON object (tolleranza): {stanze:[...]}
    if (s[0] === "{"){
      try {
        const obj = JSON.parse(s);
        const maybe = (obj && (obj.stanze ?? obj.rooms ?? obj.stanza ?? obj.room)) ?? null;
        if (Array.isArray(maybe)) return norm(maybe);
        if (typeof maybe === "string") s = String(maybe).trim();
      } catch (_) {}
    }

    // Sheets conversione data con virgole: "2,3,2004"
    let m = s.match(/^\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{2,4})\s*$/);
    if (m){
      const parts = fromDateParts(m[1], m[2], m[3]);
      if (parts) return norm(parts);
    }

    // Data con slash: "02/03/2004" oppure "2-3-04"
    m = s.match(/^\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})\s*$/);
    if (m){
      const parts = fromDateParts(m[1], m[2], m[3]);
      if (parts) return norm(parts);
    }

    // ISO date: "2004-03-02" o "2004-03-02T..."
    m = s.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (m){
      const parts = fromDateParts(m[3], m[2], m[1]);
      if (parts) return norm(parts);
    }

    // Lista stanze: supporta "2,3,4" e "2|3|4" (senza pescare cifre da numeri lunghi)
    const tokens = s.split(/[|,;\s]+/).map(t => t.trim()).filter(Boolean);
    const nums = tokens.map(t => parseInt(t, 10)).filter(n => isFinite(n) && n >= 1 && n <= 6);
    return norm(nums);
  } catch (_) {
    return [];
  }
}


function buildRoomsStackHTML(guestId, roomsArr){
  if (!roomsArr || !roomsArr.length) return `<span class="room-dot-badge is-empty" aria-label="Nessuna stanza">—</span>`;
  return `<div class="rooms-stack" aria-label=" e letti">` + roomsArr.map((n) => {
    const key = `${guestId}:${n}`;
    const info = (state.stanzeByKey && state.stanzeByKey[key]) ? state.stanzeByKey[key] : { letto_m: 0, letto_s: 0, culla: 0 };
    const lettoM = Number(info.letto_m || 0) || 0;
    const lettoS = Number(info.letto_s || 0) || 0;
    const culla  = Number(info.culla  || 0) || 0;

    let dots = "";
    if (lettoM > 0) dots += `<span class="bed-dot bed-dot-m" aria-label="Letto matrimoniale"></span>`;
    for (let i = 0; i < lettoS; i++) dots += `<span class="bed-dot bed-dot-s" aria-label="Letto singolo"></span>`;
    if (culla > 0) dots += `<span class="bed-dot bed-dot-c" aria-label="Culla"></span>`;

    return `<div class="room-row">
      <span class="room-dot-badge room-${n}">${n}</span>
      <div class="bed-dots" aria-label="Letti">${dots || `<span class="bed-dot bed-dot-empty" aria-label="Nessun letto"></span>`}</div>
    </div>`;
  }).join("") + `</div>`;
}

function renderRoomsReadOnly(ospite){
  const ro = document.getElementById("roomsReadOnly");
  if (!ro) return;

  const guestId = _guestIdOf(ospite);
  let roomsArr = _parseRoomsArr(ospite?.stanze);

  // fallback: se per qualche motivo non arriva 'stanze' dal backend, usa lo stato locale
  if (!roomsArr.length && state.guestRooms && state.guestRooms.size){
    roomsArr = Array.from(state.guestRooms)
      .map(n => parseInt(n,10))
      .filter(n => isFinite(n) && n>=1 && n<=6)
      .sort((a,b)=>a-b);
  }

  const stackHTML = buildRoomsStackHTML(guestId, roomsArr);

  const ci = formatLongDateIT(ospite?.check_in ?? ospite?.checkIn ?? "") || "—";
  const co = formatLongDateIT(ospite?.check_out ?? ospite?.checkOut ?? "") || "—";

  // Range date sempre visibile (pill bianca)
  const datesHTML = `<div class="guest-booking-dates-pill">${ci} → ${co}</div>`;

  // Matrimonio: pallino verde con "M" bianca, in alto a destra (allineato alla pill date)
  const marriageOn = !!(ospite?.matrimonio);
  const topRightHTML = marriageOn ? `<span class="marriage-dot" aria-label="Matrimonio">M</span>` : ``;

  // Notti + tassa: solo testo (no pillola)
  const nights = calcStayNights(ospite);
  let stayTextHTML = ``;
  if (nights != null){
    const tt = calcTouristTax(ospite, nights);
    const nightsLabel = (nights === 1) ? `1 notte` : `${nights} notti`;
    const taxLabel = `Tassa ${formatEUR(tt.total)}`;
    stayTextHTML = `<div class="guest-booking-staytext" aria-label="Pernottamenti e tassa di soggiorno">${nightsLabel} • ${taxLabel}</div>`;
  }

  // Coerenza UI: usa lo stesso riquadro smussato delle prenotazioni multiple
  ro.innerHTML = `
    <div class="guest-booking-block guest-booking-block--primary">
      <div class="guest-booking-top">
        <div class="guest-booking-top-row">
          ${datesHTML}
          ${topRightHTML}
        </div>
        ${stayTextHTML}
      </div>
      <div class="guest-booking-rooms guest-booking-ro">
        <div class="rooms-readonly-wrap">${stackHTML}</div>
      </div>
    </div>
  `;
}

// ===== dDAE_2.035 — Multi prenotazioni per stesso nome =====
function normalizeGuestNameKey(name){
  try{ return collapseSpaces(String(name || "").trim()).toLowerCase(); }catch(_){ return String(name||"").trim().toLowerCase(); }
}

function buildGuestBookingBlockHTML(ospite, { mode="view", showSelect=false, activeId="" } = {}){
  const gid = guestIdOf(ospite);
  const roomsArr = _parseRoomsArr(ospite?.stanze);
  const roomsHTML = buildRoomsStackHTML(gid, roomsArr);

  const ci = formatLongDateIT(ospite?.check_in ?? ospite?.checkIn ?? "") || "—";
  const co = formatLongDateIT(ospite?.check_out ?? ospite?.checkOut ?? "") || "—";

  // Notti + tassa: solo testo (no pillola)
  const nights = calcStayNights(ospite);
  let stayTextHTML = "";
  if (nights != null){
    const tt = calcTouristTax(ospite, nights);
    const nightsLabel = (nights === 1) ? `1 notte` : `${nights} notti`;
    const taxLabel = `Tassa ${formatEUR(tt.total)}`;
    stayTextHTML = `<div class="guest-booking-staytext" aria-label="Pernottamenti e tassa di soggiorno">${nightsLabel} • ${taxLabel}</div>`;
  }

  const marriageOn = !!(ospite?.matrimonio);

  const isActive = (activeId && gid && String(activeId) === String(gid));
  const actionsHTML = (showSelect && gid)
    ? `<div class="guest-booking-actions" aria-label="Azioni prenotazione">
        <button class="icon-round-btn is-edit" type="button" data-guest-select="${gid}" aria-label="Modifica prenotazione" ${isActive ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
        <button class="icon-round-btn is-del" type="button" data-guest-del-booking="${gid}" aria-label="Elimina prenotazione">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>`
    : ``;

  // Top right: azioni (in edit) altrimenti pallino matrimonio (in view)
  const topRightHTML = actionsHTML || (marriageOn ? `<span class="marriage-dot" aria-label="Matrimonio">M</span>` : ``);

  return `<div class="guest-booking-block ${isActive ? "is-active" : ""}" data-booking-id="${gid}">
    <div class="guest-booking-top">
      <div class="guest-booking-top-row">
        <div class="guest-booking-dates-pill">${ci} → ${co}</div>
        ${topRightHTML}
      </div>
      ${stayTextHTML || ``}
    </div>
    <div class="guest-booking-rooms">${roomsHTML}</div>
  </div>`;
}

function clearGuestMulti(){
  const el = document.getElementById("guestMulti");
  if (!el) return;
  el.hidden = true;
  el.innerHTML = "";
}

function renderGuestMulti({ mode="view" } = {}){
  const el = document.getElementById("guestMulti");
  if (!el) return;

  const list = Array.isArray(state.guestGroupBookings) ? state.guestGroupBookings : [];
  const activeId = String(state.guestGroupActiveId || state.guestEditId || "").trim();

  if (!list || !list.length){
    clearGuestMulti();
    return;
  }

  // In modifica: mostra SEMPRE il riquadro (anche se singolo) + tasto "+" per aggiungere prenotazione
  if (mode === "edit"){
    const showSelect = true;
    const title = `<div class="guest-multi-title">Prenotazioni</div>`;
    const blocks = list.map(g => buildGuestBookingBlockHTML(g, { mode, showSelect, activeId })).join("");
    const plus = `<button class="guest-add-booking" type="button" data-guest-add-booking aria-label="Aggiungi prenotazione">+</button>`;
    el.innerHTML = `${title}${blocks}${plus}`;
    el.hidden = false;
    return;
  }

  // In sola lettura: mostra solo le prenotazioni aggiuntive (sotto la prima)
  if (list.length <= 1){
    clearGuestMulti();
    return;
  }

  const shown = list.filter(x => guestIdOf(x) !== activeId);
  if (!shown.length){
    clearGuestMulti();
    return;
  }

  const blocks = shown.map(g => buildGuestBookingBlockHTML(g, { mode, showSelect:false, activeId })).join("");
  el.innerHTML = `${blocks}`;
  el.hidden = false;
}

function updateOspiteHdActions(){

  const hdActions = document.getElementById("ospiteHdActions");
  if (!hdActions) return;

  // Mostra il contenitore (poi nascondiamo i singoli pallini senza azione)
  hdActions.hidden = false;

  const btnCal  = hdActions.querySelector("[data-guest-cal]");
  const btnBack = hdActions.querySelector("[data-guest-back]");
  const btnEdit = hdActions.querySelector("[data-guest-edit]");
  const btnDel  = hdActions.querySelector("[data-guest-del]");

  const mode = state.guestMode; // "create" | "edit" | "view"

  // Indaco: vai al calendario (sempre presente)
  if (btnCal) btnCal.hidden = false;

  // Verde: sempre presente (torna alla lista ospiti)
  if (btnBack) btnBack.hidden = false;

  // Giallo: solo in sola lettura (azione: passa a modifica)
  if (btnEdit) btnEdit.hidden = (mode !== "view");

  // Rosso: solo in sola lettura (azione: elimina ospite)
  if (btnDel) btnDel.hidden = (mode !== "view");
}


function updateGuestFormModeClass(){
  try{
    const card = document.querySelector("#page-ospite .guest-form-card");
    if (!card) return;
    const mode = String(state.guestMode || "").toLowerCase();
    const isView = (mode === "view");
    card.classList.toggle("is-view", isView);
    card.classList.toggle("is-create", !isView && mode === "create");
    card.classList.toggle("is-edit", !isView && mode === "edit");
  }catch(_){}
}

function setGuestFormViewOnly(isView, ospite){
  try{ updateGuestFormModeClass(); }catch(_){ }
  const card = document.querySelector("#page-ospite .guest-form-card");
  if (card) card.classList.toggle("is-view", !!isView);

  const btn = document.getElementById("createGuestCard");
  if (btn) btn.hidden = !!isView;

  const picker = document.getElementById("roomsPicker");
  if (picker) picker.hidden = !!isView;

  const ro = document.getElementById("roomsReadOnly");
  if (ro) {
    ro.hidden = !isView;
    if (isView) renderRoomsReadOnly(ospite);
    else ro.innerHTML = "";
  }

  // Aggiorna i pallini in testata in base alla modalità corrente
  try { updateOspiteHdActions(); } catch (_) {}
}

function enterGuestViewMode(ospite){
  // Riempiamo la maschera usando la stessa logica dell'edit, poi blocchiamo tutto in sola lettura
  enterGuestEditMode(ospite);
  state.guestMode = "view";
  try{ updateGuestFormModeClass(); }catch(_){ }
  state.guestViewItem = ospite || null;

  const title = document.getElementById("ospiteFormTitle");
  if (title) title.textContent = "Scheda ospite";

  setGuestFormViewOnly(true, ospite);
  // Multi prenotazioni: mostra prenotazioni aggiuntive sotto la prima
  try{
    if (Array.isArray(state.guestGroupBookings) && state.guestGroupBookings.length > 1){
      state.guestGroupActiveId = guestIdOf(ospite);
      renderGuestMulti({ mode: "view" });
    } else {
      clearGuestMulti();
    }
  }catch(_){ }
  try { updateOspiteHdActions(); } catch (_) {}
}


async function saveGuest(){
  const name = (document.getElementById("guestName")?.value || "").trim();
  const adults = parseInt(document.getElementById("guestAdults")?.value || "0", 10) || 0;
  const kidsU10 = parseInt(document.getElementById("guestKidsU10")?.value || "0", 10) || 0;
  const checkIn = document.getElementById("guestCheckIn")?.value || "";
  const checkOut = document.getElementById("guestCheckOut")?.value || "";
  const total = parseFloat(document.getElementById("guestTotal")?.value || "0") || 0;
  const booking = parseFloat(document.getElementById("guestBooking")?.value || "0") || 0;
  const deposit = parseFloat(document.getElementById("guestDeposit")?.value || "0") || 0;
  const saldoPagato = parseFloat(document.getElementById("guestSaldo")?.value || "0") || 0;
  const saldoTipo = state.guestSaldoType || "contante";
  const rooms = Array.from(state.guestRooms || [])
    .map(n => parseInt(n,10))
    .filter(n => isFinite(n) && n>=1 && n<=6)
    .sort((a,b)=>a-b);
  const depositType = state.guestDepositType || "contante";
  const matrimonio = !!(state.guestMarriage);
if (!name) return toast("Inserisci il nome");
  const payload = {
    nome: name,
    adulti: adults,
    bambini_u10: kidsU10,
    check_in: checkIn,
    check_out: checkOut,
    importo_prenotazione: total,
    importo_booking: booking,
    acconto_importo: deposit,
    acconto_tipo: depositType,
    saldo_pagato: saldoPagato,
    saldo_tipo: saldoTipo,
    acconto_ricevuta: !!state.guestDepositReceipt,
    saldo_ricevuta: !!state.guestSaldoReceipt,
    saldo_ricevutain: !!state.guestSaldoReceipt,
    matrimonio,
    ps_registrato: state.guestPSRegistered ? "1" : "",
    istat_registrato: state.guestISTATRegistered ? "1" : "",
    stanze: JSON.stringify(rooms)
  };



  const isEdit = state.guestMode === "edit";
  if (isEdit){
    if (!state.guestEditId) return toast("ID ospite mancante");
    payload.id = state.guestEditId;
    // preserva la data di inserimento (non deve cambiare con le modifiche)
    const ca = state.guestEditCreatedAt;
    if (ca){
      payload.createdAt = ca;
      payload.created_at = ca;
    }
  }

  
  else {
    // CREATE: genera subito un ID stabile, così possiamo salvare le stanze al primo tentativo
    payload.id = payload.id || genId("o");
  }
// CREATE vs UPDATE (backend GAS: POST=create, PUT=update)
  const method = isEdit ? "PUT" : "POST";
  const res = await api("ospiti", { method, body: payload });

  // stanze: backend gestisce POST e sovrascrive (deleteWhere + append)
  const ospiteId = payload.id;
  const stanze = buildArrayFromState();

  let shouldSave = true;
  if (isEdit){
    try {
      const snapNow = JSON.stringify(stanze);
      const snapOrig = state.stanzeSnapshotOriginal || "";
      shouldSave = (snapNow !== snapOrig);
    } catch (_) {
      shouldSave = true;
    }
  }

  if (shouldSave){
    try { await api("stanze", { method:"POST", body: { ospite_id: ospiteId, stanze } }); } catch (_) {}
  }

  // Invalida cache in-memory (ospiti/stanze) e forza refresh Calendario.
  // Questo evita che il calendario rimanga "stale" finche' non riavvii la PWA.
  try{ invalidateApiCache("ospiti|"); }catch(_){ }
  try{ invalidateApiCache("stanze|"); }catch(_){ }
  try{ if (state.calendar){ state.calendar.ready = false; state.calendar.rangeKey = ""; } }catch(_){ }

  await loadOspiti({ ...(state.period || {}), force:true });
  toast(isEdit ? "Modifiche salvate" : "Ospite creato");

  // Dopo salvataggio: torna sempre alla lista ospiti
  try { enterGuestCreateMode(); } catch (_) {}
  showPage("ospiti");
}

function setupOspite(){
  const hb = document.getElementById("hamburgerBtnOspite");
  if (hb) hb.addEventListener("click", () => { hideLauncher(); showPage("home"); });

  // Azioni Scheda ospite (solo lettura): verde=indietro, giallo=modifica, rosso=elimina
  const hdActions = document.getElementById("ospiteHdActions");
  if (hdActions && !hdActions.__bound){
    hdActions.__bound = true;
    hdActions.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn || !hdActions.contains(btn) || btn.hidden) return;

      // Indaco: vai al calendario
      if (btn.hasAttribute("data-guest-cal")){
        // In sola lettura: apri il calendario centrato sulla stessa prenotazione
        try{
          const ciRaw = (document.getElementById("guestCheckIn")?.value || "").trim();
          const ci = ciRaw || (state.guestViewItem?.check_in || state.guestViewItem?.checkIn || "");
          if (ci){
            if (!state.calendar) state.calendar = { anchor: new Date(), ready: false, guests: [], rangeKey: "" };
            state.calendar.anchor = new Date(ci + "T00:00:00");
          }
        }catch(_){ }
        showPage("calendario");
        return;
      }

      // Verde: torna sempre alla lista ospiti (anche in Nuovo/Modifica)
      if (btn.hasAttribute("data-guest-back")){
        // pulisci contesto multi
        try{ state.guestGroupBookings = null; state.guestGroupActiveId = null; state.guestGroupKey = null; clearGuestMulti(); }catch(_){ }
        showPage("ospiti");
        return;
      }

      const mode = state.guestMode;
      const item = state.guestViewItem;

      // Giallo: dalla sola lettura passa a modifica
      if (btn.hasAttribute("data-guest-edit")){
        if (!item) return;
        enterGuestEditMode(item);
        try { updateOspiteHdActions(); } catch (_) {}
        return;
      }

      // Rosso: elimina (solo in sola lettura o modifica)
      if (btn.hasAttribute("data-guest-del")){
        let gid = null;

        if (mode === "view"){
          if (!item) return;
          gid = guestIdOf(item) || item.id;
        } else if (mode === "edit"){
          gid = state.guestEditId || null;
        }

        if (!gid) return;

        // In sola lettura: se esistono più prenotazioni per lo stesso ospite, elimina TUTTI i gruppi contemporaneamente
        let idsToDelete = [String(gid)];
        try{
          if (mode === "view"){
            // 1) se abbiamo contesto multi gia' in memoria (aperto da lista), usalo
            if (Array.isArray(state.guestGroupBookings) && state.guestGroupBookings.length){
              const all = state.guestGroupBookings
                .map(b => String(guestIdOf(b) || b?.id || "").trim())
                .filter(Boolean);
              if (all.length && all.includes(String(gid))) idsToDelete = Array.from(new Set(all));
            }

            // 2) fallback: ricostruisci gruppo dal dataset corrente (utile se aperto dal calendario)
            if (!idsToDelete || idsToDelete.length <= 1){
              const itemsNow = Array.isArray(state.ospiti) && state.ospiti.length ? state.ospiti : (Array.isArray(state.guests) ? state.guests : []);
              const nm = String(item?.nome ?? item?.name ?? item?.Nome ?? "").trim();
              const key = normalizeGuestNameKey(nm);
              if (key){
                const groups = groupGuestsByName(itemsNow || []);
                const g = groups.find(x => String(x.key) === String(key));
                if (g && Array.isArray(g.bookings) && g.bookings.length){
                  const all2 = g.bookings.map(b => String(guestIdOf(b) || b?.id || "").trim()).filter(Boolean);
                  if (all2.length && all2.includes(String(gid))) idsToDelete = Array.from(new Set(all2));
                }
              }
            }
          }
        }catch(_){ idsToDelete = [String(gid)]; }

        const msg = (idsToDelete.length > 1)
          ? "Eliminare definitivamente questa prenotazione (tutti i gruppi)?"
          : "Eliminare definitivamente questo ospite?";
        if (!confirm(msg)) return;

        try {
          for (const id of idsToDelete){
            await api("ospiti", { method:"DELETE", params:{ id }});
          }
          toast("Ospite eliminato");
          invalidateApiCache("ospiti|");
          invalidateApiCache("stanze|");
          try{ if (state.calendar){ state.calendar.ready = false; state.calendar.rangeKey = ""; } }catch(_){ }
          await loadOspiti({ ...(state.period || {}), force:true });
          // pulisci contesto multi
          try{ state.guestGroupBookings = null; state.guestGroupActiveId = null; state.guestGroupKey = null; clearGuestMulti(); }catch(_){ }
          showPage("ospiti");
        } catch (err) {
          toast(err?.message || "Errore");
        }
        return;
      }
    });
}

  // Selezione/Eliminazione prenotazione (multi) in modifica
  const multi = document.getElementById("guestMulti");
  if (multi && !multi.__bound){
    multi.__bound = true;
    multi.addEventListener("click", async (e) => {
      // Elimina singola prenotazione (solo il gruppo selezionato)
      const delBtn = e.target.closest("button[data-guest-del-booking]");
      if (delBtn && multi.contains(delBtn)){
        e.preventDefault();
        e.stopPropagation();
        const delId = String(delBtn.getAttribute("data-guest-del-booking") || "").trim();
        if (!delId) return;
        if (!confirm("Eliminare questa prenotazione?")) return;

        try{
          await api("ospiti", { method:"DELETE", params:{ id: delId }});
          toast("Prenotazione eliminata");
          invalidateApiCache("ospiti|");
          invalidateApiCache("stanze|");
          try{ if (state.calendar){ state.calendar.ready = false; state.calendar.rangeKey = ""; } }catch(_){ }

          // ricarica dati e ripristina contesto multi
          await loadOspiti({ ...(state.period || {}), force:true });

          const items = Array.isArray(state.ospiti) && state.ospiti.length ? state.ospiti : (Array.isArray(state.guests) ? state.guests : []);
          const groups = groupGuestsByName(items || []);

          const keyWanted = String(state.guestGroupKey || "").trim();
          let group = keyWanted ? groups.find(g => String(g.key) === keyWanted) : null;
          if (!group){
            // fallback: prova con il nome attuale nel form
            const nameNow = String(document.getElementById("guestName")?.value || "").trim();
            const nk = normalizeGuestNameKey(nameNow);
            group = groups.find(g => String(g.key) === nk);
          }

          if (group && Array.isArray(group.bookings) && group.bookings.length){
            state.guestGroupBookings = group.bookings;
            state.guestGroupKey = group.key;

            // Se abbiamo eliminato quella in modifica, passa alla prima disponibile
            const next = group.bookings.find(b => String(guestIdOf(b)) !== delId) || group.bookings[0];
            state.guestGroupActiveId = guestIdOf(next);
            enterGuestEditMode(next);
            showPage("ospite");
          } else {
            // non esiste piu' alcuna prenotazione per quel nome
            state.guestGroupBookings = null;
            state.guestGroupKey = null;
            state.guestGroupActiveId = null;
            try{ clearGuestMulti(); }catch(_){ }
            showPage("ospiti");
          }
        }catch(err){
          toast(err?.message || "Errore");
        }
        return;
      }

      // Aggiungi nuova prenotazione allo stesso ospite (tasto +)
      const addBtn = e.target.closest("button[data-guest-add-booking]");
      if (addBtn && multi.contains(addBtn)) {
        e.preventDefault();
        e.stopPropagation();

        const nameNow = (document.getElementById("guestName")?.value || "").trim();
        const adultsNow = parseInt(document.getElementById("guestAdults")?.value || "0", 10) || 0;
        const kidsNow = parseInt(document.getElementById("guestKidsU10")?.value || "0", 10) || 0;
        const marriageNow = !!(document.getElementById("guestMarriage")?.checked);

        const depTypeNow = state.guestDepositType || "contante";
        const saldoTypeNow = state.guestSaldoType || "contante";
        const psNow = !!state.guestPSRegistered;
        const istNow = !!state.guestISTATRegistered;

        // Passa a CREATE precompilato
        enterGuestCreateMode();
        state.guestCreateFromGroup = true;
        try { updateGuestPriceVisibility(); } catch (_) {}

        try {
          document.getElementById("guestName").value = nameNow;
          document.getElementById("guestAdults").value = adultsNow;
          document.getElementById("guestKidsU10").value = kidsNow;
          setMarriage(marriageNow);

          state.guestDepositType = depTypeNow;
          setPayType("depositType", depTypeNow);
          state.guestSaldoType = saldoTypeNow;
          setPayType("saldoType", saldoTypeNow);

          state.guestPSRegistered = psNow;
          state.guestISTATRegistered = istNow;
          setRegFlags("regTags", psNow, istNow);

          refreshFloatingLabels();
        } catch (_) {}

        showPage("ospite");
        return;
      }

      // Seleziona prenotazione da modificare
      const btn = e.target.closest("button[data-guest-select]");
      if (!btn || !multi.contains(btn)) return;
      const id = String(btn.getAttribute("data-guest-select") || "").trim();
      if (!id) return;

      const list = Array.isArray(state.guestGroupBookings) ? state.guestGroupBookings : [];
      const target = list.find(x => String(guestIdOf(x)) === id);
      if (!target) return;

      state.guestGroupActiveId = id;
      enterGuestEditMode(target);
      // enterGuestEditMode renderizza gia' la lista in modalita' edit
    });
  }

  const roomsWrap = document.getElementById("roomsPicker");
  const roomsOut = null; // removed UI string output

  function _getGuestDateRange(){
    try{
      const ci = (document.getElementById("guestCheckIn")?.value || "").trim();
      const co = (document.getElementById("guestCheckOut")?.value || "").trim();
      if (!ci || !co) return null;
      // Date ISO YYYY-MM-DD: confronto lessicografico ok
      if (co <= ci) return null;
      return { ci, co };
    }catch(_){ return null; }
  }

  async function refreshRoomsAvailability(){
    // Regola: nessuna stanza selezionabile senza intervallo date valido
    const range = _getGuestDateRange();

    const editId = String(state.guestEditId || "").trim();

    // reset/lock
    if (!range){
      state.occupiedRooms = new Set();
      state._roomsAvailKey = "";
      // se l'utente non ha ancora inserito date, non deve poter selezionare stanze
      if (state.guestRooms && state.guestRooms.size){
        state.guestRooms.clear();
        if (state.lettiPerStanza) state.lettiPerStanza = {};
      }
      renderRooms();
      return;
    }

    const key = `${range.ci}|${range.co}|${editId}`;
    if (state._roomsAvailKey === key && state.occupiedRooms instanceof Set) {
      renderRooms();
      return;
    }
    state._roomsAvailKey = key;

    let rows = [];
    try{
      const data = await cachedGet("ospiti", {}, { showLoader:false, ttlMs: 15000 });
      rows = Array.isArray(data) ? data : [];
    }catch(_){ rows = []; }

    const occ = new Set();

    for (const g of rows){
      // In MODIFICA: ignora l'ospite corrente (altrimenti le sue stanze risultano occupate e diventano rosse)
      if (editId){
        const gid = guestIdOf(g);
        if (gid && gid === editId) continue;
      }

      const gi = String(g.check_in ?? g.checkIn ?? g.checkin ?? "").slice(0,10);
      const go = String(g.check_out ?? g.checkOut ?? g.checkout ?? "").slice(0,10);
      if (!gi || !go) continue;

      // overlap: [gi,go) interseca [ci,co)
      if (!(gi < range.co && go > range.ci)) continue;

      const roomsArr = _parseRoomsArr(g.stanze ?? g.rooms ?? g.stanza ?? "");
      roomsArr.forEach(r => occ.add(r));
    }

    state.occupiedRooms = occ;

    // Se l'utente aveva selezionato stanze che ora risultano occupate, le togliamo
    let removed = false;
    try{
      for (const r of Array.from(state.guestRooms || [])){
        if (occ.has(r)){
          state.guestRooms.delete(r);
          if (state.lettiPerStanza) delete state.lettiPerStanza[String(r)];
          removed = true;
        }
      }
    }catch(_){}

    if (removed){
      try{ toast("Alcune stanze non sono disponibili"); }catch(_){}
    }

    renderRooms();
  }

  function renderRooms(){
    const range = _getGuestDateRange();
    const locked = !range;
    const occSet = (state.occupiedRooms instanceof Set) ? state.occupiedRooms : new Set();

    roomsWrap?.querySelectorAll(".room-dot").forEach(btn => {
      // Il pallino "M" non è una stanza numerata
      if (btn.id === "roomMarriage") return;

      const n = parseInt(btn.getAttribute("data-room"), 10);
      const on = state.guestRooms.has(n);
      const occ = !locked && occSet.has(n);

      btn.classList.toggle("selected", on);
      btn.classList.toggle("occupied", occ);

      const dis = locked || occ;
      btn.disabled = !!dis;
      btn.setAttribute("aria-disabled", dis ? "true" : "false");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    // matrimonio dot (rimane gestibile come flag)
    setMarriage(state.guestMarriage);
  }

  // Espone le funzioni (scope setupOspite) per poterle richiamare da enterGuestEditMode
  // senza dipendere dall'evento input/change dei campi date (iOS/Safari PWA).
  try {
    window.__ddae_refreshRoomsAvailability = refreshRoomsAvailability;
    window.__ddae_renderRooms = renderRooms;
  } catch (_) {}

  // iOS/PWA: a volte, nei contenitori orizzontali, il target del tap puo' "slittare" sul pallino precedente.
  // Per evitare che una selezione multipla aggiunga la stanza sbagliata, scegliamo SEMPRE il pallino piu' vicino
  // alle coordinate reali del tap.
  function __pickRoomDotFromEvent(e){
    try{
      if (!roomsWrap) return null;
      // 1) coordinate (touch/pointer/mouse)
      let x = null, y = null;
      const te = e;
      if (te && te.changedTouches && te.changedTouches[0]){ x = te.changedTouches[0].clientX; y = te.changedTouches[0].clientY; }
      else if (te && te.touches && te.touches[0]){ x = te.touches[0].clientX; y = te.touches[0].clientY; }
      else if (typeof te.clientX === 'number'){ x = te.clientX; y = te.clientY; }

      // 2) fallback per tastiera: usa il closest normale
      if (x == null || y == null){
        const b0 = te?.target?.closest ? te.target.closest('.room-dot') : null;
        return b0 && roomsWrap.contains(b0) ? b0 : null;
      }

      // 3) trova il bottone piu' vicino al punto del tap
      const dots = Array.from(roomsWrap.querySelectorAll('.room-dot'));
      let best = null;
      let bestD = Infinity;
      for (const d of dots){
        if (!d) continue;
        const r = d.getBoundingClientRect();
        const cx = r.left + (r.width/2);
        const cy = r.top + (r.height/2);
        const dx = cx - x;
        const dy = cy - y;
        const dist = (dx*dx) + (dy*dy);
        if (dist < bestD){ bestD = dist; best = d; }
      }

      // se il tap e' molto lontano dai pallini, ignora
      if (!best) return null;
      return best;
    }catch(_){ return null; }
  }

  // Stanze:
  // - tap breve su stanza spenta => seleziona + apre popup letti
  // - tap breve su stanza accesa => apre popup letti (cambio tipologia)
  // - pressione lunga (>=0.5s) su stanza accesa => deseleziona (SENZA popup)
  let __roomPressTimer = null;
  let __roomPressBtn = null;
  let __roomLongFired = false;
  let __roomSuppressClickUntil = 0;

  function __room_now(){
    try{ return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
    catch(_){ return Date.now(); }
  }
  function __room_markSuppress(ms){
    try{ __roomSuppressClickUntil = __room_now() + (ms || 650); }catch(_){ }
  }
  function __room_isSuppressed(){
    try{ return __room_now() < __roomSuppressClickUntil; }catch(_){ return false; }
  }
  function __room_clearPress(){
    try{ if (__roomPressTimer){ clearTimeout(__roomPressTimer); } }catch(_){ }
    __roomPressTimer = null;
    __roomPressBtn = null;
    __roomLongFired = false;
  }

  function __room_getDotFromEvent(e){
    try{
      const b = __pickRoomDotFromEvent(e);
      if (!b) return null;
      if (!roomsWrap || !roomsWrap.contains(b)) return null;
      if (!b.classList || !b.classList.contains('room-dot')) return null;
      return b;
    }catch(_){ return null; }
  }

  function __room_canInteract(b){
    const range = _getGuestDateRange();
    if (!range){
      try{ toast('Seleziona prima check-in e check-out'); }catch(_){ }
      return false;
    }
    if (b.classList.contains('occupied') || b.disabled){
      try{ toast('Stanza occupata'); }catch(_){ }
      return false;
    }
    return true;
  }

  function __room_handleShortTap(b){
    // Matrimonio: flag separato
    if (b.id === 'roomMarriage') { setMarriage(!state.guestMarriage); return; }
    if (!__room_canInteract(b)) return;

    const n = parseInt(b.getAttribute('data-room'), 10);
    if (!isFinite(n)) return;

    // Se era spenta, accendi
    if (!state.guestRooms.has(n)) {
      state.guestRooms.add(n);
      renderRooms();
    }

    // Tap breve su stanza accesa/spenta => apre popup configurazione letti
    try{ openRoomConfig(n); }catch(_){ }
  }

  function __room_handleLongPress(b){
    // Matrimonio: nessun long-press
    if (b.id === 'roomMarriage') return;
    if (!__room_canInteract(b)) return;

    const n = parseInt(b.getAttribute('data-room'), 10);
    if (!isFinite(n)) return;

    // Deselezione SOLO con pressione lunga e SOLO se era accesa
    if (state.guestRooms.has(n)) {
      state.guestRooms.delete(n);
      if (state.lettiPerStanza) delete state.lettiPerStanza[String(n)];
      renderRooms();

      // Se il popup era aperto su questa stanza, chiudilo
      try{
        if (typeof __rc_room !== 'undefined' && String(__rc_room) === String(n)){
          const m = document.getElementById('roomConfigModal');
          if (m) m.hidden = true;
          try{ __rc_room = null; }catch(_){ }
        }
      }catch(_){ }
    }
  }

  function __room_onPressStart(e){
    const b = __room_getDotFromEvent(e);
    if (!b) return;

    // Evita click "fantasma" dopo touch/pointer
    __room_markSuppress(900);

    // Evita callout/scroll strani su iOS durante pressione lunga
    try{ e.preventDefault(); }catch(_){ }

    __room_clearPress();
    __roomPressBtn = b;

    __roomPressTimer = setTimeout(() => {
      __roomLongFired = true;
      __room_handleLongPress(b);
    }, 500);
  }

  function __room_onPressEnd(e){
    if (!__roomPressBtn) return;
    const b = __roomPressBtn;
    const wasLong = __roomLongFired;

    __room_clearPress();

    // Sopprimi click generato da touchend
    __room_markSuppress(900);
    try{ e.preventDefault(); }catch(_){ }

    if (wasLong) return;
    __room_handleShortTap(b);
  }

  function __room_onPressCancel(_e){
    __room_clearPress();
  }

  // Pointer events (preferiti) + fallback touch/mouse
  try{
    if (window.PointerEvent) {
      roomsWrap?.addEventListener('pointerdown', __room_onPressStart, { passive:false });
      roomsWrap?.addEventListener('pointerup', __room_onPressEnd, { passive:false });
      roomsWrap?.addEventListener('pointercancel', __room_onPressCancel, { passive:true });
    } else {
      roomsWrap?.addEventListener('touchstart', __room_onPressStart, { passive:false });
      roomsWrap?.addEventListener('touchend', __room_onPressEnd, { passive:false });
      roomsWrap?.addEventListener('touchcancel', __room_onPressCancel, { passive:true });
      roomsWrap?.addEventListener('mousedown', __room_onPressStart, { passive:false });
      roomsWrap?.addEventListener('mouseup', __room_onPressEnd, { passive:false });
    }
  }catch(_){ }

  // Click (tastiera/desktop). Ignorato se appena gestito da touch/pointer.
  roomsWrap?.addEventListener('click', (e) => {
    if (__room_isSuppressed()) return;
    const b = __room_getDotFromEvent(e);
    if (!b) return;
    __room_handleShortTap(b);
  });

  function bindPayPill(containerId, kind){
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".pay-dot");
      if (!btn || !wrap.contains(btn)) return;

      const t = btn.getAttribute("data-type");
      if (t) {
        if (kind === "deposit") state.guestDepositType = t;
        if (kind === "saldo") state.guestSaldoType = t;
        setPayType(containerId, t);
        return;
      }

      if (btn.hasAttribute("data-receipt")) {
        if (kind === "deposit") state.guestDepositReceipt = !state.guestDepositReceipt;
        if (kind === "saldo") state.guestSaldoReceipt = !state.guestSaldoReceipt;
        setPayReceipt(containerId, kind === "deposit" ? state.guestDepositReceipt : state.guestSaldoReceipt);
        return;
      }
    });
  }

  bindPayPill("depositType", "deposit");
  bindPayPill("saldoType", "saldo");



  function bindRegPill(containerId){
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest('.pay-dot[data-flag]');
      if (!btn || !wrap.contains(btn)) return;

      const flag = (btn.getAttribute("data-flag") || "").toLowerCase();
      if (flag === "ps") state.guestPSRegistered = !state.guestPSRegistered;
      if (flag === "istat") state.guestISTATRegistered = !state.guestISTATRegistered;

      setRegFlags(containerId, state.guestPSRegistered, state.guestISTATRegistered);
    });
  }

  bindRegPill("regTags");

  // Rimanenza da pagare (Importo prenotazione - Acconto - Saldo)
  ["guestTotal","guestDeposit","guestSaldo"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => { try { updateGuestRemaining(); } catch (_) {} });
    el.addEventListener("change", () => { try { updateGuestRemaining(); } catch (_) {} });
  });
  try { updateGuestRemaining(); } catch (_) {}


  // ✅ Stanze: blocca selezione finché non c'è un intervallo date valido + segna stanze occupate (rosso)
  ["guestCheckIn","guestCheckOut"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => { try { refreshRoomsAvailability(); } catch (_) {} });
    el.addEventListener("change", () => { try { refreshRoomsAvailability(); } catch (_) {} });
  });
  try { refreshRoomsAvailability(); } catch (_) {}


  const btnCreate = document.getElementById("createGuestCard");
  btnCreate?.addEventListener("click", async () => {
    try { await saveGuest(); } catch (e) { toast(e.message || "Errore"); }
  });

  // Default: check-in oggi (solo UI)
  const today = new Date();
  const iso = today.toISOString().slice(0,10);
  const ci = document.getElementById("guestCheckIn");
  if (ci && !ci.value) ci.value = iso;

  renderRooms();
  renderGuestCards();
}

function euro(n){
  try { return (Number(n)||0).toLocaleString("it-IT", { style:"currency", currency:"EUR" }); }
  catch { return (Number(n)||0).toFixed(2) + " €"; }
}

function groupGuestsByName(items){
  const map = new Map();
  for (const it of (items || [])){
    const rawName = it?.nome ?? it?.name ?? "";
    const display = collapseSpaces(String(rawName || "").trim()) || "Ospite";
    const key0 = normalizeGuestNameKey(display);
    const key = key0 || (`__guest__${guestIdOf(it) || Math.random().toString(16).slice(2)}`);
    let g = map.get(key);
    if (!g){
      g = { key, nome: display, bookings: [] };
      map.set(key, g);
    }
    g.bookings.push(it);
  }

  const groups = Array.from(map.values());
  for (const g of groups){
    // Ordina le prenotazioni nello stesso gruppo: per arrivo, poi per inserimento
    g.bookings = g.bookings.slice().sort((a,b) => {
      const ta = parseDateTs(a?.check_in ?? a?.checkIn);
      const tb = parseDateTs(b?.check_in ?? b?.checkIn);
      if (ta == null && tb == null){
        return (Number(a?._insNo) || 1e18) - (Number(b?._insNo) || 1e18);
      }
      if (ta == null) return 1;
      if (tb == null) return -1;
      if (ta !== tb) return ta - tb;
      return (Number(a?._insNo) || 1e18) - (Number(b?._insNo) || 1e18);
    });

    // Chiavi di ordinamento a livello gruppo
    const ins = g.bookings.map(x => Number(x?._insNo) || 1e18);
    g._insNo = Math.min.apply(null, ins.length ? ins : [1e18]);
    const arrTs = g.bookings.map(x => parseDateTs(x?.check_in ?? x?.checkIn)).filter(t => t != null);
    g._arrivoTs = arrTs.length ? Math.min.apply(null, arrTs) : null;
  }
  return groups;
}

function sortGuestGroups(groups){
  const by = state.guestSortBy || "arrivo";
  const dir = (state.guestSortDir === "desc") ? -1 : 1;
  const nameKey = (s) => normalizeGuestNameKey(s);

  const out = (groups || []).slice();
  out.sort((a,b) => {
    if (by === "nome"){
      return nameKey(a?.nome).localeCompare(nameKey(b?.nome), "it") * dir;
    }
    if (by === "inserimento"){
      const aa = Number(a?._insNo) || 1e18;
      const bb = Number(b?._insNo) || 1e18;
      return (aa - bb) * dir;
    }
    const ta = (a?._arrivoTs == null) ? null : Number(a._arrivoTs);
    const tb = (b?._arrivoTs == null) ? null : Number(b._arrivoTs);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return (ta - tb) * dir;
  });
  return out;
}



function renderGuestCards(){
  const wrap = document.getElementById("guestCards");
  if (!wrap) return;
  wrap.hidden = false;
  wrap.replaceChildren();

  const frag = document.createDocumentFragment();

  let items = Array.isArray(state.ospiti) && state.ospiti.length
    ? state.ospiti
    : (Array.isArray(state.guests) ? state.guests : []);

  // Filtro rapido "Oggi": mostra solo ospiti con arrivo (check_in) = oggi
  if (state.guestTodayOnly){
    const today = todayISO();
    items = (items || []).filter(g => {
      const v = (g?.check_in ?? g?.checkIn ?? g?.arrivo ?? g?.arrival ?? g?.guestCheckIn ?? "");
      const s = String(v).trim();
      const d = s ? s.slice(0,10) : "";
      return d === today;
    });
  }


  if (!items.length){
    wrap.replaceChildren();
    const empty = document.createElement("div");
    empty.style.opacity = ".7";
    empty.style.fontSize = "14px";
    empty.style.padding = "8px";
    empty.textContent = state.guestTodayOnly ? "Nessun ospite per oggi." : "Nessun ospite nel periodo.";
    frag.appendChild(empty);
    wrap.appendChild(frag);
    return;
  }

  // Numero progressivo di inserimento (stabile)
  const insMap = computeInsertionMap(items);
  items.forEach((it) => {
    const id = guestIdOf(it);
    it._insNo = id ? insMap[id] : null;
  });

  // Raggruppa per nome (multi prenotazioni sullo stesso cliente)
  let groups = groupGuestsByName(items);
  groups = sortGuestGroups(groups);

  groups.forEach(group => {
    const first = (group.bookings && group.bookings.length) ? group.bookings[0] : null;
    if (!first) return;

    const card = document.createElement("div");
    card.className = "guest-card";

    const nome = escapeHtml(group.nome || "Ospite");

    const insNo = (Number(group._insNo) && Number(group._insNo) > 0 && Number(group._insNo) < 1e18) ? Number(group._insNo) : null;

    const led = guestLedStatus(first);

    const arrivoText = formatLongDateIT(first.check_in || first.checkIn || "") || "—";

    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Apri scheda ospite: ${nome}`);

    card.innerHTML = `
      <div class="guest-row guest-row-compact">
        <div class="guest-main">
          ${insNo ? `<span class="guest-insno">${insNo}</span>` : ``}
          <div class="guest-nameblock">
            <span class="guest-name-text">${nome}</span>
            <span class="guest-arrivo guest-arrivo-under" aria-label="Arrivo">${arrivoText}</span>
          </div>
        </div>
        <div class="guest-meta-right" aria-label="Stato">
          <span class="guest-led ${led.cls}" aria-label="${led.label}" title="${led.label}"></span>
        </div>
      </div>
    `;

    const open = () => {
      // In caso di multi prenotazioni: mantiene contesto e mostra elenco nella scheda
      if (group.bookings && group.bookings.length > 1){
        state.guestGroupBookings = group.bookings;
        state.guestGroupKey = group.key;
        state.guestGroupActiveId = guestIdOf(first);
      } else {
        state.guestGroupBookings = null;
        state.guestGroupKey = null;
        state.guestGroupActiveId = null;
        try{ clearGuestMulti(); }catch(_){ }
      }
      enterGuestViewMode(first);
      showPage("ospite");
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    frag.appendChild(card);
  });
  wrap.appendChild(frag);
}






function initFloatingLabels(){
  const fields = document.querySelectorAll(".field.float");
  fields.forEach((f) => {
    const control = f.querySelector("input, select, textarea");
    if (!control) return;
    const update = () => {
      const has = !!(control.value && String(control.value).trim().length);
      f.classList.toggle("has-value", has);
    };
    control.addEventListener("input", update);
    control.addEventListener("change", update);
    update();
  });
}


function refreshFloatingLabels(){
  try{
    document.querySelectorAll(".field.float").forEach(f => {
      const c = f.querySelector("input, select, textarea");
      const v = c ? String(c.value ?? "").trim() : "";
      f.classList.toggle("has-value", v.length > 0);
    });
  }catch(_){}
}


async function init(){
  // Perf mode: deve girare DOPO che body esiste e DOPO init delle costanti
  applyPerfMode();
  const __restore = __readRestoreState();
  // Session + anno
  state.session = loadSession();
  state.exerciseYear = loadExerciseYear();
  updateYearPill();

  // Imposta una pagina di default (poi showPage verrà chiamata UNA sola volta)
  document.body.dataset.page = (state.session && state.session.user_id) ? "home" : "auth";
  setupHeader();
  setupAuth();
  setupHome();
  setupCalendario();
  setupImpostazioni();

    setupOspite();
  initFloatingLabels();

  // Non chiamare showPage qui: evitiamo doppie navigazioni/render all'avvio
// periodo iniziale
  if (__restore && __restore.preset) state.periodPreset = __restore.preset;
  if (__restore && __restore.period && __restore.period.from && __restore.period.to) {
    setPeriod(__restore.period.from, __restore.period.to);
  } else {
    const [from,to] = monthRangeISO(new Date());
    setPeriod(from,to);
  }

  // Preset periodo (scroll iOS)
  bindPresetSelect("#periodPreset1");
  bindPresetSelect("#periodPreset2");
  bindPresetSelect("#periodPreset3");
  bindPresetSelect("#periodPreset4");
  setPresetValue(state.periodPreset || "this_month");

  // Ordinamento Spese (lista)
  if (!state.speseSort) state.speseSort = "date";
  const spSort = document.getElementById("speseSort");
  if (spSort){
    spSort.value = state.speseSort;
    spSort.addEventListener("change", () => {
      state.speseSort = spSort.value || "date";
      try { if (state.page === "spese" && state.speseView === "list") renderSpese(); } catch(_){}
    });
  }


  // Periodo automatico (niente tasto Applica)
  bindPeriodAuto("#fromDate", "#toDate");
  bindPeriodAuto("#fromDate2", "#toDate2");
  bindPeriodAuto("#fromDate3", "#toDate3");
  setupGuestListControls();

  $("#spesaData").value = todayISO();

  // Motivazione: se l'utente scrive una variante già esistente, usa la versione canonica
  const mot = $("#spesaMotivazione");
  if (mot) {
    mot.addEventListener("blur", () => {
      const v = collapseSpaces((mot.value || "").trim());
      if (!v) return;
      const canonical = findCanonicalMotivazione(v);
      if (canonical) mot.value = canonical;
      else mot.value = v; // pulizia spazi multipli
    });
  }

  $("#btnSaveSpesa").addEventListener("click", async () => {
    try { await saveSpesa(); } catch(e){ toast(e.message); }
  });


  // prefetch leggero (no await): evita blocchi e “clessidra” ripetute all'avvio
  if (state.session && state.session.user_id){
    try { loadMotivazioni().catch(() => {}); } catch(_){ }
    try { ensureSettingsLoaded({ force:false, showLoader:false }).catch(() => {}); } catch(_){ }
  }

  // avvio: ripristina sezione se il SW ha forzato un reload su iOS
  const targetPage = (__restore && __restore.page) ? __restore.page : "home";
  showPage(targetPage);
  if (__restore) setTimeout(() => { try { __applyUiState(__restore); } catch(_) {} }, 0);


  // --- Pulizie (solo grafica) ---
  const cleanPrev = document.getElementById("cleanPrev");
  const cleanNext = document.getElementById("cleanNext");
  const cleanToday = document.getElementById("cleanToday");

  const cleanGrid = document.getElementById("cleanGrid");
  const cleanSaveLaundry = document.getElementById("cleanSaveLaundry");
  const cleanSaveHours = document.getElementById("cleanSaveHours");
  const btnLaundryFromPulizie = document.getElementById("topLaundryBtn");
  const btnOrePuliziaFromPulizie = document.getElementById("topWorkBtn");

  // --- Pulizie: popup descrizioni intestazioni (MAT/SIN/...) ---
  const cleanHeaderModal = document.getElementById("cleanHeaderModal");
  const cleanHeaderText = document.getElementById("cleanHeaderText");
  const cleanHeaderClose = document.getElementById("cleanHeaderClose");

  const CLEAN_HEADER_DESC = {
    MAT: "Lenzuolo Matrimoniale",
    SIN: "Lenzuolo Singolo",
    FED: "Federe",
    TDO: "Telo Doccia",
    TFA: "Telo Faccia",
    TBI: "Telo Bidet",
    TAP: "Tappeto",
    TPI: "Telo Piscina",
  };

  const openCleanHeaderModal = (code) => {
    if (!cleanHeaderModal || !cleanHeaderText) return;
    const c = String(code || "").trim().toUpperCase();
    const text = CLEAN_HEADER_DESC[c] || "";
    if (!text) return;
    cleanHeaderText.textContent = text;
    cleanHeaderModal.hidden = false;
  };

  const closeCleanHeaderModal = () => {
    if (!cleanHeaderModal) return;
    cleanHeaderModal.hidden = true;
  };

  if (cleanHeaderClose){
    cleanHeaderClose.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeCleanHeaderModal();
    }, true);
  }

  if (cleanHeaderModal){
    cleanHeaderModal.addEventListener("click", (e) => {
      // click fuori dalla card chiude
      if (e.target === cleanHeaderModal) closeCleanHeaderModal();
    }, true);
  }



  const readCell = (el) => {
    const v = String(el.textContent || "").trim();
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  };
  const writeCell = (el, n) => {
    const val = Math.max(0, parseInt(n || 0, 10) || 0);
    el.textContent = val ? String(val) : "";
  };

  const getCleanDate = () => {
    const d = state.cleanDay ? new Date(state.cleanDay) : new Date();
    return toISODateLocal(d);
  };

  // --- Ore operatori (foglio "operatori") ---
  const OP_BENZINA_EUR = (state.settings && state.settings.loaded) ? getSettingNumber("costo_benzina", 2.00) : 2.00;   // € per presenza
  const OP_RATE_EUR_H = (state.settings && state.settings.loaded) ? getSettingNumber("tariffa_oraria", 8.00) : 8.00;    // € per ora

    const opEls = [
    { name: document.getElementById("op1Name"), hours: document.getElementById("op1Hours") },
    { name: document.getElementById("op2Name"), hours: document.getElementById("op2Hours") },
    { name: document.getElementById("op3Name"), hours: document.getElementById("op3Hours") },
  ].filter(x => x.name && x.hours);

  const readHourDot = (el) => {
    const n = parseInt(String(el.dataset.value || "0"), 10);
    return isNaN(n) ? 0 : Math.max(0, n);
  };
  const writeHourDot = (el, n) => {
    const val = Math.max(0, parseInt(n || 0, 10) || 0);
    el.dataset.value = String(val);
    el.textContent = val ? String(val) : "";
    el.classList.toggle("is-zero", !val);
  };

  const bindHourDot = (el) => {
    // Tap incrementa, long press (0.5s) azzera — come la biancheria
    let pressTimer = null;
    let longFired = false;
    let lastTouchAt = 0;

    const clear = () => {
      if (pressTimer){ clearTimeout(pressTimer); pressTimer = null; }
      longFired = false;
    };

    const onLong = () => { el.classList.remove("is-saved"); writeHourDot(el, 0); };
    const onTap = () => { el.classList.remove("is-saved"); writeHourDot(el, readHourDot(el) + 1); };

    el.addEventListener("touchstart", (e) => {
      lastTouchAt = Date.now();
      clear();
      pressTimer = setTimeout(() => {
        longFired = true;
        onLong();
      }, 500);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });

    el.addEventListener("touchend", (e) => {
      if (pressTimer){ clearTimeout(pressTimer); pressTimer = null; }
      if (!longFired) onTap();
      clear();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });

    el.addEventListener("touchcancel", (e) => {
      clear();
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
    }, { passive: false, capture: true });

    // Click (desktop) + anti ghost-click dopo touch
    el.addEventListener("click", (e) => {
      if (Date.now() - lastTouchAt < 450) { e.preventDefault(); e.stopPropagation(); return; }
      onTap();
      e.preventDefault();
      e.stopPropagation();
    }, true);
  };

  const syncCleanOperators = () => {
  const names = getOperatorNamesFromSettings(); // [op1, op2, op3]

  opEls.forEach((r, idx) => {
    const n = String(names[idx] || "").trim();
    const rowEl = (r.hours && r.hours.closest) ? r.hours.closest(".clean-op-row") : null;

    // Se non è impostato: NON mostrare né scritta né pallino
    if (!n) {
      if (rowEl) rowEl.style.display = "none";
      if (String(r.name.tagName || "").toUpperCase() === "INPUT") {
        r.name.value = "";
      } else {
        r.name.textContent = "";
        r.name.classList.remove("is-placeholder");
      }
      // sicurezza: azzera il dot
      writeHourDot(r.hours, 0);
      return;
    }

    // Se impostato: mostra riga e applica nome
    if (rowEl) rowEl.style.display = "";

    // Nome: solo lettura
    if (String(r.name.tagName || "").toUpperCase() === "INPUT") {
      r.name.readOnly = true;
      r.name.setAttribute("readonly", "");
      r.name.value = n;
    } else {
      r.name.textContent = n;
      r.name.classList.remove("is-placeholder");
    }

    // Dot: init a 0 (se mancante)
    if (!r.hours.dataset.value) writeHourDot(r.hours, 0);

    // Accessibilità: usa il nome reale
    try {
      r.name.setAttribute("aria-label", n);
      r.hours.setAttribute("aria-label", "Ore " + n);
    } catch (_) {}
  });
};

  try{ syncCleanOperators(); }catch(_){}
  opEls.forEach(r => { try{ bindHourDot(r.hours); }catch(_){ } });

  const buildOperatoriPayload = () => {
    const date = getCleanDate();
    const rows = [];
    const names = getOperatorNamesFromSettings(); // [op1, op2, op3]

    const hasAnyName = names.some(n => String(n || "").trim());
    if (!hasAnyName){
      throw new Error("Imposta i nomi operatori in Impostazioni");
    }

    // IMPORTANTE: inviamo ANCHE le ore a 0.
    // Il backend farà "replace" del giorno: cancella i record esistenti per quella data
    // e reinserisce solo quelli con ore > 0. Così un secondo salvataggio SOVRASCRIVE.
    opEls.forEach((r, idx) => {
      const name = String(names[idx] || "").trim();
      if (!name) return; // operatore non configurato

      const hours = readHourDot(r.hours); // può essere 0
      rows.push({
        data: date,
        operatore: name,
        ore: hours,
        benzina_euro: OP_BENZINA_EUR
      });
    });

    return { touched: true, payload: { data: date, operatori: rows, replaceDay: true } };
  };



  
  const clearAllSlots = () => {
    document.querySelectorAll(".clean-grid .cell.slot").forEach(el => { el.textContent = ""; el.classList.remove("is-saved"); });
  };

  const applyPulizieRows = (rows) => {
    clearAllSlots();
    if (!Array.isArray(rows)) return;
    rows.forEach(r => {
      const room = String(r.stanza || r.room || "").trim();
      if (!room) return;
      ["MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI"].forEach(c => {
        const cell = document.querySelector(`.clean-grid .cell.slot[data-room="${room}"][data-col="${c}"]`);
        if (!cell) return;
        const n = parseInt(r[c] ?? 0, 10);
        cell.textContent = (!isNaN(n) && n>0) ? String(n) : "";
        cell.classList.toggle("is-saved", (!isNaN(n) && n>0));
      });
    });
  };

  // --- Ore operatori: carica dal DB per il giorno selezionato (così un nuovo salvataggio SOVRASCRIVE davvero) ---
  const _normOpName = (s) => String(s || "").trim().toLowerCase();

  const applyOperatoriRows = (rows) => {
    if (!Array.isArray(rows)) rows = [];
    const map = new Map();
    rows.forEach(r => {
      const op = _normOpName(r?.operatore || r?.nome || "");
      const ore = parseInt(String(r?.ore ?? 0), 10);
      if (op) map.set(op, isNaN(ore) ? 0 : Math.max(0, ore));
    });

    const names = getOperatorNamesFromSettings(); // [op1, op2, op3]
    opEls.forEach((r, idx) => {
      const name = String(names[idx] || "").trim();
      if (!name) return; // non configurato (riga nascosta)
      const v = map.get(_normOpName(name)) || 0;
      writeHourDot(r.hours, v);
      r.hours.classList.toggle("is-saved", v > 0);
    });
  };

  const loadOperatoriForDay = async ({ clearFirst = true } = {}) => {
    if (clearFirst){
      // azzera dots visivamente (se poi arrivano dati li ripopola)
      const names = getOperatorNamesFromSettings();
      opEls.forEach((r, idx) => {
        const name = String(names[idx] || "").trim();
        if (!name) return;
        writeHourDot(r.hours, 0);
        r.hours.classList.remove("is-saved");
      });
    }
    try{
      const data = getCleanDate();
      const res = await api("operatori", { method:"GET", params:{ data }, showLoader:false });

      const rows = Array.isArray(res) ? res
        : (res && Array.isArray(res.rows) ? res.rows
        : (res && Array.isArray(res.data) ? res.data
        : []));
      applyOperatoriRows(rows);
    }catch(_){
      // offline/errore: se clearFirst era true, restano a 0
    }
  };


  const loadPulizieForDay = async ({ clearFirst = true } = {}) => {
    // Regola: quando cambi giorno, la griglia deve essere SUBITO vuota.
    // Poi, se ci sono dati salvati per quel giorno, li carichiamo.
    if (clearFirst) clearAllSlots();
    try{
      const day = state.cleanDay ? new Date(state.cleanDay) : new Date();
      const data = toISODateLocal(day);
      const res = await api("pulizie", { method:"GET", params:{ data }, showLoader:false });
      // Supporta risposte: array diretto, oppure {data:[...]}
      const rows = Array.isArray(res) ? res
        : (res && Array.isArray(res.data) ? res.data
        : (res && res.data && Array.isArray(res.data.data) ? res.data.data
        : (res && Array.isArray(res.rows) ? res.rows
        : [])));
      if (rows.length) applyPulizieRows(rows);
      // altrimenti resta come sta
    }catch(_){
      // offline/errore: se stiamo cambiando giorno, resta vuota; se stiamo solo ricaricando dopo salvataggio, non tocchiamo
      if (clearFirst) clearAllSlots();
    }
  };

const buildPuliziePayload = () => {
    const data = getCleanDate();
    const rooms = ["1","2","3","4","5","6","RES"];
    const cols = ["MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI"];
    const rows = rooms.map(stanza => {
      const row = { data, stanza };
      cols.forEach(c => {
        const cell = document.querySelector(`.clean-grid .cell.slot[data-room="${stanza}"][data-col="${c}"]`);
        row[c] = cell ? readCell(cell) : 0;
      });
      return row;
    });
    return { data, rows };
  };

  // Tap incrementa, long press (0.5s) azzera
  let pressTimer = null;
  let pressTarget = null;
  let longFired = false;
  let lastTouchAt = 0;

  const clearPress = () => {
    if (pressTimer){ clearTimeout(pressTimer); pressTimer = null; }
    pressTarget = null;
    longFired = false;
  };

  const startPress = (slot) => {
    clearPress();
    pressTarget = slot;
    pressTimer = setTimeout(() => {
      longFired = true;
      slot.classList.remove("is-saved");
      writeCell(slot, 0);
    }, 500);
  };

  const tapSlot = (slot) => {
    slot.classList.remove("is-saved");
    writeCell(slot, readCell(slot) + 1);
  };

  if (cleanGrid){
    // Header click (MAT/SIN/FED...): mostra descrizione in popup
    let __lastHeadTouchAt = 0;
    const __pickHeadCode = (ev) => {
      const head = ev.target && ev.target.closest ? ev.target.closest(".cell.head") : null;
      if (!head || head.classList.contains("corner")) return null;
      const code = String(head.textContent || "").trim().toUpperCase();
      return CLEAN_HEADER_DESC[code] ? code : null;
    };

    cleanGrid.addEventListener("touchend", (e) => {
      const code = __pickHeadCode(e);
      if (!code) return;
      __lastHeadTouchAt = Date.now();
      openCleanHeaderModal(code);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });

    cleanGrid.addEventListener("click", (e) => {
      const code = __pickHeadCode(e);
      if (!code) return;
      if (Date.now() - __lastHeadTouchAt < 450) { e.preventDefault(); e.stopPropagation(); return; }
      openCleanHeaderModal(code);
      e.preventDefault();
      e.stopPropagation();
    }, true);


    // Touch (iPhone)
    cleanGrid.addEventListener("touchstart", (e) => {
      const slot = e.target.closest && e.target.closest(".cell.slot");
      if (!slot) return;
      lastTouchAt = Date.now();
      startPress(slot);
      // blocca altri handler globali
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });

    cleanGrid.addEventListener("touchend", (e) => {
      const slot = e.target.closest && e.target.closest(".cell.slot");
      if (!slot) return;
      if (pressTimer){ clearTimeout(pressTimer); pressTimer = null; }
      if (!longFired) tapSlot(slot);
      clearPress();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });

    cleanGrid.addEventListener("touchcancel", (e) => {
      clearPress();
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
    }, { passive: false, capture: true });

    // Click (desktop) + anti ghost-click dopo touch
    cleanGrid.addEventListener("click", (e) => {
      const slot = e.target.closest && e.target.closest(".cell.slot");
      if (!slot) return;
      if (Date.now() - lastTouchAt < 450) { e.preventDefault(); e.stopPropagation(); return; }
      tapSlot(slot);
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  // Salva biancheria (foglio "pulizie")
if (cleanSaveLaundry){
  cleanSaveLaundry.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try{
      const payload = buildPuliziePayload();
      await api("pulizie", { method:"POST", body: payload });

      // ricarica dal DB senza svuotare (così resta visibile subito)
      try{ await loadPulizieForDay({ clearFirst:false }); }catch(_){ }

      toast("Biancheria salvata", "blue");
    }catch(err){
      toast(String(err && err.message || "Errore salvataggio biancheria"));
    }
  }, true);
}

// Salva ore lavoro (foglio "operatori") — REPLACE per data (sovrascrive report del giorno)
if (cleanSaveHours){
  cleanSaveHours.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try{
      const { touched, payload: opPayload } = buildOperatoriPayload();

      if (!touched){
        toast("Nessun operatore configurato");
        return;
      }

      const res = await api("operatori", { method:"POST", body: opPayload });
      const saved = (res && typeof res.saved === "number") ? res.saved : 0;
      const deleted = (res && typeof res.deleted === "number") ? res.deleted : null;

      // Ricarica dal DB per confermare UI allineata
      try{ await loadOperatoriForDay({ clearFirst:false }); }catch(_){}

      const msg = (deleted != null)
        ? `Ore lavoro salvate (${saved}) — sostituiti ${deleted} record`
        : `Ore lavoro salvate (${saved})`;
      toast(msg, "orange");
    }catch(err){
      toast(String(err && err.message || "Errore salvataggio ore lavoro"));
    }
  }, true);
}


  const updateCleanLabel = () => {
    const lab = document.getElementById("cleanDateLabel");
    if (!lab) return;
    const base = state.cleanDay ? new Date(state.cleanDay) : new Date();
    lab.textContent = formatFullDateIT(startOfLocalDay(base));
  };

  const shiftClean = (deltaDays) => {
    const base = state.cleanDay ? new Date(state.cleanDay) : new Date();
    const d = startOfLocalDay(base);
    d.setDate(d.getDate() + deltaDays);
    state.cleanDay = d.toISOString();
    updateCleanLabel();
    try{ loadPulizieForDay(); }catch(_){ }
    try{ loadOperatoriForDay(); }catch(_){ }
  };

  if (cleanPrev) cleanPrev.addEventListener("click", () => shiftClean(-1));
  if (cleanNext) cleanNext.addEventListener("click", () => shiftClean(1));
  if (cleanToday) cleanToday.addEventListener("click", () => {
    state.cleanDay = startOfLocalDay(new Date()).toISOString();
    updateCleanLabel();
    try{ loadPulizieForDay(); }catch(_){ }
    try{ loadOperatoriForDay(); }catch(_){ }
  });

  // inizializza label se apri direttamente la pagina
  if (!state.cleanDay) state.cleanDay = startOfLocalDay(new Date()).toISOString();
  updateCleanLabel();
  try{ loadPulizieForDay(); }catch(_){ }
    try{ loadOperatoriForDay(); }catch(_){ }



// --- Lavanderia ---
  const btnLaundryGenerate = document.getElementById("btnLaundryGenerate");
  try{
    const fromEl = document.getElementById("laundryFrom");
    const toEl   = document.getElementById("laundryTo");
    if (fromEl){ fromEl.addEventListener("change", syncLaundryDateText_); fromEl.addEventListener("input", syncLaundryDateText_); }
    if (toEl){ toEl.addEventListener("change", syncLaundryDateText_); toEl.addEventListener("input", syncLaundryDateText_); }
    syncLaundryDateText_();
  }catch(_){ }

if (btnLaundryGenerate){
    bindFastTap(btnLaundryGenerate, async () => {
      try{
        showPage("lavanderia");
        await createLavanderiaReport_();
      }catch(e){
        console.error(e);
        try{ toast(e.message || "Errore"); }catch(_){}
      }
    });
  }
if (typeof btnOrePuliziaFromPulizie !== "undefined" && btnOrePuliziaFromPulizie){
    bindFastTap(btnOrePuliziaFromPulizie, () => {
      try{ showPage("orepulizia"); }catch(_){}
    });
  }

  if (typeof btnLaundryFromPulizie !== "undefined" && btnLaundryFromPulizie){
    bindFastTap(btnLaundryFromPulizie, async () => {
      try{
        showPage("lavanderia");
        }catch(e){
        console.error(e);
        try{ toast(e.message || "Errore"); }catch(_){}
      }
    });
  }

}


// ===== CALENDARIO (dDAE_2.019) =====
function setupCalendario(){
  const pickBtn = document.getElementById("calPickBtn");
  const todayBtn = document.getElementById("calTodayBtn");
  const prevMonthBtn = document.getElementById("calPrevMonthBtn");
  const prevBtn = document.getElementById("calPrevBtn");
  const nextBtn = document.getElementById("calNextBtn");
  const nextMonthBtn = document.getElementById("calNextMonthBtn");
  const syncBtn = document.getElementById("calSyncBtn");
  const input = document.getElementById("calDateInput");

  if (!state.calendar) {
    state.calendar = { anchor: new Date(), ready: false, guests: [] };
  }

  const __scheduleCalendarFetch = (() => {
    let t = null;
    return ({ force=false, showLoader=false } = {}) => {
      if (!state.calendar) return;
      if (t) { try{ clearTimeout(t); }catch(_){} }
      const req = (state.calendar._reqId = (state.calendar._reqId || 0) + 1);
      state.calendar.loading = true;
      t = setTimeout(async () => {
        const my = req;
        try{
          await ensureCalendarData({ force, showLoader });
        }catch(e){
          console.error(e);
        }finally{
          try{ if (state.calendar && state.calendar._reqId === my) state.calendar.loading = false; }catch(_){}
        }
        try{
          if (state.page === "calendario" && state.calendar && state.calendar._reqId === my){
            renderCalendario();
          }
        }catch(_){ }
      }, 120);
    };
  })();

  // Sync: forza lettura database (tap-safe iOS PWA)
  if (syncBtn){
    syncBtn.setAttribute("aria-label", "Forza lettura database");
    bindFastTap(syncBtn, async () => {
      try{
        syncBtn.disabled = true;
        syncBtn.classList.add("is-loading");
        if (state.calendar) state.calendar.ready = false;
        await ensureCalendarData({ force:true, showLoader:false });
        renderCalendario();
        try{ toast("Aggiornato"); }catch(_){ }
      }catch(e){
        console.error(e);
        try{ toast(e.message || "Errore"); }catch(_){ }
      }finally{
        syncBtn.classList.remove("is-loading");
        syncBtn.disabled = false;
      }
    });
  }

  const openPicker = () => {
    if (!input) return;
    try { input.value = formatISODateLocal(state.calendar.anchor) || todayISO(); } catch(_) {}
    input.click();
  };

  if (pickBtn) pickBtn.addEventListener("click", openPicker);
  if (input) input.addEventListener("change", () => {
    if (!input.value) return;
    const d = new Date(input.value + "T00:00:00");
    state.calendar.anchor = d;
    renderCalendario();
    __scheduleCalendarFetch({ force:false, showLoader:false });
  });
  if (todayBtn) todayBtn.addEventListener("click", () => {
    const d = new Date();
    d.setHours(0,0,0,0);
    state.calendar.anchor = d;
    renderCalendario();
    __scheduleCalendarFetch({ force:false, showLoader:false });
  });

  const addMonthsClamped = (dt, delta) => {
    const d = new Date(dt);
    const day = d.getDate();
    // vai al primo del mese per evitare overflow (es. 31 -> mese con 30)
    d.setHours(0,0,0,0);
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    d.setHours(0,0,0,0);
    return d;
  };

  const shiftAnchorAndRender = (newAnchor, { force=false } = {}) => {
    state.calendar.anchor = newAnchor;
    // Render immediato: prima cambia pagina, poi aggiorna i dati
    renderCalendario();
    // Refresh in background (no loader)
    __scheduleCalendarFetch({ force, showLoader:false });
  };

  if (prevMonthBtn) prevMonthBtn.addEventListener("click", () => {
    shiftAnchorAndRender(addMonthsClamped(state.calendar.anchor, -1));
  });
  if (prevBtn) prevBtn.addEventListener("click", () => {
    shiftAnchorAndRender(addDays(state.calendar.anchor, -7));
  });
  if (nextBtn) nextBtn.addEventListener("click", () => {
    shiftAnchorAndRender(addDays(state.calendar.anchor, 7));
  });

  if (nextMonthBtn) nextMonthBtn.addEventListener("click", () => {
    shiftAnchorAndRender(addMonthsClamped(state.calendar.anchor, 1));
  });
}


async function ensureCalendarData({ force = false, showLoader = false } = {}) {
  if (!state.calendar) state.calendar = { anchor: new Date(), ready: false, guests: [], rangeKey: "" };

  const anchor = (state.calendar && state.calendar.anchor) ? state.calendar.anchor : new Date();
  const start = startOfWeekMonday(anchor);

  // Finestra dati: 2 settimane prima + 2 settimane dopo (evita payload enormi)
  const winFrom = toISO(addDays(start, -14));
  const winTo = toISO(addDays(start, 7 + 14));
  const rangeKey = `${winFrom}|${winTo}`;

  // Se ho già i dati per questa finestra, non ricarico
  if (!force && state.calendar.ready && state.calendar.rangeKey === rangeKey) return;

  // Carica configurazione letti ("stanze") solo se serve (evita loader ad ogni navigazione)
  if (!state.stanzeRows || !state.stanzeRows.length){
    try{ await load({ showLoader }); }catch(_){ }
  }

  const data = await cachedGet("ospiti", { from: winFrom, to: winTo }, { showLoader, ttlMs: 60*1000, force });
  state.calendar.guests = Array.isArray(data) ? data : [];
  state.calendar.ready = true;
  state.calendar.rangeKey = rangeKey;
  state.calendar.fetchedAt = Date.now();
}


function renderCalendario(){
  const grid = document.getElementById("calGrid");
  try{ if (grid) grid.classList.toggle("is-loading", !!(state.calendar && state.calendar.loading)); }catch(_){ }
  const title = document.getElementById("calWeekTitle");
  const input = document.getElementById("calDateInput");
  if (!grid) return;

  grid.replaceChildren();
  const frag = document.createDocumentFragment();

  const anchor = (state.calendar && state.calendar.anchor) ? state.calendar.anchor : new Date();
  const start = startOfWeekMonday(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  // Mantieni input data sincronizzato con l'anchor (utile quando navighi con le frecce)
  try{ if (input) input.value = formatISODateLocal(anchor) || todayISO(); }catch(_){ }

  if (title) {
    const month = monthNameIT(anchor).toUpperCase();
    title.textContent = month;
  }

  const occ = buildWeekOccupancy(start);

  grid.innerHTML = "";

  // Angolo alto-sinistra: etichetta "ST" (sopra la colonna stanze, a sinistra dei giorni)
  const corner = document.createElement("div");
  corner.className = "cal-cell cal-head cal-corner";
  corner.innerHTML = `<div class="cal-corner-text">ST</div>`;
  frag.appendChild(corner);

// Prima riga: giorni (colonne)
  for (let i = 0; i < 7; i++) {
    const d = days[i];
    const dayPill = document.createElement("div");
    dayPill.className = "cal-cell cal-head";

    // Abbreviazione (LUN, MAR...) sopra, numero giorno sotto
    const ab = document.createElement("div");
    ab.className = "cal-day-abbrev";
    ab.textContent = weekdayShortIT(d).toUpperCase();

    const num = document.createElement("div");
    num.className = "cal-day-num";
    num.textContent = String(d.getDate());

    dayPill.appendChild(ab);
    dayPill.appendChild(num);

    frag.appendChild(dayPill);
  }

  // Righe: stanze (prima colonna) + celle per ogni giorno
  for (let r = 1; r <= 6; r++) {
    const pill = document.createElement("div");
    pill.className = `cal-pill room room-${r}`;

    const rn = document.createElement("span");
    rn.className = "cal-room-num";
    rn.textContent = String(r);
    pill.appendChild(rn);

    frag.appendChild(pill);

    for (let i = 0; i < 7; i++) {
      const d = days[i];
      const dIso = isoDate(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cal-cell room-${r}`;
      cell.setAttribute("aria-label", `Stanza ${r}, ${weekdayShortIT(d)} ${d.getDate()}`);
      cell.dataset.date = dIso;
      cell.dataset.room = String(r);
      const info = occ.get(`${dIso}:${r}`);
      if (!info) {
        // Casella vuota: nessuna azione (evita anche handler globali tipo [data-room])
        cell.addEventListener("click", (ev)=>{
          try { ev.preventDefault(); } catch (_) {}
          try { ev.stopPropagation(); } catch (_) {}

          // Feedback minimo: solo bordo nero spesso (nessuna azione / nessuna apertura schede)
          try{
            const prev = grid.querySelector(".cal-cell.empty-selected");
            if (prev && prev !== cell) prev.classList.remove("empty-selected");
            cell.classList.toggle("empty-selected");
          }catch(_){}
        });
      }
      if (info) {
        cell.classList.add("has-booking");
        if (info.lastDay) cell.classList.add("last-day");

        const inner = document.createElement("div");
        inner.className = "cal-cell-inner";

        const ini = document.createElement("div");
        ini.className = "cal-initials";
        ini.textContent = info.initials;
        inner.appendChild(ini);

        const dots = document.createElement("div");
        dots.className = "cal-dots";
        const arr = info.dots.slice(0, 4); // 2x2
        for (const t of arr) {
          const s = document.createElement("span");
          s.className = `bed-dot ${t === "m" ? "bed-dot-m" : t === "s" ? "bed-dot-s" : "bed-dot-c"}`;
          dots.appendChild(s);
        }
        inner.appendChild(dots);

        cell.appendChild(inner);

        cell.addEventListener("click", (ev) => {
          // Pulisci eventuale selezione su casella vuota
          try{ const prev = grid.querySelector(".cal-cell.empty-selected"); if (prev) prev.classList.remove("empty-selected"); }catch(_){}

          // Se la cella ha una prenotazione, apri la scheda in SOLA LETTURA
          // e blocca la propagazione per evitare l'apertura del popup letto (listener globale [data-room]).
          try { ev.preventDefault(); } catch (_) {}
          try { ev.stopPropagation(); } catch (_) {}

          const ospite = findCalendarGuestById(info.guestId);
          if (!ospite) return;
          enterGuestViewMode(ospite);
          showPage("ospite");
        });
      }

      frag.appendChild(cell);
    }
  }
  grid.appendChild(frag);
}


function findCalendarGuestById(id){
  const gid = String(id ?? "").trim();
  const arr = (state.calendar && Array.isArray(state.calendar.guests)) ? state.calendar.guests : [];
  return arr.find(o => String(o.id ?? o.ID ?? o.ospite_id ?? o.ospiteId ?? o.guest_id ?? o.guestId ?? "").trim() === gid) || null;
}

function buildWeekOccupancy(weekStart){
  const map = new Map();
  const guests = (state.calendar && Array.isArray(state.calendar.guests)) ? state.calendar.guests : [];
  const weekEnd = addDays(weekStart, 7);
  const todayIso = isoDate(new Date());


  for (const g of guests){
    const guestId = String(g.id ?? g.ID ?? g.ospite_id ?? g.ospiteId ?? g.guest_id ?? g.guestId ?? "").trim();
    if (!guestId) continue;

    const ciStr = formatISODateLocal(g.check_in || g.checkIn || "");
    const coStr = formatISODateLocal(g.check_out || g.checkOut || "");
    if (!ciStr || !coStr) continue;

    const ci = new Date(ciStr + "T00:00:00");
    const co = new Date(coStr + "T00:00:00");
    const last = addDays(co, -1);
    const lastIso = isoDate(last);
    const lastIsPresentOrFuture = (lastIso >= todayIso);

    let roomsArr = [];
    try {
      const st = g.stanze;
      if (Array.isArray(st)) roomsArr = st;
      else if (st != null && String(st).trim().length) {
        const m = String(st).match(/[1-6]/g) || [];
        roomsArr = m.map(x => parseInt(x, 10));
      }
    } catch (_) {}
    roomsArr = Array.from(new Set((roomsArr||[]).map(n=>parseInt(n,10)).filter(n=>isFinite(n) && n>=1 && n<=6))).sort((a,b)=>a-b);
    if (!roomsArr.length) continue;

    const initials = initialsFromName(g.nome || g.name || "");

    for (let d = new Date(ci); d < co; d = addDays(d, 1)) {
      if (d < weekStart || d >= weekEnd) continue;
      const dIso = isoDate(d);
      const isLast = isoDate(d) === lastIso;

      for (const r of roomsArr) {
        const dots = dotsForGuestRoom(guestId, r);
        map.set(`${dIso}:${r}`, { guestId, initials, dots, lastDay: isLast });
      }
    }
  }
  return map;
}

function dotsForGuestRoom(guestId, room){
  const key = `${guestId}:${room}`;
  const info = (state.stanzeByKey && state.stanzeByKey[key]) ? state.stanzeByKey[key] : { letto_m:0, letto_s:0, culla:0 };
  const lettoM = Number(info.letto_m || 0) || 0;
  const lettoS = Number(info.letto_s || 0) || 0;
  const culla = Number(info.culla || 0) || 0;

  const arr = [];
  if (lettoM > 0) arr.push("m");
  for (let i=0;i<lettoS;i++) arr.push("s");
  if (culla > 0) arr.push("c");
  return arr;
}

function initialsFromName(name){
  const s = collapseSpaces(String(name||"").trim());
  if (!s) return "";
  const parts = s.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  const a = parts[0].slice(0,1);
  const b = parts[parts.length-1].slice(0,1);
  return (a+b).toUpperCase();
}

function startOfWeekMonday(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  return addDays(d, diff);
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0,0,0,0);
  return d;
}

function isoDate(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function weekdayShortIT(date){
  const names = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
  return names[new Date(date).getDay()];
}

function monthNameIT(date){
  const names = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  return names[new Date(date).getMonth()];
}

function romanWeekOfMonth(weekStart){
  const d = new Date(weekStart);
  const y = d.getFullYear();
  const m = d.getMonth();
  const firstOfMonth = new Date(y, m, 1);
  const firstWeekStart = startOfWeekMonday(firstOfMonth);
  const diff = Math.floor((startOfWeekMonday(d) - firstWeekStart) / (7*24*60*60*1000));
  const n = Math.max(1, diff + 1);
  return toRoman(n);
}

function toRoman(n){
  const map = [[10,"X"],[9,"IX"],[8,"VIII"],[7,"VII"],[6,"VI"],[5,"V"],[4,"IV"],[3,"III"],[2,"II"],[1,"I"]];
  let out = "";
  let x = Math.max(1, Math.min(10, n));
  for (const [v,s] of map){
    while (x >= v){ out += s; x -= v; }
  }
  return out || "I";
}


(async ()=>{ try{ await init(); } catch(e){ console.error(e); try{ toast(e.message||"Errore"); }catch(_){ } } })();




/* =========================
   Lavanderia (dDAE_2.019)
========================= */
const LAUNDRY_COLS = ["MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI"];
const LAUNDRY_LABELS = {
  MAT: "Matrimoniale",
  SIN: "Singolo",
  FED: "Federe",
  // Teli (arancio)
  TDO: "Telo doccia",
  TFA: "Telo Faccia",
  TBI: "Telo bidet",
  // Eccezioni
  TAP: "Tappeto",
  TPI: "Telo Piscina",
};

function sanitizeLaundryItem_(it){
  it = it || {};
  const out = {};
  out.id = String(it.id || "").trim();
  out.startDate = String(it.startDate || it.start_date || it.from || "").trim();
  out.endDate = String(it.endDate || it.end_date || it.to || "").trim();
  out.createdAt = String(it.createdAt || it.created_at || "").trim();
  out.updatedAt = String(it.updatedAt || it.updated_at || it.updatedAt || "").trim();
  for (const k of LAUNDRY_COLS){
    const n = Number(it[k]);
    out[k] = isNaN(n) ? 0 : Math.max(0, Math.floor(n));
  }
  return out;
}

function setLaundryLabels_(){
  for (const k of LAUNDRY_COLS){
    const el = document.getElementById("laundryLbl"+k);
    if (el) el.textContent = LAUNDRY_LABELS[k] || k;
  }
}

function renderLaundry_(item){
  item = item ? sanitizeLaundryItem_(item) : null;
  state.laundry.current = item;

  const rangeEl = document.getElementById("laundryPeriodLabel");
  const printRangeEl = document.getElementById("laundryPrintRange");

  if (!item){
    if (rangeEl){ rangeEl.hidden = true; rangeEl.textContent = ""; }
    if (printRangeEl) printRangeEl.textContent = "";
    for (const k of LAUNDRY_COLS){
      const v = document.getElementById("laundryVal"+k);
      if (v) v.textContent = "0";
    }
    const tbody = document.getElementById("laundryPrintBody");
    if (tbody) tbody.innerHTML = "";
    return;
  }

  const startLbl = item.startDate ? formatLongDateIT(item.startDate) : "";
  const endLbl = item.endDate ? formatLongDateIT(item.endDate) : "";
  const rangeText = (startLbl && endLbl) ? `${startLbl} – ${endLbl}` : (startLbl || endLbl || "—");
  if (rangeEl){ rangeEl.hidden = false; rangeEl.innerHTML = `<b>${rangeText}</b>`; }
  if (printRangeEl) printRangeEl.textContent = rangeText;

  for (const k of LAUNDRY_COLS){
    const v = document.getElementById("laundryVal"+k);
    if (v) v.textContent = String(item[k] || 0);
  }

  const tbody = document.getElementById("laundryPrintBody");
  if (tbody){
    tbody.innerHTML = LAUNDRY_COLS.map(k => {
      const label = LAUNDRY_LABELS[k] || k;
      const val = String(item[k] || 0);
      return `<tr><td><b>${label}</b> <span style="opacity:.7">(${k})</span></td><td style="text-align:right;font-weight:950">${val}</td></tr>`;
    }).join("");
  }
}

function renderLaundryHistory_(list){
  const host = document.getElementById("laundryHistory");
  if (!host) return;
  host.innerHTML = "";

  if (!list || !list.length){
    const empty = document.createElement("div");
    empty.className = "item";
    empty.style.opacity = "0.8";
    empty.textContent = "Nessun resoconto ancora.";
    host.appendChild(empty);
    return;
  }

  list.forEach((raw) => {
    const it = sanitizeLaundryItem_(raw);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.cursor = "pointer";
    btn.style.display = "flex";
    btn.style.justifyContent = "space-between";
    btn.style.alignItems = "center";
    btn.style.gap = "10px";

    const left = document.createElement("div");
    const startLbl = it.startDate ? formatShortDateIT(it.startDate) : "";
    const endLbl = it.endDate ? formatShortDateIT(it.endDate) : "";
    left.innerHTML = `<div style="font-weight:950">${startLbl} – ${endLbl}</div>`;


    const del = document.createElement("button");
    del.type = "button";
    del.className = "laundry-del";
    del.setAttribute("aria-label", "Elimina report");
    del.innerHTML = `<span class="x">✕</span>`;

    bindFastTap(del, async (ev) => {
      try {
        ev && ev.preventDefault && ev.preventDefault();
        ev && ev.stopPropagation && ev.stopPropagation();
      } catch(_){}

      // Anti-doppio tap / tocchi multipli
      if (del.classList.contains("busy")) return;

      const startLblFull = it.startDate ? formatLongDateIT(it.startDate) : String(it.startDate || "");
      const endLblFull = it.endDate ? formatLongDateIT(it.endDate) : String(it.endDate || "");
      const msg = (startLblFull && endLblFull)
        ? `Eliminare il report lavanderia\n${startLblFull} → ${endLblFull}\n\n(Non tocca le Pulizie)`
        : "Eliminare questo report lavanderia?\n\n(Non tocca le Pulizie)";
      if (!confirm(msg)) return;

      const prevHTML = del.innerHTML;
      del.classList.add("busy");
      del.disabled = true;
      del.innerHTML = `<span class="spinner" aria-hidden="true"></span>`;

      try{
        await api("lavanderia", { method:"DELETE", body:{ id: it.id }, showLoader:true });
        toast("Report eliminato");
        await loadLavanderia();
      }catch(e){
        console.error(e);
        toast(e && e.message ? e.message : "Errore eliminazione");
        // ripristina solo se l'elemento esiste ancora
        try{
          if (del && del.isConnected){
            del.innerHTML = prevHTML;
          }
        }catch(_){}
      }finally{
        try{
          if (del && del.isConnected){
            del.classList.remove("busy");
            del.disabled = false;
            // se non è stato ripristinato nel catch
            if (!del.querySelector(".x") && !del.querySelector(".spinner")) del.innerHTML = prevHTML;
          }
        }catch(_){}
      }
    }, true);;

    btn.appendChild(left);
    btn.appendChild(del);

    bindFastTap(btn, () => {
      renderLaundry_(it);
      // scroll su
      try{ window.scrollTo({ top: 0, behavior: "smooth" }); }catch(_){
        window.scrollTo(0,0);
      }
    });

    host.appendChild(btn);
  });
}

function syncLaundryDateText_(){
  try{
    const fromEl = document.getElementById("laundryFrom");
    const toEl = document.getElementById("laundryTo");
    const fromTxt = document.getElementById("laundryFromText");
    const toTxt = document.getElementById("laundryToText");
    if (fromTxt) fromTxt.textContent = fromEl && fromEl.value ? formatShortDateIT(fromEl.value) : "--/--/--";
    if (toTxt) toTxt.textContent = toEl && toEl.value ? formatShortDateIT(toEl.value) : "--/--/--";
  }catch(_){ }
}

async function loadLavanderia() {
  setLaundryLabels_();
  const hint = document.getElementById("laundryHint");
  try {
    const res = await api("lavanderia", { method:"GET", showLoader:false });
    const rows = Array.isArray(res) ? res
      : (res && Array.isArray(res.data) ? res.data
      : (res && res.data && Array.isArray(res.data.data) ? res.data.data
      : (res && Array.isArray(res.rows) ? res.rows
      : [])));
    const list = (rows || []).map(sanitizeLaundryItem_).sort((a,b) => String(b.endDate||"").localeCompare(String(a.endDate||"")));
    state.laundry.list = list;
    renderLaundryHistory_(list);
    renderLaundry_(list[0] || null);
    if (hint) hint.textContent = "";
  } catch (e) {
    if (hint) hint.textContent = "";
    throw e;
  }
}

async function createLavanderiaReport_() {
  const hint = document.getElementById("laundryHint");
  const fromEl = document.getElementById("laundryFrom");
  const toEl = document.getElementById("laundryTo");

  const startDate = (fromEl && fromEl.value) ? String(fromEl.value).trim() : "";
  const endDate = (toEl && toEl.value) ? String(toEl.value).trim() : "";
  try{ if (typeof __laundrySyncDateText === "function") __laundrySyncDateText(); }catch(_){ }

  if (!startDate || !endDate) {
    if (hint) hint.textContent = "";
    toast("Seleziona le date");
    return null;
  }
  if (startDate > endDate) {
    if (hint) hint.textContent = "";
    toast("Intervallo non valido");
    return null;
  }

  if (hint) hint.textContent = "";
  const res = await api("lavanderia", { method:"POST", body: { startDate, endDate }, showLoader:true });
  const item = sanitizeLaundryItem_(res && res.data ? res.data : res);

  await loadLavanderia();
  renderLaundry_(item);

  if (hint) hint.textContent = "";
  return item;
}


/* Service Worker: forza update su iOS (cache-bust via query) */
async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try {
    // Query param = BUILD_VERSION -> forza fetch del file SW anche con cache aggressiva
    const reg = await navigator.serviceWorker.register(`./service-worker.js?v=${BUILD_VERSION}`, {
      updateViaCache: "none"
    });

    const checkUpdate = () => {
      try { reg?.update?.(); } catch (_) {}
    };

    // check immediato + quando torna in primo piano
    checkUpdate();
    window.addEventListener("focus", checkUpdate);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkUpdate();
    });
    // check periodico (non invasivo)
    setInterval(checkUpdate, 60 * 60 * 1000);

    // Se viene trovata una nuova versione, prova ad attivarla subito
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          try { nw.postMessage({ type: "SKIP_WAITING" }); } catch (_) {}
        }
      });
    });

    // se cambia controller, ricarica una volta per prendere i file nuovi
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      __requestSwReload();
    });
  } catch (_) {}
}
registerSW();





try{ hardUpdateCheck(); }catch(_){}

// iOS/PWA: quando l'app torna in foreground (senza un vero reload), alcune viste possono restare "stale".
// Forziamo un refresh mirato del Calendario se e' la pagina attiva.
async function __onAppResume(){
  // Se nel frattempo e' stata deployata una nuova build, hardUpdateCheck fara' reload.
  try{ await hardUpdateCheck(); }catch(_){ }

  try{
    if (state.page === "calendario") {
      if (state.calendar){ state.calendar.ready = false; }
      await ensureCalendarData({ force:true, showLoader:false });
      renderCalendario();
    }
  }catch(_){ }
}

try{
  window.addEventListener("focus", () => { __onAppResume(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) __onAppResume();
  });
}catch(_){ }
// ---  helpers (sheet "stanze") ---
function buildArrayFromState(){
  const rooms = Array.from(state.guestRooms || []).map(n=>parseInt(n,10)).filter(n=>isFinite(n)).sort((a,b)=>a-b);
  const lp = state.lettiPerStanza || {};
  return rooms.map((n)=>{
    const d = lp[String(n)] || lp[n] || {};
    return {
      stanza_num: n,
      letto_m: !!d.matrimoniale,
      letto_s: parseInt(d.singoli || 0, 10) || 0,
      culla: !!d.culla,
      note: (d.note || "").toString()
    };
  });
}

function applyToState(rows){
  state.guestRooms = state.guestRooms || new Set();
  state.lettiPerStanza = {};
  state.bedsDirty = false;
  state.stanzeSnapshotOriginal = "";
  state.guestRooms.clear();
  (Array.isArray(rows) ? rows : []).forEach(r=>{
    const n = parseInt(r.stanza_num ?? r.stanzaNum ?? r.room ?? r.stanza, 10);
    if (!isFinite(n) || n<=0) return;
    state.guestRooms.add(n);
    state.lettiPerStanza[String(n)] = {
      matrimoniale: !!(r.letto_m ?? r.lettoM ?? r.matrimoniale),
      singoli: parseInt(r.letto_s ?? r.lettoS ?? r.singoli, 10) || 0,
      culla: !!(r.culla),
      note: (r.note || "").toString()
    };
  });
}

// --- Room beds config (non-invasive) ---
state.lettiPerStanza = state.lettiPerStanza || {};
let __rc_room = null;

function __rc_renderToggle(el, on){
  el.innerHTML = `<span class="dot ${on?'on':''}"></span>`;
  el.onclick = ()=> el.firstElementChild.classList.toggle('on');
}
function __rc_renderSingoli(el, n){
  el.innerHTML = '';
  for(let i=1;i<=3;i++){
    const s=document.createElement('span');
    s.className='dot'+(i<=n?' on':'');
    s.onclick=()=>{
      [...el.children].forEach((c,ix)=>c.classList.toggle('on', ix < i));
    };
    el.appendChild(s);
  }
}

function openRoomConfig(room){
  __rc_room = String(room);
  const d = state.lettiPerStanza[__rc_room] || {matrimoniale:false,singoli:0,culla:false};
  document.getElementById('roomConfigTitle').textContent = 'Stanza '+room;
  __rc_renderToggle(document.getElementById('rc_matrimoniale'), d.matrimoniale);
  __rc_renderSingoli(document.getElementById('rc_singoli'), d.singoli);
  __rc_renderToggle(document.getElementById('rc_culla'), d.culla);
  document.getElementById('roomConfigModal').hidden = false;
}


document.getElementById('rc_save')?.addEventListener('click', ()=>{
  const matrimoniale = document.querySelector('#rc_matrimoniale .dot')?.classList.contains('on')||false;
  const culla = document.querySelector('#rc_culla .dot')?.classList.contains('on')||false;
  const singoli = document.querySelectorAll('#rc_singoli .dot.on').length;
  state.lettiPerStanza[__rc_room] = {matrimoniale, singoli, culla};
  state.bedsDirty = true;
  document.getElementById('roomConfigModal').hidden = true;
});

// Popup letti: Annulla (chiudi senza salvare)
document.getElementById('rc_cancel')?.addEventListener('click', ()=>{
  const m = document.getElementById('roomConfigModal');
  if (m) m.hidden = true;
});
// --- end room beds config ---


// --- FIX dDAE_2.019: renderSpese allineato al backend ---
// --- dDAE: Spese riga singola (senza IVA in visualizzazione) ---
function renderSpese(){
  const list = document.getElementById("speseList");
  if (!list) return;
  list.innerHTML = "";

  let items = Array.isArray(state.spese) ? [...state.spese] : [];

  // Ordina: data / inserimento / motivazione
  const mode = String(state.speseSort || "date");
  const withIdx = items.map((s, idx) => ({ s, idx }));

  const toTime = (v) => {
    if (!v) return null;
    const s = String(v);
    const iso = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)){
      const t = Date.parse(iso + "T00:00:00Z");
      return isNaN(t) ? null : t;
    }
    const t = Date.parse(s);
    return isNaN(t) ? null : t;
  };

  withIdx.sort((a, b) => {
    if (mode === "motivazione"){
      const am = (a.s.motivazione || a.s.motivo || "").toString().trim().toLowerCase();
      const bm = (b.s.motivazione || b.s.motivo || "").toString().trim().toLowerCase();
      const c = am.localeCompare(bm, "it", { sensitivity: "base" });
      return c !== 0 ? c : (a.idx - b.idx);
    }

    if (mode === "insert"){
      const ta = toTime(a.s.createdAt || a.s.created_at) ?? a.idx;
      const tb = toTime(b.s.createdAt || b.s.created_at) ?? b.idx;
      // Nuovi prima
      return (tb - ta);
    }

    // mode === "date" (default): più recenti prima
    const da = toTime(a.s.dataSpesa || a.s.data || a.s.data_spesa);
    const db = toTime(b.s.dataSpesa || b.s.data || b.s.data_spesa);
    if (da == null && db == null) return a.idx - b.idx;
    if (da == null) return 1;
    if (db == null) return -1;
    return (db - da);
  });

  items = withIdx.map(x => x.s);
  if (!items.length){
    list.innerHTML = '<div style="font-size:13px; opacity:.75; padding:8px 2px;">Nessuna spesa nel periodo.</div>';
    return;
  }

  items.forEach(s => {
    const el = document.createElement("div");
    el.className = "item spesa-bg";
    const cls = spesaCategoryClass(s);
    if (cls) el.classList.add(cls);

    const importo = Number(s.importoLordo || 0);
    const data = formatShortDateIT(s.dataSpesa || s.data || s.data_spesa || "");
    const motivoTxt = (s.motivazione || s.motivo || "").toString();
    const motivo = escapeHtml(motivoTxt);

    el.innerHTML = `
      <div class="item-top" style="align-items:center;">
        <div class="spesa-line" title="${motivo}">
          <span class="spesa-imp">${euro(importo)}</span>
          <span class="spesa-sep">·</span>
          <span class="spesa-date">${data}</span>
          <span class="spesa-sep">·</span>
          <span class="spesa-motivo">${motivo}</span>
        </div>
        <button class="delbtn delbtn-x" type="button" aria-label="Elimina record" data-del="${s.id}">Elimina</button>
      </div>
    `;

    const btn = el.querySelector("[data-del]");
    if (btn) btn.addEventListener("click", async () => {
      if (!confirm("Eliminare definitivamente questa spesa?")) return;
      await api("spese", { method:"DELETE", params:{ id: s.id } });
      toast("Spesa eliminata");
      invalidateApiCache("spese|");
      invalidateApiCache("report|");
      await ensurePeriodData({ showLoader:false, force:true });
      renderSpese();
    });

    list.appendChild(el);
  });
}



// --- FIX dDAE_2.019: delete reale ospiti ---
function attachDeleteOspite(card, ospite){
  const btn = document.createElement("button");
  btn.className = "delbtn";
  btn.textContent = "Elimina";
  btn.addEventListener("click", async () => {
    if (!confirm("Eliminare definitivamente questo ospite?")) return;
    await api("ospiti", { method:"DELETE", params:{ id: ospite.id } });
    toast("Ospite eliminato");
    invalidateApiCache("ospiti|");
    invalidateApiCache("stanze|");
    try{ if (state.calendar){ state.calendar.ready = false; state.calendar.rangeKey = ""; } }catch(_){ }
    await loadOspiti({ ...(state.period || {}), force:true });
  });
  const actions = card.querySelector(".actions") || card;
  actions.appendChild(btn);
}


// Hook delete button into ospiti render
(function(){
  const orig = window.renderOspiti;
  if (!orig) return;
  window.renderOspiti = function(){
    orig();
    const cards = document.querySelectorAll(".guest-card");
    cards.forEach(card => {
      const id = card.getAttribute("data-id");
      const ospite = (state.ospiti||[]).find(o=>String(o.id)===String(id));
      if (ospite) attachDeleteOspite(card, ospite);
    });
  }
})();


// --- FIX dDAE_2.019: mostra nome ospite ---
(function(){
  const orig = window.renderOspiti;
  if (!orig) return;
  window.renderOspiti = function(){
    orig();
    document.querySelectorAll(".guest-card").forEach(card=>{
      const id = card.getAttribute("data-id");
      const ospite = (state.ospiti||[]).find(o=>String(o.id)===String(id));
      if(!ospite) return;
      if(card.querySelector(".guest-name")) return;
      const name = document.createElement("div");
      name.className = "guest-name";
      name.textContent = ospite.nome || ospite.name || "Ospite";
      name.style.fontWeight = "950";
      name.style.fontSize = "18px";
      name.style.marginBottom = "6px";
      card.prepend(name);
    });
  }
})();



// ===== Tassa di soggiorno =====
let __tassaBound = false;

function __parseDateFlexibleToISO(unknown){
  // Ritorna ISO YYYY-MM-DD oppure "" se non parsabile
  const s = String(unknown || "").trim();
  if (!s) return "";
  // ISO date (YYYY-MM-DD) or ISO datetime
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  // dd/mm/yyyy
  const mIt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mIt){
    const dd = String(mIt[1]).padStart(2,"0");
    const mm = String(mIt[2]).padStart(2,"0");
    const yy = mIt[3];
    return `${yy}-${mm}-${dd}`;
  }
  return "";
}

function __utcDay(y,m,d){ return Date.UTC(y, m-1, d); }

function __daysBetweenUTC(isoA, isoB){
  // isoA, isoB: YYYY-MM-DD ; ritorna giorni interi (B - A)
  const [ya,ma,da] = isoA.split("-").map(n=>parseInt(n,10));
  const [yb,mb,db] = isoB.split("-").map(n=>parseInt(n,10));
  const ta = __utcDay(ya,ma,da);
  const tb = __utcDay(yb,mb,db);
  return Math.round((tb - ta) / 86400000);
}

function __addDaysISO(iso, delta){
  const [y,m,d] = iso.split("-").map(n=>parseInt(n,10));
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2,"0");
  const dd = String(dt.getUTCDate()).padStart(2,"0");
  return `${yy}-${mm}-${dd}`;
}

function __overlapNights(checkInISO, checkOutISO, fromISO, toISO_inclusive){
  // Intersezione tra [checkIn, checkOut) e [from, to+1)
  const toExcl = __addDaysISO(toISO_inclusive, 1);
  const start = (checkInISO > fromISO) ? checkInISO : fromISO;
  const end   = (checkOutISO < toExcl) ? checkOutISO : toExcl;
  const n = __daysBetweenUTC(start, end);
  return (isFinite(n) && n > 0) ? n : 0;
}

function resetTassaUI(){
  const res = $("#taxResults");
  if (res) res.hidden = true;
  const rb = $("#taxReportBtn");
  if (rb) rb.disabled = true;

  const ids = ["taxPayingCount","taxPayingAmount","taxKidsCount","taxKidsAmount","taxReducedCount","taxReducedAmount"];
  ids.forEach(id => { const el = $("#"+id); if (el) el.textContent = "—"; });
}

async function calcTassa(){
  const fromEl = $("#taxFrom");
  const toEl = $("#taxTo");
  const from = fromEl ? fromEl.value : "";
  const to   = toEl ? toEl.value : "";
  if (!from || !to){
    toast("Seleziona un periodo (Da/A)");
    resetTassaUI();
    return;
  }
  if (to < from){
    toast("Il periodo non è valido");
    resetTassaUI();
    return;
  }

  // Prende i dati SOLO dalle prenotazioni (foglio ospiti)
  const ospiti = await api("ospiti", { method:"GET" }) || [];

  let payingPres = 0;
  let kidsPres = 0;
  let reducedPres = 0;

  for (const o of ospiti){
    const inISO  = __parseDateFlexibleToISO(o.check_in || o.checkIn);
    const outISO = __parseDateFlexibleToISO(o.check_out || o.checkOut);
    if (!inISO || !outISO) continue;

    const nights = __overlapNights(inISO, outISO, from, to);
    if (!nights) continue;

    const adults = Number(o.adulti || 0) || 0;
    const kids   = Number(o.bambini_u10 || 0) || 0;

    // Ridotti: campo futuro (se presente). Esempi supportati: ridotti, anziani, ridotti_n
    const red = Number(o.ridotti ?? o.anziani ?? o.ridotti_n ?? 0) || 0;

    const redClamped = Math.max(0, Math.min(adults, red));
    const fullAdults = Math.max(0, adults - redClamped);

    payingPres  += fullAdults * nights;
    reducedPres += redClamped * nights;
    kidsPres    += kids * nights;
  }

  const rate = (state.settings && state.settings.loaded) ? (getSettingNumber("tassa_soggiorno", (typeof TOURIST_TAX_EUR_PPN !== "undefined" ? TOURIST_TAX_EUR_PPN : 0)) || 0) : (Number(typeof TOURIST_TAX_EUR_PPN !== "undefined" ? TOURIST_TAX_EUR_PPN : 0) || 0);
  const redFactor = Number(typeof TOURIST_TAX_REDUCED_FACTOR !== "undefined" ? TOURIST_TAX_REDUCED_FACTOR : 1) || 1;

  const payingAmt  = payingPres * rate;
  const reducedAmt = reducedPres * rate * redFactor;

  // salva per report
  state._taxLast = { from, to, payingPres, kidsPres, reducedPres, rate, redFactor, payingAmt, reducedAmt, totalAmt: (payingAmt + reducedAmt) };

  // UI: mostra solo dopo click Calcola
  const res = $("#taxResults");
  if (res) res.hidden = false;
  const rb = $("#taxReportBtn");
  if (rb) rb.disabled = false;

  const pc = $("#taxPayingCount"); if (pc) pc.textContent = String(payingPres);
  const pa = $("#taxPayingAmount"); if (pa) pa.textContent = formatEUR(payingAmt);

  const kc = $("#taxKidsCount"); if (kc) kc.textContent = String(kidsPres);
  const ka = $("#taxKidsAmount"); if (ka) ka.textContent = "—"; // non pagano

  const rc = $("#taxReducedCount"); if (rc) rc.textContent = String(reducedPres);
  const ra = $("#taxReducedAmount"); if (ra) ra.textContent = formatEUR(reducedAmt);
}


function buildTaxReportText(){
  const t = state._taxLast;
  if (!t) return "Premi prima Calcola.";
  const lines = [];
  lines.push("Report tassa di soggiorno");
  lines.push(`Periodo: ${t.from} → ${t.to}`);
  lines.push("");
  lines.push(`Presenze paganti: ${t.payingPres}`);
  lines.push(`Importo paganti: ${formatEUR(t.payingAmt)}`);
  lines.push("");
  lines.push(`Presenze ridotte: ${t.reducedPres}`);
  lines.push(`Importo ridotti: ${formatEUR(t.reducedAmt)}`);
  lines.push("");
  lines.push(`Bambini (<10): ${t.kidsPres} (esenti)`);
  lines.push("");
  lines.push(`Tariffa: ${formatEUR(t.rate)} / persona / notte`);
  if (t.redFactor !== 1) lines.push(`Fattore ridotti: ${String(t.redFactor)}`);
  lines.push("");
  lines.push(`TOTALE: ${formatEUR(t.totalAmt)}`);
  return lines.join("\n");
}

function openTaxReportModal(text){
  const modal = document.getElementById("taxReportModal");
  const pre = document.getElementById("taxReportText");
  const closeBtn = document.getElementById("taxReportCloseBtn");
  const copyBtn = document.getElementById("taxReportCopyBtn");

  if (!modal || !pre) return;
  pre.textContent = text || "";

  modal.hidden = false;
  modal.setAttribute("aria-hidden","false");

  const close = () => {
    modal.hidden = true;
    modal.setAttribute("aria-hidden","true");
  };

  // click su overlay chiude
  const onOverlay = (e)=>{
    if (e.target === modal) close();
  };
  modal.addEventListener("click", onOverlay, { once:true });

  if (closeBtn){
    closeBtn.onclick = close;
  }

  if (copyBtn){
    copyBtn.onclick = async () => {
      try{
        const txt = pre.textContent || "";
        if (navigator.clipboard && navigator.clipboard.writeText){
          await navigator.clipboard.writeText(txt);
        } else {
          // fallback
          const ta = document.createElement("textarea");
          ta.value = txt;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        toast("Copiato");
      }catch(_){
        toast("Impossibile copiare");
      }
    };
  }
}


function initTassaPage(){
  if (__tassaBound) return;
  __tassaBound = true;

  const from = $("#taxFrom");
  const to = $("#taxTo");
  if (from) from.addEventListener("change", resetTassaUI);
  if (to) to.addEventListener("change", resetTassaUI);

  const btn = $("#taxCalcBtn");
  if (btn){
    bindFastTap(btn, async () => {
      try { await calcTassa(); }
      catch (err) { toast(String(err && err.message || err || "Errore")); resetTassaUI(); }
    });
  }


// Stato iniziale: risultati nascosti finché non premi "Calcola"
  resetTassaUI();
}


/* =========================
   Ore pulizia (Calendario ore operatori)
   Build: dDAE_2.019
========================= */

state.orepulizia = state.orepulizia || {
  inited: false,
  monthKey: "",          // "YYYY-MM"
  operatore: "",         // nome operatore oppure "__ALL__"
  rows: [],              // righe da foglio operatori
  months: []             // [{key,label}]
};

function __capitalizeFirst_(s){
  s = String(s||"");
  return s ? (s[0].toUpperCase() + s.slice(1)) : "";
}

function formatMonthYearIT_(monthKey){
  // monthKey = "YYYY-MM"
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return "";
  const parts = monthKey.split("-").map(n=>parseInt(n,10));
  const y = parts[0], m = parts[1];
  const dt = new Date(y, (m-1), 1);
  const s = dt.toLocaleDateString("it-IT", { month:"long", year:"numeric" });
  return __capitalizeFirst_(s);
}

function __fmtHours_(h){
  const n = Number(h||0);
  if (!isFinite(n) || n <= 0) return "";
  // 2 dec max, no trailing zeros
  let s = (Math.round(n * 100) / 100).toFixed(2);
  s = s.replace(/\.00$/, "").replace(/0$/, "");
  // italiano: virgola
  s = s.replace(".", ",");
  return s;
}

function __fmtMoneyNoSpace_(amount){
  const n = Number(amount || 0);
  if (!isFinite(n)) return "—";
  // Formato italiano senza spazio prima di €
  const s = n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s + "€";
}


function __getUniqueMonthsFromRows_(rows){
  const set = new Set();
  (rows||[]).forEach(r=>{
    const iso = formatISODateLocal(r.data || r.date || r.Data || "");
    if (!iso) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) set.add(iso.slice(0,7));
  });
  return Array.from(set).sort();
}

async function __loadOperatoriRows_(){
  try{
    const res = await api("operatori", { method:"GET", showLoader:true });
    const rows = res && (res.rows || res.items) ? (res.rows || res.items) : [];
    return Array.isArray(rows) ? rows : [];
  }catch(e){
    console.warn("Operatori load failed", e);
    return [];
  }
}

function __fillSelect_(sel, items, value){
  if (!sel) return;
  sel.innerHTML = "";
  (items||[]).forEach(it=>{
    const opt = document.createElement("option");
    opt.value = it.value;
    opt.textContent = it.label;
    sel.appendChild(opt);
  });
  if (value) sel.value = value;
}

function __fmtHoursOrDash_(h){
  const s = __fmtHours_(h);
  return s ? s : "—";
}

function __opLabel_(op){
  const v = String(op||"").trim();
  if (!v || v === "__ALL__") return "Tutti";
  const low = v.toLowerCase();
  // Title-case semplice (spazi, trattini, apostrofi)
  return low.replace(/(^|[\s\-'])\S/g, (m) => m.toUpperCase());
}

function __renderOrePuliziaCalendar_(){
  const grid = document.getElementById("opcalGrid");
  if (!grid) return;

  const monthKey = state.orepulizia.monthKey;
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    grid.innerHTML = "";
    return;
  }

  const titleEl = document.getElementById("opcalTitleMain");
  const totalEl = document.getElementById("opcalTotalHours");
  const daysEl = document.getElementById("opcalDaysWithHours");

  const monthLabel = formatMonthYearIT_(monthKey) || monthKey;
  const op = String(state.orepulizia.operatore || "").trim();
  const opDisp = __opLabel_(op);

  if (titleEl) titleEl.textContent = `${opDisp} - ${monthLabel}`;

  const parts = monthKey.split("-").map(n=>parseInt(n,10));
  const Y = parts[0], M = parts[1]; // 1..12
  const first = new Date(Y, M-1, 1);
  const daysInMonth = new Date(Y, M, 0).getDate();

  // Lun=0..Dom=6
  const jsDow = first.getDay(); // Dom=0..Sab=6
  const dowMon0 = (jsDow + 6) % 7; // convert to Mon=0
  const totalCells = 42; // 6 settimane

  // ore per giorno
  const rows = state.orepulizia.rows || [];
  const hoursByDay = new Map();
  rows.forEach(r=>{
    const iso = formatISODateLocal(r.data || r.date || r.Data || "");
    if (!iso) return;
    if (!iso.startsWith(monthKey + "-")) return;

    const oper = String(r.operatore || r.nome || "").trim();
    if (op && op !== "__ALL__" && oper !== op) return;

    const oreRaw = (r.ore !== undefined && r.ore !== null) ? r.ore : (r.Ore !== undefined ? r.Ore : "");
    const ore = Number(String(oreRaw).trim().replace(",", "."));
    if (!isFinite(ore) || ore <= 0) return;

    const d = parseInt(iso.slice(8,10), 10);
    if (!d) return;
    hoursByDay.set(d, (hoursByDay.get(d) || 0) + ore);
  });

  // stats
  let totalHours = 0;
  let presenze = 0;
  for (const h of hoursByDay.values()){
    if (h > 0){
      totalHours += h;
      presenze += 1;
    }
  }

  // Tariffe da impostazioni
  // - tariffa_oraria: €/ora
  // - costo_benzina: €/presenza (giorno con ore)
  const tariffaOraria = (state.settings && state.settings.loaded) ? getSettingNumber("tariffa_oraria", 0) : 0;
  const costoBenzinaPerPresenza = (state.settings && state.settings.loaded) ? getSettingNumber("costo_benzina", 0) : 0;

  const hoursStr = __fmtHours_(totalHours);
  const totalImporto = (isFinite(totalHours) && isFinite(tariffaOraria)) ? (totalHours * tariffaOraria) : 0;
  const totalImportoStr = (tariffaOraria > 0) ? __fmtMoneyNoSpace_(totalImporto) : "—";

  const presenzeImporto = (isFinite(presenze) && isFinite(costoBenzinaPerPresenza)) ? (presenze * costoBenzinaPerPresenza) : 0;
  const presenzeImportoStr = (costoBenzinaPerPresenza > 0) ? __fmtMoneyNoSpace_(presenzeImporto) : "—";

  if (totalEl) {
    totalEl.textContent = hoursStr ? `${hoursStr} ore - ${totalImportoStr}` : "—";
  }
  if (daysEl) {
    daysEl.textContent = presenze > 0 ? `${presenze} transfert - ${presenzeImportoStr}` : "—";
  }

  // build cells
  grid.innerHTML = "";
  for (let i=0; i<totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "opcal-cell";

    const dayNum = i - dowMon0 + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cell.classList.add("is-empty");
      grid.appendChild(cell);
      continue;
    }

    const dayEl = document.createElement("div");
    dayEl.className = "opcal-day";
    dayEl.textContent = String(dayNum);
    cell.appendChild(dayEl);

    const h = hoursByDay.get(dayNum) || 0;
    if (h > 0) {
      const hEl = document.createElement("div");
      hEl.className = "opcal-hours";
      hEl.textContent = __fmtHours_(h); // no zeri
      cell.appendChild(hEl);
    }

    grid.appendChild(cell);
  }
}

async function initOrePuliziaPage(){
  const s = state.orepulizia;
  const back = document.getElementById("opcalBack");
  const selMonth = document.getElementById("opcalMonthSelect");
  const selOp = document.getElementById("opcalOperatorSelect");

  // Serve per mostrare importi in "Totali ore" e "Spese Benzina"
  try{ await ensureSettingsLoaded({ force:false, showLoader:false }); }catch(_){}

  if (!s.inited){
    s.inited = true;

    if (back) back.addEventListener("click", ()=>showPage("pulizie"));

    // Topbar: tasto arancione "torna a Pulizie"
    const topBack = document.getElementById("backBtnTop");
    if (topBack && !s._topBackBound){
      s._topBackBound = true;
      bindFastTap(topBack, () => { try{ showPage("pulizie"); }catch(_){ } });
    }

    if (selMonth) selMonth.addEventListener("change", ()=>{
      s.monthKey = selMonth.value;
      __renderOrePuliziaCalendar_();
    });

    if (selOp) selOp.addEventListener("change", ()=>{
      s.operatore = selOp.value;
      __renderOrePuliziaCalendar_();
    });
  }

  // dati
  await ensureSettingsLoaded({ force:false, showLoader:false });
  s.rows = await __loadOperatoriRows_();

  // mesi
  const months = __getUniqueMonthsFromRows_(s.rows);
  const now = new Date();
  const nowKey = String(now.getFullYear()) + "-" + String(now.getMonth()+1).padStart(2,"0");
  if (!months.includes(nowKey)) months.push(nowKey);
  months.sort();

  s.months = months.map(k=>({ key:k, label: formatMonthYearIT_(k) }));
  const monthItems = s.months.map(m=>({ value:m.key, label:m.label }));

  // default month: ultimo (più recente)
  if (!s.monthKey) s.monthKey = monthItems.length ? monthItems[monthItems.length-1].value : nowKey;

  __fillSelect_(selMonth, monthItems, s.monthKey);

  // operatori list: da impostazioni + da righe
  let fromSet = [];
  try{ fromSet = getOperatorNamesFromSettings(); }catch(_){ fromSet = []; }
  const fromRows = Array.from(new Set((s.rows||[]).map(r=>String(r.operatore||r.nome||"").trim()).filter(Boolean))).sort();
  const ops = Array.from(new Set([...(fromSet||[]), ...(fromRows||[])]))
    .filter(Boolean)
    .sort();

  // opzioni: TUTTI + operatori
  const opItems = [{ value:"__ALL__", label:"TUTTI" }, ...ops.map(x=>({ value:x, label:x }))];

  // default operatore
  if (!s.operatore) s.operatore = ops.length ? ops[0] : "__ALL__";
  if (!opItems.some(o=>o.value === s.operatore)) s.operatore = ops.length ? ops[0] : "__ALL__";

  __fillSelect_(selOp, opItems, s.operatore);

  __renderOrePuliziaCalendar_();
}

