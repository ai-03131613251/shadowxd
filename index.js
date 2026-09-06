import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import config from './config.js';
import { commands } from './command.js';
import { sms } from './lib/handler.js';
import { AntiDelete } from './lib/antidel.js';
import antiEdit from './lib/antiedit.js';
import groupEvents from './lib/groupevents.js';
import { addConnectionFunctions } from './lib/connection.js';
import { getGroupAdmins } from './lib/functions.js';
import { saveMessage } from './lib/store.js';
import {
  connectMongo,
  saveSession,
  getSession,
  deleteSession,
  addNumber,
  removeNumber,
  getAllNumbers,
  getUserConfig,
  updateUserConfig,
  deleteUserConfig
} from './lib/mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sessions = new Map();
const sessionStartedAt = new Map();
const locks = new Map();
const connectMsgSentFor = new Set();
const reconnectAttempts = new Map();
const sessionReadyAt = new Map();
const reactQueues = new Map();

const LINK_REGEX = /(chat\.whatsapp\.com\/\S+)|(whatsapp\.com\/channel\/\S+)/i;
const NEWSLETTER_REACT_EMOJIS = ['❤️', '👍', '😮', '😎', '😘', '🔥', '✨', '💖', '🤍', '🥀', '💫', '🌸', '⚡', '🤝', '🎉', '🥺', '😍', '😈', '🤖', '👀', '💯', '🎶', '🖤', '💥', '🌟', '😴', '🫶', '🍂', '☠️', '🌈', '🦋', '💎', '🎧', '📸', '🚀', '😏', '🤩', '🌹', '🎭', '🕊️', '🐼', '🐣', '🌙', '☁️', '🍁', '🎀', '🧸', '🍓', '🍒', '🌼', '🎯', '🏆', '🪐', '🌊', '🐉', '😜', '💌', '📍', '🎵', '🕶️', '🪄', '💋', '🌺', '🍀'];

// -------- Helpers --------
function log(msg, level = 'info') {
  const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' };
  console.log(`${icons[level] || '📝'} [SHADOW-MD] ${new Date().toISOString()}: ${msg}`);
}

async function fetchRawText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    log(`Failed to fetch ${url}: ${e.message}`, 'error');
    return null;
  }
}

// -------- Plugin Loading --------
async function loadExternalPlugins() {
  log('Loading external plugins from GitHub...');
  const tempDir = path.join(__dirname, '.temp_plugins');
  await fs.ensureDir(tempDir);

  try {
    const res = await fetch('https://api.github.com/repos/ai-03131613251/sabkabapai/contents/plugins');
    if (!res.ok) throw new Error('GitHub API failed');
    const files = (await res.json()).filter(f => f.name.endsWith('.js')).map(f => f.name);

    if (!files.length) {
      log('No plugins found via API.', 'warning');
      return;
    }

    commands.length = 0;
    for (const file of files) {
      const raw = await fetchRawText(`https://raw.githubusercontent.com/ai-03131613251/sabkabapai/main/plugins/${file}`);
      if (!raw) continue;
      const localPath = path.join(tempDir, file);
      await fs.writeFile(localPath, raw);
      await import(`\( {localPath}?update= \){Date.now()}`);
      log(`Loaded plugin: ${file}`, 'success');
    }
    log(`Total commands: ${commands.length}`, 'success');
  } catch (e) {
    log(`Plugin load error: ${e.message}`, 'error');
  }
}

// -------- React Queue (faster & safer) --------
function enqueueReact(sessionId, fn) {
  if (!reactQueues.has(sessionId)) {
    reactQueues.set(sessionId, { queue: [], processing: false });
  }
  const q = reactQueues.get(sessionId);
  if (q.queue.length >= 12) return; // limit queue size
  q.queue.push(fn);
  if (!q.processing) processReactQueue(sessionId);
}

async function processReactQueue(sessionId) {
  const q = reactQueues.get(sessionId);
  if (!q || q.processing) return;
  q.processing = true;

  while (q.queue.length) {
    const fn = q.queue.shift();
    try {
      await fn();
    } catch {}
    await delay(280); // slightly faster than before
  }
  q.processing = false;
}

// -------- Session Helpers --------
function cleanNumber(number) {
  return number.replace(/[^0-9]/g, '');
}

function isConnected(number) {
  return sessions.has(cleanNumber(number));
}

function connectionStatus(number) {
  const clean = cleanNumber(number);
  const started = sessionStartedAt.get(clean);
  return {
    isConnected: sessions.has(clean),
    connectionTime: started ? new Date(started).toLocaleString() : null,
    uptime: started ? Math.floor((Date.now() - started) / 1000) : 0
  };
}

function isReconnectingTooFast(number) {
  const now = Date.now();
  let record = reconnectAttempts.get(number);

  if (!record || now - record.windowStart > 60000) {
    reconnectAttempts.set(number, { count: 1, windowStart: now });
    return false;
  }

  record.count++;
  if (record.count > 6) {
    log(`Number ${number} reconnected ${record.count} times in 1min — backing off`, 'warning');
    return true;
  }
  return false;
}

// -------- Start Session (Cleaner + More Stable) --------
async function startSession(number, res = null) {
  const clean = cleanNumber(number);
  const sessionPath = path.join(__dirname, 'session', `session_${clean}`);

  if (sessions.has(clean)) {
    if (res && !res.headersSent) {
      return res.json({ status: 'already_connected', ...connectionStatus(clean) });
    }
    return;
  }

  if (locks.has(clean) && Date.now() - locks.get(clean) < 25000) {
    if (res && !res.headersSent) {
      return res.json({ status: 'connection_in_progress' });
    }
    return;
  }
  locks.set(clean, Date.now());

  try {
    const savedSession = await getSession(clean);

    if (!savedSession && fs.existsSync(sessionPath)) {
      await fs.remove(sessionPath);
    } else if (savedSession) {
      await fs.ensureDir(sessionPath);
      await fs.writeFile(path.join(sessionPath, 'creds.json'), JSON.stringify(savedSession, null, 2));
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, console)
      },
      printQRInTerminal: false,
      logger: console,
      version,
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined // reduces memory usage
    });

    await addConnectionFunctions(sock);
    sessionStartedAt.set(clean, Date.now());

    // User Config
    let userConfig = await getUserConfig(clean);
    sock.userConfig = userConfig || {};
    sock.setUserConfig = async (updates) => {
      sock.userConfig = { ...sock.userConfig, ...updates };
      await updateUserConfig(clean, updates);
      return sock.userConfig;
    };

    // Pairing Code
    if (!sock.authState.creds.registered) {
      await delay(1200);
      const code = await sock.requestPairingCode(clean);
      log(`Pairing code for ${clean}: ${code}`, 'success');
      if (res && !res.headersSent) {
        return res.json({ status: 'new_pairing', code });
      }
    } else {
      if (res && !res.headersSent) {
        return res.json({ status: 'reconnecting' });
      }
    }

    // Save Creds
    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const creds = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
        await saveSession(clean, JSON.parse(creds));
      } catch (e) {
        log(`Creds save error (${clean}): ${e.message}`, 'error');
      }
    });

    // Anti Delete
    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (update.update?.message === null) {
          AntiDelete(sock, [update], clean).catch(() => {});
        }
      }
    });

    // Connection Update (Most Important part for 24h stability)
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        sessions.set(clean, sock);
        log(`Connected: ${clean}`, 'success');
        await addNumber(clean);
        sessionReadyAt.set(clean, Date.now());
        reconnectAttempts.delete(clean); // reset attempts on successful connect

        if (!connectMsgSentFor.has(clean)) {
          connectMsgSentFor.add(clean);
          // welcome message / follow newsletters yahan add kar sakte ho
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        sessions.delete(clean);
        sessionStartedAt.delete(clean);
        sessionReadyAt.delete(clean);

        if (statusCode === DisconnectReason.loggedOut) {
          log(`Logged out: ${clean}`, 'warning');
          await deleteSession(clean);
          await removeNumber(clean);
          await deleteUserConfig(clean);
          connectMsgSentFor.delete(clean);
          reconnectAttempts.delete(clean);
          locks.delete(clean);
          return;
        }

        if (!sock.authState?.creds?.registered) {
          locks.delete(clean);
          connectMsgSentFor.delete(clean);
          reconnectAttempts.delete(clean);
          return;
        }

        // Clean listeners before reconnect
        try {
          sock.ev.removeAllListeners();
        } catch {}

        const tooFast = isReconnectingTooFast(clean);
        const backoff = tooFast ? 35000 : 4000 + Math.floor(Math.random() * 3000);

        log(`Connection closed for ${clean} (code: ${statusCode}). Reconnecting in ${backoff}ms...`, 'warning');

        await delay(backoff);
        locks.delete(clean);

        startSession(clean).catch(e => {
          log(`Reconnect failed (${clean}): ${e.message}`, 'error');
        });
      }
    });

    // Anti Call
    sock.ev.on('call', async (calls) => {
      const cfg = sock.userConfig || {};
      if (cfg.ANTI_CALL !== 'true') return;

      for (const call of calls) {
        if (call.status === 'offer') {
          try {
            await sock.rejectCall(call.id, call.from);
            await sock.sendMessage(call.from, {
              text: cfg.REJECT_MSG || 'Calls are not allowed.'
            });
          } catch {}
        }
      }
    });

    // Group Events
    sock.ev.on('group-participants.update', async (event) => {
      const ready = sessionReadyAt.get(clean);
      if (ready && Date.now() - ready < 15000) return;
      if (event.participants?.length > 4) return;

      groupEvents(sock, event).catch(() => {});
    });

    // Messages Handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg?.message) return;

      // Ephemeral
      if (getContentType(msg.message) === 'ephemeralMessage') {
        msg.message = msg.message.ephemeralMessage.message;
      }

      const userConfig = sock.userConfig || {};
      const prefix = userConfig.PREFIX || config.PREFIX || '.';
      const mode = userConfig.MODE || config.MODE || 'public';

      // Anti Edit
      if (msg.message?.protocolMessage?.editedMessage) {
        antiEdit(sock, msg, clean).catch(() => {});
        return;
      }

      // Ignore newsletter & status
      if (msg.key.remoteJid?.endsWith('@newsletter')) return;

      if (msg.key.remoteJid === 'status@broadcast') {
        if (userConfig.AUTO_VIEW_STATUS === 'true') {
          sock.readMessages([msg.key]).catch(() => {});
        }
        return;
      }

      const m = sms(sock, msg);
      const type = getContentType(msg.message);
      const jid = msg.key.remoteJid;
      const text =
        type === 'conversation' ? msg.message.conversation :
        type === 'extendedTextMessage' ? msg.message.extendedTextMessage?.text || '' :
        '';

      saveMessage(msg, clean, userConfig).catch(() => {});

      const isCmd = text.startsWith(prefix);
      const cmd = isCmd ? text.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase() : '';
      const args = text.trim().split(/\s+/).slice(1);
      const fullArgs = args.join(' ');

      const isGroup = jid.endsWith('@g.us');
      const sender = msg.key.fromMe
        ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
        : (msg.key.participant || msg.key.remoteJid);
      const senderNumber = sender.split('@')[0];
      const botNumber = sock.user.id.split(':')[0];
      const pushname = msg.pushName || 'User';
      const isMe = botNumber === senderNumber;
      const isOwner =
        config.SUDO?.includes(sender) ||
        config.OWNER_NUMBER?.includes(senderNumber) ||
        userConfig.SUDO?.includes(sender) ||
        userConfig.OWNER_NUMBER === senderNumber ||
        userConfig.OWNER_NUMBER?.includes?.(senderNumber) ||
        isMe;

      // Anti Link
      if (isGroup && !isMe && !isOwner) {
        const antiLink = userConfig.ANTI_LINK;
        if (antiLink && antiLink !== 'false' && antiLink !== 'off' && LINK_REGEX.test(text)) {
          try {
            const group = await sock.groupMetadata(jid);
            const admins = getGroupAdmins(group.participants);
            const isBotAdmin = admins.some(a => a.split('@')[0] === botNumber);
            const isSenderAdmin = admins.some(a => a.split('@')[0] === senderNumber);

            if (isBotAdmin && !isSenderAdmin) {
              await sock.sendMessage(jid, { delete: msg.key });
              await sock.sendMessage(jid, {
                text: `🚫 @${senderNumber} link bheja, isliye remove kiya gaya.`,
                mentions: [sender]
              });
              await sock.groupParticipantsUpdate(jid, [sender], 'remove');
            }
          } catch {}
        }
      }

      // Mode check
      if (mode === 'private' && !isOwner) return;
      if (mode === 'inbox' && isGroup && !isOwner) return;

      // Commands
      if (isCmd) {
        const plugin = commands.find(p => p.pattern === cmd || p.alias?.includes(cmd));
        if (plugin) {
          if (plugin.react) {
            sock.sendMessage(jid, { react: { text: plugin.react, key: msg.key } }).catch(() => {});
          }

          try {
            await plugin.function(sock, msg, m, {
              from: jid,
              quoted: msg,
              body: text,
              isCmd,
              command: cmd,
              args,
              q: fullArgs,
              text: fullArgs,
              isGroup,
              sender,
              senderNumber,
              botNumber,
              pushname,
              isMe,
              isOwner,
              reply: (txt) => sock.sendMessage(jid, { text: txt }, { quoted: msg }),
              config,
              userConfig,
              updateUserConfig: sock.setUserConfig,
              sanitizedNumber: clean,
              prefix,
              mode
            });
          } catch (e) {
            log(`Plugin error [${cmd}]: ${e.message}`, 'error');
          }
        }
      }

      // Auto React
      if (
        ['imageMessage', 'videoMessage', 'audioMessage', 'conversation', 'extendedTextMessage'].includes(type) &&
        userConfig.AUTO_REACT === 'true' &&
        !jid.includes('@newsletter') &&
        !msg.message?.protocolMessage
      ) {
        const emojis = isOwner
          ? (userConfig.OWNER_EMOJIS || config.OWNER_EMOJIS)
          : (userConfig.REACT_EMOJIS || config.REACT_EMOJIS);

        if (emojis?.length) {
          const emoji = emojis[Math.floor(Math.random() * emojis.length)];
          enqueueReact(clean, async () => {
            await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } }).catch(() => {});
          });
        }
      }
    });

    return sock;

  } catch (e) {
    sessions.delete(clean);
    sessionStartedAt.delete(clean);
    if (res && !res.headersSent) {
      res.status(503).json({ status: 'error', error: 'Failed to start session' });
    }
    log(`startSession error (${clean}): ${e.message}`, 'error');
    throw e;
  } finally {
    locks.delete(clean);
  }
}

// -------- Auto Reconnect (Faster & More Reliable) --------
async function autoReconnectAll() {
  try {
    const numbers = await getAllNumbers();
    log(`Auto-reconnect check: ${numbers.length} numbers`, 'debug');

    for (const num of numbers) {
      if (sessions.has(num)) continue;

      locks.delete(num);
      startSession(num).catch(e => {
        log(`Auto-reconnect failed for ${num}: ${e.message}`, 'error');
      });

      await delay(1500); // faster than before
    }
  } catch (e) {
    log(`autoReconnectAll error: ${e.message}`, 'error');
  }
}

// -------- Keep Alive (important for 24h stability) --------
function startKeepAlive() {
  setInterval(() => {
    // Health check
    log(`Keep-alive | Active sessions: ${sessions.size}`, 'debug');

    // Optional: force reconnect if any session is stuck
    for (const [num, sock] of sessions) {
      if (!sock?.user) {
        log(`Detected dead session: ${num}, forcing reconnect...`, 'warning');
        sessions.delete(num);
        sessionStartedAt.delete(num);
        startSession(num).catch(() => {});
      }
    }
  }, 4 * 60 * 1000); // every 4 minutes
}

// -------- Express Server --------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const html = path.join(__dirname, 'public', 'pair.html');
  if (fs.existsSync(html)) return res.sendFile(html);
  res.send(`${config.BOT_NAME || 'SHADOW-MD'} is running 🔥`);
});

app.get('/code', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Number required' });
  if (sessions.size >= 50) {
    return res.status(429).json({ error: 'Server full', message: 'Max 50 active sessions' });
  }

  try {
    await startSession(number, res);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', details: e.message });
    }
  }
});

app.get('/status', (req, res) => {
  const { number } = req.query;
  if (!number) {
    return res.json({
      totalActive: sessions.size,
      connections: Array.from(sessions.keys()).map(n => ({
        number: n,
        ...connectionStatus(n)
      }))
    });
  }
  res.json({ number, ...connectionStatus(number) });
});

app.get('/disconnect', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Number required' });

  const clean = cleanNumber(number);
  const sock = sessions.get(clean);
  if (!sock) return res.status(404).json({ error: 'Not found' });

  try {
    sock.ws?.close();
    sock.ev.removeAllListeners();
    sessions.delete(clean);
    sessionStartedAt.delete(clean);
    sessionReadyAt.delete(clean);
    await removeNumber(clean);
    await deleteSession(clean);
    connectMsgSentFor.delete(clean);
    reconnectAttempts.delete(clean);

    res.json({ status: 'success', message: 'Disconnected' });
  } catch {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

app.get('/active', (req, res) => {
  res.json({
    count: sessions.size,
    numbers: Array.from(sessions.keys())
  });
});

app.get('/ping', (req, res) => {
  res.json({
    status: 'active',
    message: `${config.BOT_NAME || 'SHADOW-MD'} is running 🔥`,
    activeSessions: sessions.size,
    uptime: process.uptime()
  });
});

app.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbers();
    const results = [];

    for (const num of numbers) {
      if (sessions.has(num)) {
        results.push({ number: num, status: 'already_connected' });
        continue;
      }
      startSession(num).catch(() => {});
      results.push({ number: num, status: 'connection_initiated' });
      await delay(800);
    }

    res.json({ status: 'success', total: numbers.length, connections: results });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// -------- React Endpoint (cleaned) --------
app.get('/react', async (req, res) => {
  const { link, emojis } = req.query;
  if (!link) return res.status(400).json({ status: 'error', message: 'link parameter required' });
  if (!sessions.size) return res.status(404).json({ status: 'error', message: 'No active sessions' });

  let reactEmojis = emojis ? emojis.split(',').filter(Boolean) : NEWSLETTER_REACT_EMOJIS;
  if (!reactEmojis.length) reactEmojis = NEWSLETTER_REACT_EMOJIS;

  let inviteCode = null;
  let serverId = null;
  let targetJid = null;

  try {
    const url = new URL(link);
    const parts = url.pathname.split('/').filter(Boolean);
    const channelIdx = parts.indexOf('channel');

    if (channelIdx !== -1 && parts[channelIdx + 1]) {
      inviteCode = parts[channelIdx + 1];
      if (parts[channelIdx + 2] && /^\d+$/.test(parts[channelIdx + 2])) {
        serverId = parts[channelIdx + 2];
      }
    }

    if (!serverId) {
      serverId = url.searchParams.get('sid') || url.searchParams.get('serverId');
    }

    if (link.includes('@newsletter')) {
      targetJid = link.split('/').pop().split('?')[0];
      inviteCode = null;
    }
  } catch {
    const match = link.match(/channel\/([^\/]+)\/(\d+)/);
    if (match) {
      inviteCode = match[1];
      serverId = match[2];
    }
    if (link.includes('@newsletter')) {
      targetJid = link.split('/').pop().split('?')[0];
    }
  }

  if (!serverId) {
    return res.status(400).json({ status: 'error', message: 'Could not extract serverId from link' });
  }

  const entries = Array.from(sessions.entries());
  const results = [];

  for (let i = 0; i < entries.length; i++) {
    const [number, sock] = entries[i];
    const emoji = reactEmojis[Math.floor(Math.random() * reactEmojis.length)];

    try {
      let jid = targetJid;

      if (!jid && inviteCode) {
        if (typeof sock.newsletterMetadata === 'function') {
          try {
            const meta = await sock.newsletterMetadata('invite', inviteCode);
            if (meta?.id) jid = meta.id;
          } catch {}
        }
        if (!jid) jid = `${inviteCode}@newsletter`;
      }

      if (!jid) throw new Error('Could not determine target JID');
      if (typeof sock.newsletterReactMessage !== 'function') {
        throw new Error('newsletterReactMessage not available');
      }

      let retries = 3;
      let success = false;

      while (retries > 0) {
        try {
          await sock.newsletterReactMessage(jid, serverId.toString(), emoji);
          results.push({ number, status: 'success', emoji });
          success = true;
          break;
        } catch (err) {
          if (err.message?.includes('rate-overlimit') || err.message?.includes('429')) {
            results.push({ number, status: 'rate_limited', emoji });
            break;
          }
          retries--;
          if (retries === 0) throw err;
          await delay(1800 * (4 - retries));
        }
      }
    } catch (err) {
      results.push({ number, status: 'failed', error: err.message });
    }

    if (i < entries.length - 1) await delay(2500);
  }

  res.json({
    status: 'completed',
    totalSessions: entries.length,
    successCount: results.filter(r => r.status === 'success').length,
    results,
    inviteCode,
    serverId,
    targetJid
  });
});

// -------- Main --------
let serverStarted = false;

async function main() {
  try {
    if (!serverStarted) {
      const port = process.env.PORT || 8000;
      app.listen(port, () => {
        log(`Server listening on port ${port}`, 'success');
      });
      serverStarted = true;
    }

    await connectMongo();
    await loadExternalPlugins();
    await autoReconnectAll();
    startKeepAlive();

    // Auto reconnect every 5 minutes
    setInterval(() => {
      autoReconnectAll().catch(() => {});
    }, 5 * 60 * 1000);

  } catch (e) {
    log(`Main crashed: ${e.message}`, 'error');
    await delay(4000);
    main();
  }
}

main();

// -------- Process Handlers (important for non-stop) --------
process.on('SIGINT', () => {
  log('Received SIGINT, cleaning up...', 'warning');
  for (const [, sock] of sessions) {
    try { sock.ev.removeAllListeners(); } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, cleaning up...', 'warning');
  for (const [, sock] of sessions) {
    try { sock.ev.removeAllListeners(); } catch {}
  }
  process.exit(0);
});

process.on('uncaughtException', (e) => {
  log(`Uncaught exception: ${e.message}`, 'error');
  // Don't restart main() immediately — let the process manager handle it if needed
});

process.on('unhandledRejection', (e) => {
  log(`Unhandled rejection: ${e?.message || e}`, 'error');
});

export default app;