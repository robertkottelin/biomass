const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const configuredLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function rotate() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stat = fs.statSync(LOG_FILE);
    if (stat.size >= MAX_SIZE) {
      const rotated = LOG_FILE + '.1';
      if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch {
    // Rotation failure should never crash the server
  }
}

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  let line = `[${ts}] ${level.toUpperCase()} ${message}`;
  if (meta !== undefined) {
    if (meta instanceof Error) {
      line += ` | ${meta.message}`;
      if (meta.stack) line += `\n${meta.stack}`;
    } else if (typeof meta === 'object') {
      try { line += ` | ${JSON.stringify(meta)}`; } catch { line += ` | [unserializable]`; }
    } else {
      line += ` | ${meta}`;
    }
  }
  return line;
}

function write(level, message, meta) {
  if (LEVELS[level] > configuredLevel) return;
  const line = formatMessage(level, message, meta) + '\n';

  // Write to file
  rotate();
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // If file write fails, still log to console
  }

  // Also write to console
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

const logger = {
  error: (msg, meta) => write('error', msg, meta),
  warn:  (msg, meta) => write('warn', msg, meta),
  info:  (msg, meta) => write('info', msg, meta),
  debug: (msg, meta) => write('debug', msg, meta),
};

module.exports = logger;
