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

const RP_ACCEPTED = 3;
const RP_SUCCESS = 0;

let bot = null;
let commandTimers = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;
let loggedIn = false;

// ─── توابع کمکی ───────────────────────────────────────────
function clearAllTimers() {
  commandTimers.forEach(t => clearTimeout(t));
  commandTimers = [];
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function getReconnectDelay() {
  reconnectAttempts++;
  return Math.min(180000, 5000 * Math.pow(2, reconnectAttempts) + Math.random() * 3000);
}

function extractKickText(reason) {
  if (typeof reason === 'string') return reason;
  if (!reason || typeof reason !== 'object') return String(reason);

  // فرمت NBT: { type: 'compound', value: { text: { type: 'string', value: '...' } } }
  if (reason.type === 'compound' && reason.value?.text?.value) {
    return String(reason.value.text.value);
  }

  // فرمت معمولی: { text: '...' }
  if (reason.text !== undefined) return String(reason.text);

  // فرمت extra array
  if (Array.isArray(reason.extra)) {
    return reason.extra.map(p =>
      typeof p === 'string' ? p : (p?.text !== undefined ? p.text : '')
    ).join('');
  }

  // NBT compound با extra
  if (reason.type === 'compound' && Array.isArray(reason.value?.extra?.value)) {
    return reason.value.extra.value
      .map(p => p?.text?.value || '')
      .join('');
  }

  try { return JSON.stringify(reason); } catch { return String(reason); }
}

function isAlreadyOnline(text) {
  return /online|hastid|already connected|آنلاین/i.test(text);
}

function isFloodKicked(text) {
  return /sari|flood|too many|خیلی زیاد/i.test(text);
}

function isInternalError(text) {
  return /internal error|خطای داخلی/i.test(text);
}

// ─── اجرای دستورات بعد از لاگین ──────────────────────────
function runPostLoginCommands() {
  console.log('🏁 لاگین تأیید شد. اجرای دستورات AFK...');

  // /prison — بعد از ۱۰ ثانیه
  setTimeout(() => {
    if (bot?.entity) {
      bot.chat('/prison');
      console.log('📤 ارسال: /prison');
    }
  }, 10000);

  // /warp AFK — بعد از ۲۵ ثانیه (به /prison فرصت بده + ریسورس پک)
  setTimeout(() => {
    if (bot?.entity) {
      bot.chat('/warp AFK');
      console.log('📤 ارسال: /warp AFK');
    }
  }, 25000);
}

// ─── ساخت بات ─────────────────────────────────────────────
function createBot() {
  if (bot) {
    try { bot.removeAllListeners(); bot.quit(); } catch {}
    bot = null;
  }
  clearAllTimers();
  loggedIn = false;

  console.log('🔧 اتصال...');
  console.log(`   هاست: ${CONFIG.host}:${CONFIG.port}`);
  console.log(`   یوزرنیم: ${CONFIG.username}`);
  console.log(`   رمز: ${LOGIN_PASSWORD ? '***' + LOGIN_PASSWORD.slice(-2) : '❌ خالی!'}`);

  bot = mineflayer.createBot(CONFIG);

  // ✅ قبول ریسورس پک (در هر زمانی)
  bot.on('resourcepack', () => {
    bot._client.write('resource_pack_receive', { result: RP_ACCEPTED });
    bot._client.write('resource_pack_receive', { result: RP_SUCCESS });
    console.log('📦 Resource Pack قبول شد.');
  });

  bot.on('spawn', () => {
    reconnectAttempts = 0;
    loggedIn = false;
    console.log('✅ Bot وصل شد. ارسال لاگین...');

    // ارسال /login بعد از ۵ ثانیه
    setTimeout(() => {
      if (bot?.entity) {
        bot.chat(`/login ${LOGIN_PASSWORD}`);
        console.log('📤 ارسال: /login ***');
      }
    }, 5000);
  });

  // ─── چت — تشخیص تأیید لاگین + دیباگ ────────────────────
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] <${username}> ${message}`);

    // تشخیص پیام‌های تأیید لاگین
    if (!loggedIn && username === 'GameUP') {
      const lowerMsg = message.toLowerCase();
      if (/login|varid|shod|khosh|welcome|orrub|mohit/i.test(lowerMsg)) {
        console.log('✅ لاگین تأیید شد!');
        loggedIn = true;
        runPostLoginCommands();
      }
    }
  });

  bot.on('kicked', (reason) => {
    const text = extractKickText(reason);
    console.error(`❌ کیک: ${text}`);

    if (isAlreadyOnline(text)) {
      console.log('⏳ اکانت آنلاینه — ۵ دقیقه صبر...');
      reconnectTimer = setTimeout(createBot, 300000);
    } else if (isFloodKicked(text)) {
      console.log('⏳ ضد فلاود — ۲ دقیقه صبر...');
      reconnectTimer = setTimeout(createBot, 120000);
    } else if (isInternalError(text)) {
      console.log('⏳ خطای داخلی سرور — ۱ دقیقه صبر...');
      reconnectTimer = setTimeout(createBot, 60000);
    } else {
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.error('🛑 حداکثر تلاش رسید.');
        return;
      }
      reconnectTimer = setTimeout(createBot, getReconnectDelay());
    }
  });

  bot.on('error', (err) => {
    console.error(`❌ خطا: ${err.message}`);
  });

  bot.on('end', () => {
    console.log('🔴 قطع شد.');
    clearAllTimers();
  });
}

// ─── اجرا ──────────────────────────────────────────────────
createBot();

process.on('SIGINT', () => {
  console.log('🚪 خاموش...');
  clearAllTimers();
  if (bot) bot.quit();
  process.exit(0);
});
