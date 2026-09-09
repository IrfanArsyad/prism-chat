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
  starFilled: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/></svg>',
  copy: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  regen: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.55"/><path d="M21 4v6h-6"/></svg>',
  stop: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  edit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
};

function formatRelativeTime(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 45) return 'baru saja';
  if (s < 90) return '1 menit lalu';
  if (s < 3600) return `${Math.round(s / 60)} menit lalu`;
  if (s < 5400) return '1 jam lalu';
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  if (s < 172800) return 'kemarin';
  if (s < 604800) return `${Math.round(s / 86400)} hari lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateConvTokens(conv) {
  if (!conv) return { input: 0, output: 0 };
  let input = 0, output = 0;
  if (state.settings.systemPrompt) input += estimateTokens(state.settings.systemPrompt);
  for (const m of conv.messages) {
    const t = estimateTokens(m.content);
    if (m.role === 'assistant') output += t;
    else input += t;
  }
  return { input, output };
}

function estimateCost(conv) {
  if (!conv) return 0;
  const model = state.models.find(m => m.id === state.settings.selectedModel);
  if (!model || !model.pricing) return 0;
  const { input, output } = estimateConvTokens(conv);
  const pIn = parseFloat(model.pricing.prompt || 0);
  const pOut = parseFloat(model.pricing.completion || 0);
  return input * pIn + output * pOut;
}

function updateTokenBar() {
  const el = $('#tokenBar');
  if (!el) return;
  const conv = activeConv();
  if (!conv) { el.innerHTML = ''; return; }
  const { input, output } = estimateConvTokens(conv);
  const total = input + output;
  const cost = estimateCost(conv);
  const parts = [`<b>~${total.toLocaleString('id-ID')}</b> tokens`];
  if (cost > 0) parts.push(`<span class="cost">${cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(3)}`}</span>`);
  el.innerHTML = parts.join(' · ');
}

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

function renameConversation(id, newTitle) {
  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;
  const trimmed = (newTitle || '').trim();
  if (!trimmed) return;
  conv.title = trimmed.slice(0, 80);
  persistConversations();
  renderChatList();
}

function startRenameInline(itemEl, conv) {
  const titleEl = itemEl.querySelector('.title');
  if (!titleEl) return;
  const current = conv.title;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = current;
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    if (input.value.trim() && input.value.trim() !== current) {
      renameConversation(conv.id, input.value);
    } else {
      renderChatList();
    }
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); renderChatList(); }
  });
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
          <div class="title" title="Klik ganda untuk ganti nama">${escapeHtml(c.title)}</div>
        </div>
        <button class="del" type="button" aria-label="Hapus" title="Hapus percakapan">${ICONS.trash}</button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.del')) return;
        saveDraft();
        state.activeId = c.id;
        renderChatList();
        renderMessages();
        loadDraft();
        updateTokenBar();
      });
      item.querySelector('.title').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRenameInline(item, c);
      });
      const delBtn = item.querySelector('.del');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (delBtn.classList.contains('confirm')) {
          deleteConversation(c.id);
        } else {
          delBtn.classList.add('confirm');
          delBtn.innerHTML = 'Hapus?';
          delBtn.title = 'Klik lagi untuk konfirmasi';
          clearTimeout(delBtn._t);
          delBtn._t = setTimeout(() => {
            delBtn.classList.remove('confirm');
            delBtn.innerHTML = ICONS.trash;
            delBtn.title = 'Hapus percakapan';
          }, 2500);
        }
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
  const actions = msg.role === 'assistant'
    ? `<div class="msg-actions">
         <button class="msg-action" type="button" data-act="copy">${ICONS.copy}<span>Salin</span></button>
         <button class="msg-action" type="button" data-act="regen">${ICONS.regen}<span>Ulangi</span></button>
       </div>`
    : `<div class="msg-actions">
         <button class="msg-action" type="button" data-act="edit">${ICONS.edit}<span>Edit</span></button>
         <button class="msg-action" type="button" data-act="copy">${ICONS.copy}<span>Salin</span></button>
       </div>`;
  const ts = msg.createdAt ? `<span class="role-meta" title="${new Date(msg.createdAt).toLocaleString()}">${formatRelativeTime(msg.createdAt)}</span>` : '';
  el.innerHTML = `
    <div class="avatar">${msg.role === 'user' ? 'U' : 'AI'}</div>
    <div class="content">
      <div class="role">${msg.role === 'user' ? 'Anda' : 'Assistant'}${meta}${ts}</div>
      <div class="bubble"></div>
      ${actions}
    </div>
  `;
  const bubble = el.querySelector('.bubble');
  bubble.innerHTML = renderMarkdown(msg.content || '');
  attachCopyButtons(bubble);
  highlightBlocks(bubble);
  wireMsgActions(el, msg);
  box.appendChild(el);
  if (scroll) box.scrollTop = box.scrollHeight;
  return el;
}

function wireMsgActions(el, msg) {
  el.querySelectorAll('.msg-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'copy') {
        const conv = activeConv();
        const m = conv?.messages.find(x => x.id === msg.id);
        if (!m) return;
        const ok = await copyToClipboard(m.content);
        if (ok) {
          const label = btn.querySelector('span');
          const orig = label.textContent;
          btn.classList.add('copied');
          label.textContent = 'Tersalin';
          setTimeout(() => { btn.classList.remove('copied'); label.textContent = orig; }, 1400);
        }
      } else if (act === 'regen') {
        regenerateAssistant(msg.id);
      } else if (act === 'edit') {
        startEditUserMessage(msg.id);
      }
    });
  });
}

function startEditUserMessage(msgId) {
  if (state.streaming) return;
  const conv = activeConv();
  const m = conv?.messages.find(x => x.id === msgId);
  if (!m || m.role !== 'user') return;
  const el = document.querySelector(`.msg[data-id="${msgId}"]`);
  if (!el) return;
  el.classList.add('editing');
  const content = el.querySelector('.content');
  const shell = document.createElement('div');
  shell.className = 'edit-shell';
  shell.innerHTML = `
    <textarea class="edit-textarea">${escapeHtml(m.content)}</textarea>
    <div class="edit-actions">
      <button class="btn btn-ghost" type="button" data-cancel>Batal</button>
      <button class="btn btn-primary" type="button" data-save>Simpan & kirim ulang</button>
    </div>
  `;
  content.appendChild(shell);
  const ta = shell.querySelector('textarea');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  autoresize(ta);
  ta.addEventListener('input', () => autoresize(ta));
  const cleanup = () => { el.classList.remove('editing'); shell.remove(); };
  shell.querySelector('[data-cancel]').addEventListener('click', cleanup);
  shell.querySelector('[data-save]').addEventListener('click', () => {
    const newText = ta.value.trim();
    if (!newText) return cleanup();
    m.content = newText;
    // remove everything after this user message
    const idx = conv.messages.findIndex(x => x.id === msgId);
    conv.messages.splice(idx + 1);
    touchConversation(conv);
    persistConversations();
    renderMessages();
    renderChatList();
    triggerAssistant();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); shell.querySelector('[data-save]').click(); }
  });
}

function regenerateAssistant(assistantId) {
  if (state.streaming) return;
  const conv = activeConv();
  if (!conv) return;
  const idx = conv.messages.findIndex(m => m.id === assistantId);
  if (idx < 1) return;
  // Remove this assistant message and everything after
  conv.messages.splice(idx);
  touchConversation(conv);
  persistConversations();
  renderMessages();
  // Now trigger a new assistant response based on remaining messages
  triggerAssistant();
}

function triggerAssistant() {
  const conv = activeConv();
  if (!conv || !state.settings.selectedModel || !state.settings.apiKey) return;
  const asstMsg = {
    id: uid(),
    role: 'assistant',
    content: '',
    model: state.settings.selectedModelName || state.settings.selectedModel,
    createdAt: Date.now()
  };
  conv.messages.push(asstMsg);
  const el = appendMessage(asstMsg);
  el.classList.add('streaming');
  el.querySelector('.bubble').innerHTML = '<span class="typing-cursor"></span>';

  const messagesForApi = [];
  if (state.settings.systemPrompt) messagesForApi.push({ role: 'system', content: state.settings.systemPrompt });
  for (const m of conv.messages) {
    if (m === asstMsg) continue;
    messagesForApi.push({ role: m.role, content: m.content });
  }

  state.streaming = true;
  state.streamingId = asstMsg.id;
  setConnState('streaming');
  updateSendButton();

  window.api.sendChat({
    id: asstMsg.id,
    model: state.settings.selectedModel,
    messages: messagesForApi,
    temperature: parseFloat(state.settings.temperature) || 0.7,
    max_tokens: state.settings.maxTokens ? parseInt(state.settings.maxTokens) : undefined
  });
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
const _hljs = window.hljs || null;
if (_hljs) _hljs.configure({ ignoreUnescapedHTML: true, throwUnescapedHTML: false });

function highlightBlocks(root) {
  if (!_hljs) return;
  root.querySelectorAll('pre code').forEach(el => {
    if (el.dataset.hlDone) return;
    try {
      _hljs.highlightElement(el);
      el.dataset.hlDone = '1';
    } catch {}
  });
}

function renderMarkdown(text) {
  if (!text) return '';
  if (!_marked) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
  let raw = _marked.parse ? _marked.parse(text) : _marked(text);
  if (window.DOMPurify) raw = window.DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'data-code', 'data-lang'] });
  // Wrap <pre><code class="language-xxx"> with copy button
  raw = raw.replace(
    /<pre><code(?:\s+class="([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, cls, code) => {
      const langMatch = (cls || '').match(/language-(\S+)/);
      const lang = langMatch ? langMatch[1] : '';
      const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
      return `<div class="code-block">${langLabel}<button class="copy-code" type="button" data-copy>${ICONS.copy}<span>Copy</span></button><pre><code${cls ? ` class="${escapeHtml(cls)}"` : ''}>${code}</code></pre></div>`;
    }
  );
  return raw;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

function attachCopyButtons(root) {
  root.querySelectorAll('.copy-code').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const pre = btn.parentElement.querySelector('pre code');
      const text = pre ? pre.textContent : '';
      const ok = await copyToClipboard(text);
      if (!ok) return;
      const label = btn.querySelector('span');
      const original = label.textContent;
      btn.classList.add('copied');
      label.textContent = 'Tersalin';
      setTimeout(() => { btn.classList.remove('copied'); label.textContent = original; }, 1400);
    });
  });
}

/* ============ Model picker ============ */
function updateModelDisplay() {
  const label = state.settings.selectedModelName || state.settings.selectedModel || 'Pilih model dulu';
  $('#currentModel').textContent = label;
  const hint = $('#composerModelHint');
  if (hint) hint.textContent = state.settings.selectedModel ? label : 'Pilih model dulu';
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
      updateTokenBar();
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
  const userMsg = { id: uid(), role: 'user', content: text, createdAt: Date.now() };
  conv.messages.push(userMsg);
  if (conv.title === 'Percakapan baru') {
    conv.title = text.slice(0, 52) + (text.length > 52 ? '…' : '');
  }
  touchConversation(conv);
  renderChatList();
  appendMessage(userMsg);
  input.value = '';
  autoresize(input);

  triggerAssistant();
}

function stopStreaming() {
  if (!state.streaming || !state.streamingId) return;
  window.api.abortChat(state.streamingId);
}

function updateSendButton() {
  const btn = $('#sendBtn');
  const icon = $('#sendIcon');
  if (state.streaming) {
    btn.classList.add('stop');
    btn.title = 'Hentikan (Esc)';
    icon.outerHTML = `<svg id="sendIcon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
  } else {
    btn.classList.remove('stop');
    btn.title = 'Kirim (Enter)';
    icon.outerHTML = `<svg id="sendIcon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;
  }
}

function finalizeStream() {
  state.streaming = false;
  state.streamingId = null;
  setConnState('idle');
  updateSendButton();
  document.querySelectorAll('.msg.streaming').forEach(el => el.classList.remove('streaming'));
  const conv = activeConv();
  if (conv) touchConversation(conv);
  persistConversations();
  renderChatList();
  updateTokenBar();
}

let _renderScheduled = false;
let _renderPendingId = null;

function handleDelta({ id, delta }) {
  const conv = activeConv();
  if (!conv) return;
  const m = conv.messages.find(x => x.id === id);
  if (!m) return;
  m.content += delta;
  _renderPendingId = id;
  if (_renderScheduled) return;
  _renderScheduled = true;
  requestAnimationFrame(() => {
    _renderScheduled = false;
    const pid = _renderPendingId;
    if (!pid) return;
    const cc = activeConv();
    const mm = cc?.messages.find(x => x.id === pid);
    if (!mm) return;
    const bubble = document.querySelector(`.msg[data-id="${pid}"] .bubble`);
    if (bubble) {
      bubble.innerHTML = renderMarkdown(mm.content) + '<span class="typing-cursor"></span>';
      attachCopyButtons(bubble);
      smartScroll();
    }
  });
}
function handleDone({ id, aborted }) {
  const conv = activeConv();
  const m = conv?.messages.find(x => x.id === id);
  const bubble = document.querySelector(`.msg[data-id="${id}"] .bubble`);
  if (bubble && m) {
    let content = m.content;
    if (aborted) content += (content ? '\n\n' : '') + '_(dihentikan)_';
    m.content = content;
    bubble.innerHTML = renderMarkdown(content);
    attachCopyButtons(bubble);
    highlightBlocks(bubble);
  }
  finalizeStream();
}
function handleError({ id, error }) {
  setConnState('error');
  const conv = activeConv();
  const m = conv?.messages.find(x => x.id === id);
  const bubble = document.querySelector(`.msg[data-id="${id}"] .bubble`);
  if (bubble && m) {
    if (!m.content) m.content = '';
    bubble.innerHTML = renderMarkdown(m.content) +
      `<button class="retry-error" type="button" data-retry="${id}">${ICONS.regen}<span>Coba lagi</span></button>` +
      `<div style="margin-top:6px;font-size:12px;color:var(--text-quaternary)">${escapeHtml(error)}</div>`;
    attachCopyButtons(bubble);
    const retry = bubble.querySelector('.retry-error');
    if (retry) retry.addEventListener('click', () => regenerateAssistant(id));
  }
  toast({ title: 'Gagal streaming', message: error, type: 'error', duration: 5000 });
  finalizeStream();
}

function smartScroll() {
  const box = $('#messages');
  const dist = box.scrollHeight - box.scrollTop - box.clientHeight;
  if (dist < 200) box.scrollTop = box.scrollHeight;
  else updateScrollPill(true);
}

function updateScrollPill(force) {
  const box = $('#messages');
  const pill = $('#scrollBottomPill');
  if (!pill) return;
  const dist = box.scrollHeight - box.scrollTop - box.clientHeight;
  if (force || dist > 240) pill.classList.add('visible');
  else pill.classList.remove('visible');
}

/* ============ Draft ============ */
function saveDraft() {
  const conv = activeConv();
  if (!conv) return;
  const val = $('#input').value;
  if (val) conv.draft = val; else delete conv.draft;
  persistConversations();
}
function loadDraft() {
  const conv = activeConv();
  const input = $('#input');
  input.value = conv?.draft || '';
  autoresize(input);
}

/* ============ Export ============ */
function conversationToMarkdown(conv) {
  const lines = [`# ${conv.title}`, ''];
  lines.push(`> Diekspor ${new Date().toLocaleString('id-ID')} · model ${state.settings.selectedModelName || state.settings.selectedModel || 'n/a'}`);
  lines.push('');
  for (const m of conv.messages) {
    const who = m.role === 'user' ? '### Anda' : `### Assistant${m.model ? ` (${m.model})` : ''}`;
    lines.push(who);
    lines.push('');
    lines.push(m.content);
    lines.push('');
  }
  return lines.join('\n');
}

async function exportConversation(format) {
  const conv = activeConv();
  if (!conv) { toast({ title: 'Tidak ada percakapan', message: 'Pilih percakapan yang mau di-export.', type: 'error' }); return; }
  const safeTitle = conv.title.replace(/[<>:"\/\\|?*]/g, '_').slice(0, 60);
  let content, filters, defaultName;
  if (format === 'md') {
    content = conversationToMarkdown(conv);
    defaultName = `${safeTitle}.md`;
    filters = [{ name: 'Markdown', extensions: ['md'] }];
  } else if (format === 'json') {
    content = JSON.stringify(conv, null, 2);
    defaultName = `${safeTitle}.json`;
    filters = [{ name: 'JSON', extensions: ['json'] }];
  } else return;
  const res = await window.api.saveExport({ defaultName, content, filters });
  if (res.ok) toast({ title: 'Tersimpan', message: `Percakapan diekspor ke ${res.path}`, type: 'success' });
}

async function copyAllMessages() {
  const conv = activeConv();
  if (!conv) return;
  const ok = await copyToClipboard(conversationToMarkdown(conv));
  if (ok) toast({ title: 'Tersalin', message: 'Seluruh percakapan disalin sebagai Markdown.', type: 'success' });
}

function clearConversationMessages() {
  const conv = activeConv();
  if (!conv || conv.messages.length === 0) return;
  if (!confirmToast('Hapus semua pesan di percakapan ini?')) return;
  conv.messages = [];
  conv.title = 'Percakapan baru';
  touchConversation(conv);
  persistConversations();
  renderChatList();
  renderMessages();
  updateTokenBar();
}

function confirmToast(msg) {
  // simple browser confirm fallback (native Electron dialog would be nicer but this is fine)
  return window.confirm(msg);
}

/* ============ Find in conversation ============ */
const findState = { hits: [], index: -1, query: '' };

function openFindBar() {
  $('#findBar').classList.remove('hidden');
  const inp = $('#findInput');
  inp.focus();
  inp.select();
}
function closeFindBar() {
  $('#findBar').classList.add('hidden');
  clearFindHighlights();
  findState.hits = []; findState.index = -1; findState.query = '';
  $('#findCount').textContent = '0/0';
  $('#findInput').value = '';
}
function clearFindHighlights() {
  document.querySelectorAll('.find-hit').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}
function runFind(query) {
  clearFindHighlights();
  findState.query = query;
  findState.hits = [];
  findState.index = -1;
  if (!query) { $('#findCount').textContent = '0/0'; return; }
  const q = query.toLowerCase();
  const bubbles = document.querySelectorAll('.msg .bubble');
  bubbles.forEach(b => highlightTextIn(b, q));
  findState.hits = Array.from(document.querySelectorAll('.find-hit'));
  if (findState.hits.length > 0) navigateFind(1);
  $('#findCount').textContent = `${findState.hits.length === 0 ? 0 : findState.index + 1}/${findState.hits.length}`;
}
function highlightTextIn(root, query) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.parentElement.closest('.code-block, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let idx = lower.indexOf(query);
    if (idx === -1) continue;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    while (idx !== -1) {
      if (idx > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, idx)));
      const mark = document.createElement('mark');
      mark.className = 'find-hit';
      mark.textContent = text.slice(idx, idx + query.length);
      frag.appendChild(mark);
      cursor = idx + query.length;
      idx = lower.indexOf(query, cursor);
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    node.parentNode.replaceChild(frag, node);
  }
}
function navigateFind(dir) {
  if (findState.hits.length === 0) return;
  findState.hits.forEach(h => h.classList.remove('current'));
  findState.index = (findState.index + dir + findState.hits.length) % findState.hits.length;
  const current = findState.hits[findState.index];
  current.classList.add('current');
  current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  $('#findCount').textContent = `${findState.index + 1}/${findState.hits.length}`;
}

/* ============ Chat menu ============ */
function toggleChatMenu(force) {
  const m = $('#chatMenu');
  const shouldOpen = force !== undefined ? force : m.classList.contains('hidden');
  m.classList.toggle('hidden', !shouldOpen);
}

function handleMenuAction(action) {
  toggleChatMenu(false);
  const conv = activeConv();
  if (!conv) { toast({ title: 'Tidak ada percakapan', message: 'Pilih atau buat percakapan dulu.', type: 'error' }); return; }
  if (action === 'rename') {
    // find the chat item in sidebar and trigger rename
    const item = document.querySelector(`.chat-item.active`);
    if (item) startRenameInline(item, conv);
  } else if (action === 'export-md') exportConversation('md');
  else if (action === 'export-json') exportConversation('json');
  else if (action === 'copy-all') copyAllMessages();
  else if (action === 'clear') clearConversationMessages();
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
  input.addEventListener('input', () => { autoresize(input); saveDraft(); updateTokenBar(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  $('#sendBtn').addEventListener('click', () => {
    if (state.streaming) stopStreaming();
    else sendMessage();
  });

  // Chat menu
  $('#chatMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleChatMenu(); });
  $('#chatMenu').querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => handleMenuAction(item.dataset.action));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) toggleChatMenu(false);
  });

  // Find bar
  $('#findInChatBtn').addEventListener('click', openFindBar);
  $('#findClose').addEventListener('click', closeFindBar);
  $('#findPrev').addEventListener('click', () => navigateFind(-1));
  $('#findNext').addEventListener('click', () => navigateFind(1));
  $('#findInput').addEventListener('input', (e) => runFind(e.target.value));
  $('#findInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); navigateFind(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
  });

  // Scroll-to-bottom pill
  const messages = $('#messages');
  const pill = $('#scrollBottomPill');
  messages.addEventListener('scroll', () => updateScrollPill(false));
  pill.addEventListener('click', () => {
    messages.scrollTop = messages.scrollHeight;
    updateScrollPill(false);
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); newConversation(); }
    else if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); openModelDropdown(); }
    else if (ctrl && e.key === ',') { e.preventDefault(); openSettings(); }
    else if (ctrl && e.key.toLowerCase() === 'l') { e.preventDefault(); $('#chatSearch').focus(); }
    else if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); openFindBar(); }
    else if (e.key === 'Escape') {
      if (!$('#findBar').classList.contains('hidden')) { e.preventDefault(); closeFindBar(); }
      else if (state.streaming) { e.preventDefault(); stopStreaming(); }
    }
  });

  window.api.onChatDelta(handleDelta);
  window.api.onChatDone(handleDone);
  window.api.onChatError(handleError);
}

wire();
loadAll().then(() => {
  updateSendButton();
  loadDraft();
  updateTokenBar();
  if (state.settings.apiKey) {
    refreshModels();
  } else {
    // First-run: nudge user to settings
    setTimeout(() => {
      toast({ title: 'Selamat datang di Prism', message: 'Isi Base URL dan API key untuk mulai chat.', type: 'info', duration: 4500 });
      openSettings();
    }, 300);
  }
});
