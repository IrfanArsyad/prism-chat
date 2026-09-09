const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const USER_DATA = () => app.getPath('userData');
const SETTINGS_PATH = () => path.join(USER_DATA(), 'settings.json');
const CONV_PATH = () => path.join(USER_DATA(), 'conversations.json');

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getSettings() {
  const raw = readJson(SETTINGS_PATH(), {});
  if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      raw.apiKey = safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64'));
    } catch { raw.apiKey = ''; }
  }
  delete raw.apiKeyEnc;
  return raw;
}

function saveSettings(s) {
  const out = { ...s };
  if (out.apiKey && safeStorage.isEncryptionAvailable()) {
    out.apiKeyEnc = safeStorage.encryptString(out.apiKey).toString('base64');
    delete out.apiKey;
  }
  writeJson(SETTINGS_PATH(), out);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0b0d10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Route any external navigation to the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url !== current && /^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:set', (_e, s) => { saveSettings(s); return true; });
ipcMain.handle('conversations:get', () => readJson(CONV_PATH(), []));
ipcMain.handle('conversations:set', (_e, c) => { writeJson(CONV_PATH(), c); return true; });
ipcMain.handle('clipboard:read-image', () => {
  try {
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) {
      return img.toDataURL();
    }
  } catch { return null; }
  return null;
});

const pkg = require('../package.json');
const REPO_OWNER = 'IrfanArsyad';
const REPO_NAME = 'prism-chat';

ipcMain.handle('app:version', () => pkg.version);

function isNewerVersion(latest, current) {
  const l = (latest || '').replace(/^v/, '').split('.').map(Number);
  const c = (current || '').replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lNum = l[i] || 0;
    const cNum = c[i] || 0;
    if (lNum > cNum) return true;
    if (lNum < cNum) return false;
  }
  return false;
}

ipcMain.handle('app:check-update', async () => {
  const currentVersion = pkg.version;
  const opts = {
    protocol: 'https:',
    hostname: 'api.github.com',
    path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    method: 'GET',
    headers: {
      'User-Agent': 'Prism-Desktop-App',
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  try {
    const data = await requestJson(opts);
    const latestVersion = (data.tag_name || '').replace(/^v/, '');
    const hasUpdate = isNewerVersion(latestVersion, currentVersion);
    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      releaseName: data.name || data.tag_name,
      releaseNotes: data.body || ''
    };
  } catch (err) {
    return {
      hasUpdate: false,
      currentVersion,
      error: err.message,
      releaseUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`
    };
  }
});

function resolveBaseUrl(settings) {
  const raw = (settings.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return raw;
}

function buildRequestOptions(baseUrl, endpoint, method, apiKey, contentLength) {
  const u = new URL(baseUrl + endpoint);
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://prism.local',
    'X-Title': 'Prism'
  };
  if (contentLength != null) headers['Content-Length'] = contentLength;
  return {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    method,
    headers
  };
}

function httpModule(protocol) {
  return protocol === 'http:' ? http : https;
}

ipcMain.handle('openrouter:models', async () => {
  const settings = getSettings();
  if (!settings.apiKey) throw new Error('API key belum diatur');
  const baseUrl = resolveBaseUrl(settings);
  const opts = buildRequestOptions(baseUrl, '/models', 'GET', settings.apiKey);
  return await requestJson(opts);
});

const activeRequests = new Map();

ipcMain.on('openrouter:chat', (event, payload) => {
  const settings = getSettings();
  if (!settings.apiKey) {
    event.sender.send('openrouter:chat:error', { id: payload.id, error: 'API key belum diatur' });
    return;
  }
  streamChat(event.sender, settings, payload);
});

ipcMain.on('shell:open', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle('export:save', async (event, { defaultName, content, filters }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false };
  fs.writeFileSync(res.filePath, content, 'utf8');
  return { ok: true, path: res.filePath };
});

ipcMain.on('openrouter:abort', (_e, id) => {
  const req = activeRequests.get(id);
  if (req) {
    req.destroy(new Error('aborted'));
    activeRequests.delete(id);
  }
});

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const mod = httpModule(options.protocol);
    const req = mod.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) return reject(new Error(parsed.error?.message || data));
          resolve(parsed);
        } catch (e) {
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0,200)}`));
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function streamChat(sender, settings, payload) {
  const body = JSON.stringify({
    model: payload.model,
    messages: payload.messages,
    stream: true,
    temperature: payload.temperature ?? 0.7,
    ...(payload.max_tokens ? { max_tokens: payload.max_tokens } : {})
  });
  const baseUrl = resolveBaseUrl(settings);
  const opts = buildRequestOptions(baseUrl, '/chat/completions', 'POST', settings.apiKey, Buffer.byteLength(body));
  const mod = httpModule(opts.protocol);

  const req = mod.request(opts, res => {
    let buffer = '';
    if (res.statusCode >= 400) {
      let err = '';
      res.on('data', d => err += d);
      res.on('end', () => {
        activeRequests.delete(payload.id);
        sender.send('openrouter:chat:error', { id: payload.id, error: err || `HTTP ${res.statusCode}` });
      });
      return;
    }
    res.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          activeRequests.delete(payload.id);
          sender.send('openrouter:chat:done', { id: payload.id });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) sender.send('openrouter:chat:delta', { id: payload.id, delta });
        } catch {}
      }
    });
    res.on('end', () => {
      activeRequests.delete(payload.id);
      sender.send('openrouter:chat:done', { id: payload.id });
    });
  });

  activeRequests.set(payload.id, req);
  req.on('error', err => {
    activeRequests.delete(payload.id);
    if (err.message === 'aborted') sender.send('openrouter:chat:done', { id: payload.id, aborted: true });
    else sender.send('openrouter:chat:error', { id: payload.id, error: err.message });
  });
  req.write(body);
  req.end();
}
