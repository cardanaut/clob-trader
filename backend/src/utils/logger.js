const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../../logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFile = fs.createWriteStream(path.join(LOG_DIR, 'collector.log'), { flags: 'a' });

function format(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  return `[${ts}] [${level}] ${message}${metaStr}`;
}

const logger = {
  info(message, meta) {
    const line = format('INFO', message, meta);
    console.log(line);
    logFile.write(line + '\n');
  },
  warn(message, meta) {
    const line = format('WARN', message, meta);
    console.warn(line);
    logFile.write(line + '\n');
  },
  error(message, meta) {
    const line = format('ERROR', message, meta);
    console.error(line);
    logFile.write(line + '\n');
  },
  debug(message, meta) {
    if (process.env.LOG_LEVEL === 'debug') {
      const line = format('DEBUG', message, meta);
      console.log(line);
      logFile.write(line + '\n');
    }
  },
};

module.exports = logger;
