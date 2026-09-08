# Prism

Desktop chat app (Electron) yang khusus terkoneksi ke **9router / OpenRouter** atau endpoint **OpenAI-compatible** apa pun. Satu prompt bisa direfraksikan lewat ratusan model — dari GPT, Gemini, Llama, Mistral, sampai model lokal via Ollama/LM Studio.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Electron](https://img.shields.io/badge/Electron-32-47848F)
![License](https://img.shields.io/badge/license-MIT-green)

## Fitur

- **Koneksi fleksibel** — arahkan Prism ke `openrouter.ai`, instance 9router self-hosted Anda, Ollama, LM Studio, vLLM, atau endpoint OpenAI-compatible apa pun
- **Model picker cerdas** — katalog model dinamis dengan search, filter tab (Semua / Favorit / Gratis), dan sistem pinning bintang ★
- **Streaming real-time** via SSE dengan indicator koneksi
- **Riwayat percakapan dikelompokkan otomatis** — Hari ini / Kemarin / 7 hari terakhir / 30 hari terakhir / Lebih lama
- **Markdown lengkap** — tabel GFM, heading, list, blockquote, code block, task list, link (via `marked` + `DOMPurify` untuk sanitasi)
- **API key aman** — disimpan terenkripsi via Electron `safeStorage` (DPAPI di Windows, Keychain di macOS)
- **UI gelap ala Untitled UI** dengan aksen emerald
- **Setelan lengkap** — base URL, system prompt, temperature, max tokens
- **CSP ketat** — hanya Google Fonts + endpoint yang dikonfigurasi
- **Zero-tracking, zero-analytics** — semua data lokal di `app.getPath('userData')`

## Screenshot

> Coming soon — jalankan `npm start` untuk lihat langsung.

## Menjalankan

Butuh Node.js 18+ dan npm.

```bash
git clone git@github.com:IrfanArsyad/prism-chat.git
cd prism-chat
npm install
npm start
```

Setelah jendela terbuka:

1. Klik ikon ⚙ di header sidebar kiri
2. **Host / Base URL**: default `https://openrouter.ai/api/v1`, atau arahkan ke instance Anda
3. **API Key**: tempel dari https://openrouter.ai/keys (atau key instance Anda)
4. Simpan → klik model picker di topbar → pilih model → mulai chat

## Base URL yang didukung

| Endpoint | Base URL |
|---|---|
| OpenRouter publik | `https://openrouter.ai/api/v1` |
| 9router self-hosted | `https://your-9router.example.com/v1` |
| Ollama (lokal) | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| vLLM / LocalAI | `http://host:port/v1` |

Selama endpoint kompatibel dengan skema `/models` + `/chat/completions` OpenAI, Prism bisa nyambung.

## Build installer

```bash
npm run build:win     # Windows NSIS installer
npm run build:mac     # macOS dmg
npm run build:linux   # Linux AppImage
```

Output ada di folder `dist/`.

## Struktur project

```
prism-chat/
├── src/
│   ├── main.js              # Electron main process, IPC, streaming HTTPS
│   ├── preload.js           # Bridge context-isolated ke renderer
│   └── renderer/
│       ├── index.html       # Layout + CSP
│       ├── styles.css       # Design system (Untitled UI-inspired)
│       ├── renderer.js      # State, chat rendering, model picker
│       └── vendor/
│           ├── marked.js    # Markdown parser (GFM)
│           └── purify.min.js # DOMPurify sanitizer
├── package.json
└── README.md
```

## Keamanan

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (dibutuhkan preload)
- CSP: `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com`
- Semua HTML dari LLM di-sanitize DOMPurify sebelum di-render
- API key dienkripsi via `safeStorage` OS
- Tidak ada network call ke domain selain base URL yang dikonfigurasi + Google Fonts

## Roadmap

- [ ] Regenerate response
- [ ] Stop / abort streaming
- [ ] Export percakapan ke Markdown / JSON
- [ ] Multi-window / multi-session
- [ ] Themeable accent color
- [ ] System tray + hotkey global

## Kontribusi

PR & issue dipersilakan. Untuk perubahan besar, buka issue dulu untuk diskusi.

## Lisensi

MIT © Irfan Arsyad
