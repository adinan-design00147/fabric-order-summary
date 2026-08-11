/**
 * Haifa Design — ตัวกลางจัดการรูปงานบน Google Drive
 *
 * ใช้คู่กับ app.html (เว็บ static บน GitHub Pages ที่คุยกับ Drive ตรงๆ ไม่ได้)
 * ไฟล์รูปทั้งหมดถูกเก็บไว้ในไดรฟ์ของคุณเอง แยกโฟลเดอร์ตามชื่อล็อต
 *
 * โครงสร้างในไดรฟ์ (โฟลเดอร์ "งานป้ายผ้า" ที่มีอยู่แล้ว):
 *   งานป้ายผ้า/
 *     ├── 7/8/69/        <- ชื่อโฟลเดอร์ = ชื่อล็อต
 *     ├── 30-7-69/       <- เขียนคนละแบบก็เจอ (เทียบแบบไม่สนขีด/เว้นวรรค)
 *     ├── 10 / 7/ 69/
 *     └── ...
 *
 * วิธี deploy อ่านได้ที่ CLAUDE.md หัวข้อ "ระบบรูปงานบน Google Drive"
 */

// ID ของโฟลเดอร์หลักในไดรฟ์ — ดูได้จาก URL: drive.google.com/drive/folders/<ตรงนี้คือ ID>
// fabric = งานป้ายผ้า (ต้นทุนผลิต แยกตามล็อต)
// order  = รูปงานของออเดอร์ลูกค้า (แยกตามเลขออเดอร์ เช่น OD6908-001)
const ROOTS = {
  fabric: '1-G4nVFPTlrM27M2fEx5Vtt9GFrzzBHEl',
  order:  '1dNsrJLp-YbWlip2sVeE6KC9Ng2qAZRji',
};
const ROOT_FOLDER_ID = ROOTS.fabric;   // ค่า default เผื่อเรียกแบบไม่ส่ง root มา

// ---------- endpoints ----------

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    const root = (e && e.parameter && e.parameter.root) || 'fabric';
    if (action === 'list') {
      return json({ ok: true, files: listImages(e.parameter.lot, root) });
    }
    if (action === 'counts') {
      return json({ ok: true, counts: countAll(root) });
    }
    return json({ ok: true, message: 'Haifa Design image API พร้อมใช้งาน' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'upload') {
      return json({ ok: true, file: uploadImage(body.lot, body.filename, body.mimeType, body.data, body.root || 'fabric') });
    }
    // ไม่รองรับการลบโดยตั้งใจ — ลบรูปให้ทำในไดรฟ์โดยตรงเท่านั้น
    return json({ ok: false, error: 'ไม่รู้จัก action: ' + body.action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- helpers ----------

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getRoot(root) {
  return DriveApp.getFolderById(ROOTS[root] || ROOT_FOLDER_ID);
}

/** ชื่อล็อตมี "/" ซึ่งใช้เป็นชื่อโฟลเดอร์ได้ใน Drive แต่กันพลาดด้วยการ trim */
function safeName(lot) {
  const n = String(lot == null ? '' : lot).trim();
  return n === '' ? 'ไม่ระบุล็อต' : n;
}

/**
 * ทำชื่อล็อตให้อยู่ในรูปมาตรฐานก่อนเทียบ
 * โฟลเดอร์เดิมในไดรฟ์เขียนไม่เหมือนกัน เช่น "30-7-69", "10 / 7/ 69", "7/8/69"
 * ทั้งหมดต้องถือว่าเป็นล็อตเดียวกับ "30/7/69", "10/7/69", "7/8/69"
 * และตัดเลข 0 นำหน้าออกด้วย (02/07/69 -> 2/7/69)
 */
function normalizeLotName(name) {
  const parts = String(name == null ? '' : name)
    .replace(/[\s ]/g, '')   // ตัดช่องว่างทุกชนิด
    .replace(/[-.]/g, '/')        // - และ . ให้เป็น /
    .split('/')
    .filter(function (p) { return p !== ''; });
  return parts.map(function (p) {
    return /^\d+$/.test(p) ? String(parseInt(p, 10)) : p;
  }).join('/');
}

/** หาโฟลเดอร์ล็อตแบบเทียบชื่อหลัง normalize (เจอทั้ง 30-7-69 และ 30/7/69) */
function getLotFolder(lot, createIfMissing, rootKey) {
  const root = getRoot(rootKey);
  const target = normalizeLotName(safeName(lot));
  const folders = root.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    if (normalizeLotName(f.getName()) === target) return f;
  }
  return createIfMissing ? root.createFolder(safeName(lot)) : null;
}

function fileInfo(f) {
  const id = f.getId();
  return {
    id: id,
    name: f.getName(),
    // รูปย่อสำหรับโชว์ในเว็บ (เร็วกว่าโหลดไฟล์เต็ม)
    thumb: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800',
    // ลิงก์เปิดไฟล์เต็มในไดรฟ์
    view: 'https://drive.google.com/file/d/' + id + '/view',
    created: f.getDateCreated().toISOString(),
  };
}

// ---------- actions ----------

function listImages(lot, rootKey) {
  const folder = getLotFolder(lot, false, rootKey);
  if (!folder) return [];
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) out.push(fileInfo(files.next()));
  out.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
  return out;
}

/**
 * นับจำนวนรูปของทุกล็อต เพื่อให้เว็บโชว์ตัวเลขบนปุ่มได้โดยไม่ต้องยิงทีละล็อต
 * key ที่คืนเป็นชื่อที่ normalize แล้ว (เว็บจะ normalize ชื่อล็อตฝั่งตัวเองเพื่อจับคู่)
 */
function countAll(rootKey) {
  const root = getRoot(rootKey);
  const counts = {};
  const folders = root.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    let n = 0;
    const files = f.getFiles();
    while (files.hasNext()) { files.next(); n++; }
    counts[normalizeLotName(f.getName())] = n;
  }
  return counts;
}

function uploadImage(lot, filename, mimeType, base64, rootKey) {
  const folder = getLotFolder(lot, true, rootKey);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'image/jpeg', filename || 'image.jpg');
  const file = folder.createFile(blob);
  // ต้องเปิดสิทธิ์ "ใครมีลิงก์ก็ดูได้" ไม่งั้นรูปจะไม่ขึ้นในเว็บ
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return fileInfo(file);
}

// ---------- ทดสอบใน editor ได้ ----------

function testSetup() {
  Object.keys(ROOTS).forEach(function (key) {
    const root = getRoot(key);
    Logger.log('[' + key + '] โฟลเดอร์หลัก: ' + root.getName() + ' (' + root.getUrl() + ')');
    Logger.log('[' + key + '] จำนวนรูปแต่ละโฟลเดอร์: ' + JSON.stringify(countAll(key)));
  });
  Logger.log('ทดสอบหาโฟลเดอร์ล็อต 30/7/69 -> ' +
    (getLotFolder('30/7/69', false, 'fabric') ? 'เจอ ✅' : 'ไม่เจอ ❌'));
}
