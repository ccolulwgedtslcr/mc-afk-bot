require('dotenv').config();
const mineflayer = require('mineflayer');

// ===== پیکربندی =====
const CONFIG = {
  host: process.env.MC_HOST || 'mc.gameup.ir',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USERNAME || 'MynoxMC',
  auth: 'offline',          // سرور کرکیه
  version: '1.21.11',
};

// ===== دنباله دستورات (تأخیر نسبت به spawn) =====
const COMMAND_SEQUENCE = [
  { cmd: `/login "your-password"`, delay: 3000 },
  { cmd: '/prison',                                delay: 15000 },
  { cmd: '/warp AFK',                              delay: 28000 },
];

// ===== وضعیت =====
let bot = null;
let commandTimers = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

// ===== ابزار =====
function clearAllTimers() {
  commandTimers.forEach(t => clearTimeout(t));
  commandTimers = [];
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function getReconnectDelay() {
  reconnectAttempts++;
  const base = Math.min(60000, 5000 * Math.pow(2, reconnectAttempts));
  const jitter = Math.random() * 3000;
  console.log(`🔄 تلاش #${reconnectAttempts} — بعد از ${Math.round(base + jitter)}ms`);
  return base + jitter;
}

function kickText(reason) {
  try {
    if (typeof reason === 'string') return reason;
    if (reason?.text !== undefined) return String(reason.text);
    if (reason?.extra) return JSON.stringify(reason);
  } catch {}
  return String(reason);
}

function isAlreadyOnline(text) {
  return /online hastid|already connected|آنلاین/i.test(text);
}

function isFloodKicked(text) {
  return /sari darid|flood|too many|خیلی زیاد/i.test(text);
}

function isAuthExpired(text) {
  return /hoviat tamam|device code|timeout|زمان/i.test(text);
}

// ===== ساخت بات =====
function createBot() {
  if (bot) {
    try { bot.removeAllListeners(); bot.quit(); } catch {}
    bot = null;
  }
  clearAllTimers();

  bot = mineflayer.createBot(CONFIG);

  // ===== رویداد spawn =====
  bot.on('spawn', () => {
    reconnectAttempts = 0;
    console.log('✅ بات وصل شد. شروع دستورات...');

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

  // ===== رویداد ریسورس پک (در صورت اجباری بودن از سمت سرور) =====
  bot.on('resourcepack', () => {
    try { bot.acceptResourcePack(); } catch {}
  });

  // ===== رویداد چت (فقط برای دیباگ) =====
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    // console.log(`[${username}] ${message}`);
  });

  // ===== کیک =====
  bot.on('kicked', (reason) => {
    const text = kickText(reason);
    console.error(`❌ کیک: ${text}`);

    if (isAlreadyOnline(text)) {
      const d = 300000; // ۵ دقیقه
      console.log(`⏳ اکانت آنلاینه — بعد از ${d / 1000} ثانیه تلاش مجدد...`);
      reconnectTimer = setTimeout(createBot, d);
    } else if (isFloodKicked(text)) {
      const d = 120000; // ۲ دقیقه
      console.log(`⏳ ضد فلاود — بعد از ${d / 1000} ثانیه تلاش مجدد...`);
      reconnectTimer = setTimeout(createBot, d);
    } else if (isAuthExpired(text)) {
      const d = 60000; // ۱ دقیقه
      console.log(`⏳ لاگین منقضی — بعد از ${d / 1000} ثانیه تلاش مجدد...`);
      reconnectTimer = setTimeout(createBot, d);
    } else {
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.error('🛑 حداکثر تلاش رسید. نیاز به دستی مداخله.');
        return;
      }
      reconnectTimer = setTimeout(createBot, getReconnectDelay());
    }
  });

  // ===== خطا =====
  bot.on('error', (err) => {
    console.error(`❌ خطا: ${err.message}`);
  });

  // ===== قطع =====
  bot.on('end', () => {
    console.log('🔴 قطع شد.');
    clearAllTimers();
  });
}

// ===== اجرا =====
createBot();

// ===== خاموشی تمیز =====
process.on('SIGINT', () => {
  console.log('🚪 خاموش شدن...');
  clearAllTimers();
  if (bot) bot.quit();
  process.exit();
});
