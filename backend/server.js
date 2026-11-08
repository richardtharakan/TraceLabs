import 'dotenv/config';
import express from 'express';
import basicAuth from 'express-basic-auth';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import sharp from 'sharp';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSchema, pool } from './src/db.js';
import { storeImage, deleteStoredImage } from './src/storage.js';

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const CONSENT_VERSION = 'tracelab-v1';
const SESSION_HOURS = 24;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '32kb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    callback(allowed.has(file.mimetype) ? null : new Error('Choose a JPG, PNG or WebP image.'), allowed.has(file.mimetype));
  }
});

const creationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many links created from this network. Try again later.' }
});
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many location submissions. Try again later.' }
});

const adminAuth = basicAuth({
  challenge: false,
  unauthorizedResponse: { error: 'Dashboard credentials are missing or invalid.' },
  authorizer: (username, password) => {
    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) return false;
    const userOk = safeEqual(username, process.env.ADMIN_USERNAME);
    const passOk = safeEqual(password, process.env.ADMIN_PASSWORD);
    return userOk && passOk;
  },
  authorizeAsync: false
});

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
function classifyClient(req) {
  const ua = String(req.get('user-agent') || '');
  let browser = 'Other/unknown';
  if (/WhatsApp/i.test(ua)) browser = 'WhatsApp in-app';
  else if (/Instagram/i.test(ua)) browser = 'Instagram in-app';
  else if (/Telegram/i.test(ua)) browser = 'Telegram in-app';
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = 'Facebook in-app';
  else if (/Android.*wv/i.test(ua)) browser = 'Android WebView';
  else if (/EdgA?|EdgiOS/i.test(ua)) browser = 'Edge';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome|Chromium/i.test(ua)) browser = 'Chrome/Chromium';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  let platform = 'Other/unknown';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Windows NT/i.test(ua)) platform = 'Windows';
  else if (/Mac OS X/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';
  return { browser, platform };
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function getPublicBase(req) {
  return baseUrl || `${req.protocol}://${req.get('host')}`;
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/', (_req, res) => res.redirect('/dashboard'));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(publicDir, 'dashboard.html')));
app.get('/share/:token', (_req, res) => res.sendFile(path.join(publicDir, 'share.html')));
app.use('/assets', express.static(path.join(publicDir, 'assets'), { maxAge: '1h' }));
app.use('/uploads', express.static(path.join(here, 'uploads'), { maxAge: '1d', fallthrough: false }));

// Link creation is authenticated. The secret is entered by the app/dashboard user;
// it is never embedded in the Android APK or in the recipient's share URL.
app.post('/api/sessions', adminAuth, creationLimiter, upload.single('image'), asyncRoute(async (req, res) => {
  await ensureSchema();
  const title = String(req.body.title || 'TraceLab location demo').trim().slice(0, 100) || 'TraceLab location demo';
  const rawHours = Number(req.body.expiryHours || SESSION_HOURS);
  const expiryHours = Number.isFinite(rawHours) ? Math.min(168, Math.max(1, Math.round(rawHours))) : SESSION_HOURS;
  let imageUrl = null;
  let imageStorageKey = null;

  if (req.file) {
    // Re-encode to JPEG to strip EXIF/GPS metadata and normalize the public preview.
    const processed = await sharp(req.file.buffer, { failOn: 'error' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const stored = await storeImage(processed);
    imageUrl = stored.url;
    imageStorageKey = stored.storageKey;
  }

  const token = randomBytes(32).toString('base64url');
  const sessionId = randomUUID();
  const result = await pool.query(
    `INSERT INTO sessions (id, token_hash, title, image_url, image_storage_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 * INTERVAL '1 hour'))
     RETURNING id, title, image_url, created_at, expires_at`,
    [sessionId, hashToken(token), title, imageUrl, imageStorageKey, expiryHours]
  );
  const session = result.rows[0];
  res.status(201).json({
    id: session.id,
    title: session.title,
    imageUrl: session.image_url,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    shareUrl: `${getPublicBase(req)}/share/${token}`
  });
}));

app.get('/api/sessions/:token', asyncRoute(async (req, res) => {
  await ensureSchema();
  const result = await pool.query(
    `SELECT s.id, title, image_url, expires_at, (expires_at > NOW()) AS active,
            EXISTS (SELECT 1 FROM location_reports r WHERE r.session_id = s.id) AS reported
     FROM sessions s WHERE token_hash = $1`,
    [hashToken(req.params.token)]
  );
  const session = result.rows[0];
  if (!session) return res.status(404).json({ error: 'This TraceLab link does not exist.' });
  if (!session.active) return res.status(410).json({ error: 'This TraceLab link has expired.' });

  // Record that the consent page loaded. Store only a timestamp and coarse
  // browser/platform categories; do not persist the IP address or full User-Agent.
  const client = classifyClient(req);
  await pool.query(
    `INSERT INTO session_visits (id, session_id, browser_family, platform_family)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), session.id, client.browser, client.platform]
  );
  const visitResult = await pool.query(
    `SELECT COUNT(*)::int AS open_count, MAX(opened_at) AS last_opened_at
     FROM session_visits WHERE session_id = $1`,
    [session.id]
  );

  console.info('[TraceLabs] Demo link page opened; visit recorded.');
  res.json({
    title: session.title,
    imageUrl: session.image_url,
    expiresAt: session.expires_at,
    alreadyShared: session.reported,
    consentVersion: CONSENT_VERSION,
    openCount: visitResult.rows[0].open_count,
    lastOpenedAt: visitResult.rows[0].last_opened_at
  });
}));

app.post('/api/sessions/:token/location', reportLimiter, asyncRoute(async (req, res) => {
  await ensureSchema();
  const { latitude, longitude, accuracy, consentAccepted, consentVersion } = req.body || {};
  if (consentAccepted !== true || consentVersion !== CONSENT_VERSION) {
    return res.status(400).json({ error: 'Explicit TraceLab consent is required.' });
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  const acc = Number(accuracy);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 ||
      !Number.isFinite(acc) || acc < 0 || acc > 1_000_000) {
    return res.status(400).json({ error: 'The supplied location values are invalid.' });
  }

  const sessionResult = await pool.query(
    'SELECT id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()',
    [hashToken(req.params.token)]
  );
  if (!sessionResult.rowCount) return res.status(404).json({ error: 'This TraceLab link is missing or expired.' });

  try {
    await pool.query(
      `INSERT INTO location_reports
       (id, session_id, latitude, longitude, accuracy_m, consent_version, consented_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [randomUUID(), sessionResult.rows[0].id, lat, lon, acc, CONSENT_VERSION]
    );
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A location has already been shared for this link.' });
    throw error;
  }

  // No IP address, device fingerprint or continuous location updates are stored.
  console.info('[TraceLabs] One-time location report saved successfully.');
  res.status(201).json({ message: 'Your one-time location was shared successfully.' });
}));

app.get('/api/admin/sessions', adminAuth, asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  await ensureSchema();
  const result = await pool.query(
    `SELECT s.id, s.title, s.image_url, s.created_at, s.expires_at,
            r.latitude, r.longitude, r.accuracy_m, r.consented_at, r.received_at,
            COALESCE(v.open_count, 0)::int AS open_count,
            v.last_opened_at,
            latest.browser_family AS last_browser,
            latest.platform_family AS last_platform
     FROM sessions s
     LEFT JOIN location_reports r ON r.session_id = s.id
     LEFT JOIN (
       SELECT session_id, COUNT(*)::int AS open_count, MAX(opened_at) AS last_opened_at
       FROM session_visits
       GROUP BY session_id
     ) v ON v.session_id = s.id
     LEFT JOIN LATERAL (
       SELECT browser_family, platform_family
       FROM session_visits
       WHERE session_id = s.id
       ORDER BY opened_at DESC
       LIMIT 1
     ) latest ON TRUE
     ORDER BY s.created_at DESC LIMIT 100`
  );
  res.json({ sessions: result.rows });
}));

app.delete('/api/admin/sessions/:id', adminAuth, asyncRoute(async (req, res) => {
  await ensureSchema();
  const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING image_storage_key', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Session not found.' });
  await deleteStoredImage(result.rows[0].image_storage_key);
  res.json({ message: 'Session and associated report deleted.' });
}));

app.get('/health', asyncRoute(async (_req, res) => {
  await ensureSchema();
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'TraceLab API', database: 'connected' });
}));

app.use((error, req, res, _next) => {
  const errorId = randomUUID();
  console.error(JSON.stringify({
    event: 'request_error',
    errorId,
    method: req.method,
    path: req.path,
    code: error.code || null,
    message: error.message || 'Unknown error'
  }));
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 3 MB or smaller.' : 'Image upload failed.';
    return res.status(400).json({ error: message });
  }
  if (error.message?.includes('Choose a JPG')) return res.status(400).json({ error: error.message });
  if (error.message?.includes('BLOB_READ_WRITE_TOKEN')) return res.status(503).json({ error: error.message });
  res.status(500).json({ error: 'TraceLab encountered a server error. Check the server logs.', reference: errorId });
});

const port = Number(process.env.PORT || 3000);
if (!process.env.VERCEL) {
  ensureSchema().then(() => {
    app.listen(port, () => console.log(`TraceLab running at http://localhost:${port}`));
  }).catch((error) => {
    console.error('Could not connect to PostgreSQL:', error.message);
    process.exit(1);
  });
}

export default app;
