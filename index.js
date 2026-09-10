require('dotenv').config();
const mineflayer = require('mineflayer');

// ──────────────────────────────────────────────────────────────
// Konfiguration (aus .env oder Fallback‑Werten)
// ──────────────────────────────────────────────────────────────
const CONFIG = {
  host: process.env.MC_HOST || 'mc.gameup.ir',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USERNAME || 'MynoxMC',
  auth: 'offline',               // gekrackter Server → kein Microsoft‑Login
  version: '1.21.11',
};

// ──────────────────────────────────────────────────────────────
// Befehlsfolge: { cmd, delayNachSpawnInMs }
// ──────────────────────────────────────────────────────────────
const COMMAND_SEQUENCE = [
  { cmd: `/login "your-password"`, delay: 5000 },   // nach dem Spawn 5 s warten
  { cmd: '/prison',                delay: 20000 },  // dann 20 s warten
  { cmd: '/warp AFK',              delay: 35000 },  // dann 35 s warten
];

// ──────────────────────────────────────────────────────────────
// Laufzeitvariablen
// ──────────────────────────────────────────────────────────────
let bot = null;
let commandTimers = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;   // nach diesem Abstand gibt’s eine Fehlermeldung

// ──────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ──────────────────────────────────────────────────────────────
function clearAllTimers() {
  commandTimers.forEach(t => clearTimeout(t));
  commandTimers = [];
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function getReconnectDelay() {
  reconnectAttempts++;
  const base = Math.min(180000, 5000 * Math.pow(2, reconnectAttempts)); // max 3 min
  const jitter = Math.random() * 3000;
  console.log(`🔄 Verbindungsversuch #${reconnectAttempts} – warte ${Math.round(base + jitter)} ms`);
  return base + jitter;
}

/**
 * Extrahiert lesbaren Text aus dem kick‑reason‑Objekt von Mineflayer.
 * Das Objekt kann unterschiedlich aufgebaut sein (string, {text}, {extra}, …).
 */
function extractKickText(reason) {
  if (typeof reason === 'string') return reason;

  if (reason && typeof reason === 'object') {
    // 1) Direktes text‑Feld
    if (reason.text !== undefined) return String(reason.text);

    // 2) extra‑Array (häufig bei farbigen Nachrichten)
    if (Array.isArray(reason.extra)) {
      return reason.extra
        .map(part => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && part.text !== undefined) return part.text;
          return ''; // fallback
        })
        .join('');
    }

    // 3) Fallback: JSON‑Darstellung (sollte selten benötigt werden)
    try { return JSON.stringify(reason); } catch { return String(reason); }
  }

  return String(reason);
}

// ──────────────────────────────────────────────────────────────
// Bot‑Erstellung und Ereignishandler
// ──────────────────────────────────────────────────────────────
function createBot() {
  // Sicherstellen, dass ein éventuell vorhandener Bot sauber beendet wird
  if (bot) {
    try { bot.removeAllListeners(); bot.quit(); } catch {}
    bot = null;
  }
  clearAllTimers();

  bot = mineflayer.createBot(CONFIG);

  // —— Spawn —— 
  bot.on('spawn', () => {
    reconnectAttempts = 0; // erfolgreicher Verbindungsaufbau → Zähler zurücksetzen
    console.log('✅ Bot ist verbunden. Starte Befehlsfolge …');

    COMMAND_SEQUENCE.forEach(({ cmd, delay }) => {
      const timer = setTimeout(() => {
        // Nur senden, wenn der Bot noch da und gespawned ist
        if (bot && bot.entity) {
          bot.chat(cmd);
          console.log(`📤 Befehl gesendet: ${cmd}`);
        }
      }, delay);
      commandTimers.push(timer);
    });
  });

  // —— Chat (für Debugging und eventuelle Server‑Fehlermeldungen) —— 
  bot.on('chat', (username, message) => {
    if (username === bot.username) return; // Eigene Nachrichten ignorieren
    console.log(`[CHAT] <${username}> ${message}`);
  });

  // —— Ressourcenpaket (falls vom Server verlangt) —— 
  bot.on('resourcepack', () => {
    try { bot.acceptResourcePack(); } catch {}
  });

  // —— Kick —— 
  bot.on('kicked', (reason) => {
    const text = extractKickText(reason);
    console.error(`❌ Gekickt: ${text}`);

    // Spezifische Behandlung je nach Kick‑Grund
    if (/online hastid|already connected|آنلاین/i.test(text)) {
      const delay = 300000; // 5 Minuten warten, bis das alte Login‑Timeout abläuft
      console.log(`⏳ Der Account scheint noch online zu sein – neuer Versuch in ${delay / 1000} s …`);
      reconnectTimer = setTimeout(createBot, delay);
    } else if (/sari darid|flood|too many|خیلی زیاد/i.test(text)) {
      const delay = 120000; // 2 Minuten bei Flood‑Schutz
      console.log(`⏳ Flood‑Schutz aktiv – neuer Versuch in ${delay / 1000} s …`);
      reconnectTimer = setTimeout(createBot, delay);
    } else if (/hoviat tamam|device code|timeout|زمان/i.test(text)) {
      const delay = 60000; // 1 Minute bei abgelaufener Geräte‑Auth
      console.log(`⏳ Auth‑Token abgelaufen – neuer Versuch in ${delay / 1000} s …`);
      reconnectTimer = setTimeout(createBot, delay);
    } else {
      // Allgemeiner Fallback mit exponentiellem Backoff
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.error('🛑 Maximale Anzahl an Verbindungsversuchen erreicht. Bitte manuell prüfen.');
        return;
      }
      reconnectTimer = setTimeout(createBot, getReconnectDelay());
    }
  });

  // —— Allgemeine Fehler —— 
  bot.on('error', (err) => {
    console.error(`❌ Fehler: ${err.message}`);
  });

  // —— Verbindung beendet —— 
  bot.on('end', () => {
    console.log('🔴 Verbindung zum Server getrennt.');
    clearAllTimers();
  });
}

// ──────────────────────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────────────────────
createBot();

// ──────────────────────────────────────────────────────────────
// Sauberes Herunterfahren (bei SIGINT – z. B. Railway‑Neustart)
// ──────────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('🚪 Herunterfahren …');
  clearAllTimers();
  if (bot) bot.quit();
  process.exit(0);
});
