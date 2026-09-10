require('dotenv').config();
const mineflayer = require('mineflayer');

const CONFIG = {
  host: process.env.MC_HOST || 'mc.gameup.ir',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USERNAME || 'MynoxMC',
  auth: 'offline',
  version: '1.21.11',
};

// از .env خوانده می‌شه
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || '';

const COMMAND_SEQUENCE = [
  { cmd: `/login ${LOGIN_PASSWORD}`, delay: 2000 },
  { cmd: '/prison', delay: 20000 },
  { cmd: '/warp AFK', delay: 40000 },
];

let bot = null;
let commandTimers = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;

function clearAllTimers() {
  commandTimers.forEach(t => clearTimeout(t));
  commandTimers = [];
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function getReconnectDelay() {
  reconnectAttempts++;
  const base = Math.min(180000, 5000 * Math.pow(2, reconnectAttempts));
  const jitter = Math.random() * 3000;
  console.log(`🔄 Verbindungsversuch #${reconnectAttempts} – warte ${Math.round(base + jitter)} ms`);
  return base + jitter;
}

function extractKickText(reason) {
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object') {
    if (reason.text !== undefined) return String(reason.text);
    if (Array.isArray(reason.extra)) {
      return reason.extra
        .map(part => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && part.text !== undefined) return part.text;
          return '';
        })
        .join('');
    }
    try { return JSON.stringify(reason); } catch { return String(reason); }
  }
  return String(reason);
}

function createBot() {
  if (bot) {
    try { bot.removeAllListeners(); bot.quit(); } catch {}
    bot = null;
  }
  clearAllTimers();

  bot = mineflayer.createBot(CONFIG);

  bot.on('spawn', () => {
    reconnectAttempts = 0;
    console.log('✅ Bot verbunden. Starte Befehlsfolge…');
    COMMAND_SEQUENCE.forEach(({ cmd, delay }) => {
      const timer = setTimeout(() => {
        if (bot && bot.entity) {
          bot.chat(cmd);
          console.log(`📤 Befehl gesendet: ${cmd}`);
        }
      }, delay);
      commandTimers.push(timer);
    });
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] <${username}> ${message}`);
  });

  bot.on('resourcepack', () => {
    try { bot.acceptResourcePack(); } catch {}
  });

  bot.on('kicked', (reason) => {
    const text = extractKickText(reason);
    console.error(`❌ Gekickt: ${text}`);
    if (/online hastid|already connected|آنلاین/i.test(text)) {
      const delay = 300000;
      console.log(`⏳ Account noch online – neuer Versuch in ${delay / 1000} s …`);
      reconnectTimer = setTimeout(createBot, delay);
    } else if (/sari darid|flood|too many|خیلی زیاد/i.test(text)) {
      const delay = 120000;
      console.log(`⏳ Flood-Schutz – neuer Versuch in ${delay / 1000} s …`);
      reconnectTimer = setTimeout(createBot, delay);
    } else if (/hoviat tamam|device code|timeout|زمان/i.test(text)) {
      const delay = 60000;
      console.log(`⏳ Auth-Token abgelaufen – neuer Versuch in ${delay / 1000} s …`);
      reconnectTimer = setTimeout(createBot, delay);
    } else {
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.error('🛑 Maximale Anzahl an Verbindungsversuchen erreicht.');
        return;
      }
      reconnectTimer = setTimeout(createBot, getReconnectDelay());
    }
  });

  bot.on('error', (err) => {
    console.error(`❌ Fehler: ${err.message}`);
  });

  bot.on('end', () => {
    console.log('🔴 Verbindung getrennt.');
    clearAllTimers();
  });
}

createBot();

process.on('SIGINT', () => {
  console.log('🚪 Herunterfahren …');
  clearAllTimers();
  if (bot) bot.quit();
  process.exit(0);
});
