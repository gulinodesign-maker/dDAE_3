/*************************************************
 * dDAE Backend (Google Apps Script)
 * - Formato risposta: { ok:true, data:* }
 * - apiKey obbligatoria
 * - DELETE reale per ospiti/spese
 * - Report compatibile con UI (totals + byCategoria)
 * - Calcolo IVA automatico per spese
 *************************************************/

const API_KEY = "daedalium2026";

const SHEETS = {
  IMPOSTAZIONI: "impostazioni",
  UTENTI: "utenti",
  LAVANDERIA: "lavanderia",
  OPERATORI: "operatori",
  PULIZIE: "pulizie",
  OSPITI: "ospiti",
  STANZE: "stanze",
  SPESE: "spese",
  MOTIVAZIONI: "motivazioni",
};

/* =========================
   ENTRY POINT
========================= */

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    if (!e || !e.parameter) return jsonError_("Request non valida");

    if (String(e.parameter.apiKey || "") !== API_KEY) {
      return jsonError_("API key non valida");
    }

    // method override: PUT/DELETE via _method (frontend)
    const override = e.parameter._method;
    if (method === "POST" && override) method = String(override).toUpperCase();

    const action = String(e.parameter.action || "");
    if (!action) return jsonError_("Action mancante");

    // Multi-account safety: enforce tenant scoping to prevent cross-account mixing.
    // - user_id mandatory for every tenant-aware action (everything except utenti/ping)
    // - anno mandatory for year-scoped sheets
    const actionLc = String(action).toLowerCase();
    const needsUser = !(actionLc === "utenti" || actionLc === "ping");
    const needsAnno = [
      "ospiti",
      "stanze",
      "spese",
      "motivazioni",
      "pulizie",
      "lavanderia",
      "operatori",
      "report",
    ].indexOf(actionLc) >= 0;

    if (needsUser) {
      const uid = String(e.parameter.user_id || e.parameter.userId || "").trim();
      if (!uid) return jsonError_("user_id mancante");
    }
    if (needsAnno) {
      const yr = String(e.parameter.anno || e.parameter.year || "").trim();
      if (!yr) return jsonError_("anno mancante");
    }

    switch (action) {
      case "utenti":
        return handleUtenti_(e, method);
      case "ospiti":
        return handleOspiti_(e, method);
      case "stanze":
        return handleStanze_(e, method);
      case "spese":
        return handleSpese_(e, method);
      case "motivazioni":
        return handleMotivazioni_(e, method);
      case "pulizie":
        return handlePulizie_(e, method);
      case "lavanderia":
        return handleLavanderia_(e, method);
      case "operatori":
        return handleOperatori_(e, method);
      case "impostazioni":
        return handleImpostazioni_(e, method);
      case "report":
        return handleReport_(e);
      case "ping":
        return jsonOk_({ ts: new Date().toISOString() });
      default:
        return jsonError_("Action non valida: " + action);
    }
  } catch (err) {
    return jsonError_(errToString_(err));
  }
}

/* =========================
   AUTH / UTENTI (multi-account)
========================= */

function _ctx_(e){
  e = e || {};
  const p = e.parameter || {};
  return {
    user_id: String(p.user_id || "").trim(),
    anno: String(p.anno || "").trim(),
  };
}

function filterByUserAnno_(rows, ctx){
  const uid = String(ctx && ctx.user_id || "").trim();
  const yr = String(ctx && ctx.anno || "").trim();
  if (!uid && !yr) return rows;
  return (Array.isArray(rows) ? rows : []).filter(r => {
    if (!r) return false;
    if (uid){
      const ru = String(r.user_id || r.userId || r.userid || "").trim();
      if (ru !== uid) return false;
    }
    if (yr){
      const ry = String(r.anno || r.year || "").trim();
      if (ry !== yr) return false;
    }
    return true;
  });
}

function sha256Hex_(str){
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(str || ""), Utilities.Charset.UTF_8);
  return bytes.map(b => {
    const v = (b < 0) ? b + 256 : b;
    return (v < 16 ? "0" : "") + v.toString(16);
  }).join("");
}

function handleUtenti_(e, method){
  const sh = getSheet_(SHEETS.UTENTI);

  if (method === "GET"){
    // non esporre password_hash
    const { rows } = readAll_(sh);
    const safe = (rows || []).map(r => {
      const o = Object.assign({}, r);
      delete o.password_hash;
      return o;
    });
    return jsonOk_(safe);
  }

  if (method === "POST" || method === "PUT"){
    const payload = parseBody_(e) || {};
    const op = String(payload.op || payload.operation || "").toLowerCase();
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");

    if (!op) return jsonError_("Op mancante (utenti)");
    if (!username) return jsonError_("Username mancante");

    const { headers, rows } = readAll_(sh);
    const findByUsername = () => (rows || []).find(r => String(r.username || "").trim() === username);

    if (op === "create"){
      if (!password) return jsonError_("Password mancante");
      if (findByUsername()) return jsonError_("Username già esistente");
      const nowIso = new Date().toISOString();
      const id = String(payload.id || ("u_" + Date.now() + "_" + Math.floor(Math.random()*100000)));
      const obj = {
        id: id,
        username: username,
        password_hash: sha256Hex_(password),
        ruolo: String(payload.ruolo || "user"),
        attivo: String(payload.attivo !== undefined ? payload.attivo : "true"),
        nome: String(payload.nome || ""),
        telefono: String(payload.telefono || ""),
        email: String(payload.email || ""),
        last_login: "",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      upsertById_(sh, obj, "id");
      return jsonOk_({ user: { id: id, user_id: id, username: username, ruolo: obj.ruolo, attivo: obj.attivo, nome: obj.nome, telefono: obj.telefono, email: obj.email } });
    }

    if (op === "login"){
      if (!password) return jsonError_("Password mancante");
      const urow = findByUsername();
      if (!urow) return jsonError_("Credenziali non valide");
      const ph = String(urow.password_hash || "");
      if (sha256Hex_(password) !== ph) return jsonError_("Credenziali non valide");
      const nowIso = new Date().toISOString();
      // aggiorna last_login
      try{ upsertById_(sh, { id: String(urow.id || urow.ID || ""), last_login: nowIso, updatedAt: nowIso }, "id"); }catch(_){ }
      const id = String(urow.id || urow.ID || "");
      return jsonOk_({ user: { id: id, user_id: id, username: username, ruolo: String(urow.ruolo||"user"), attivo: String(urow.attivo||"true"), nome: String(urow.nome||""), telefono: String(urow.telefono||""), email: String(urow.email||"") } });
    }

    if (op === "update"){
      const urow = findByUsername();
      if (!urow) return jsonError_("Account non trovato");
      if (!password) return jsonError_("Password mancante");
      const ph = String(urow.password_hash || "");
      if (sha256Hex_(password) !== ph) return jsonError_("Credenziali non valide");
      const nowIso = new Date().toISOString();
      const newPassword = String(payload.newPassword || payload.new_password || "");
      const id = String(urow.id || urow.ID || "");
      const obj = {
        id: id,
        username: username,
        updatedAt: nowIso,
      };
      if (newPassword) obj.password_hash = sha256Hex_(newPassword);
      if (payload.ruolo !== undefined) obj.ruolo = String(payload.ruolo);
      if (payload.attivo !== undefined) obj.attivo = String(payload.attivo);
      if (payload.nome !== undefined) obj.nome = String(payload.nome);
      if (payload.telefono !== undefined) obj.telefono = String(payload.telefono);
      if (payload.email !== undefined) obj.email = String(payload.email);
      upsertById_(sh, obj, "id");
      const merged = Object.assign({}, urow, obj);
      return jsonOk_({ user: { id: id, user_id: id, username: username, ruolo: String(merged.ruolo||"user"), attivo: String(merged.attivo||"true"), nome: String(merged.nome||""), telefono: String(merged.telefono||""), email: String(merged.email||"") } });
    }

    return jsonError_("Op non valida (utenti): " + op);
  }

  return jsonError_("Metodo non supportato per utenti: " + method);
}

/* =========================
   RESPONSE
========================= */

function jsonOk_(data) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(msg) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: String(msg || "Errore") })
  ).setMimeType(ContentService.MimeType.JSON);
}

function errToString_(err) {
  try {
    if (!err) return "Errore sconosciuto";
    if (typeof err === "string") return err;
    if (err && err.stack) return err.stack;
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}

/* =========================
   SHEET UTILS
========================= */

function getCtx_(e){
  e = e || {};
  const p = e.parameter || {};
  return {
    user_id: String(p.user_id || p.userId || "").trim(),
    anno: String(p.anno || p.year || "").trim(),
  };
}

function filterByUserAnno_(rows, ctx){
  const u = String(ctx?.user_id || "").trim();
  const a = String(ctx?.anno || "").trim();
  if (!u && !a) return rows;
  return (Array.isArray(rows) ? rows : []).filter(r => {
    if (u){
      const ru = String(r.user_id || r.userId || "").trim();
      if (ru !== u) return false;
    }
    if (a){
      const ra = String(r.anno || r.year || "").trim();
      if (ra !== a) return false;
    }
    return true;
  });
}

function sha256Hex_(s){
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s || ""), Utilities.Charset.UTF_8);
  return bytes.map(b => (b + 256).toString(16).slice(-2)).join("");
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Foglio mancante: "' + name + '"');
  return sh;
}

function readAll_(sh) {
  const values = sh.getDataRange().getValues();
  if (!values || values.length === 0) return { headers: [], rows: [], raw: [] };

  const headers = (values[0] || []).map(h => String(h).trim());
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c];
    rows.push(obj);
  }
  return { headers, rows, raw: values };
}


// Assicura che la riga header contenga almeno le colonne richieste.
// Se mancano, le aggiunge in coda e allarga il foglio se necessario.
function ensureHeaders_(sh, required) {
  required = Array.isArray(required) ? required : [];
  const values = sh.getDataRange().getValues();
  let headers = (values[0] || []).map(h => String(h).trim()).filter(h => h !== "");
  let changed = false;

  for (const h of required) {
    if (headers.indexOf(h) === -1) {
      headers.push(h);
      changed = true;
    }
  }

  if (!headers.length && required.length) {
    headers = required.slice();
    changed = true;
  }

  if (!changed) return headers;

  const maxCols = sh.getMaxColumns();
  if (headers.length > maxCols) {
    sh.insertColumnsAfter(maxCols, headers.length - maxCols);
  }

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return headers;
}


function buildRowFromHeaders_(headers, obj) {
  const row = new Array(headers.length).fill("");
  for (let c = 0; c < headers.length; c++) {
    const k = headers[c];
    if (k in obj) row[c] = obj[k];
  }
  return row;
}

function upsertById_(sh, obj, idField) {
  idField = idField || "id";
  const data = sh.getDataRange().getValues();
  const headers = (data[0] || []).map(h => String(h).trim());
  const idCol = headers.indexOf(idField);

  if (idCol < 0) {
    sh.appendRow(buildRowFromHeaders_(headers, obj));
    return { mode: "append_no_idcol", id: obj[idField] || "" };
  }

  const idVal = String(obj[idField] || "").trim();
  if (!idVal) {
    sh.appendRow(buildRowFromHeaders_(headers, obj));
    return { mode: "append_no_idval", id: "" };
  }

  let foundRow = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idCol]).trim() === idVal) {
      foundRow = r;
      break;
    }
  }

  if (foundRow === -1) {
    sh.appendRow(buildRowFromHeaders_(headers, obj));
    return { mode: "append", id: idVal };
  }

  const newRow = data[foundRow].slice();
  for (let c = 0; c < headers.length; c++) {
    const key = headers[c];
    if (key in obj) newRow[c] = obj[key];
  }

  sh.getRange(foundRow + 1, 1, 1, headers.length).setValues([newRow]);
  return { mode: "update", id: idVal, row: foundRow + 1 };
}

function deleteById_(sh, idValue, idField) {
  idField = idField || "id";
  const data = sh.getDataRange().getValues();
  const headers = (data[0] || []).map(h => String(h).trim());
  const idCol = headers.indexOf(idField);
  if (idCol < 0) return 0;

  const toDelete = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idCol]).trim() === String(idValue).trim()) {
      toDelete.push(r + 1);
    }
  }

  toDelete.sort((a, b) => b - a).forEach(rowNum => sh.deleteRow(rowNum));
  return toDelete.length;
}

function deleteWhere_(sh, colName, value) {
  const data = sh.getDataRange().getValues();
  const headers = (data[0] || []).map(h => String(h).trim());
  const idx = headers.indexOf(colName);
  if (idx < 0) return 0;

  const toDelete = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idx]).trim() === String(value).trim()) {
      toDelete.push(r + 1);
    }
  }

  toDelete.sort((a, b) => b - a).forEach(rowNum => sh.deleteRow(rowNum));
  return toDelete.length;
}

/* =========================
   BODY / TYPE UTILS
========================= */

function uuid_() {
  return Utilities.getUuid();
}

function parseBody_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return {};
    const txt = String(e.postData.contents || "").trim();
    if (!txt) return {};
    return JSON.parse(txt);
  } catch (err) {
    Logger.log("parseBody_ error: " + errToString_(err));
    return {};
  }
}

function pick_(/*...vals*/) {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function toNumOrEmpty_(v) {
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  if (!s) return "";
  const n = Number(s.replace(",", "."));
  return isNaN(n) ? "" : n;
}

// ✅ NUOVO: converte toggle/boolean in 1 oppure ""
function toOneOrEmpty_(v) {
  if (v === true) return 1;
  if (v === false) return "";
  if (v === 1 || v === "1") return 1;
  if (v === 0 || v === "0") return "";

  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s === "true" || s === "on" || s === "yes" || s === "si" || s === "sì") return 1;
  if (s === "false" || s === "off" || s === "no") return "";

  const n = Number(s.replace(",", "."));
  if (!isNaN(n) && n > 0) return 1;

  return "";
}

function normalizeDateCell_(v) {
  if (v === undefined || v === null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return "";

  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) {
    const y = Number(m1[1]), mo = Number(m1[2]) - 1, d = Number(m1[3]);
    const dt = new Date(Date.UTC(y, mo, d));
    if (!isNaN(dt.getTime())) return dt;
  }

  const dt2 = new Date(s);
  if (!isNaN(dt2.getTime())) return dt2;

  return s;
}

/* =========================
   OSPITI
========================= */

function handleOspiti_(e, method) {
  const sh = getSheet_(SHEETS.OSPITI);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    const scopedRows = filterByUserAnno_(rows, getCtx_(e));
    return jsonOk_(scopedRows);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e);
    const items = Array.isArray(payload) ? payload : [payload];

    const results = [];
    for (const item of items) {
      const obj = normalizeOspite_(item);
      results.push(upsertById_(sh, obj, "id"));
    }
    return jsonOk_({ saved: results.length, results: results });
  }

  if (method === "DELETE") {
    const id = String(e.parameter.id || "").trim();
    if (!id) return jsonError_("Parametro id mancante (DELETE ospiti)");

    const deleted = deleteById_(sh, id, "id");

    // elimina anche le stanze collegate
    const shSt = getSheet_(SHEETS.STANZE);
    const deletedRooms = deleteWhere_(shSt, "ospite_id", id);

    return jsonOk_({ deleted: deleted, deletedRooms: deletedRooms, id: id });
  }

  return jsonError_("Metodo non supportato per ospiti: " + method);
}

function normalizeOspite_(d) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(
    d.id, d.ID, d.ospite_id, d.ospiteId, d.guest_id, d.guestId,
    ("o_" + Date.now() + "_" + Math.floor(Math.random() * 100000))
  ));

  const nome = String(pick_(d.nome, d.name, d.nominativo, d.fullname, d.fullName));
  const adulti = toNumOrEmpty_(pick_(d.adulti, d.adults, d.num_adulti, d.numAdulti));
  const bambini = toNumOrEmpty_(pick_(d.bambini_u10, d.bambiniU10, d.children_u10, d.childrenU10));

  const checkIn = normalizeDateCell_(pick_(d.check_in, d.checkIn, d.checkin, d.check_in_date, d.checkInDate));
  const checkOut = normalizeDateCell_(pick_(d.check_out, d.checkOut, d.checkout, d.check_out_date, d.checkOutDate));

  const importoPrenota = toNumOrEmpty_(pick_(d.importo_prenotazione, d.importo_prenota, d.importoPrenotazione, d.importoPrenota));
  const importoBooking = toNumOrEmpty_(pick_(d.importo_booking, d.importoBooking));

  const accontoImporto = toNumOrEmpty_(pick_(d.acconto_importo, d.accontoImporto));
  const accontoTipo = String(pick_(d.acconto_tipo, d.accontoTipo));


  const accontoRicevuta = toOneOrEmpty_(pick_(d.acconto_ricevuta, d.accontoRicevuta, d.ricevuta_acconto, d.ricevutaAcconto, d.acconto_ricevutain));

  const saldoPagato = toNumOrEmpty_(pick_(d.saldo_pagato, d.saldoPagato));
  const saldoTipo = String(pick_(d.saldo_tipo, d.saldoTipo));


  const saldoRicevuta = toOneOrEmpty_(pick_(d.saldo_ricevuta, d.saldoRicevuta, d.ricevuta_saldo, d.ricevutaSaldo, d.saldo_ricevutain));

  const matrimonio = String(pick_(d.matrimonio, d.wedding));
  const psRegistrato = String(pick_(d.ps_registrato, d.psRegistrato));
  const istatRegistrato = String(pick_(d.istat_registrato, d.istatRegistrato));

  let stanzeField = pick_(d.stanze, d.rooms);
  if (typeof stanzeField === "object" && stanzeField !== null) stanzeField = JSON.stringify(stanzeField);
  stanzeField = String(stanzeField || "");

  const createdAt = String(pick_(d.created_at, d.createdAt, nowIso));
  const user_id = String(pick_(d.user_id, d.userId, ""));
  const anno = String(pick_(d.anno, d.year, ""));

  return {
    user_id: user_id,
    anno: anno,
    id: id,
    nome: nome,
    adulti: adulti,
    bambini_u10: bambini,
    check_in: checkIn,
    check_out: checkOut,

    importo_prenotazione: importoPrenota,
    importo_prenota: importoPrenota,
    importo_booking: importoBooking,

    acconto_importo: accontoImporto,
    acconto_tipo: accontoTipo,

    acconto_ricevuta: accontoRicevuta,

    saldo_pagato: saldoPagato,
    saldo_tipo: saldoTipo,

    saldo_ricevuta: saldoRicevuta,
    saldo_ricevutain: saldoRicevuta,

    matrimonio: matrimonio,
    ps_registrato: psRegistrato,
    istat_registrato: istatRegistrato,

    stanze: stanzeField,

    created_at: createdAt,
    updated_at: nowIso,
    createdAt: createdAt,
    updatedAt: nowIso,
  };
}

/* =========================
   STANZE
========================= */

function handleStanze_(e, method) {
  const sh = getSheet_(SHEETS.STANZE);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    return jsonOk_(rows);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e) || {};
    const ospiteId = String(pick_(payload.ospite_id, payload.ospiteId, payload.guest_id, payload.guestId, payload.id)).trim();
    if (!ospiteId) return jsonError_("ospite_id mancante in payload stanze");

    const stanzeArr = Array.isArray(payload.stanze) ? payload.stanze
      : Array.isArray(payload.rooms) ? payload.rooms
      : [];

    deleteWhere_(sh, "ospite_id", ospiteId);

    const headers = readAll_(sh).headers;
    let inserted = 0;

    for (const room of stanzeArr) {
      const obj = normalizeStanza_(room, ospiteId);
      sh.appendRow(buildRowFromHeaders_(headers, obj));
      inserted++;
    }

    return jsonOk_({ ospite_id: ospiteId, inserted: inserted });
  }

  return jsonError_("Metodo non supportato per stanze: " + method);
}

function normalizeStanza_(d, ospiteId) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(d.id, d.ID, ("r_" + Date.now() + "_" + Math.floor(Math.random() * 100000))));
  const stanzaNum = String(pick_(d.stanza_num, d.stanzaNum, d.room_number, d.roomNumber));

  // ✅ MATRIMONIALE -> salva 1 quando è selezionato (true)
  const lettoM_raw = pick_(
    d.letto_m, d.lettoM,
    d.matrimoniale, d.letto_matrimoniale, d.lettoMatrimoniale,
    d.double_bed, d.doubleBed
  );
  const lettoM = toOneOrEmpty_(lettoM_raw);

  // letti singoli come prima (numerico)
  const lettoS = toNumOrEmpty_(pick_(d.letto_s, d.lettoS, d.single_bed, d.singleBed));

  // ✅ CULLA -> salva 1 quando è selezionata (true)
  const culla_raw = pick_(d.culla, d.crib, d.cullaPresente, d.hasCulla);
  const culla = toOneOrEmpty_(culla_raw);

  const note = String(pick_(d.note, d.notes));
  const createdAt = String(pick_(d.created_at, d.createdAt, nowIso));

  return {
    id: id,
    ospite_id: String(ospiteId),
    stanza_num: stanzaNum,
    letto_m: lettoM,
    letto_s: lettoS,
    culla: culla,
    note: note,
    created_at: createdAt,
    updated_at: nowIso,
    createdAt: createdAt,
    updatedAt: nowIso,
  };
}

/* =========================
   SPESE
========================= */

function handleSpese_(e, method) {
  const sh = getSheet_(SHEETS.SPESE);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    const scopedRows = filterByUserAnno_(rows, getCtx_(e));

    const from = String((e.parameter && e.parameter.from) ? e.parameter.from : "").trim();
    const to = String((e.parameter && e.parameter.to) ? e.parameter.to : "").trim();

    const filtered = filterByDateRange_(scopedRows, from, to, ["dataSpesa", "data_spesa", "data", "date"]);
    const clean = filtered.filter(r => String(r.isDeleted || r.is_deleted || "false").toLowerCase() !== "true");

    return jsonOk_(clean);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e);
    const items = Array.isArray(payload) ? payload : [payload];

    const results = [];
    for (const item of items) {
      const obj = normalizeSpesa_(item);
      results.push(upsertById_(sh, obj, "id"));
    }
    return jsonOk_({ saved: results.length, results: results });
  }

  if (method === "DELETE") {
    const id = String(e.parameter.id || "").trim();
    if (!id) return jsonError_("Parametro id mancante (DELETE spese)");
    const deleted = deleteById_(sh, id, "id");
    return jsonOk_({ deleted: deleted, id: id });
  }

  return jsonError_("Metodo non supportato per spese: " + method);
}

function normalizeSpesa_(d) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(d.id, d.ID, ("s_" + Date.now() + "_" + Math.floor(Math.random() * 100000))));
  const createdAt = String(pick_(d.createdAt, d.created_at, nowIso));
  const user_id = String(pick_(d.user_id, d.userId, ""));
  const anno = String(pick_(d.anno, d.year, ""));

  const categoria = String(pick_(d.categoria, d.category));
  const motivazione = String(pick_(d.motivazione, d.reason));
  const note = String(pick_(d.note, d.notes, ""));

  const importoLordo = toNumOrEmpty_(pick_(d.importoLordo, d.importo_lordo, d.gross));

  const aliquota = inferAliquotaIvaFromCategoria_(categoria, d);
  const calc = calcIva_(importoLordo, aliquota, categoria);

  return {
    user_id: user_id,
    anno: anno,
    id: id,
    createdAt: createdAt,
    updatedAt: nowIso,

    dataSpesa: normalizeDateCell_(pick_(d.dataSpesa, d.data_spesa, d.data, d.date)),
    categoria: categoria,
    motivazione: motivazione,

    importoLordo: importoLordo,
    aliquotaIva: calc.aliquotaIva,
    imponibile: calc.imponibile,
    iva: calc.iva,
    ivaDetraibile: calc.ivaDetraibile,

    note: note,
    isDeleted: String(pick_(d.isDeleted, d.is_deleted, "false")),
  };
}

function inferAliquotaIvaFromCategoria_(categoria, d) {
  const passed = toNumOrEmpty_(pick_(d.aliquotaIva, d.aliquota_iva, d.vatRate));
  if (passed !== "") return passed;

  const c = String(categoria || "").toUpperCase();
  if (c.includes("IVA_22")) return 22;
  if (c.includes("IVA_10")) return 10;
  if (c.includes("IVA_4")) return 4;
  return 0;
}

function calcIva_(importoLordo, aliquotaIva, categoria) {
  const lordo = Number(importoLordo || 0) || 0;
  const aliq = Number(aliquotaIva || 0) || 0;

  let imponibile = 0;
  let iva = 0;

  if (aliq > 0) {
    imponibile = lordo / (1 + aliq / 100);
    iva = lordo - imponibile;
  } else {
    imponibile = lordo;
    iva = 0;
  }

  const c = String(categoria || "").toUpperCase();
  const ivaDetraibile = (c.includes("IVA_")) ? iva : 0;

  imponibile = round2_(imponibile);
  iva = round2_(iva);

  return {
    aliquotaIva: aliq,
    imponibile: imponibile,
    iva: iva,
    ivaDetraibile: round2_(ivaDetraibile),
  };
}

function round2_(n) {
  const x = Number(n || 0) || 0;
  return Math.round(x * 100) / 100;
}

/* =========================
   MOTIVAZIONI
========================= */



/* =========================
   PULIZIE (biancheria)
   1 riga = 1 stanza per 1 giorno
   Chiave: id = p_<data>_<stanza>
   Colonne: id, data, stanza, MAT, SIN, FED, TDO, TFA, TBI, TAP, TPI, createdAt, updatedAt
========================= */

function handlePulizie_(e, method) {
  const sh = getSheet_(SHEETS.PULIZIE);

  const ctx = getCtx_(e);

  // Garantisce colonne minime per persistenza per-data (se mancano, vengono create)
  ensureHeaders_(sh, ["id","user_id","anno","data","stanza","MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI","createdAt","updatedAt"]);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    const data = String((e.parameter && e.parameter.data) ? e.parameter.data : "").trim();
    const stanza = String((e.parameter && e.parameter.stanza) ? e.parameter.stanza : "").trim();

    let out = filterByUserAnno_(rows, ctx);
    if (data) out = out.filter(r => isoDatePulizie_(pick_(r.data, r.Data, r.DATA, r.date, r.Date, r.DATE, "")) === data);
    if (stanza) out = out.filter(r => String(pick_(r.stanza, r.Stanza, r.STANZA, r.room, r.Room, r.ROOM, r.stanza_num, r.stanzaNum, "")).trim() === stanza);

    return jsonOk_(out);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e);
    const nowIso = new Date().toISOString();

    const forcedDate = String(pick_(payload.data, payload.date, "")).trim();
    const items = Array.isArray(payload.rows) ? payload.rows
               : (Array.isArray(payload) ? payload : [payload]);

    if (!items || !items.length) return jsonError_("Nessun dato pulizie");

    const results = [];
    for (const item of items) {
      const obj = normalizePulizieRow_(item, forcedDate);
      if (!obj.data) return jsonError_("Campo data mancante (pulizie)");
      if (!obj.stanza) return jsonError_("Campo stanza mancante (pulizie)");

      // Tenant scoping
      obj.user_id = ctx.user_id;
      obj.anno = ctx.anno;

      obj.id = String(pick_(obj.id, ("p_" + obj.data + "_" + obj.stanza)));
      obj.createdAt = String(pick_(obj.createdAt, obj.created_at, nowIso));
      obj.updatedAt = nowIso;

      results.push(upsertById_(sh, obj, "id"));
    }
    return jsonOk_({ saved: results.length });
  }

  return jsonError_("Metodo non supportato per pulizie: " + method);
}


/* =========================
   LAVANDERIA
========================= */

function handleLavanderia_(e, method) {
  const sh = getSheet_(SHEETS.LAVANDERIA);
  const shPul = getSheet_(SHEETS.PULIZIE);

  const ctx = getCtx_(e);

  // colonne minime
  ensureHeaders_(sh, ["id","user_id","anno","startDate","endDate","MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI","createdAt","updatedAt"]);
  ensureHeaders_(shPul, ["id","user_id","anno","data","stanza","MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI","createdAt","updatedAt"]);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    return jsonOk_(filterByUserAnno_(rows, ctx));
  }

  const body = parseBody_(e);

  if (method === "POST") {
    const nowIso = new Date().toISOString();

    // intervallo selezionato (obbligatorio): Da/A
    let startDate = String(pick_(body.startDate, body.from, body.da, e.parameter.startDate, e.parameter.from, e.parameter.da, "")).trim();
    let endDate   = String(pick_(body.endDate, body.to, body.a, e.parameter.endDate, e.parameter.to, e.parameter.a, "")).trim();

    startDate = isoDatePulizie_(startDate);
    endDate   = isoDatePulizie_(endDate);

    if (!startDate || !endDate) {
      return jsonError_("Seleziona l'intervallo (Da e A) prima di creare il report lavanderia.");
    }
    if (startDate > endDate) {
      return jsonError_("Intervallo non valido: la data 'Da' non può essere successiva alla data 'A'.");
    }

    // somma pulizie nel range [startDate, endDate]
    const { rows } = readAll_(shPul);
    const scopedPul = filterByUserAnno_(rows, ctx);
    const cols = ["MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI"];
    const totals = {};
    cols.forEach(k => totals[k] = 0);

    for (const r of scopedPul) {
      // data può essere Date (Sheets) o stringa
      const d0 = pick_(r.data, r.Data, r.DATE, r.date, r.Date, "");
      const iso = isoDatePulizie_(d0);
      if (!iso) continue;
      if (iso < startDate || iso > endDate) continue;

      // se esiste un flag "isDeleted" per pulizie, ignoralo
      const del = String(pick_(r.isDeleted, r.is_deleted, "false")).toLowerCase();
      if (del === "true") continue;

      for (const k of cols) {
        const n = Number(pick_(r[k], r[k.toLowerCase()], 0));
        totals[k] += (isNaN(n) ? 0 : Math.max(0, Math.floor(n)));
      }
    }

    const id = "l_" + uuid_().slice(0, 10);
    const obj = {
      id,
      user_id: ctx.user_id,
      anno: ctx.anno,
      startDate,
      endDate,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    cols.forEach(k => obj[k] = totals[k]);

    upsertById_(sh, obj, "id");
    return jsonOk_(obj);
  }

  // Cancellazione di un report lavanderia: NON tocca il foglio pulizie
  if (method === "DELETE") {
    const id = String(pick_(body.id, e.parameter.id, "")).trim();
    if (!id) return jsonError_("ID mancante per cancellazione report lavanderia.");

    const deleted = deleteById_(sh, id, "id");
    return jsonOk_({ id, deleted });
  }

  return jsonError_("Metodo non supportato per lavanderia: " + method);
}

/* =========================
   OPERATORI
   - Salva ore per data (max 3 dal frontend, ma accetta N)
   - Benzina calcolata lato frontend (2€ per presenza), ma se manca usa 2
   - Upsert per (data + operatore) per evitare duplicati
========================= */

function handleOperatori_(e, method) {
  const sh = getSheet_(SHEETS.OPERATORI);

  const ctx = getCtx_(e);

  // colonne minime (tenant-aware)
  ensureHeaders_(sh, ["id","user_id","anno","data","operatore","ore","benzina_euro","note","createdAt","updatedAt"]);

  if (method === "GET") {
    const qDateRaw = String((e.parameter.data || e.parameter.date || "")).trim();
    const qDate = isoDatePulizie_(qDateRaw);
    const all = readAll_(sh);
    const scoped = filterByUserAnno_(all.rows, ctx);
    if (!qDate) return jsonOk_({ rows: scoped });
    const out = scoped.filter(r => isoDatePulizie_(r.data || r.date || "") === qDate);
    return jsonOk_({ rows: out });
  }

  if (method !== "POST") return jsonError_("Metodo non supportato");

  const body = parseBody_(e);
  const dateRaw = String(body.data || body.date || "").trim();
  const date = isoDatePulizie_(dateRaw);
  const items = body.operatori || body.rows || [];

  if (!date) return jsonError_("Data mancante");
  if (!Array.isArray(items) || items.length === 0) return jsonOk_({ saved: 0 });

  // Headers / colonne
  const range = sh.getDataRange();
  const values = range.getValues();
  const headers = (values[0] || []).map(h => String(h).trim());

  // Se foglio vuoto o senza header, crea header standard
  if (!headers.length || headers.every(h => !h)) {
    const std = ["id","user_id","anno","data","operatore","ore","benzina_euro","note","createdAt","updatedAt"];
    sh.clearContents();
    sh.appendRow(std);
    return handleOperatori_(e, "POST"); // retry
  }

  const col = (name) => headers.indexOf(name);
  const cId = col("id");
  const cUser = col("user_id");
  const cAnno = col("anno");
  const cData = col("data") >= 0 ? col("data") : col("date");
  const cOp = col("operatore");
  const cOre = col("ore");
  const cBenz = col("benzina_euro");
  const cNote = col("note");
  const cCreatedAt = col("createdAt") >= 0 ? col("createdAt") : col("created_at");
  const cUpdatedAt = col("updatedAt") >= 0 ? col("updatedAt") : col("updated_at");

  if (cData < 0 || cOp < 0) return jsonError_("Colonne mancanti nel foglio 'operatori' (serve almeno: data, operatore)");

  const norm = (s) => String(s || "").trim().toLowerCase();

    // REPLACE per data: se salvi di nuovo lo stesso giorno, il report deve SOVRASCRIVERE (non sommare).
    // Quindi: 1) cancella TUTTI i record esistenti per quella data  2) reinserisce quelli ricevuti (solo ore > 0).
    const now = new Date().toISOString();
    let deleted = 0;

    // 1) delete rows for same date (partendo dal basso per non sfasare gli indici)
    const toDelete = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r] || [];
      const d = isoDatePulizie_(row[cData] || "");
      if (d !== date) continue;
      const ru = (cUser >= 0) ? String(row[cUser] || "").trim() : "";
      const ra = (cAnno >= 0) ? String(row[cAnno] || "").trim() : "";
      if (ru !== String(ctx.user_id || "").trim()) continue;
      if (ra !== String(ctx.anno || "").trim()) continue;
      toDelete.push(r + 1); // 1-based
    }
    toDelete.sort((a,b) => b - a).forEach((rowIndex) => {
      try { sh.deleteRow(rowIndex); deleted++; } catch (_) {}
    });

    // 2) append fresh rows (ore > 0)
    let saved = 0;
    items.forEach(it => {
      const operatore = String(it.operatore || it.nome || "").trim();
      const ore = toNumOrEmpty_(it.ore);
      const benz = (it.benzina_euro !== undefined && it.benzina_euro !== null) ? toNumOrEmpty_(it.benzina_euro) : 2;

      if (!operatore) return;
      // se ore <= 0 non inserire (serve per "cancellare" ore di un operatore salvate in precedenza)
      if (ore === "" || Number(ore) <= 0) return;

      const newRow = new Array(headers.length).fill("");
      if (cId >= 0) newRow[cId] = uuid_();
      if (cUser >= 0) newRow[cUser] = ctx.user_id;
      if (cAnno >= 0) newRow[cAnno] = ctx.anno;
      newRow[cData] = date;
      newRow[cOp] = operatore;
      if (cOre >= 0) newRow[cOre] = ore;
      if (cBenz >= 0) newRow[cBenz] = (benz === "" ? 2 : benz);
      if (cNote >= 0) newRow[cNote] = "";
      if (cCreatedAt >= 0) newRow[cCreatedAt] = now;
      if (cUpdatedAt >= 0) newRow[cUpdatedAt] = now;

      sh.appendRow(newRow);
      saved++;
    });

    return jsonOk_({ saved: saved, deleted: deleted, date: date });
}



/* =========================
   IMPOSTAZIONI
   Foglio: "impostazioni"
   Colonne attese (ma vengono create se mancanti):
   key, value, type, unit, descrizione, operatore_1, operatore_2, operatore_3, updatedAt, createdAt

   Chiavi gestite dal frontend:
   - operatori        (usa operatore_1/2/3)
   - tariffa_oraria   (usa value)
   - costo_benzina    (usa value)
   - tassa_soggiorno  (usa value)
========================= */

function handleImpostazioni_(e, method) {
  const sh = getSheet_(SHEETS.IMPOSTAZIONI);

  const ctx = getCtx_(e);

  const required = ["id","user_id","key","value","type","unit","descrizione","operatore_1","operatore_2","operatore_3","updatedAt","createdAt"];
  const headers = ensureHeaders_(sh, required);

  const readMap_ = () => {
    const values = sh.getDataRange().getValues();
    const hdr = (values[0] || []).map(h => String(h).trim());
    const kCol = hdr.indexOf("key");
    const uCol = hdr.indexOf("user_id");
    const map = new Map();
    if (kCol >= 0) {
      for (let r = 1; r < values.length; r++) {
        const k = String(values[r][kCol] || "").trim().toLowerCase();
        const u = (uCol >= 0) ? String(values[r][uCol] || "").trim() : "";
        if (k && u) map.set(u + "|" + k, r + 1); // 1-based
      }
    }
    return { values, hdr, map };
  };

  const setCell_ = (rowIndex, colName, value) => {
    const colIndex = headers.indexOf(colName);
    if (colIndex < 0) return;
    sh.getRange(rowIndex, colIndex + 1).setValue(value);
  };

  if (method === "GET") {
    const all = readAll_(sh);
    return jsonOk_({ rows: filterByUserAnno_(all.rows, { user_id: ctx.user_id }) });
  }

  if (method !== "POST") return jsonError_("Metodo non supportato per impostazioni: " + method);

  const body = parseBody_(e);
  const now = new Date().toISOString();

  // Input: operatori: [op1, op2, op3] oppure operatore_1/2/3
  const opsArr = Array.isArray(body.operatori) ? body.operatori : [];
  const op1 = String(pick_(body.operatore_1, opsArr[0], "")).trim();
  const op2 = String(pick_(body.operatore_2, opsArr[1], "")).trim();
  const op3 = String(pick_(body.operatore_3, opsArr[2], "")).trim();

  // Numeri
  const tariffa = toNumOrEmpty_(pick_(body.tariffa_oraria, body.tariffa, body.rate, ""));
  const benzina = toNumOrEmpty_(pick_(body.costo_benzina, body.benzina, body.fuel, ""));
  const tassa = toNumOrEmpty_(pick_(body.tassa_soggiorno, body.tassa, body.tourist_tax, ""));

  const { map } = readMap_();

  const upsertByKey_ = (key, patchObj, meta) => {
    const k = String(key || "").trim().toLowerCase();
    if (!k) return false;

    const rowIndex = map.get(ctx.user_id + "|" + k);
    if (rowIndex) {
      // update (preserva createdAt)
      setCell_(rowIndex, "key", key);
      Object.keys(patchObj || {}).forEach(col => setCell_(rowIndex, col, patchObj[col]));
      if (meta && meta.updatedAt) setCell_(rowIndex, "updatedAt", meta.updatedAt);
      return true;
    }

    // append
    const obj = Object.assign({}, patchObj || {});
    obj.id = String(pick_(obj.id, uuid_()));
    obj.user_id = ctx.user_id;
    obj.key = key;
    obj.updatedAt = now;
    obj.createdAt = now;

    const row = buildRowFromHeaders_(headers, obj);
    sh.appendRow(row);
    map.set(ctx.user_id + "|" + k, sh.getLastRow());
    return true;
  };

  let saved = 0;

  // 1) operatori
  if (op1 || op2 || op3) {
    const ok = upsertByKey_("operatori", {
      type: "text",
      unit: "",
      descrizione: "Nomi operatori",
      value: "",
      operatore_1: op1,
      operatore_2: op2,
      operatore_3: op3
    }, { updatedAt: now });
    if (ok) saved++;
  }

  // 2) tariffa oraria
  if (tariffa !== "") {
    const ok = upsertByKey_("tariffa_oraria", {
      type: "number",
      unit: "€/h",
      descrizione: "Tariffa oraria operatore",
      value: tariffa
    }, { updatedAt: now });
    if (ok) saved++;
  }

  // 3) costo benzina
  if (benzina !== "") {
    const ok = upsertByKey_("costo_benzina", {
      type: "number",
      unit: "€",
      descrizione: "Costo benzina",
      value: benzina
    }, { updatedAt: now });
    if (ok) saved++;
  }

  // 4) tassa soggiorno
  if (tassa !== "") {
    const ok = upsertByKey_("tassa_soggiorno", {
      type: "number",
      unit: "€/ppn",
      descrizione: "Tassa di soggiorno (€/persona/notte)",
      value: tassa
    }, { updatedAt: now });
    if (ok) saved++;
  }

  return jsonOk_({ saved: saved });
}

/* =========================
   UTENTI (account)
========================= */

function sha256Hex_(s){
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(s || ""),
    Utilities.Charset.UTF_8
  );
  return bytes
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeUserOut_(row){
  const u = row || {};
  return {
    id: String(u.id || ""),
    user_id: String(u.id || u.user_id || ""),
    username: String(u.username || ""),
    ruolo: String(u.ruolo || ""),
    attivo: String(u.attivo || "1"),
    nome: String(u.nome || ""),
    telefono: String(u.telefono || ""),
    email: String(u.email || ""),
    last_login: String(u.last_login || ""),
    createdAt: String(u.createdAt || ""),
    updatedAt: String(u.updatedAt || ""),
  };
}

function findUserByUsername_(rows, username){
  const u = String(username || "").trim().toLowerCase();
  if (!u) return null;
  for (const r of (Array.isArray(rows) ? rows : [])){
    const ru = String(r.username || "").trim().toLowerCase();
    if (ru === u) return r;
  }
  return null;
}

// Riscrive un foglio preservando la header row esistente.
// NB: cancella i contenuti eccedenti ma non rimuove formattazioni.
function rewriteSheetFromObjects_(sh, headers, rows){
  headers = Array.isArray(headers) ? headers : [];
  rows = Array.isArray(rows) ? rows : [];

  const out = [headers];
  for (const r of rows){
    out.push(buildRowFromHeaders_(headers, r || {}));
  }

  const needRows = Math.max(1, out.length);
  const needCols = Math.max(1, headers.length);

  if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
  if (sh.getMaxRows() < needRows) sh.insertRowsAfter(sh.getMaxRows(), needRows - sh.getMaxRows());

  // Clear old contents (only used range)
  sh.getRange(1, 1, sh.getMaxRows(), needCols).clearContent();
  sh.getRange(1, 1, out.length, needCols).setValues(out);
}

function purgeUserFromSheet_(sheetName, uid){
  const sh = getSheet_(sheetName);
  const data = readAll_(sh);
  const headers = data.headers || [];
  const rows = data.rows || [];
  const keep = rows.filter(r => String(r.user_id || r.userId || "").trim() !== uid);
  rewriteSheetFromObjects_(sh, headers, keep);
}

function deleteUserRowById_(uid){
  const sh = getSheet_(SHEETS.UTENTI);
  const data = readAll_(sh);
  const headers = data.headers || [];
  const rows = data.rows || [];
  const keep = rows.filter(r => String(r.id || r.ID || "").trim() !== uid);
  rewriteSheetFromObjects_(sh, headers, keep);
}

function purgeAllUserData_(uid){
  // Ripulisce tutti i fogli tenant-aware.
  const targets = [
    SHEETS.IMPOSTAZIONI,
    SHEETS.OSPITI,
    SHEETS.STANZE,
    SHEETS.SPESE,
    SHEETS.MOTIVAZIONI,
    SHEETS.PULIZIE,
    SHEETS.LAVANDERIA,
    SHEETS.OPERATORI,
  ];
  for (const name of targets){
    try{ purgeUserFromSheet_(name, uid); }catch(_){ }
  }
}

function handleUtenti_(e, method){
  const sh = getSheet_(SHEETS.UTENTI);

  if (method !== "POST") {
    return jsonError_("Metodo non supportato per utenti: " + method);
  }

  const nowIso = new Date().toISOString();
  const body = parseBody_(e) || {};
  const op = String(body.op || "").trim().toLowerCase();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!op) return jsonError_("Parametro op mancante (utenti)");
  if (!username || !password) return jsonError_("Username/password mancanti");

  const { headers, rows } = readAll_(sh);
  const existing = findUserByUsername_(rows, username);

  if (op === "create"){
    if (existing) return jsonError_("Username già esistente");
    const id = String("u_" + Date.now() + "_" + Math.floor(Math.random()*100000));
    const obj = {
      id: id,
      username: username,
      password_hash: sha256Hex_(password),
      ruolo: "admin",
      attivo: "1",
      nome: String(body.nome || ""),
      telefono: String(body.telefono || ""),
      email: String(body.email || ""),
      last_login: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    upsertById_(sh, obj, "id");
    return jsonOk_({ user: sanitizeUserOut_(obj) });
  }

  if (!existing) return jsonError_("Credenziali non valide");

  const storedHash = String(existing.password_hash || existing.passwordHash || "");
  if (sha256Hex_(password) !== storedHash) return jsonError_("Credenziali non valide");

  if (String(existing.attivo || "1") === "0") return jsonError_("Account disattivato");

  if (op === "login"){
    // aggiorna last_login
    try{
      existing.last_login = nowIso;
      existing.updatedAt = nowIso;
      upsertById_(sh, existing, "id");
    }catch(_){ }
    return jsonOk_({ user: sanitizeUserOut_(existing) });
  }

  if (op === "update"){
    const newPassword = String(body.newPassword || "");
    const upd = Object.assign({}, existing);
    if (newPassword) upd.password_hash = sha256Hex_(newPassword);
    if (body.nome !== undefined) upd.nome = String(body.nome || "");
    if (body.telefono !== undefined) upd.telefono = String(body.telefono || "");
    if (body.email !== undefined) upd.email = String(body.email || "");
    upd.updatedAt = nowIso;
    upsertById_(sh, upd, "id");
    return jsonOk_({ user: sanitizeUserOut_(upd) });
  }

  if (op === "delete"){
    const uid = String(existing.id || existing.ID || existing.user_id || existing.userId || "").trim();
    if (!uid) return jsonError_("ID utente mancante");

    // 1) purge dati
    purgeAllUserData_(uid);
    // 2) elimina account
    deleteUserRowById_(uid);
    return jsonOk_({ deleted: true });
  }

  return jsonError_("Operazione utenti non valida: " + op);
}

function normalizePulizieRow_(d, fallbackDate) {
  d = d || {};
  const obj = {};
  obj.data = String(pick_(d.data, d.date, d.Data, d.DATE, d.Date, fallbackDate)).trim();
  obj.Data = obj.data;
obj.stanza = String(pick_(d.stanza, d.Stanza, d.room, d.Room, d.stanza_num, d.stanzaNum, "")).trim();
  obj.Stanza = obj.stanza;
const fields = ["MAT","SIN","FED","TDO","TFA","TBI","TAP","TPI"];
  for (const k of fields) {
    const v = pick_(d[k], d[k.toLowerCase()], 0);
    const n = Number(v);
    obj[k] = (isNaN(n) ? 0 : Math.max(0, Math.floor(n)));
  }

  obj.id = String(pick_(d.id, ""));
  obj.createdAt = String(pick_(d.createdAt, d.created_at, ""));
  obj.updatedAt = String(pick_(d.updatedAt, d.updated_at, ""));
  return obj;
}

function isoDatePulizie_(v){
  if (!v) return "";
  // Date object from Sheets
  try{
    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v)){
      return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  }catch(_){}

  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);

  // dd/mm/yy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m){
    const dd = String(m[1]).padStart(2,"0");
    const mm = String(m[2]).padStart(2,"0");
    let yy = String(m[3]);
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-${dd}`;
  }

  // last resort parse
  try{
    const d = new Date(s);
    if (!isNaN(d)){
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  }catch(_){}

  return s.slice(0,10);
}



function handleMotivazioni_(e, method) {
  const sh = getSheet_(SHEETS.MOTIVAZIONI);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    const clean = rows.filter(r => String(r.attiva || r.active || "true").toLowerCase() !== "false");
    return jsonOk_(clean);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e);
    const items = Array.isArray(payload) ? payload : [payload];

    const results = [];
    for (const item of items) {
      const obj = normalizeMotivazione_(item);
      results.push(upsertById_(sh, obj, "id"));
    }
    return jsonOk_({ saved: results.length, results: results });
  }

  return jsonError_("Metodo non supportato per motivazioni: " + method);
}

function normalizeMotivazione_(d) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(d.id, d.ID, ("m_" + Date.now() + "_" + Math.floor(Math.random() * 100000))));
  const createdAt = String(pick_(d.createdAt, d.created_at, nowIso));
  const updatedAt = nowIso;

  return {
    id: id,
    motivazione: String(pick_(d.motivazione, d.reason, d.nome, d.name)),
    attiva: String(pick_(d.attiva, d.active, "true")),
    createdAt: createdAt,
    updatedAt: updatedAt,
  };
}

/* =========================
   REPORT (compatibile UI)
========================= */

function handleReport_(e) {
  const shS = getSheet_(SHEETS.SPESE);
  const speseAll = readAll_(shS).rows;

  const from = String((e.parameter && e.parameter.from) ? e.parameter.from : "").trim();
  const to = String((e.parameter && e.parameter.to) ? e.parameter.to : "").trim();

  const spese = filterByDateRange_(speseAll, from, to, ["dataSpesa", "data_spesa", "data", "date"])
    .filter(r => String(r.isDeleted || r.is_deleted || "false").toLowerCase() !== "true");

  const totals = {
    importoLordo: 0,
    imponibile: 0,
    iva: 0,
    ivaDetraibile: 0,
  };

  const byCategoria = {};

  for (const s of spese) {
    const cat = String(s.categoria || "").toUpperCase() || "SENZA_CATEGORIA";

    const lordo = Number(s.importoLordo || 0) || 0;
    const imp = Number(s.imponibile || 0) || 0;
    const iva = Number(s.iva || 0) || 0;
    const ivaDet = Number(s.ivaDetraibile || 0) || 0;

    totals.importoLordo += lordo;
    totals.imponibile += imp;
    totals.iva += iva;
    totals.ivaDetraibile += ivaDet;

    if (!byCategoria[cat]) {
      byCategoria[cat] = { importoLordo: 0, imponibile: 0, iva: 0, ivaDetraibile: 0 };
    }
    byCategoria[cat].importoLordo += lordo;
    byCategoria[cat].imponibile += imp;
    byCategoria[cat].iva += iva;
    byCategoria[cat].ivaDetraibile += ivaDet;
  }

  totals.importoLordo = round2_(totals.importoLordo);
  totals.imponibile = round2_(totals.imponibile);
  totals.iva = round2_(totals.iva);
  totals.ivaDetraibile = round2_(totals.ivaDetraibile);

  Object.keys(byCategoria).forEach(k => {
    byCategoria[k].importoLordo = round2_(byCategoria[k].importoLordo);
    byCategoria[k].imponibile = round2_(byCategoria[k].imponibile);
    byCategoria[k].iva = round2_(byCategoria[k].iva);
    byCategoria[k].ivaDetraibile = round2_(byCategoria[k].ivaDetraibile);
  });

  return jsonOk_({
    totals: totals,
    byCategoria: byCategoria,
  });
}

/* =========================
   FILTER UTILS
========================= */

function filterByDateRange_(rows, from, to, dateFieldCandidates) {
  if (!from && !to) return rows;

  const fromD = from ? new Date(from) : null;
  const toD = to ? new Date(to) : null;

  const hasFrom = fromD && !isNaN(fromD.getTime());
  const hasTo = toD && !isNaN(toD.getTime());

  return rows.filter(r => {
    let v = "";
    for (const f of dateFieldCandidates) {
      if (r && r[f] !== undefined && r[f] !== null && String(r[f]).trim() !== "") {
        v = r[f];
        break;
      }
    }
    if (!v) return true;

    const dt = new Date(v);
    if (isNaN(dt.getTime())) return true;

    if (hasFrom && dt < fromD) return false;
    if (hasTo && dt > toD) return false;
    return true;
  });
}
