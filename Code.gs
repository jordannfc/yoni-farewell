/* =============================================================================
   Yoni's Farewell — Apps Script backend (Code.gs)
   -----------------------------------------------------------------------------
   Deploy as a Web App:  Execute as = Me,  Who has access = Anyone.
   See SETUP.md, Step 3. Every code change needs a NEW deployment version.

   On first request it auto-creates in your Drive root:
     - a Sheet "Yoni Book - Entries" (tabs: Entries, settings)
     - a folder "Yoni Book - Photos" (one subfolder per entry)
   and remembers their IDs in Script Properties. Nothing to pre-create.

   To CLOSE the book: open the Sheet -> "settings" tab -> set B1 to TRUE.
   To HIDE a bad entry: on the "Entries" tab set that row's `hidden` to TRUE.
   ============================================================================= */

// If you turned on Google Sign-In, paste the SAME OAuth Client ID here so the
// backend can verify tokens. Leave "" for name-only mode (no verification).
var GOOGLE_CLIENT_ID = "39894390702-tkmapdifhpot6m911lpffbodb7is32ns.apps.googleusercontent.com";

var SHEET_NAME  = "Yoni Book - Entries";
var FOLDER_NAME = "Yoni Book - Photos";
var FEED_LIMIT  = 200;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "health";
  try {
    if (action === "feed")   return json_(getFeed_());
    if (action === "status") return json_({ ok: true, closed: isClosed_() });
    if (action === "checkpin") {
      var pin = getPin_();
      var given = (e.parameter.pin || "").toString().trim();
      return json_({ ok: true, valid: !!pin && given === pin });
    }
    return json_({ ok: true, service: "yoni-farewell", closed: isClosed_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (isClosed_()) {
      return json_({ ok: false, closed: true, error: "The book is closed." });
    }

    // Auth: accept a valid Google ID token OR the correct party code (settings!B2).
    // No open bypass — a guest needs one of the two.
    var email = "";
    var authed = false;
    if (GOOGLE_CLIENT_ID && body.idToken) {
      var v = verifyToken_(body.idToken);
      if (v.ok) { authed = true; email = v.email; }
    }
    if (!authed) {
      var pin = getPin_();
      if (pin && body.pin && String(body.pin).trim() === pin) authed = true;
    }
    if (!authed) return json_({ ok: false, error: "auth_required" });

    var name = (body.name || "").toString().trim().slice(0, 80) || "Anonymous";
    var message = (body.message || "").toString().slice(0, 4000);
    var photos = Array.isArray(body.photos) ? body.photos.slice(0, 3) : [];

    // Save photos into a per-entry subfolder.
    var stamp = Utilities.formatDate(new Date(), "Australia/Sydney", "yyyy-MM-dd_HHmm");
    var safeName = name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "entry";
    var parent = getPhotosFolder_();
    var sub = parent.createFolder(stamp + "_" + safeName);

    var ids = [], links = [];
    for (var i = 0; i < photos.length; i++) {
      var p = photos[i];
      if (!p || !p.data) continue;
      var mime = p.mime || "image/jpeg";
      var ext = mime.indexOf("png") > -1 ? "png" : "jpg";
      var bytes = Utilities.base64Decode(p.data);
      var blob = Utilities.newBlob(bytes, mime, "photo_" + (i + 1) + "." + ext);
      var file = sub.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      ids.push(file.getId());
      links.push("https://drive.google.com/file/d/" + file.getId() + "/view");
    }

    // Log a row.
    var sheet = getEntriesSheet_();
    sheet.appendRow([
      new Date().toISOString(),
      email,
      name,
      message,
      ids.join(","),
      links.join(","),
      false // hidden
    ]);

    return json_({ ok: true, photoIds: ids });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Feed (photos only — never exposes messages or emails)
// ---------------------------------------------------------------------------
function getFeed_() {
  var sheet = getEntriesSheet_();
  var last = sheet.getLastRow();
  var photos = [];
  if (last >= 2) {
    // columns: ts(1) email(2) name(3) message(4) photoIds(5) links(6) hidden(7)
    var rows = sheet.getRange(2, 1, last - 1, 7).getValues();
    for (var r = 0; r < rows.length; r++) {
      var hidden = rows[r][6] === true || String(rows[r][6]).toUpperCase() === "TRUE";
      if (hidden) continue;
      var ts = rows[r][0];
      var idsCell = String(rows[r][4] || "").trim();
      if (!idsCell) continue;
      var ids = idsCell.split(",");
      for (var k = 0; k < ids.length; k++) {
        if (ids[k]) photos.push({ id: ids[k], ts: ts });
      }
    }
  }
  photos.reverse(); // newest first
  if (photos.length > FEED_LIMIT) photos = photos.slice(0, FEED_LIMIT);
  return { ok: true, closed: isClosed_(), photos: photos };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function verifyToken_(idToken) {
  if (!idToken) return { ok: false, error: "no_token" };
  try {
    var resp = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return { ok: false, error: "tokeninfo_" + resp.getResponseCode() };
    var info = JSON.parse(resp.getContentText());
    if (info.aud !== GOOGLE_CLIENT_ID) return { ok: false, error: "bad_aud" };
    if (String(info.email_verified) !== "true") return { ok: false, error: "email_unverified" };
    return { ok: true, email: info.email || "" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Storage provisioning (auto-create + cache IDs)
// ---------------------------------------------------------------------------
function getEntriesSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SHEET_ID");
  var ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    props.setProperty("SHEET_ID", ss.getId());
  }
  var entries = ss.getSheetByName("Entries");
  if (!entries) {
    entries = ss.getSheets()[0];
    entries.setName("Entries");
    entries.appendRow(["timestamp", "google_email", "display_name", "message", "photo_ids", "photo_links", "hidden"]);
    entries.setFrozenRows(1);
  }
  ensureSettings_(ss);
  return entries;
}

function ensureSettings_(ss) {
  var s = ss.getSheetByName("settings");
  if (!s) s = ss.insertSheet("settings");
  s.getRange("A1").setValue("closed?");
  if (s.getRange("B1").getValue() === "") s.getRange("B1").setValue(false);
  s.getRange("A2").setValue("party_code (4 digits)");
  if (String(s.getRange("B2").getValue()).trim() === "") s.getRange("B2").setValue("2607");
  s.getRange("A4").setValue("B1=TRUE closes the book. B2 is the 4-digit code for guests who don't use Google — change it to your own.");
  return s;
}

function getPin_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty("SHEET_ID");
    if (!id) return "";
    var ss = SpreadsheetApp.openById(id);
    var s = ss.getSheetByName("settings") || ensureSettings_(ss);
    var v = String(s.getRange("B2").getValue()).trim();
    if (v === "") { ensureSettings_(ss); v = String(s.getRange("B2").getValue()).trim(); }
    return v;
  } catch (e) {
    return "";
  }
}

function getPhotosFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate */ }
  }
  var folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("FOLDER_ID", folder.getId());
  return folder;
}

function isClosed_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty("SHEET_ID");
    if (!id) return false;
    var ss = SpreadsheetApp.openById(id);
    var settings = ss.getSheetByName("settings");
    if (!settings) return false;
    var v = settings.getRange("B1").getValue();
    return v === true || String(v).toUpperCase() === "TRUE";
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
