// CatPhis — content.js
// PhishFox analysis + CatPhis animated mascot + chatbot

(function () {
  "use strict";

  const PAGE_URL = window.location.href;
  if (
    window.__catphisRan ||
    !PAGE_URL ||
    PAGE_URL.startsWith("chrome://") ||
    PAGE_URL.startsWith("chrome-extension://") ||
    PAGE_URL.startsWith("edge://") ||
    PAGE_URL.startsWith("about:") ||
    PAGE_URL.startsWith("http://localhost") ||
    PAGE_URL.startsWith("https://localhost")
  ) return;

  window.__catphisRan = true;

  const BACKEND = "http://localhost:8000";
  const OVERLAY_THRESHOLD = 70;
  const TEXT_LIMIT = 5000;
  const STYLES_ID = "__catphis_styles__";
  const ROOT_ID = "catphis-root";

  function extractPageText() {
    if (!document.body) return "";
    const text = (document.body.innerText || "").trim();
    if (text.length <= TEXT_LIMIT) return text;
    return text.slice(0, 2000) + "\n\n...[CONTENT TRUNCATED]...\n\n" + text.slice(-1000);
  }

  function extractForms() {
    const forms = [];
    document.querySelectorAll("form").forEach((form) => {
      const inputs = Array.from(form.querySelectorAll("input"));
      const inputTypes = inputs.map((el) => (el.type || "text").toLowerCase());
      forms.push({
        action: form.action || "",
        method: (form.method || "get").toLowerCase(),
        hasPassword: inputTypes.includes("password"),
        inputTypes,
      });
    });
    return forms;
  }

  async function analyzeWithBackend(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${BACKEND}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
    finally { clearTimeout(timer); }
  }

  function saveResult(result, backendOnline) {
    chrome.storage.local.set({
      lastDomAnalysis: {
        url: PAGE_URL,
        risk_score: result?.risk_score ?? 0,
        verdict: result?.verdict ?? (backendOnline ? "Unknown" : "Backend Offline"),
        reasons: result?.reasons || [],
        analyzedAt: Date.now(),
        backendOnline,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CAT SVGs — embedded as inline SVG strings (always works, no files needed)
  // If you later add images/cat_idle.png and images/cat_drag.png to the
  // extension folder, those will be used instead via the onerror fallback.
  // ═══════════════════════════════════════════════════════════════════════

  // Pisica asezata (idle) — verde ochi
  const SVG_IDLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="90" height="112">
    <!-- Shadow -->
    <ellipse cx="62" cy="148" rx="28" ry="5" fill="rgba(0,0,0,0.25)"/>
    <!-- Tail -->
    <path d="M80 120 Q115 100 108 72 Q102 52 88 60" stroke="#1a1a1a" stroke-width="9" fill="none" stroke-linecap="round"/>
    <!-- Body -->
    <ellipse cx="58" cy="110" rx="32" ry="30" fill="#1c1c1c"/>
    <!-- Hind legs / paws sitting -->
    <ellipse cx="38" cy="143" rx="13" ry="7" fill="#1c1c1c"/>
    <ellipse cx="80" cy="143" rx="13" ry="7" fill="#1c1c1c"/>
    <!-- Chest fluff -->
    <ellipse cx="58" cy="102" rx="14" ry="11" fill="#282828"/>
    <!-- Front paws -->
    <ellipse cx="44" cy="133" rx="9" ry="6" fill="#222"/>
    <ellipse cx="72" cy="133" rx="9" ry="6" fill="#222"/>
    <!-- Neck -->
    <ellipse cx="58" cy="75" rx="16" ry="12" fill="#1c1c1c"/>
    <!-- Head -->
    <ellipse cx="60" cy="54" rx="28" ry="26" fill="#1c1c1c"/>
    <!-- Ear left -->
    <polygon points="32,34 40,12 52,32" fill="#1a1a1a"/>
    <polygon points="35,32 41,17 49,31" fill="#4a2040"/>
    <!-- Ear right -->
    <polygon points="68,32 78,12 88,34" fill="#1a1a1a"/>
    <polygon points="71,31 79,17 85,32" fill="#4a2040"/>
    <!-- Eyes -->
    <ellipse cx="48" cy="52" rx="8" ry="9" fill="#2ecc71"/>
    <ellipse cx="48" cy="52" rx="4" ry="7" fill="#0a0612"/>
    <circle cx="50" cy="49" r="1.8" fill="rgba(255,255,255,.75)"/>
    <ellipse cx="72" cy="52" rx="8" ry="9" fill="#2ecc71"/>
    <ellipse cx="72" cy="52" rx="4" ry="7" fill="#0a0612"/>
    <circle cx="74" cy="49" r="1.8" fill="rgba(255,255,255,.75)"/>
    <!-- Nose -->
    <polygon points="60,62 57,66 63,66" fill="#c084bc"/>
    <!-- Mouth -->
    <path d="M57 66 Q60 70 63 66" stroke="#c084bc" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <!-- Whiskers L -->
    <line x1="22" y1="60" x2="50" y2="63" stroke="#555" stroke-width="1.1"/>
    <line x1="20" y1="65" x2="49" y2="65" stroke="#555" stroke-width="1.1"/>
    <line x1="22" y1="70" x2="50" y2="67" stroke="#555" stroke-width="1.1"/>
    <!-- Whiskers R -->
    <line x1="98" y1="60" x2="70" y2="63" stroke="#555" stroke-width="1.1"/>
    <line x1="100" y1="65" x2="71" y2="65" stroke="#555" stroke-width="1.1"/>
    <line x1="98" y1="70" x2="70" y2="67" stroke="#555" stroke-width="1.1"/>
    <!-- Bell collar -->
    <rect x="44" y="72" width="32" height="7" rx="3.5" fill="#5b21b6"/>
    <circle cx="60" cy="78" r="5" fill="#d97706"/>
    <circle cx="60" cy="78" r="3" fill="#f59e0b"/>
    <circle cx="59" cy="77" r="1" fill="#92400e"/>
  </svg>`;

  // Pisica suspendata (drag) — labe in sus, ochi deschisi
  const SVG_DRAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" width="90" height="120">
    <!-- Tail hanging down -->
    <path d="M88 80 Q115 105 108 130 Q104 150 92 148" stroke="#1a1a1a" stroke-width="9" fill="none" stroke-linecap="round"/>
    <!-- Body -->
    <ellipse cx="58" cy="100" rx="28" ry="32" fill="#1c1c1c"/>
    <!-- Chest fluff -->
    <ellipse cx="58" cy="92" rx="13" ry="10" fill="#282828"/>
    <!-- Front paws raised -->
    <path d="M38 90 Q22 70 28 55" stroke="#1c1c1c" stroke-width="10" fill="none" stroke-linecap="round"/>
    <ellipse cx="28" cy="53" rx="9" ry="6" fill="#222" transform="rotate(-20 28 53)"/>
    <path d="M78 90 Q94 70 88 55" stroke="#1c1c1c" stroke-width="10" fill="none" stroke-linecap="round"/>
    <ellipse cx="88" cy="53" rx="9" ry="6" fill="#222" transform="rotate(20 88 53)"/>
    <!-- Hind legs hanging -->
    <path d="M44 128 Q36 148 42 158" stroke="#1c1c1c" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="42" cy="157" rx="8" ry="5" fill="#222"/>
    <path d="M72 128 Q80 148 74 158" stroke="#1c1c1c" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="74" cy="157" rx="8" ry="5" fill="#222"/>
    <!-- Neck -->
    <ellipse cx="58" cy="68" rx="16" ry="12" fill="#1c1c1c"/>
    <!-- Head -->
    <ellipse cx="58" cy="48" rx="28" ry="26" fill="#1c1c1c"/>
    <!-- Ear left -->
    <polygon points="30,30 38,8 50,28" fill="#1a1a1a"/>
    <polygon points="33,28 39,13 47,27" fill="#4a2040"/>
    <!-- Ear right -->
    <polygon points="66,28 76,8 86,30" fill="#1a1a1a"/>
    <polygon points="69,27 77,13 83,28" fill="#4a2040"/>
    <!-- Eyes wide open (surprised) -->
    <ellipse cx="46" cy="46" rx="9" ry="10" fill="#2ecc71"/>
    <ellipse cx="46" cy="46" rx="5" ry="8" fill="#0a0612"/>
    <circle cx="48" cy="43" r="2" fill="rgba(255,255,255,.8)"/>
    <ellipse cx="70" cy="46" rx="9" ry="10" fill="#2ecc71"/>
    <ellipse cx="70" cy="46" rx="5" ry="8" fill="#0a0612"/>
    <circle cx="72" cy="43" r="2" fill="rgba(255,255,255,.8)"/>
    <!-- Nose -->
    <polygon points="58,57 55,61 61,61" fill="#c084bc"/>
    <!-- Mouth - open slightly / surprised -->
    <path d="M55 61 Q58 66 61 61" stroke="#c084bc" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <!-- Whiskers L -->
    <line x1="20" y1="54" x2="48" y2="57" stroke="#555" stroke-width="1.1"/>
    <line x1="18" y1="59" x2="47" y2="59" stroke="#555" stroke-width="1.1"/>
    <!-- Whiskers R -->
    <line x1="96" y1="54" x2="68" y2="57" stroke="#555" stroke-width="1.1"/>
    <line x1="98" y1="59" x2="69" y2="59" stroke="#555" stroke-width="1.1"/>
    <!-- Bell collar -->
    <rect x="42" y="65" width="32" height="7" rx="3.5" fill="#5b21b6"/>
    <circle cx="58" cy="71" r="5" fill="#d97706"/>
    <circle cx="58" cy="71" r="3" fill="#f59e0b"/>
    <circle cx="57" cy="70" r="1" fill="#92400e"/>
  </svg>`;

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement("style");
    style.id = STYLES_ID;
    // Inject Inter font once
    if (!document.getElementById('__catphis_font__')) {
      const lnk = document.createElement('link');
      lnk.id = '__catphis_font__';
      lnk.rel = 'stylesheet';
      lnk.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(lnk);
    }
    style.textContent = `
      #catphis-root * { box-sizing: border-box; margin: 0; padding: 0; }
      #catphis-root {
        all: initial;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483646;
        pointer-events: none;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .catphis-positioner {
        position: relative;
        display: inline-block;
        pointer-events: none;
        will-change: transform;
      }
      .catphis-cat-wrap {
        pointer-events: all;
        cursor: grab;
        position: relative;
        width: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: filter .4s ease;
      }
      .catphis-cat-wrap:hover {
        filter: drop-shadow(0 8px 16px rgba(0,0,0,0.25));
      }
      .catphis-cat-wrap:active { cursor: grabbing; }

      .catphis-cat-svg-wrap {
        display: block;
        width: 160px;
        pointer-events: none;
      }
      .catphis-cat-svg-wrap svg { display: block; width: 100%; height: auto; }

      .catphis-glow {
        position: absolute;
        inset: 20px 15px;
        border-radius: 50%;
        opacity: 0;
        pointer-events: none;
        transition: opacity .6s, box-shadow .6s;
      }
      .catphis-glow.safe   { box-shadow: none; opacity: 0; }
      .catphis-glow.warn   { box-shadow: 0 0 24px 8px rgba(245,158,11,0.5); opacity: .8; }
      .catphis-glow.danger { box-shadow: 0 0 28px 10px rgba(239,68,68,0.6); opacity: .9; }
      .catphis-glow.loading { box-shadow: 0 0 20px 8px rgba(167,139,250,0.6); opacity: .8; animation: catphis-pulse 1.5s infinite; }

      .catphis-anim-idle { animation: catphis-breathe 3.8s ease-in-out infinite; }
      @keyframes catphis-breathe {
        0%,100% { transform: translateY(0) scale(1); }
        50%      { transform: translateY(-3px) scale(1.02); }
      }

      @keyframes catphis-pop-in {
        from { opacity:0; transform: scale(.88) translateY(8px); }
        to   { opacity:1; transform: scale(1) translateY(0); }
      }

      .catphis-bubble {
        pointer-events: all;
        position: absolute;
        bottom: calc(100% + 12px);
        right: 0;
        background: rgba(15, 10, 30, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(167,139,250,.4);
        border-radius: 16px 16px 4px 16px;
        padding: 10px 15px;
        max-width: 240px;
        font-size: 13px;
        color: #e9d5ff;
        line-height: 1.5;
        box-shadow: 0 8px 32px rgba(0,0,0,.6), 0 0 0 1px rgba(167,139,250,.08);
        white-space: normal;
      }
      .catphis-bubble::after {
        content: ""; position: absolute; bottom: -9px; right: 18px;
        border: 5px solid transparent;
        border-top-color: rgba(167,139,250,.4);
      }

      .catphis-chat {
        pointer-events: all;
        position: absolute;
        bottom: calc(100% + 14px);
        right: 0;
        width: 340px;
        background: rgba(10, 7, 22, 0.96);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(139,92,246,.25);
        border-radius: 20px;
        box-shadow:
          0 24px 60px rgba(0,0,0,.85),
          0 0 0 1px rgba(139,92,246,.1),
          inset 0 1px 0 rgba(255,255,255,.06);
        overflow: hidden;
        display: none;
        flex-direction: column;
        max-height: 500px;
        transform-origin: bottom right;
      }
      .catphis-chat.open {
        display: flex;
        animation: catphis-chat-open .28s cubic-bezier(.34,1.56,.64,1) both;
      }
      @keyframes catphis-chat-open {
        from { opacity:0; transform: scale(.85) translateY(12px); }
        to   { opacity:1; transform: scale(1)   translateY(0); }
      }

      .catphis-chat-header {
        padding: 14px 16px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: linear-gradient(135deg, rgba(76,29,149,.9), rgba(109,40,217,.8));
        border-bottom: 1px solid rgba(139,92,246,.2);
        position: relative;
        overflow: hidden;
      }
      .catphis-chat-header::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, transparent 40%, rgba(167,139,250,.08));
        pointer-events: none;
      }
      .catphis-chat-avatar {
        width: 36px; height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1e1b2e, #2d1b69);
        border: 2px solid rgba(167,139,250,.4);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
        box-shadow: 0 0 12px rgba(139,92,246,.4);
      }
      .catphis-chat-header-info { flex: 1; }
      .catphis-chat-header-title {
        font-size: 14px; font-weight: 700; color: #fff;
        letter-spacing: -.2px; line-height: 1.2;
      }
      .catphis-chat-header-sub {
        font-size: 11px; color: rgba(167,139,250,.7); margin-top: 1px;
        display: flex; align-items: center; gap: 5px;
      }
      .catphis-status-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
        box-shadow: 0 0 5px #22c55e;
        animation: catphis-pulse 2s ease-in-out infinite;
      }
      @keyframes catphis-pulse {
        0%,100% { opacity: 1; } 50% { opacity: .4; }
      }
      .catphis-chat-header-close {
        all: unset; cursor: pointer;
        width: 28px; height: 28px;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; color: rgba(255,255,255,.5);
        transition: color .15s, background .15s;
        flex-shrink: 0;
      }
      .catphis-chat-header-close:hover { color:#fff; background:rgba(255,255,255,.12); }

      .catphis-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 14px 14px 8px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 200px;
        max-height: 280px;
        scrollbar-width: thin;
        scrollbar-color: rgba(139,92,246,.25) transparent;
      }
      .catphis-chat-messages::-webkit-scrollbar { width: 6px; }
      .catphis-chat-messages::-webkit-scrollbar-track { background: transparent; }
      .catphis-chat-messages::-webkit-scrollbar-thumb { background: rgba(139,92,246,.4); border-radius: 3px; }

      .catphis-msg-row { display: flex; align-items: flex-end; gap: 7px; }
      .catphis-msg-row.user { flex-direction: row-reverse; }
      .catphis-msg-icon {
        width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
        background: linear-gradient(135deg, #1e1b2e, #2d1b69);
        border: 1px solid rgba(139,92,246,.3);
        display: flex; align-items: center; justify-content: center;
        font-size: 13px;
      }
      
      .catphis-msg {
        max-width: 78%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.55;
        animation: catphis-msg-in .22s cubic-bezier(.34,1.56,.64,1) both;
      }
      @keyframes catphis-msg-in {
        from { opacity:0; transform: translateY(6px) scale(.96); }
        to   { opacity:1; transform: translateY(0) scale(1); }
      }
      .catphis-msg.bot {
        align-self: flex-start;
        background: rgba(30, 20, 60, 0.8);
        border: 1px solid rgba(139,92,246,.2);
        color: #e9d5ff;
        border-radius: 4px 16px 16px 16px;
      }
      .catphis-msg.user {
        align-self: flex-end;
        background: linear-gradient(135deg, #5b21b6, #7c3aed);
        color: #fff;
        border-radius: 16px 4px 16px 16px;
        box-shadow: 0 4px 12px rgba(124,58,237,.35);
      }
      .catphis-msg.typing {
        align-self: flex-start;
        background: rgba(30,20,60,.6);
        border: 1px solid rgba(139,92,246,.15);
        border-radius: 4px 16px 16px 16px;
        padding: 12px 16px;
        display: flex; align-items: center; gap: 4px;
      }
      .catphis-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #a78bfa;
        animation: catphis-dots 1.2s ease-in-out infinite;
      }
      .catphis-dot:nth-child(2) { animation-delay: .2s; }
      .catphis-dot:nth-child(3) { animation-delay: .4s; }
      @keyframes catphis-dots {
        0%,60%,100% { transform: translateY(0); opacity: .5; }
        30% { transform: translateY(-5px); opacity: 1; }
      }

      .catphis-divider {
        text-align: center; font-size: 10px; color: rgba(139,92,246,.4);
        letter-spacing: .5px; text-transform: uppercase; margin: 2px 0;
      }

      .catphis-chat-input-area {
        display: flex;
        gap: 8px;
        padding: 12px 14px;
        border-top: 1px solid rgba(139,92,246,.12);
        background: rgba(15,10,35,.6);
        align-items: center;
      }
      .catphis-chat-input {
        all: unset;
        flex: 1;
        background: rgba(139,92,246,.08);
        border: 1px solid rgba(139,92,246,.2);
        border-radius: 12px;
        padding: 10px 14px;
        color: #e9d5ff;
        font-size: 13px;
        line-height: 1.4;
        transition: border-color .2s, background .2s;
      }
      .catphis-chat-input::placeholder { color: rgba(167,139,250,.35); }
      .catphis-chat-input:focus {
        border-color: rgba(139,92,246,.55);
        background: rgba(139,92,246,.12);
      }
      .catphis-send-btn {
        all: unset;
        cursor: pointer;
        width: 38px; height: 38px;
        border-radius: 12px;
        background: linear-gradient(135deg, #5b21b6, #7c3aed);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
        transition: opacity .15s, transform .15s, box-shadow .2s;
        box-shadow: 0 4px 12px rgba(124,58,237,.4);
      }
      .catphis-send-btn:hover  { opacity: .9; box-shadow: 0 6px 16px rgba(124,58,237,.55); }
      .catphis-send-btn:active { transform: scale(.88); }
      .catphis-send-btn:disabled { opacity: .35; cursor: not-allowed; transform: none; }
      .catphis-chat-input:disabled { opacity: .45; cursor: not-allowed; }

      /* Quick action chips */
      .catphis-quick-btns {
        display: flex; flex-wrap: wrap; gap: 6px;
        padding: 8px 14px 10px;
        border-top: 1px solid rgba(139,92,246,.08);
        background: rgba(15,10,35,.4);
      }
      .catphis-quick-btn {
        all: unset; cursor: pointer;
        background: rgba(139,92,246,.1);
        border: 1px solid rgba(139,92,246,.22);
        border-radius: 20px;
        padding: 5px 11px;
        font-size: 11.5px;
        color: #c4b5fd;
        transition: background .15s, border-color .15s, transform .12s;
        white-space: nowrap;
        font-family: 'Inter', sans-serif;
      }
      .catphis-quick-btn:hover {
        background: rgba(139,92,246,.22);
        border-color: rgba(139,92,246,.45);
        transform: translateY(-1px);
      }
      .catphis-quick-btn:active { transform: scale(.95); }

      /* Risk score card */
      .catphis-risk-card {
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 2px;
        font-size: 12px;
        line-height: 1.5;
        border: 1px solid;
        animation: catphis-msg-in .3s ease both;
      }
      .catphis-risk-card.safe   { background: rgba(16,185,129,.1); border-color: rgba(16,185,129,.3); color: #6ee7b7; }
      .catphis-risk-card.warn   { background: rgba(245,158,11,.1); border-color: rgba(245,158,11,.3); color: #fcd34d; }
      .catphis-risk-card.danger { background: rgba(239,68,68,.1);  border-color: rgba(239,68,68,.3);  color: #fca5a5; }
      .catphis-risk-card-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
      .catphis-risk-bar-bg {
        height: 5px; border-radius: 3px; background: rgba(255,255,255,.1); overflow: hidden; margin-bottom: 7px;
      }
      .catphis-risk-bar-fill { height: 100%; border-radius: 3px; transition: width 1s cubic-bezier(.4,0,.2,1); }
      .catphis-risk-bar-fill.safe   { background: linear-gradient(90deg,#10b981,#34d399); }
      .catphis-risk-bar-fill.warn   { background: linear-gradient(90deg,#f59e0b,#fbbf24); }
      .catphis-risk-bar-fill.danger { background: linear-gradient(90deg,#ef4444,#f87171); }
      .catphis-risk-reason { font-size: 11px; opacity: .8; padding-left: 2px; }
      .catphis-risk-reason::before { content: '• '; }

      /* Toast */
      .catphis-toast {
        position: absolute;
        bottom: 70px; left: 50%; transform: translateX(-50%);
        background: rgba(16,185,129,.92);
        color: #fff; font-size: 12px; font-weight: 600;
        padding: 7px 16px; border-radius: 20px;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0,0,0,.4);
        animation: catphis-toast-in .3s ease both;
        pointer-events: none; z-index: 10;
      }
      @keyframes catphis-toast-in {
        from { opacity:0; transform: translateX(-50%) translateY(8px); }
        to   { opacity:1; transform: translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // BOT RESPONSES & HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  let conversationHistory = [];

  async function loadHistory() {
    return new Promise(res => {
        chrome.storage.local.get("chatHistory", (data) => {
            const h = data.chatHistory || {};
            if (h.url === PAGE_URL && Array.isArray(h.messages)) {
                conversationHistory = h.messages;
            } else {
                conversationHistory = [];
            }
            res();
        });
    });
  }

  function saveHistory() {
    if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
    }
    chrome.storage.local.set({
        chatHistory: { url: PAGE_URL, messages: conversationHistory }
    });
  }

  async function fetchChatResponse(msg, riskScore) {
    let analysisResult = null;
    try {
      const data = await new Promise(res => chrome.storage.local.get("lastDomAnalysis", res));
      if (data && data.lastDomAnalysis && data.lastDomAnalysis.url === PAGE_URL) {
        analysisResult = data.lastDomAnalysis;
      }

      if (!analysisResult) {
        const payload = {
          url: PAGE_URL,
          page_title: document.title || "",
          page_text: extractPageText(),
          forms: extractForms(),
        };
        const analyzeRes = await fetch(`${BACKEND}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (analyzeRes.ok) {
            analysisResult = await analyzeRes.json();
            saveResult(analysisResult, true);
        } else {
            analysisResult = { risk_score: riskScore || 0, verdict: "Unknown", reasons: [] };
        }
      }

      const forms = extractForms();
      const hasPasswordForm = forms.some(f => f.hasPassword);
      const formActions = forms.map(f => f.action).filter(Boolean);

      const pageContext = {
        url: PAGE_URL,
        hostname: window.location.hostname,
        title: document.title || "",
        page_text_sample: extractPageText(),
        hasPasswordForm: hasPasswordForm,
        formActions: formActions
      };

      const chatPayload = {
        message: msg,
        conversation_history: conversationHistory.slice(0, -1),
        analysis: {
          risk_score: analysisResult.risk_score || 0,
          verdict: analysisResult.verdict || "Unknown",
          reasons: analysisResult.reasons || []
        },
        page_context: pageContext
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${BACKEND}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatPayload),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (response.ok) {
        const json = await response.json();
        if (json && json.reply) return json.reply;
      }
      throw new Error("Backend chat failed");
    } catch (err) {
      console.error("[CatPhis] Chat backend error:", err);
      return getLocalBotResponse(msg, riskScore, analysisResult?.reasons || []);
    }
  }

  function getLocalBotResponse(msg, riskScore, reasons) {
    const m = msg.toLowerCase().trim();
    const score = riskScore || 0;
    const reasonList = (reasons && reasons.length) ? '\n\nDetected: ' + reasons.slice(0, 2).join('; ') + '.' : '';

    if (m.includes("safe") || m.includes("sigur") || m.includes("legit"))
      return score < 40
        ? "✅ This page looks clean! No phishing signals detected. Stay safe 😺"
        : `⚠️ Risk score is ${score}/100 — don't fully trust this page.${reasonList}`;

    if (m.includes("why") || m.includes("reason") || m.includes("suspicious") || m.includes("explain"))
      return reasons && reasons.length
        ? `🔍 Here's what I found:\n${reasons.map(r => '• ' + r).join('\n')}`
        : "I couldn't find specific issues, but stay cautious on unfamiliar pages.";

    if (m.includes("score") || m.includes("risk") || m.includes("scor") || m.includes("risc"))
      return riskScore != null
        ? `📊 Risk score: ${score}/100. ${score >= 70 ? '⛔ Dangerous — leave now!' : score >= 40 ? '⚠️ Suspicious — be cautious.' : '✅ Looks clean.'}`
        : "Still analyzing this page... ask me again in a moment!";

    if (m.includes("password") || m.includes("parola") || m.includes("login") || m.includes("credentials"))
      return score >= 40
        ? `🚨 Do NOT enter your password here! Risk score is ${score}/100.${reasonList}`
        : "This page seems safe for login, but always double-check the URL bar 🔒";

    if (m.includes("report") || m.includes("flag"))
      return "Use the '🚩 Report Site' button below to report this page to our team!";

    if (m.includes("what should i do") || m.includes("help") || m.includes("ajutor"))
      return score >= 70
        ? "⛔ Leave this page immediately! Don't click anything or enter any info."
        : score >= 40
        ? "⚠️ Be very careful. Avoid entering personal data. You can also report it below."
        : "Looks okay! But always verify the URL and look for HTTPS 🔐";

    if (m.includes("hello") || m.includes("hi") || m.includes("salut") || m.includes("hey"))
      return "Meow! 🐾 I'm CatPhish, your anti-phishing guardian. Ask me anything about this page!";

    const defaults = [
      `I'm actively monitoring this page (score: ${score}/100) 👀`,
      "Meow. Let me sniff around 🐈‍⬛ — try asking 'is this site safe?'",
      "Always scanning for threats 🛡️ Ask me if you should trust this page!",
      "Try: 'why is this suspicious?' or 'can I enter my password here?'",
    ];
    return defaults[Math.floor(Math.random() * defaults.length)];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MASCOT INJECTION
  // ═══════════════════════════════════════════════════════════════════════

  function injectMascot(riskScore, verdict) {
    if (document.getElementById(ROOT_ID)) return;
    injectStyles();

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const positioner = document.createElement("div");
    positioner.className = "catphis-positioner";

    // ── Bubble notification
    const bubble = document.createElement("div");
    bubble.className = "catphis-bubble";
    bubble.style.display = "none";
    if (riskScore != null) {
      if (riskScore >= 70) {
        bubble.textContent = "⛔ Dangerous page detected! Don't enter any info.";
        bubble.style.borderColor = "rgba(239,68,68,.6)";
        bubble.style.display = "block";
      } else if (riskScore >= 40) {
        bubble.textContent = "👀 My whiskers say this page is suspicious. Be careful!";
        bubble.style.borderColor = "rgba(245,158,11,.5)";
        bubble.style.display = "block";
      }
    }

    // ── Chat
    const chat = document.createElement("div");
    chat.className = "catphis-chat";

    const header = document.createElement("div");
    header.className = "catphis-chat-header";

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = "catphis-chat-avatar";
    avatar.textContent = "🐾";

    const infoArea = document.createElement("div");
    infoArea.className = "catphis-chat-header-info";
    const titleEl = document.createElement("div");
    titleEl.className = "catphis-chat-header-title";
    titleEl.textContent = "CatPhish Assistant";
    const subEl = document.createElement("div");
    subEl.className = "catphis-chat-header-sub";
    const dot = document.createElement("span");
    dot.className = "catphis-status-dot";
    subEl.append(dot, document.createTextNode("Anti-phishing AI"));
    infoArea.append(titleEl, subEl);

    const actionsArea = document.createElement("div");
    actionsArea.style.cssText = "display:flex;gap:6px;";

    const clearBtn = document.createElement("button");
    clearBtn.className = "catphis-chat-header-close";
    clearBtn.textContent = "↺";
    clearBtn.title = "New Chat";
    clearBtn.style.fontSize = "18px";
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      conversationHistory = [];
      saveHistory();
      msgArea.innerHTML = "";
      injectRiskCard();
      addMsg("Meow! 🐈‍⬛ I'm CatPhish. Ask me about this page's safety!", "bot");
    };

    const closeBtn = document.createElement("button");
    closeBtn.className = "catphis-chat-header-close";
    closeBtn.textContent = "✕";
    closeBtn.onclick = (e) => { e.stopPropagation(); chat.classList.remove("open"); };

    actionsArea.append(clearBtn, closeBtn);
    header.append(avatar, infoArea, actionsArea);

    const msgArea = document.createElement("div");
    msgArea.className = "catphis-chat-messages";

    function addMsg(text, type) {
      const row = document.createElement("div");
      row.className = `catphis-msg-row ${type === "user" ? "user" : ""}`;

      if (type === "bot") {
        const icon = document.createElement("div");
        icon.className = "catphis-msg-icon";
        icon.textContent = "🐾";
        row.appendChild(icon);
      }

      const el = document.createElement("div");
      el.className = `catphis-msg ${type}`;
      el.textContent = text;
      row.appendChild(el);
      msgArea.appendChild(row);
      msgArea.scrollTop = msgArea.scrollHeight;
    }

    // Helper: inject risk score card at top of messages
    function injectRiskCard() {
      if (riskScore == null) return;
      const level = riskScore >= 70 ? 'danger' : riskScore >= 40 ? 'warn' : 'safe';
      const icons = { safe: '✅', warn: '⚠️', danger: '⛔' };
      const labels = { safe: 'Safe', warn: 'Suspicious', danger: 'Dangerous' };
      const card = document.createElement("div");
      card.className = `catphis-risk-card ${level}`;
      const ttl = document.createElement("div");
      ttl.className = "catphis-risk-card-title";
      ttl.innerHTML = `${icons[level]} <span>${labels[level]}</span> <span style="margin-left:auto;font-weight:400;font-size:12px;">${riskScore}/100</span>`;
      const barBg = document.createElement("div");
      barBg.className = "catphis-risk-bar-bg";
      const barFill = document.createElement("div");
      barFill.className = `catphis-risk-bar-fill ${level}`;
      barFill.style.width = "0%";
      barBg.appendChild(barFill);
      card.append(ttl, barBg);
      if (verdict) {
        const vd = document.createElement("div");
        vd.style.cssText = "font-size:11px;opacity:.7;margin-bottom:5px;";
        vd.textContent = `Verdict: ${verdict}`;
        card.appendChild(vd);
      }
      msgArea.appendChild(card);
      // Animate bar after paint
      requestAnimationFrame(() => requestAnimationFrame(() => { barFill.style.width = riskScore + "%"; }));
    }

    if (conversationHistory.length === 0) {
      injectRiskCard();
      addMsg("Meow! 🐈‍⬛ I'm CatPhish. Ask me about this page's safety!", "bot");
    } else {
      injectRiskCard();
      conversationHistory.forEach(m => addMsg(m.content, m.role === "user" ? "user" : "bot"));
      setTimeout(() => msgArea.scrollTop = msgArea.scrollHeight, 50);
    }
    
    // Expose for external calls (like email scans)
    window.__catphisAddMsg = addMsg;
    window.__catphisInjectRiskCard = injectRiskCard;


    const inputArea = document.createElement("div");
    inputArea.className = "catphis-chat-input-area";
    const input = document.createElement("input");
    input.className = "catphis-chat-input";
    input.placeholder = "Ask me anything...";
    const sendBtn = document.createElement("button");
    sendBtn.className = "catphis-send-btn";
    sendBtn.textContent = "➤";
    sendBtn.title = "Send";

    const quickBtnsArea = document.createElement("div");
    quickBtnsArea.className = "catphis-quick-btns";
    const quickQuestions = [
      "Scan this email",
      "Is this safe?",
      "Why is this email risky?",
      "What should I do?"
    ];

    function showToast(msg, color) {
      const t = document.createElement("div");
      t.className = "catphis-toast";
      t.textContent = msg;
      if (color) t.style.background = color;
      positioner.appendChild(t);
      setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; }, 2200);
      setTimeout(() => t.remove(), 2700);
    }

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      // Lock UI
      input.disabled = true;
      sendBtn.disabled = true;
      addMsg(text, "user");
      conversationHistory.push({ role: "user", content: text });
      saveHistory();
      input.value = "";

      const tRow = document.createElement("div");
      tRow.className = "catphis-msg-row";
      const tIcon = document.createElement("div");
      tIcon.className = "catphis-msg-icon"; tIcon.textContent = "🐾";
      const tBubble = document.createElement("div");
      tBubble.className = "catphis-msg typing";
      [1, 2, 3].forEach(() => {
        const d = document.createElement("div");
        d.className = "catphis-dot";
        tBubble.appendChild(d);
      });
      tRow.append(tIcon, tBubble);
      msgArea.appendChild(tRow);
      msgArea.scrollTop = msgArea.scrollHeight;

      const minDelay = new Promise(r => setTimeout(r, 700 + Math.random() * 400));
      const [reply] = await Promise.all([
        fetchChatResponse(text, riskScore),
        minDelay
      ]);

      tRow.remove();
      addMsg(reply, "bot");
      conversationHistory.push({ role: "assistant", content: reply });
      saveHistory();
      // Unlock UI
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }

    quickQuestions.forEach(q => {
      const btn = document.createElement("button");
      btn.className = "catphis-quick-btn";
      btn.textContent = q;
      btn.onclick = () => { 
        if (q === "Scan this email") {
            if (window.__catphisForceScanEmail) window.__catphisForceScanEmail();
        } else {
            input.value = q; send(); 
        }
      };
      quickBtnsArea.appendChild(btn);
    });

    // Report site chip
    const reportBtn = document.createElement("button");
    reportBtn.className = "catphis-quick-btn";
    reportBtn.textContent = "🚩 Report site";
    reportBtn.style.borderColor = "rgba(239,68,68,.3)";
    reportBtn.style.color = "#fca5a5";
    reportBtn.onclick = async () => {
      reportBtn.disabled = true;
      reportBtn.textContent = "Reporting...";
      try {
        await fetch(`${BACKEND}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: PAGE_URL, description: "Reported via CatPhish extension" })
        });
        showToast("✅ Site reported — thank you!");
      } catch {
        showToast("⚠️ Could not report (backend offline)", "rgba(245,158,11,.9)");
      }
      reportBtn.textContent = "🚩 Reported!";
    };
    quickBtnsArea.appendChild(reportBtn);

    // Scam Message Detector
    const scamBtn = document.createElement("button");
    scamBtn.className = "catphis-quick-btn";
    scamBtn.textContent = "🕵️ Check scam message";
    scamBtn.style.borderColor = "rgba(16,185,129,.3)";
    scamBtn.style.color = "#6ee7b7";
    scamBtn.onclick = async () => {
      scamBtn.disabled = true;
      scamBtn.textContent = "Checking...";

      let msgText = window.getSelection().toString().trim();
      let source = "selected_text";

      if (!msgText) {
        msgText = extractPageText();
        source = "visible_page";
      }

      if (!msgText || msgText.length < 10) {
        msgText = prompt("Please paste the message you want to check for scams:");
        source = "manual_paste";
      }

      if (!msgText) {
        showToast("No message provided.", "rgba(245,158,11,.9)");
        scamBtn.disabled = false;
        scamBtn.textContent = "🕵️ Check scam message";
        return;
      }

      try {
        const analyzeRes = await fetch(`${BACKEND}/analyze-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message_text: msgText,
                page_url: PAGE_URL,
                source: source
            })
        });
        
        let result = null;
        if (analyzeRes.ok) {
            result = await analyzeRes.json();
        } else {
            throw new Error("Backend offline");
        }
        
        handleScamResult(result);
      } catch (err) {
        // Fallback analysis
        const result = fallbackScamAnalysis(msgText);
        handleScamResult(result);
      }

      scamBtn.disabled = false;
      scamBtn.textContent = "🕵️ Check scam message";
    };
    quickBtnsArea.appendChild(scamBtn);

    function fallbackScamAnalysis(text) {
        const t = text.toLowerCase();
        let score = 0;
        let reasons = [];
        
        if (t.match(/mom|dad|son|daughter|mum/) && t.includes("new number")) { score += 80; reasons.push("Family impersonation"); }
        if (t.includes("send money") || t.includes("lost my phone") || t.includes("broken phone") || t.includes("transfer needed")) { score += 60; reasons.push("Emergency money request"); }
        if (t.match(/package|delivery|stuck/) && t.match(/fee|pay|customs/)) { score += 75; reasons.push("Package delivery scam"); }
        if (t.includes("won a prize") || t.includes("claim now") || t.includes("reward") || t.includes("lottery")) { score += 70; reasons.push("Prize scam"); }
        if (t.includes("account is locked") || t.includes("bank account locked")) { score += 85; reasons.push("Bank account lock scam"); }
        if (t.match(/gift card|crypto|bitcoin|wire transfer/)) { score += 50; reasons.push("Request for untraceable payment"); }
        if (t.match(/urgent|immediately|asap|act now/)) { score += 20; reasons.push("Urgent pressure language"); }
        
        score = Math.min(100, score);
        let verdict = "Safe";
        let advice = "This message doesn't trigger our basic scam filters, but always stay alert.";
        if (score >= 70) { verdict = "Scam"; advice = "This looks like a known scam. Do not reply or send money."; }
        else if (score >= 40) { verdict = "Suspicious"; advice = "This message contains suspicious language. Verify the sender's identity."; }
        
        return { risk_score: score, verdict: verdict, reasons: reasons, advice: advice };
    }

    function handleScamResult(result) {
        chrome.storage.local.set({ lastMessageAnalysis: result });
        
        // Update glow
        glow.className = "catphis-glow";
        if (result.risk_score >= 70) glow.classList.add("danger");
        else if (result.risk_score >= 40) glow.classList.add("warn");
        else glow.classList.add("safe");

        // Send a chat message
        const chatMsg = `I checked the message. Verdict: **${result.verdict}** (Score: ${result.risk_score}/100).\n\nAdvice: ${result.advice}`;
        
        if (!chat.classList.contains("open")) {
            chat.classList.add("open");
            bubble.style.display = "none";
        }
        
        addMsg(chatMsg, "bot");
        conversationHistory.push({ role: "assistant", content: chatMsg });
        saveHistory();
    }

    sendBtn.onclick = send;
    input.onkeydown = (e) => { if (e.key === "Enter") send(); };

    inputArea.append(input, sendBtn);
    chat.append(header, msgArea, quickBtnsArea, inputArea);

    // ── Cat wrap
    const catWrap = document.createElement("div");
    catWrap.className = "catphis-cat-wrap catphis-anim-idle";

    const glow = document.createElement("div");
    glow.className = "catphis-glow";
    if (riskScore != null) {
      if (riskScore >= 70) glow.classList.add("danger");
      else if (riskScore >= 40) glow.classList.add("warn");
      else glow.classList.add("safe");
    }

    // Size constants — change here to resize everywhere
    const IDLE_SIZE = "400px";
    const DRAG_SIZE = "250px";

    // SVG container — try to use PNG images first, fall back to inline SVG
    const svgWrap = document.createElement("div");
    svgWrap.className = "catphis-cat-svg-wrap";

    // Try extension image first; onerror falls back to embedded SVG
    const initImgUrl = (() => {
      try { return chrome.runtime.getURL("images/cat_idle.png"); } catch { return null; }
    })();
    const dragImgUrl = (() => {
      try { return chrome.runtime.getURL("images/cat_drag.png"); } catch { return null; }
    })();

    let usingImage = false;
    let imgEl = null;

    if (initImgUrl) {
      imgEl = document.createElement("img");
      imgEl.src = initImgUrl;
      // mix-blend-mode:multiply makes white pixels transparent visually (no Photoshop needed)
      imgEl.style.cssText = "width:100%;height:auto;display:block;pointer-events:none;mix-blend-mode:multiply;";
      imgEl.draggable = false;
      imgEl.onerror = () => {
        // Image not found — fall back to inline SVG
        usingImage = false;
        imgEl.remove();
        svgWrap.innerHTML = SVG_IDLE;
      };
      imgEl.onload = () => {
        if (!usingImage) {
          // First load only: mark as ready and apply idle size
          usingImage = true;
          catWrap.style.width = svgWrap.style.width = IDLE_SIZE;
        }
        // Subsequent onload calls (from setCatIdle/setCatDrag src swaps) — do nothing
      };
      svgWrap.appendChild(imgEl);
    } else {
      svgWrap.innerHTML = SVG_IDLE;
    }

    function setCatIdle() {
      if (usingImage && imgEl && initImgUrl) {
        imgEl.src = initImgUrl;
      } else {
        svgWrap.innerHTML = SVG_IDLE;
      }
    }
    function setCatDrag() {
      if (usingImage && imgEl && dragImgUrl) {
        imgEl.src = dragImgUrl;
      } else {
        svgWrap.innerHTML = SVG_DRAG;
      }
    }

    catWrap.append(glow, svgWrap);
    positioner.append(bubble, chat, catWrap);
    root.append(positioner);
    document.body.append(root);

    // ── Physics & drag
    let isDragging = false;
    let hasMoved = false;
    let startX, startY;
    let translateX = 0, translateY = 0;
    let velocityY = 0;
    let physicsReq = null;

    function applyTransform() {
      positioner.style.transform = `translate(${translateX}px, ${translateY}px)`;
    }

    function fallStep() {
      if (isDragging) return;
      velocityY += 1.6;
      translateY += velocityY;
      if (translateY >= 0) {
        translateY = 0;
        velocityY = 0;
        applyTransform();
        catWrap.classList.add("catphis-anim-idle");
        catWrap.style.width = svgWrap.style.width = IDLE_SIZE;
        setCatIdle();
      } else {
        applyTransform();
        physicsReq = requestAnimationFrame(fallStep);
      }
    }

    catWrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      hasMoved = false;
      if (physicsReq) { cancelAnimationFrame(physicsReq); physicsReq = null; }
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      catWrap.classList.remove("catphis-anim-idle");
      catWrap.style.width = svgWrap.style.width = DRAG_SIZE;
      setCatDrag();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const nx = e.clientX - startX;
      const ny = e.clientY - startY;
      if (Math.abs(nx - translateX) > 3 || Math.abs(ny - translateY) > 3) hasMoved = true;
      translateX = nx;
      translateY = ny;
      applyTransform();
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;

      if (translateY < 0) {
        velocityY = 0;
        physicsReq = requestAnimationFrame(fallStep);
        // size restored in fallStep when cat lands
      } else {
        if (translateY > 0) {
          translateY = 0;
          applyTransform();
        }
        catWrap.classList.add("catphis-anim-idle");
        catWrap.style.width = svgWrap.style.width = IDLE_SIZE;
        setCatIdle();
      }
    });

    // Chat toggle on click (only if not dragged)
    catWrap.addEventListener("click", () => {
      if (!hasMoved) {
        chat.classList.toggle("open");
        if (chat.classList.contains("open")) {
          bubble.style.display = "none";
          setTimeout(() => input.focus(), 60);
        }
      }
    });

    // Random idle micro-animations
    function randomAnim() {
      if (!isDragging && translateY === 0) {
        catWrap.style.animation = "catphis-breathe 3.8s ease-in-out infinite";
      }
      setTimeout(randomAnim, 10000 + Math.random() * 10000);
    }
    setTimeout(randomAnim, 7000);

    // Auto-dismiss bubble
    if (bubble.style.display === "block") {
      setTimeout(() => { bubble.style.transition = "opacity .6s"; bubble.style.opacity = "0"; }, 6000);
      setTimeout(() => { bubble.style.display = "none"; bubble.style.opacity = ""; }, 6700);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EMAIL SCANNER
  // ═══════════════════════════════════════════════════════════════════════
  let emailScanTimeout = null;
  let lastScannedEmailFingerprint = null;
  let currentWebmailState = "inbox";
  let lastEmailScanMsg = "";

  function isWebmailPage() {
    const h = window.location.hostname;
    return h.includes("mail.google.com") || 
           h.includes("outlook.live.com") || 
           h.includes("mail.yahoo.com") ||
           document.querySelector('article, [role="main"]') != null;
  }

  function findVisibleEmailContainer() {
    // If Gmail is just showing the inbox list without an email open, abort
    if (window.location.hostname.includes("mail.google.com")) {
        const hash = window.location.hash.split('/')[0];
        if (hash === "#inbox" && window.location.hash.split('/').length === 1) return null;
    }

    const selectors = [
      '.a3s.aiL', // Gmail strict body
      '[aria-label*="Message body"]', '[role="document"]', 'div[dir="ltr"]', // Outlook
      '[data-test-id="message-view-body"]', '.msg-body', // Yahoo
      'article' // Generic fallback
    ];
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      const visibleEls = els.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.height > 20 && rect.width > 50 && rect.top < window.innerHeight && rect.bottom > 0;
      });
      if (visibleEls.length > 0) {
          return visibleEls.reduce((max, el) => el.getBoundingClientRect().height > max.getBoundingClientRect().height ? el : max, visibleEls[0]);
      }
    }
    return null;
  }

  function extractEmailDataFast(container) {
    let bodyText = container.innerText || "";
    if (bodyText.length > 4000) bodyText = bodyText.substring(0, 4000) + "...";

    let subject = document.title || "";
    let sender = "";
    let senderEmail = "";

    const gmailSubject = document.querySelector('h2.hP, .hP, [data-thread-perm-id]');
    if (gmailSubject) subject = gmailSubject.innerText;
    
    const gmailSender = document.querySelector('[email], [data-hovercard-id], .gD');
    if (gmailSender) {
        senderEmail = gmailSender.getAttribute('email') || gmailSender.getAttribute('data-hovercard-id') || "";
        sender = gmailSender.innerText;
    } else {
        const outlookSubj = document.querySelector('[role="heading"], h1, h2');
        if (outlookSubj) subject = outlookSubj.innerText;
        
        const possibleEmails = document.querySelectorAll('[title*="@"], span[aria-label*="@"], a[href^="mailto:"]');
        if (possibleEmails.length > 0) {
            const el = possibleEmails[0];
            senderEmail = el.getAttribute('title') || el.getAttribute('aria-label') || (el.href || "").replace('mailto:', '');
            sender = el.innerText || senderEmail;
        }
    }

    const links = [];
    const aTags = Array.from(container.querySelectorAll('a'));
    for (const a of aTags) {
        if (links.length >= 25) break;
        const href = a.href || "";
        const text = (a.innerText || "").trim();
        if (href && !href.startsWith("mailto:") && !href.startsWith("javascript:") && !href.startsWith("chrome-extension:") && !href.startsWith("about:")) {
            if (text && text.length > 1) {
                links.push({ href: href, text: text });
            }
        }
    }

    return {
      page_url: PAGE_URL,
      sender: sender.trim(),
      sender_email: senderEmail.trim(),
      subject: subject.trim(),
      body_text: bodyText.trim(),
      links: links
    };
  }

  function getEmailFingerprint(emailData) {
    const s = emailData.sender_email + "|" + emailData.subject + "|" + emailData.body_text.substring(0, 500) + "|" + emailData.links.map(l => l.href).join(',');
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString();
  }

  async function shouldSkipEmailScan(fingerprint, emailData) {
    if (fingerprint === lastScannedEmailFingerprint) return true;
    const data = await new Promise(res => chrome.storage.local.get("emailCache", res));
    const cache = data.emailCache || {};
    if (cache[fingerprint]) {
        lastScannedEmailFingerprint = fingerprint;
        const result = cache[fingerprint];
        updateEmailRiskUI(result);
        addEmailScanMessage(result, "cache", emailData);
        return true;
    }
    return false;
  }

  function saveEmailToCache(fingerprint, result) {
    lastScannedEmailFingerprint = fingerprint;
    chrome.storage.local.get("emailCache", data => {
        const cache = data.emailCache || {};
        cache[fingerprint] = result;
        const keys = Object.keys(cache);
        if (keys.length > 50) delete cache[keys[0]];
        chrome.storage.local.set({ emailCache: cache });
    });
  }

  function quickLocalEmailPrecheck(emailData) {
    if (emailData.links.length === 0) {
        const urgentWords = ["urgent", "verify", "suspended", "locked", "immediate", "expire", "action required"];
        const credWords = ["password", "login", "sign in", "account", "card", "payment"];
        const bodyL = emailData.body_text.toLowerCase();
        if (!urgentWords.some(w => bodyL.includes(w)) && !credWords.some(w => bodyL.includes(w))) {
            return {
                risk_score: 0, verdict: "Safe", reasons: ["No links and no suspicious keywords found."], dangerous_links: []
            };
        }
    }
    return null;
  }

  function localEmailFallbackAnalysis(emailData) {
    let score = 0;
    let reasons = [];
    let dangerous_links = [];

    const urgentWords = ["urgent", "verify now", "account suspended", "locked", "immediate", "expire", "action required", "limited access", "unusual activity", "password expires", "payment failed"];
    const credWords = ["password", "login", "sign in", "account", "card", "payment", "billing", "bank account"];
    const suspUrls = ["login", "verify", "secure", "account", "update"];
    const shortUrls = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly"];
    const brands = ["paypal", "google", "microsoft", "apple", "facebook", "meta", "instagram", "netflix", "amazon", "dhl", "fedex", "bank"];

    const subj = emailData.subject.toLowerCase();
    const body = emailData.body_text.toLowerCase();
    const sEmail = emailData.sender_email.toLowerCase();
    const sName = emailData.sender.toLowerCase();

    if (urgentWords.some(w => subj.includes(w) || body.includes(w))) {
        score += 25; reasons.push("Urgent or threatening language detected");
    }
    if (credWords.some(w => body.includes(w))) {
        score += 15; reasons.push("Requests credentials or sensitive information");
    }
    if (brands.some(b => sName.includes(b) && !sEmail.includes(b))) {
        score += 30; reasons.push("Sender name mimics a brand but email address does not match");
    }

    emailData.links.forEach(link => {
        const h = link.href.toLowerCase();
        const t = link.text.toLowerCase();
        
        let looksLikeUrl = t.includes(".") && !t.includes(" ");
        if (looksLikeUrl) {
            let tDomain = t.replace('http://', '').replace('https://', '').split('/')[0];
            let hDomain = h.replace('http://', '').replace('https://', '').split('/')[0];
            if (tDomain && hDomain && tDomain !== hDomain) {
                score += 40; reasons.push("Link text destination mismatch (spoofed link)"); dangerous_links.push(link.href);
            }
        }

        let linkDomain = h.replace('http://', '').replace('https://', '').split('/')[0] || "";

        if (h.startsWith("http") && linkDomain.includes("@")) {
            score += 75; reasons.push("URL obfuscation detected (credentials in link)"); dangerous_links.push(link.href);
        }
        
        brands.forEach(b => {
            if (linkDomain.includes(b) && linkDomain !== `${b}.com`) {
                score += 40; reasons.push("Link domain mimics a brand"); dangerous_links.push(link.href);
            }
        });

        if (shortUrls.some(s => h.includes(s))) {
            score += 20; reasons.push("Contains shortened URLs"); dangerous_links.push(link.href);
        } else if (suspUrls.some(s => h.includes(s))) {
            score += 15; reasons.push("Suspicious keywords in links"); dangerous_links.push(link.href);
        }
    });

    reasons = [...new Set(reasons)];
    dangerous_links = [...new Set(dangerous_links)];
    score = Math.min(100, score);

    let verdict = "Safe";
    if (score >= 70) verdict = "Phishing";
    else if (score >= 40) verdict = "Suspicious";
    
    if (reasons.length === 0) reasons.push("Email looks mostly safe");

    return { risk_score: score, verdict, reasons, dangerous_links };
  }

  async function analyzeEmailWithTimeout(emailData) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`${BACKEND}/analyze-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailData),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) return await response.json();
    } catch (e) {
      clearTimeout(timeoutId);
    }
    return null;
  }

  function updateEmailRiskUI(result, isLoading = false) {
    const glow = document.querySelector('.catphis-glow');
    if (!glow) return;
    glow.className = "catphis-glow";
    if (isLoading) {
        glow.classList.add("loading");
    } else {
        if (result.risk_score >= 70) glow.classList.add("danger");
        else if (result.risk_score >= 40) glow.classList.add("warn");
        else glow.classList.add("safe");
    }
  }

  function addEmailScanMessage(result, source, emailData) {
    if (!window.__catphisAddMsg) return;
    let msg = "";
    
    if (emailData && emailData.subject) {
        msg += `[Scanning: "${emailData.subject.substring(0, 30)}..."]\n`;
    }

    if (source === "local_fallback") {
        msg += "I did a quick local scan first. I’ll update if deeper analysis finds more.\n";
    }
    if (result.risk_score < 40) {
        msg += "This email looks mostly safe. I did not find strong phishing signals, but still check links before clicking. ✅";
    } else if (result.risk_score < 70) {
        msg += `This email looks suspicious. I found signs like: ${result.reasons.slice(0,2).join(', ')}. Be careful before clicking links. ⚠️`;
    } else {
        msg += `This email looks dangerous. I found signs like: ${result.reasons.slice(0,2).join(', ')}. Do not click links or enter passwords. 🚫`;
    }
    
    // Don't repeat the exact same message for the same email
    let shouldAddChatMsg = (msg !== lastEmailScanMsg);
    
    if (shouldAddChatMsg) {
        lastEmailScanMsg = msg;
        window.__catphisAddMsg(msg, "bot");
    }
    
    const chat = document.querySelector('.catphis-chat');
    const bubble = document.querySelector('.catphis-bubble');
    if (chat && !chat.classList.contains("open") && bubble) {
        bubble.textContent = result.risk_score >= 70 ? "⛔ Dangerous email detected!" : "⚠️ Suspicious email detected!";
        if (result.risk_score < 40) bubble.textContent = "✅ Email scanned: Looks safe.";
        bubble.style.borderColor = result.risk_score >= 70 ? "rgba(239,68,68,.6)" : (result.risk_score >= 40 ? "rgba(245,158,11,.5)" : "rgba(16,185,129,.5)");
        bubble.style.display = "block";
        setTimeout(() => { bubble.style.transition = "opacity .6s"; bubble.style.opacity = "0"; }, 6000);
        setTimeout(() => { bubble.style.display = "none"; bubble.style.opacity = ""; }, 6700);
    }
  }
  
  window.__catphisForceScanEmail = () => {
      lastScannedEmailFingerprint = null;
      scheduleEmailScan("manual");
  };

  async function performEmailScan(reason) {
    const container = findVisibleEmailContainer();
    if (!container) {
        if (currentWebmailState === "email") {
            // We just left an email and went back to inbox. Reset UI.
            currentWebmailState = "inbox";
            lastScannedEmailFingerprint = null;
            if (window.__catphisPageRiskResult) {
                updateEmailRiskUI(window.__catphisPageRiskResult);
            }
        }
        if (reason === "manual" && window.__catphisAddMsg) window.__catphisAddMsg("I couldn't find an open email to scan. Please open one first!", "bot");
        return;
    }

    currentWebmailState = "email";
    const emailData = extractEmailDataFast(container);
    if ((!emailData.body_text || emailData.body_text.length < 10) && emailData.links.length === 0) return;

    const fingerprint = getEmailFingerprint(emailData);
    if (reason !== "manual" && await shouldSkipEmailScan(fingerprint, emailData)) return;

    if (reason === "manual" && window.__catphisAddMsg) window.__catphisAddMsg("Scanning email...", "bot");
    updateEmailRiskUI(null, true);

    let result = quickLocalEmailPrecheck(emailData);
    let source = "local_precheck";

    if (!result) {
        result = await analyzeEmailWithTimeout(emailData);
        source = "backend";
        if (!result) {
            result = localEmailFallbackAnalysis(emailData);
            source = "local_fallback";
        }
    }

    saveEmailToCache(fingerprint, result);
    updateEmailRiskUI(result);
    addEmailScanMessage(result, source, emailData);
  }

  function scheduleEmailScan(reason) {
      if (reason === "manual" || reason === "navigation") {
          setTimeout(() => performEmailScan(reason), 50);
      } else if (window.requestIdleCallback) {
          window.requestIdleCallback(() => performEmailScan(reason), { timeout: 500 });
      } else {
          setTimeout(() => performEmailScan(reason), 200);
      }
  }

  function startEmailWatcher() {
    scheduleEmailScan("init");
    
    // Watch DOM mutations
    const observer = new MutationObserver(() => {
      if (emailScanTimeout) clearTimeout(emailScanTimeout);
      emailScanTimeout = setTimeout(() => scheduleEmailScan("mutation"), 300);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Watch SPA navigation (e.g. Gmail changing hash from #inbox to #inbox/1234)
    window.addEventListener("hashchange", () => {
        lastScannedEmailFingerprint = null; // Force check
        scheduleEmailScan("navigation");
    });
    window.addEventListener("popstate", () => {
        lastScannedEmailFingerprint = null;
        scheduleEmailScan("navigation");
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════════════════════

  async function run() {
    await loadHistory();
    const payload = {
      url: PAGE_URL,
      page_title: document.title || "",
      page_text: extractPageText(),
      forms: extractForms(),
    };

    // Show cat immediately — no score yet
    injectMascot(null, null);

    try {
      const result = await analyzeWithBackend(payload);
      if (!result) { saveResult(null, false); return; }
      saveResult(result, true);

      // Re-inject with glow + bubble
      const root = document.getElementById(ROOT_ID);
      if (root) {
        root.remove();
        window.__catphisRan = false;
        window.__catphisRan = true;
        window.__catphisPageRiskResult = result;
        injectMascot(result.risk_score, result.verdict);
      }
      
      // Start Email Watcher if we are on a webmail page
      if (isWebmailPage()) {
          startEmailWatcher();
      }

    } catch (err) {
      console.error("[CatPhis] Error:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    setTimeout(run, 500);
  }

})();
