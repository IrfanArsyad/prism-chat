const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  settings: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    temperature: 0.7,
    maxTokens: null,
    systemPrompt: '',
    selectedModel: '',
    selectedModelName: '',
    pinnedModels: []
  },
  models: [],
  conversations: [],
  activeId: null,
  streaming: false,
  chatFilter: '',
  modelFilter: '',
  modelFilterMode: 'all'
};

const ICONS = {
  trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  info: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  prism: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6 20.4 18.4H3.6L12 3.6Z" fill="rgba(18,183,106,0.14)" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.6v14.8" stroke="rgba(18,183,106,0.5)" stroke-width="1.2"/><circle cx="12" cy="12.3" r="1.8" fill="currentColor"/></svg>',
  starOutline: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/></svg>',
  starFilled: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/></svg>'
};

function isFreeModel(m) {
  const pin = parseFloat(m.pricing?.prompt || 0);
  const pout = parseFloat(m.pricing?.completion || 0);
  return m.id.includes(':free') || (pin === 0 && pout === 0);
}
function isPinned(id) {
  return (state.settings.pinnedModels || []).includes(id);
}
async function togglePin(id) {
  const pinned = new Set(state.settings.pinnedModels || []);
  if (pinned.has(id)) pinned.delete(id); else pinned.add(id);
  state.settings.pinnedModels = [...pinned];
  await window.api.setSettings(state.settings);
  renderModelList();
}

const SUGGESTIONS = [
  {
    title: 'Jelaskan konsep teknis',
    hint: 'async/await vs Promise di JavaScript',
    prompt: 'Jelaskan perbedaan async/await dan Promise di JavaScript dengan contoh singkat dan kapan sebaiknya memakai masing-masing.',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.9.7 1.6 1.6 2 2.6.4 1 .6 2 .6 2.7h2.8c0-.7.2-1.7.6-2.7.4-1 1.1-1.9 2-2.6A7 7 0 0 0 12 2Z"/></svg>'
  },
  {
    title: 'Bantu menulis',
    hint: 'Email profesional dalam bahasa Inggris',
    prompt: 'Bantu saya menulis email profesional dalam bahasa Inggris untuk menanyakan status lamaran kerja saya yang dikirim minggu lalu. Tone sopan tapi tegas.',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z"/><path d="m4 6 8 6 8-6"/></svg>'
  },
  {
    title: 'Rencanakan pembelajaran',
    hint: 'Roadmap 30 hari mahir React dari HTML/CSS/JS',
    prompt: 'Buatkan roadmap 30 hari untuk belajar React dari nol untuk seseorang yang sudah menguasai HTML/CSS/JS dasar. Sertakan target harian dan resource yang direkomendasikan.',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-5"/></svg>'
  },
  {
    title: 'Review kode',
    hint: 'Kirim potongan, dapatkan saran perbaikan',
    prompt: 'Tolong review kode ini — sarankan perbaikan untuk readability, performa, dan bug potensial:\n\n```\n// paste kode di sini\n```',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>'
  }
];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function formatContext(len) {
  if (!len) return null;
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(1)}M ctx`;
  if (len >= 1000) return `${Math.round(len / 1000)}K ctx`;
  return `${len} ctx`;
}
function formatPricePerMillion(p) {
  if (p == null || p === '') return null;
  const n = Number(p);
  if (!isFinite(n) || n <= 0) return null;
  const perM = n * 1_000_000;
  if (perM < 0.1) return `$${perM.toFixed(3)}`;
  if (perM < 10) return `$${perM.toFixed(2)}`;
  return `$${perM.toFixed(1)}`;
}
function initials(id) {
  const first = id.split('/')[0] || id;
  return first.slice(0, 2).toUpperCase();
}

/* ============ Toasts ============ */
function toast({ title, message, type = 'info', duration = 3200 }) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-icon">${ICONS[type === 'success' ? 'check' : type === 'error' ? 'x' : 'info']}</div>
    <div class="toast-body">
      ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  $('#toastRoot').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, duration);
}

/* ============ Load / Save ============ */
async function loadAll() {
  const s = await window.api.getSettings();
  state.settings = { ...state.settings, ...s };
  state.conversations = await window.api.getConversations();
  // migrate: ensure updatedAt exists
  for (const c of state.conversations) {
    if (!c.updatedAt) c.updatedAt = c.createdAt || Date.now();
  }
  if (state.conversations.length) state.activeId = state.conversations[0].id;

  $('#baseUrl').value = state.settings.baseUrl || 'https://openrouter.ai/api/v1';
  $('#apiKey').value = state.settings.apiKey || '';
  $('#temperature').value = state.settings.temperature ?? 0.7;
  $('#maxTokens').value = state.settings.maxTokens || '';
  $('#systemPrompt').value = state.settings.systemPrompt || '';

  renderChatList();
  renderMessages();
  updateModelDisplay();
}

const persistConversations = () => window.api.setConversations(state.conversations);

/* ============ Conversations ============ */
function activeConv() { return state.conversations.find(c => c.id === state.activeId); }

function touchConversation(conv) {
  conv.updatedAt = Date.now();
  state.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function newConversation() {
  const now = Date.now();
  const c = { id: uid(), title: 'Percakapan baru', messages: [], model: state.settings.selectedModel, createdAt: now, updatedAt: now };
  state.conversations.unshift(c);
  state.activeId = c.id;
  persistConversations();
  renderChatList();
  renderMessages();
  $('#input').focus();
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter(c => c.id !== id);
  if (state.activeId === id) state.activeId = state.conversations[0]?.id || null;
  persistConversations();
  renderChatList();
  renderMessages();
}

function groupConversations(convs) {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const sevenDaysAgo = new Date(startOfToday); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(startOfToday); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups = [
    { label: 'Hari ini', items: [] },
    { label: 'Kemarin', items: [] },
    { label: '7 hari terakhir', items: [] },
    { label: '30 hari terakhir', items: [] },
    { label: 'Lebih lama', items: [] }
  ];
  for (const c of convs) {
    const t = new Date(c.updatedAt || c.createdAt || 0);
    if (t >= startOfToday) groups[0].items.push(c);
    else if (t >= startOfYesterday) groups[1].items.push(c);
    else if (t >= sevenDaysAgo) groups[2].items.push(c);
    else if (t >= thirtyDaysAgo) groups[3].items.push(c);
    else groups[4].items.push(c);
  }
  return groups.filter(g => g.items.length > 0);
}

function renderChatList() {
  const list = $('#chatList');
  list.innerHTML = '';

  if (state.conversations.length === 0) {
    list.innerHTML = `<div class="sidebar-list-empty"><b>Belum ada percakapan</b><br>Klik <b>Percakapan baru</b> untuk mulai.</div>`;
    return;
  }

  const q = state.chatFilter.toLowerCase().trim();
  const filtered = q
    ? state.conversations.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some(m => m.content && m.content.toLowerCase().includes(q))
      )
    : state.conversations;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="sidebar-list-empty">Tidak ada hasil untuk<br><b>“${escapeHtml(state.chatFilter)}”</b></div>`;
    return;
  }

  const groups = groupConversations(filtered);
  for (const group of groups) {
    const grp = document.createElement('div');
    grp.className = 'chat-group';
    const label = document.createElement('div');
    label.className = 'chat-group-label';
    label.textContent = group.label;
    grp.appendChild(label);

    for (const c of group.items) {
      const item = document.createElement('div');
      item.className = 'chat-item' + (c.id === state.activeId ? ' active' : '');
      item.innerHTML = `
        <div class="title-wrap">
          <div class="title">${escapeHtml(c.title)}</div>
        </div>
        <button class="del" type="button" aria-label="Hapus">${ICONS.trash}</button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.del')) return;
        state.activeId = c.id;
        renderChatList();
        renderMessages();
      });
      item.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(c.id);
      });
      grp.appendChild(item);
    }
    list.appendChild(grp);
  }
}

/* ============ Messages rendering ============ */
function renderMessages() {
  const box = $('#messages');
  const conv = activeConv();
  box.innerHTML = '';
  if (!conv || conv.messages.length === 0) {
    box.appendChild(makeEmptyState());
    return;
  }
  for (const m of conv.messages) appendMessage(m, false);
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

function makeEmptyState() {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  wrap.innerHTML = `
    <div class="empty-badge">${ICONS.prism}</div>
    <h1 class="empty-title">Mau bicarakan apa hari ini?</h1>
    <p class="empty-sub">Prism menghubungkan Anda ke katalog model 9router — pilih otak yang paling cocok, lalu mulai obrolan. Semua percakapan tersimpan lokal di perangkat Anda.</p>
    <div class="suggestion-grid">
      ${SUGGESTIONS.map(s => `
        <button class="suggestion" type="button" data-prompt="${escapeHtml(s.prompt)}">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-body">
            <div class="suggestion-title">${escapeHtml(s.title)}</div>
            <div class="suggestion-hint">${escapeHtml(s.hint)}</div>
          </div>
        </button>
      `).join('')}
    </div>
  `;
  wrap.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('#input');
      input.value = btn.dataset.prompt;
      autoresize(input);
      input.focus();
    });
  });
  return wrap;
}

function appendMessage(msg, scroll = true) {
  const box = $('#messages');
  const empty = box.querySelector('.empty-state');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = `msg ${msg.role}`;
  el.dataset.id = msg.id;
  const meta = msg.role === 'assistant' && msg.model
    ? `<span class="role-meta">${escapeHtml(msg.model)}</span>`
    : '';
  el.innerHTML = `
    <div class="avatar">${msg.role === 'user' ? 'U' : 'AI'}</div>
    <div class="content">
      <div class="role">${msg.role === 'user' ? 'Anda' : 'Assistant'}${meta}</div>
      <div class="bubble"></div>
    </div>
  `;
  el.querySelector('.bubble').innerHTML = renderMarkdown(msg.content || '');
  box.appendChild(el);
  if (scroll) box.scrollTop = box.scrollHeight;
  return el;
}

const _marked = (window.marked && (window.marked.marked || window.marked)) || null;
if (_marked && _marked.setOptions) {
  _marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false
  });
}

function renderMarkdown(text) {
  if (!text) return '';
  if (!_marked) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
  const raw = _marked.parse ? _marked.parse(text) : _marked(text);
  return window.DOMPurify
    ? window.DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })
    : raw;
}

/* ============ Model picker ============ */
function updateModelDisplay() {
  const label = state.settings.selectedModelName || state.settings.selectedModel || 'Pilih model dulu';
  $('#currentModel').textContent = label;
}

function openModelDropdown() {
  $('#modelDropdown').classList.remove('hidden');
  $('#modelTrigger').classList.add('open');
  renderModelList();
  setTimeout(() => $('#modelSearch').focus(), 30);
  if (state.models.length === 0 && state.settings.apiKey) refreshModels();
}
function closeModelDropdown() {
  $('#modelDropdown').classList.add('hidden');
  $('#modelTrigger').classList.remove('open');
}

async function refreshModels() {
  const btn = $('#refreshModels');
  btn.classList.add('spinning');
  try {
    const res = await window.api.listModels();
    state.models = res.data || res || [];
    renderModelList();
    toast({ title: 'Katalog model dimuat', message: `${state.models.length} model tersedia di endpoint ini.`, type: 'success' });
  } catch (e) {
    toast({ title: 'Gagal memuat model', message: e.message, type: 'error', duration: 5000 });
    renderModelList();
  } finally {
    btn.classList.remove('spinning');
  }
}

function renderModelOptionHTML(m) {
  const ctx = formatContext(m.context_length);
  const free = isFreeModel(m);
  const pIn = formatPricePerMillion(m.pricing?.prompt);
  const pOut = formatPricePerMillion(m.pricing?.completion);
  const chips = [];
  if (ctx) chips.push(`<span class="chip">${escapeHtml(ctx)}</span>`);
  if (free) chips.push(`<span class="chip free">Gratis</span>`);
  else {
    if (pIn) chips.push(`<span class="chip">in ${pIn}/M</span>`);
    if (pOut) chips.push(`<span class="chip">out ${pOut}/M</span>`);
  }
  const selected = m.id === state.settings.selectedModel ? ' selected' : '';
  const pinned = isPinned(m.id);
  return `
    <div class="model-option${selected}" data-id="${escapeHtml(m.id)}" data-name="${escapeHtml(m.name || m.id)}">
      <div class="m-avatar">${escapeHtml(initials(m.id))}</div>
      <div class="m-body">
        <div class="m-name">${escapeHtml(m.name || m.id)}</div>
        <div class="m-id">${escapeHtml(m.id)}</div>
        ${chips.length ? `<div class="m-meta">${chips.join('')}</div>` : ''}
      </div>
      <button class="pin-btn${pinned ? ' pinned' : ''}" type="button" data-pin="${escapeHtml(m.id)}" title="${pinned ? 'Hapus dari favorit' : 'Tambah ke favorit'}">
        ${pinned ? ICONS.starFilled : ICONS.starOutline}
      </button>
    </div>
  `;
}

function attachModelOptionHandlers(list) {
  list.querySelectorAll('.model-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      if (e.target.closest('.pin-btn')) return;
      state.settings.selectedModel = opt.dataset.id;
      state.settings.selectedModelName = opt.dataset.name;
      window.api.setSettings(state.settings);
      updateModelDisplay();
      closeModelDropdown();
    });
  });
  list.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(btn.dataset.pin);
    });
  });
}

function renderModelList() {
  const list = $('#modelList');

  // Update counts on filter chips
  const pinnedCount = (state.settings.pinnedModels || []).filter(id => state.models.some(m => m.id === id)).length;
  const freeCount = state.models.filter(isFreeModel).length;
  $('#countAll').textContent = state.models.length;
  $('#countPinned').textContent = pinnedCount;
  $('#countFree').textContent = freeCount;

  if (state.models.length === 0) {
    list.innerHTML = `
      <div class="dropdown-empty">
        <strong>Belum ada model dimuat</strong>
        ${state.settings.apiKey
          ? 'Klik tombol refresh untuk memuat katalog dari endpoint.'
          : 'Set API key di Pengaturan dulu.'}
      </div>`;
    return;
  }

  const q = state.modelFilter.toLowerCase().trim();
  const matchesSearch = (m) => !q || m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q);

  let modelsToShow;
  if (state.modelFilterMode === 'pinned') {
    modelsToShow = state.models.filter(m => isPinned(m.id) && matchesSearch(m));
  } else if (state.modelFilterMode === 'free') {
    modelsToShow = state.models.filter(m => isFreeModel(m) && matchesSearch(m));
  } else {
    modelsToShow = state.models.filter(matchesSearch);
  }

  if (modelsToShow.length === 0) {
    let msg;
    if (state.modelFilterMode === 'pinned') msg = q
      ? `<strong>Tidak ada favorit cocok</strong>Ubah kata kunci atau ganti tab.`
      : `<strong>Belum ada favorit</strong>Klik ikon bintang ★ di kanan model untuk menyematkannya ke sini.`;
    else if (state.modelFilterMode === 'free') msg = `<strong>Tidak ada model gratis</strong>${q ? 'Coba tanpa filter pencarian.' : 'Endpoint ini tidak menyediakan model gratis.'}`;
    else msg = `<strong>Tidak ada hasil</strong>Coba kata kunci lain seperti "gpt", "gemini", "llama", "mistral", atau "free".`;
    list.innerHTML = `<div class="dropdown-empty">${msg}</div>`;
    return;
  }

  // In 'all' mode with no search: show pinned at top as section
  let html = '';
  if (state.modelFilterMode === 'all' && !q) {
    const pinnedList = modelsToShow.filter(m => isPinned(m.id));
    const otherList = modelsToShow.filter(m => !isPinned(m.id));
    if (pinnedList.length > 0) {
      html += `<div class="dropdown-section-label">★ Favorit</div>`;
      html += pinnedList.map(renderModelOptionHTML).join('');
      html += `<div class="dropdown-divider"></div>`;
      html += `<div class="dropdown-section-label">Semua model</div>`;
    }
    html += otherList.slice(0, 200).map(renderModelOptionHTML).join('');
  } else {
    html = modelsToShow.slice(0, 200).map(renderModelOptionHTML).join('');
  }

  list.innerHTML = html;
  attachModelOptionHandlers(list);
}

/* ============ Composer / streaming ============ */
function autoresize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
}

function setConnState(s) {
  const card = document.querySelector('.connection-card');
  const sub = $('#connSub');
  const lbl = $('#connLabel');
  if (!card) return;
  card.classList.remove('streaming', 'error');
  if (s === 'streaming') { card.classList.add('streaming'); sub.textContent = 'Streaming...'; lbl.textContent = 'Streaming'; }
  else if (s === 'error') { card.classList.add('error'); sub.textContent = 'Ada masalah koneksi'; lbl.textContent = 'Error'; }
  else { sub.textContent = 'Idle'; lbl.textContent = 'Idle'; }
}

function sendMessage() {
  if (state.streaming) return;
  const input = $('#input');
  const text = input.value.trim();
  if (!text) return;

  if (!state.settings.apiKey) {
    toast({ title: 'API key belum diatur', message: 'Buka Pengaturan untuk mengisi API key 9router / OpenRouter.', type: 'error' });
    openSettings();
    return;
  }
  if (!state.settings.selectedModel) {
    toast({ title: 'Pilih model dulu', message: 'Klik pemilih model di atas untuk memilih model yang mau dipakai.', type: 'error' });
    openModelDropdown();
    return;
  }

  if (!activeConv()) newConversation();
  const conv = activeConv();
  const userMsg = { id: uid(), role: 'user', content: text };
  conv.messages.push(userMsg);
  if (conv.title === 'Percakapan baru') {
    conv.title = text.slice(0, 52) + (text.length > 52 ? '…' : '');
  }
  touchConversation(conv);
  renderChatList();
  appendMessage(userMsg);
  input.value = '';
  autoresize(input);

  const asstMsg = {
    id: uid(),
    role: 'assistant',
    content: '',
    model: state.settings.selectedModelName || state.settings.selectedModel
  };
  conv.messages.push(asstMsg);
  const el = appendMessage(asstMsg);
  el.querySelector('.bubble').innerHTML = '<span class="typing-cursor"></span>';

  const messagesForApi = [];
  if (state.settings.systemPrompt) messagesForApi.push({ role: 'system', content: state.settings.systemPrompt });
  for (const m of conv.messages) {
    if (m === asstMsg) continue;
    messagesForApi.push({ role: m.role, content: m.content });
  }

  state.streaming = true;
  setConnState('streaming');
  const sendBtn = $('#sendBtn');
  sendBtn.classList.add('streaming');

  window.api.sendChat({
    id: asstMsg.id,
    model: state.settings.selectedModel,
    messages: messagesForApi,
    temperature: parseFloat(state.settings.temperature) || 0.7,
    max_tokens: state.settings.maxTokens ? parseInt(state.settings.maxTokens) : undefined
  });
}

function finalizeStream() {
  state.streaming = false;
  setConnState('idle');
  $('#sendBtn').classList.remove('streaming');
  const conv = activeConv();
  if (conv) touchConversation(conv);
  persistConversations();
  renderChatList();
}

function handleDelta({ id, delta }) {
  const conv = activeConv();
  if (!conv) return;
  const m = conv.messages.find(x => x.id === id);
  if (!m) return;
  m.content += delta;
  const el = document.querySelector(`.msg[data-id="${id}"] .bubble`);
  if (el) {
    el.innerHTML = renderMarkdown(m.content) + '<span class="typing-cursor"></span>';
    const box = $('#messages');
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 240) box.scrollTop = box.scrollHeight;
  }
}
function handleDone({ id }) {
  const conv = activeConv();
  const m = conv?.messages.find(x => x.id === id);
  const el = document.querySelector(`.msg[data-id="${id}"] .bubble`);
  if (el && m) el.innerHTML = renderMarkdown(m.content);
  finalizeStream();
}
function handleError({ id, error }) {
  setConnState('error');
  const conv = activeConv();
  const m = conv?.messages.find(x => x.id === id);
  if (m) m.content += (m.content ? '\n\n' : '') + `[Error: ${error}]`;
  const el = document.querySelector(`.msg[data-id="${id}"] .bubble`);
  if (el && m) el.innerHTML = renderMarkdown(m.content);
  toast({ title: 'Gagal streaming', message: error, type: 'error', duration: 5000 });
  finalizeStream();
}

/* ============ Settings modal ============ */
function openSettings() { $('#settingsModal').classList.remove('hidden'); }
function closeSettings() { $('#settingsModal').classList.add('hidden'); }

async function saveSettingsForm() {
  const rawBase = $('#baseUrl').value.trim() || 'https://openrouter.ai/api/v1';
  state.settings.baseUrl = rawBase.replace(/\/+$/, '');
  state.settings.apiKey = $('#apiKey').value.trim();
  state.settings.temperature = parseFloat($('#temperature').value) || 0.7;
  state.settings.maxTokens = $('#maxTokens').value ? parseInt($('#maxTokens').value) : null;
  state.settings.systemPrompt = $('#systemPrompt').value.trim();
  await window.api.setSettings(state.settings);
  closeSettings();
  toast({ title: 'Pengaturan tersimpan', message: 'Perubahan diterapkan pada koneksi.', type: 'success' });
  if (state.settings.apiKey) refreshModels();
}

/* ============ Wire ============ */
function wire() {
  $('#newChatBtn').addEventListener('click', newConversation);
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#closeSettings').addEventListener('click', closeSettings);
  $('#saveSettings').addEventListener('click', saveSettingsForm);
  document.querySelectorAll('[data-close="1"]').forEach(el => el.addEventListener('click', closeSettings));

  $('#chatSearch').addEventListener('input', (e) => {
    state.chatFilter = e.target.value;
    renderChatList();
  });

  $('#modelTrigger').addEventListener('click', (e) => {
    e.stopPropagation();
    if ($('#modelDropdown').classList.contains('hidden')) openModelDropdown();
    else closeModelDropdown();
  });
  $('#modelSearch').addEventListener('input', (e) => {
    state.modelFilter = e.target.value;
    renderModelList();
  });
  $('#modelSearch').addEventListener('click', (e) => e.stopPropagation());
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.modelFilterMode = chip.dataset.filter;
      renderModelList();
    });
  });
  $('#refreshModels').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.settings.apiKey) {
      toast({ title: 'API key belum diatur', message: 'Set API key di Pengaturan dulu.', type: 'error' });
      openSettings();
      return;
    }
    refreshModels();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.model-picker')) closeModelDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#modelDropdown').classList.contains('hidden')) closeModelDropdown();
      else if (!$('#settingsModal').classList.contains('hidden')) closeSettings();
    }
  });

  const input = $('#input');
  input.addEventListener('input', () => autoresize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  $('#sendBtn').addEventListener('click', sendMessage);

  window.api.onChatDelta(handleDelta);
  window.api.onChatDone(handleDone);
  window.api.onChatError(handleError);
}

wire();
loadAll().then(() => {
  if (state.settings.apiKey) refreshModels();
});
