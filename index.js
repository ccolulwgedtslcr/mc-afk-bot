require('dotenv').config();
const mineflayer = require('mineflayer');

// ─── پیکربندی ────────────────────────────────────────────
const CONFIG = {
  host: process.env.MC_HOST || 'mc.gameup.ir',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USERNAME || 'MynoxMC',
  auth: 'offline',
  version: '1.21.11',
};

const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || '';

// ─── دنباله دستورات ───────────────────────────────────────
const COMMAND_SEQUENCE = [
  { cmd: `/login "${LOGIN_PASSWORD}"`, delay: 5000 },
  { cmd: '/prison', delay: 20000 },
  { cmd: '/warp AFK', delay: 35000 },
];

// ─── ثابت‌های ریسورس پک (قبول کردن) ────────────────────────
const RP_ACCEPTED = 3;
const RP_SUCCESS = 0;

// ─── متغیرهای داخلی ────────────────────────────────────────
let bot = null;
let commandTimers = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;

// ─── توابع کمکی ───────────────────────────────────────────
function clearAllTimers() {
  commandTimers.forEach(t => clearTimeout(t));
  commandTimers = [];
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function getReconnectDelay() {
  reconnectAttempts++;
  const base = Math.min(180000, 5000 * Math.pow(2, reconnectAttempts));
  const jitter = Math.random() * 3000;
  return base + jitter;
}

function extractKickText(reason) {
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object') {
    if (reason.text !== undefined) return String(reason.text);
    if (Array.isArray(reason.extra)) {
      return reason.extra.map(p => typeof p === 'string' ? p : p?.text || '').join('');
    }
    try { return JSON.stringify(reason); } catch { return String(reason); }
  }
  return String(reason);
}

// ─── ساخت بات ─────────────────────────────────────────────
function createBot() {
  if (bot) {
    try { bot.removeAllListeners(); bot.quit(); } catch {}
    bot = null;
  }
  clearAllTimers();

  bot = mineflayer.createBot(CONFIG);

  // ✅ قبول خودکار ریسورس پک (بعد از /prison یا /warp AFK)
  bot.on('resourcepack', () => {
    bot._client.write('resource_pack_receive', { result: RP_ACCEPTED });
    bot._client.write('resource_pack_receive', { result: RP_SUCCESS });
    console.log('📦 Resource Pack قبول شد.');
  });

  // ─── Spawn ────────────────────────────────────────────────
  bot.on('spawn', () => {
    reconnectAttempts = 0;
    console.log('✅ Bot وصل شد. شروع دستورات…');

    COMMAND_SEQUENCE.forEach(({ cmd, delay }) => {
      const timer = setTimeout(() => {
        if (bot && bot.entity) {
          bot.chat(cmd);
          console.log(`📤 ارسال: ${cmd}`);
        }
      }, delay);
      commandTimers.push(timer);
    });
  });

  // ─── Chat (دیباگ) ────────────────────────────────────────
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] <${username}> ${message}`);
  });

  // ─── Kick ────────────────────────────────────────────────
  bot.on('kicked', (reason) => {
    const text = extractKickText(reason);
    console.error(`❌ کیک: ${text}`);

    if (/online|hastid|already connected|آنلاین/i.test(text)) {
      console.log('⏳ اکانت آنلاینه — ۵ دقیقه صبر…');
      reconnectTimer = setTimeout(createBot, 300000);
    } else if (/sari|flood|too many|خیلی زیاد/i.test(text)) {
      console.log('⏳ ضد فلاود — ۲ دقیقه صبر…');
      reconnectTimer = setTimeout(createBot, 120000);
    } else if (/hoviat|timeout|device code|زمان/i.test(text)) {
      console.log('⏳ Auth منقضی — ۱ دقیقه صبر…');
      reconnectTimer = setTimeout(createBot, 60000);
    } else {
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.error('🛑 حداکثر تلاش رسید.');
        return;
      }
      reconnectTimer = setTimeout(createBot, getReconnectDelay());
    }
  });

  // ─── Error ───────────────────────────────────────────────
  bot.on('error', (err) => {
    console.error(`❌ خطا: ${err.message}`);
  });
  // ─── End ─────────────────────────────────────────────────
  bot.on('end', () => {
    console.log('🔴 اتصال قطع شد.');
    clearAllTimers();
  });
}

// ─── اجرا ──────────────────────────────────────────────────
createBot();

// ─── خاموشی تمیز ──────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('🚪 خاموش شدن…');
  clearAllTimers();
  if (bot) bot.quit();
  process.exit(0);
});
