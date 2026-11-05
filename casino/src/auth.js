const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { tx } = require('./db');
const { AppError, bad } = require('./errors');
const { newServerSeed, newClientSeed, sha256 } = require('./fair');
const { adjustBalance } = require('./wallet');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE = 'nv_session';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(key, expected);
}

const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw bad('Password must be at least 8 characters');
  if (p.length > 200) throw bad('Password is too long');
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + SESSION_MS);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return token;
}

function setSessionCookie(res, token, secure) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_MS, path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, balance: u.balance, createdAt: u.created_at };
}

function makeAuth(db, config) {
  async function signup(req, res) {
    const { username, email, password, ageConfirmed } = req.body || {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) throw bad('Username must be 3-20 letters, numbers or underscores');
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw bad('Enter a valid email address');
    validatePassword(password);
    if (ageConfirmed !== true) throw bad('You must confirm you are 18 or older');
    const hash = await hashPassword(password);
    const user = tx(db, () => {
      const taken = db.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?').get(username, email.trim());
      if (taken) throw new AppError(409, taken.username.toLowerCase() === username.toLowerCase() ? 'Username is taken' : 'Email is already registered');
      const r = db.prepare(
        'INSERT INTO users (username, email, password_hash, server_seed, client_seed, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(username, email.trim(), hash, newServerSeed(), newClientSeed(), Date.now());
      const id = Number(r.lastInsertRowid);
      if (config.signupBonus > 0) adjustBalance(db, id, config.signupBonus, 'bonus', null, 'signup');
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    });
    setSessionCookie(res, createSession(db, user.id), config.secureCookies);
    res.status(201).json({ user: publicUser(user) });
  }

  async function login(req, res) {
    const { identifier, password } = req.body || {};
    if (typeof identifier !== 'string' || typeof password !== 'string') throw bad('Enter your username/email and password');
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier.trim(), identifier.trim());
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new AppError(401, 'Invalid username/email or password');
    setSessionCookie(res, createSession(db, user.id), config.secureCookies);
    res.json({ user: publicUser(user) });
  }

  function logout(req, res) {
    const token = readCookie(req, COOKIE);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }

  function loadUser(req, _res, next) {
    const token = readCookie(req, COOKIE);
    if (token) {
      const row = db.prepare(
        'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
      ).get(sha256(token), Date.now());
      if (row) req.user = row;
    }
    next();
  }

  function requireUser(req, _res, next) {
    if (!req.user) return next(new AppError(401, 'Please log in'));
    next();
  }

  return { signup, login, logout, loadUser, requireUser };
}

module.exports = { makeAuth, publicUser, hashPassword, verifyPassword, COOKIE };
