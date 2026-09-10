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

function createBot() {
  bot = mineflayer.createBot(CONFIG);

  bot.on('spawn', () => {
    console.log('✅ بات وصل شد. شروع دستورات...');
    COMMANDS.forEach(({ cmd, delay }) => {
      setTimeout(() => {
        if (bot && bot.entity) {
          bot.chat(cmd)
            .then(() => console.log(`📤 ارسال: ${cmd}`))
            .catch(e => console.error(`❌ خطا: ${e.message}`));
        }
      }, delay);
    });
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
  });

  bot.on('kicked', (reason) => {
    console.error(`❌ کیک: ${reason}`);
  });

  bot.on('error', (err) => {
    console.error(`❌ خطا: ${err.message}`);
  });

  bot.on('end', () => {
    console.log('🔴 قطع شد. reconnect در ۵ ثانیه...');
    setTimeout(createBot, 5000);
  });
}

createBot();

process.on('SIGINT', () => {
  if (bot) bot.quit();
  process.exit();
});
