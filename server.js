const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

const app = express();
const SECRET = process.env.JWT_SECRET || 'ftv-sopralluogo-secret-2026-cambia-questo';
const PORT = process.env.PORT || 3000;

// ── CLOUDINARY ────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key:    process.env.CLOUDINARY_API_KEY    || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});
const useCloudinary = !!process.env.CLOUDINARY_CLOUD_NAME;
console.log(useCloudinary ? 'CLOUDINARY-OK useCloudinary=true cloud=' + process.env.CLOUDINARY_CLOUD_NAME : 'CLOUDINARY-NO env var mancante');

// ── CARTELLA UPLOAD LOCALE (fallback) ─────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!useCloudinary && !fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── DATABASE ──────────────────────────────────────────────
const db = new Database(process.env.DB_PATH || 'surveys.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    status TEXT DEFAULT 'bozza',
    created_by_id TEXT,
    created_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    survey_id TEXT NOT NULL,
    category TEXT DEFAULT 'altro',
    nota TEXT DEFAULT '',
    filename TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Crea admin di default se non esiste
const adminExists = db.prepare("SELECT id FROM users WHERE role='admin'").get();
if (!adminExists) {
  db.prepare(
    'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)'
  ).run('admin_001', 'Amministratore', 'admin@ftv.it', bcrypt.hashSync('Admin2026!', 10), 'admin');
  console.log('Admin creato: admin@ftv.it / Admin2026!');
}

// ── MULTER (memory storage per Cloudinary, disk per fallback) ──
const storage = useCloudinary
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `ph_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`);
      }
    });

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo immagini consentite'));
  }
});

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR)); // sempre attivo per compatibilità foto vecchie

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorizzato' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sessione scaduta, effettua di nuovo il login' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Richiesti permessi amministratore' });
  next();
}

// ── AUTH ROUTES ───────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email o password non corretti' });
  }
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Password attuale non corretta' });
  }
  if (newPassword.length < 6) return res.status(400).json({ error: 'La nuova password deve avere almeno 6 caratteri' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ success: true });
});

// ── SURVEY ROUTES ─────────────────────────────────────────
app.get('/api/surveys', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM surveys ORDER BY created_at DESC').all();
  res.json(rows.map(r => {
    const data = JSON.parse(r.data);
    return {
      ...data,
      id: r.id,
      status: r.status,
      createdById: r.created_by_id,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }));
});

app.post('/api/surveys', authMiddleware, (req, res) => {
  const body = req.body;
  const id = body.id || ('sv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
  db.prepare(
    'INSERT INTO surveys (id, data, status, created_by_id, created_by_name) VALUES (?, ?, ?, ?, ?)'
  ).run(id, JSON.stringify(body), body.status || 'bozza', req.user.id, req.user.name);
  res.json({ success: true, id });
});

app.put('/api/surveys/:id', authMiddleware, (req, res) => {
  const body = req.body;
  db.prepare(
    "UPDATE surveys SET data=?, status=?, updated_at=datetime('now') WHERE id=?"
  ).run(JSON.stringify(body), body.status || 'bozza', req.params.id);
  res.json({ success: true });
});

app.delete('/api/surveys/:id', authMiddleware, async (req, res) => {
  const surveyId = req.params.id;
  const photos = db.prepare('SELECT filename FROM photos WHERE survey_id = ?').all(surveyId);
  for (const p of photos) {
    try {
      if (useCloudinary) await cloudinary.uploader.destroy(p.filename);
      else {
        const filepath = path.join(UPLOAD_DIR, p.filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      }
    } catch(e) {}
  }
  db.prepare('DELETE FROM photos WHERE survey_id = ?').run(surveyId);
  db.prepare('DELETE FROM surveys WHERE id = ?').run(surveyId);
  res.json({ success: true });
});

// ── PHOTO ROUTES ──────────────────────────────────────────
app.get('/api/photos/survey/:surveyId', authMiddleware, (req, res) => {
  const photos = db.prepare(
    'SELECT * FROM photos WHERE survey_id = ? ORDER BY created_at ASC'
  ).all(req.params.surveyId);
  res.json(photos.map(p => ({
    ...p,
    url: p.filename.includes('/')
      ? cloudinary.url(p.filename, { secure: true })
      : `/uploads/${p.filename}`
  })));
});

app.post('/api/photos', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File mancante' });
  const { surveyId, category, nota } = req.body;
  if (!surveyId) return res.status(400).json({ error: 'surveyId mancante' });
  const id = 'ph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  console.log('PHOTO-UPLOAD useCloudinary=' + useCloudinary + ' buffer=' + (!!req.file.buffer) + ' filename=' + req.file.filename);

  try {
    let filename, url;
    if (useCloudinary) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'ftv_sopralluogo', resource_type: 'image' },
          (error, result) => { if (error) reject(error); else resolve(result); }
        ).end(req.file.buffer);
      });
      filename = result.public_id;
      url = result.secure_url;
    } else {
      filename = req.file.filename;
      url = `/uploads/${filename}`;
    }
    db.prepare(
      'INSERT INTO photos (id, survey_id, category, nota, filename) VALUES (?, ?, ?, ?, ?)'
    ).run(id, surveyId, category || 'altro', nota || '', filename);
    res.json({ success: true, id, url });
  } catch(e) {
    console.log('PHOTO-UPLOAD-ERROR: ' + e.message);
    res.status(500).json({ error: 'Errore upload: ' + e.message });
  }
});

app.delete('/api/photos/:id', authMiddleware, async (req, res) => {
  const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id);
  if (photo) {
    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
    try {
      if (useCloudinary) await cloudinary.uploader.destroy(photo.filename);
      else {
        const filepath = path.join(UPLOAD_DIR, photo.filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      }
    } catch(e) {}
  }
  res.json({ success: true });
});

// ── ADMIN ROUTES ──────────────────────────────────────────
app.get('/api/admin/backup', authMiddleware, adminOnly, (req, res) => {
  const surveys = db.prepare('SELECT * FROM surveys ORDER BY created_at ASC').all().map(r => ({
    ...JSON.parse(r.data), id: r.id, status: r.status,
    createdById: r.created_by_id, createdByName: r.created_by_name,
    createdAt: r.created_at, updatedAt: r.updated_at
  }));
  const users = db.prepare('SELECT id, name, email, password, role, created_at FROM users ORDER BY created_at ASC').all();
  const photos = db.prepare('SELECT * FROM photos ORDER BY created_at ASC').all().map(p => ({
    ...p,
    url: p.filename.includes('/') ? cloudinary.url(p.filename, { secure: true }) : `/uploads/${p.filename}`
  }));
  res.json({ exportedAt: new Date().toISOString(), surveys, users, photos });
});

app.post('/api/admin/restore', authMiddleware, adminOnly, (req, res) => {
  const { surveys = [], users = [], photos = [] } = req.body || {};
  let addedSurveys = 0, skippedSurveys = 0, addedUsers = 0, skippedUsers = 0, addedPhotos = 0;
  const insertSurvey = db.prepare('INSERT OR IGNORE INTO surveys (id, data, status, created_by_id, created_by_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const s of surveys) {
    const { id, status, createdById, createdByName, createdAt, updatedAt, ...data } = s;
    const result = insertSurvey.run(id, JSON.stringify(data), status || 'bozza', createdById || '', createdByName || '', createdAt || new Date().toISOString(), updatedAt || new Date().toISOString());
    result.changes > 0 ? addedSurveys++ : skippedSurveys++;
  }
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const u of users) {
    const result = insertUser.run(u.id, u.name, u.email, u.password, u.role || 'user', u.created_at || new Date().toISOString());
    result.changes > 0 ? addedUsers++ : skippedUsers++;
  }
  const insertPhoto = db.prepare('INSERT OR IGNORE INTO photos (id, survey_id, category, nota, filename, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const p of photos) {
    const result = insertPhoto.run(p.id, p.survey_id, p.category || 'altro', p.nota || '', p.filename, p.created_at || new Date().toISOString());
    if (result.changes > 0) addedPhotos++;
  }
  res.json({ success: true, addedSurveys, skippedSurveys, addedUsers, skippedUsers, addedPhotos });
});

app.delete('/api/admin/surveys', authMiddleware, adminOnly, async (req, res) => {
  const photos = db.prepare('SELECT filename FROM photos').all();
  for (const p of photos) {
    try {
      if (useCloudinary) await cloudinary.uploader.destroy(p.filename);
      else {
        const filepath = path.join(UPLOAD_DIR, p.filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      }
    } catch(e) {}
  }
  db.prepare('DELETE FROM photos').run();
  db.prepare('DELETE FROM surveys').run();
  res.json({ success: true });
});

// ── USER ROUTES (admin) ───────────────────────────────────
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC').all();
  res.json(users);
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e password richiesti' });
  if (password.length < 6) return res.status(400).json({ error: 'Password di almeno 6 caratteri' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: 'Email gia in uso' });
  const id = 'u_' + Date.now();
  db.prepare(
    'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, email.toLowerCase().trim(), bcrypt.hashSync(password, 10), role === 'admin' ? 'admin' : 'user');
  res.json({ success: true, id });
});

app.put('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (password) {
    db.prepare('UPDATE users SET name=?, email=?, password=?, role=? WHERE id=?')
      .run(name, email, bcrypt.hashSync(password, 10), role, req.params.id);
  } else {
    db.prepare('UPDATE users SET name=?, email=?, role=? WHERE id=?')
      .run(name, email, role, req.params.id);
  }
  res.json({ success: true });
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nSopralluogo FTV avviato su http://localhost:${PORT}`);
  console.log(`   Admin: admin@ftv.it / Admin2026!`);
  console.log(`   Storage: ${useCloudinary ? 'Cloudinary' : 'Locale'}\n`);
});
