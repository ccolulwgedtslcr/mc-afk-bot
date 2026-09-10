require('dotenv').config();
const mineflayer = require('mineflayer');

const CONFIG = {
  host: process.env.MC_HOST || 'mc.gameup.ir',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USERNAME || 'MynoxMC',
  auth: 'offline',
  version: '1.21.11',
};

const COMMANDS = [
  { cmd: `/login "${process.env.LOGIN_PASSWORD}"`, delay: 2000 },
  { cmd: '/prison', delay: 12000 },
  { cmd: '/warp AFK', delay: 22000 },
];

let bot = null;
let commandTimers = [];

function clearTimers() {
  commandTimers.forEach(t => clearTimeout(t));
  commandTimers = [];
}

function createBot() {
  // اگه قبلاً بات وجود داشت، تمیز کن
  if (bot) {
    try { bot.quit(); } catch {}
    bot = null;
  }
  clearTimers();

  bot = mineflayer.createBot(CONFIG);

  bot.on('spawn', () => {
    console.log('✅ بات وصل شد. شروع دستورات...');
    
    COMMANDS.forEach(({ cmd, delay }) => {
      const timer = setTimeout(() => {
        if (bot && bot.entity) {
          // mineflayer v4: bot.chat() پرامیس برنمی‌گردونه — فقط صدا بزن
          bot.chat(cmd);
          console.log(`📤 ارسال: ${cmd}`);
        }
      }, delay);
      commandTimers.push(timer);
    });
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
  });

  bot.on('kicked', (reason) => {
    console.error(`❌ کیک شد: ${JSON.stringify(reason)}`);
    // بعد از کیک، ۶۰ ثانیه صبر کن (تا اکانت قبلی از سرور خارج بشه)
    setTimeout(createBot, 60000);
  });

  bot.on('error', (err) => {
    console.error(`❌ خطا: ${err.message}`);
  });

  bot.on('end', () => {
    console.log('🔴 قطع شد. تلاش مجدد در ۶۰ ثانیه...');
    clearTimers();
    setTimeout(createBot, 60000);
  });
}

createBot();

process.on('SIGINT', () => {
  console.log('🚪 خاموش شدن...');
  clearTimers();
  if (bot) bot.quit();
  process.exit();
});
