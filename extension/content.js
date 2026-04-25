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
    return (document.body.innerText || "").trim().slice(0, TEXT_LIMIT);
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
    style.textContent = `
      #catphis-root * { box-sizing: border-box; margin: 0; padding: 0; }
      #catphis-root {
        all: initial;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483646;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
      }
      .catphis-positioner {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: none;
        will-change: transform;
      }
      .catphis-cat-wrap {
        pointer-events: all;
        cursor: grab;
        position: relative;
        width: 130px;
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
        width: 130px;
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

      /* idle breathing */
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
        pointer-events: none;
        background: linear-gradient(135deg, #1e1b2e, #12101f);
        border: 1px solid rgba(167,139,250,.35);
        border-radius: 8px 8px 2px 8px;
        padding: 12px 16px;
        max-width: 240px;
        font-size: 13px;
        color: #ddd6fe;
        line-height: 1.5;
        box-shadow: 0 6px 24px rgba(0,0,0,.6);
        position: relative;
      }
      .catphis-bubble::after {
        content:""; position:absolute; bottom:-8px; right:32px;
        border:4px solid transparent; border-top-color:rgba(167,139,250,.35);
      }

      .catphis-chat {
        pointer-events: all;
        width: 360px;
        background: rgba(18, 14, 28, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(139, 92, 246, 0.4);
        border-radius: 16px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.8), 0 0 20px rgba(139, 92, 246, 0.15);
        overflow: hidden;
        display: none;
        flex-direction: column;
        max-height: 560px;
      }
      .catphis-chat.open { display:flex; animation: catphis-pop-in .3s cubic-bezier(.4,0,.2,1) both; }

      .catphis-chat-header {
        background: linear-gradient(135deg, #4c1d95, #6d28d9);
        padding: 16px 18px; display:flex; align-items:center; gap:12px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .catphis-chat-header-info { flex:1; display:flex; flex-direction:column; }
      .catphis-chat-header-title { font-size:15px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px; }
      .catphis-chat-header-subtitle { font-size:11px; color:#c4b5fd; margin-top:2px; font-weight:500; }
      
      .catphis-chat-header-clear, .catphis-chat-header-close {
        cursor:pointer; font-size:14px; color:rgba(255,255,255,.8);
        width: 28px; height: 28px; border:none; background:rgba(255,255,255,0.1);
        border-radius:8px; display: flex; align-items: center; justify-content: center;
        transition:color .2s, background .2s, transform .2s;
      }
      .catphis-chat-header-clear:hover, .catphis-chat-header-close:hover { 
        color:#fff; background:rgba(255,255,255,.2); transform:scale(1.05); 
      }

      .catphis-chat-messages {
        flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column;
        gap:12px; min-height:250px; max-height:350px; scrollbar-width:thin;
        scrollbar-color: rgba(139,92,246,.4) transparent;
      }
      .catphis-chat-messages::-webkit-scrollbar { width: 6px; }
      .catphis-chat-messages::-webkit-scrollbar-thumb { background: rgba(139,92,246,.4); border-radius: 3px; }
      
      .catphis-msg {
        max-width:85%; padding:12px 16px; border-radius:12px; font-size:14px; line-height:1.5;
        animation: catphis-pop-in .2s ease both; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        word-wrap: break-word;
      }
      .catphis-msg.bot  { align-self:flex-start; background:rgba(109,40,217,.2); border:1px solid rgba(139,92,246,.3); color:#e9d5ff; border-radius:4px 16px 16px 16px; }
      .catphis-msg.user { align-self:flex-end; background:linear-gradient(135deg,#6d28d9,#8b5cf6); color:#fff; border-radius:16px 4px 16px 16px; border:1px solid rgba(255,255,255,0.1); }
      .catphis-msg.typing { align-self:flex-start; font-style:italic; color:#a78bfa; background:none; font-size:13px; box-shadow:none; border:none; padding:8px 12px; }

      .catphis-chat-input-area { display:flex; gap:10px; padding:16px; border-top:1px solid rgba(139,92,246,.2); background: rgba(0,0,0,0.2); }
      .catphis-chat-input {
        flex:1; background:rgba(0,0,0,.3); border:1px solid rgba(139,92,246,.4);
        border-radius:12px; padding:12px 16px; color:#fff; font-size:14px;
        transition:border-color .2s, box-shadow .2s; outline:none; font-family:inherit; min-width:0;
      }
      .catphis-chat-input::placeholder { color: #a78bfa; opacity: 0.6; }
      .catphis-chat-input:focus { border-color:#8b5cf6; box-shadow: 0 0 0 2px rgba(139,92,246,.2); }
      .catphis-chat-input:disabled { opacity: 0.6; cursor: not-allowed; }
      
      .catphis-send-btn {
        cursor:pointer; background:linear-gradient(135deg,#6d28d9,#8b5cf6);
        color:#fff; border-radius:12px; padding:0 20px; font-weight:600; font-size:14px;
        transition:opacity .2s, transform .1s, box-shadow .2s; border:none; outline:none; font-family:inherit;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(109,40,217,0.4);
      }
      .catphis-send-btn:hover { opacity:.9; box-shadow: 0 6px 16px rgba(109,40,217,0.6); transform:translateY(-1px); }
      .catphis-send-btn:active { transform:translateY(1px); box-shadow: 0 2px 8px rgba(109,40,217,0.4); }
      .catphis-send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

      .catphis-quick-btns {
        display: flex; gap: 8px; padding: 0 16px 12px; flex-wrap: wrap;
        border-top: 1px solid rgba(139,92,246,.1); background: rgba(0,0,0,0.1); padding-top:12px;
      }
      .catphis-quick-btn {
        background: rgba(139,92,246,.15);
        border: 1px solid rgba(139,92,246,.3);
        color: #e9d5ff; border-radius: 14px; padding: 6px 12px;
        font-size: 12px; cursor: pointer; transition: all .2s;
        font-family: inherit; font-weight: 500;
      }
      .catphis-quick-btn:hover { background: rgba(139,92,246,.4); color: #fff; transform:translateY(-1px); }
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
    try {
      let analysisResult = null;
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
      return getLocalBotResponse(msg, riskScore);
    }
  }

  function getLocalBotResponse(msg, riskScore) {
    const m = msg.toLowerCase().trim();
    if (m.includes("safe") || m.includes("sigur"))
      return (riskScore || 0) < 40 ? "Looks safe to me 😺 No suspicious signals here." : "Score is " + (riskScore || 0) + "/100 — be careful! 🐾";
    if (m.includes("phishing") || m.includes("pericol") || m.includes("suspicious"))
      return "That smells like phishing 🐟 Don't enter passwords on this page!";
    if (m.includes("score") || m.includes("scor") || m.includes("risc") || m.includes("risk"))
      return riskScore != null
        ? `Risk score: ${riskScore}/100. ${riskScore >= 70 ? "⛔ Dangerous!" : riskScore >= 40 ? "⚠️ Be cautious." : "✅ Looks clean."}`
        : "Still analyzing... ask me again in a moment!";
    if (m.includes("help") || m.includes("ajutor") || m.includes("what should i do"))
      return "Ask me: 'is this site safe?', 'why is it suspicious?', or 'can I enter my password?'. I'm always watching 👀";
    if (m.includes("hello") || m.includes("salut") || m.includes("hi"))
      return "Meow! 🐾 I'm CatPhish, your security guardian. How can I help?";
    if (m.includes("password") || m.includes("parola"))
      return "⚠️ Never enter your password on suspicious pages! Check the score first.";
    const defaults = [
      "I'm watching this page for you... 👀",
      "Meow. Let me sniff around 🐈‍⬛",
      "Always scanning for threats 🛡️ Ask me if this is safe!",
      "Try: 'is this site safe?' or 'why is it suspicious?'",
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
    
    const infoArea = document.createElement("div");
    infoArea.className = "catphis-chat-header-info";
    infoArea.innerHTML = `
      <div class="catphis-chat-header-title">
        <span>CatPhish Assistant</span>
        <span style="font-size:16px;">🐾</span>
      </div>
      <div class="catphis-chat-header-subtitle">Your anti-phishing buddy</div>
    `;
    
    const actionsArea = document.createElement("div");
    actionsArea.style.display = "flex";
    actionsArea.style.gap = "8px";
    
    const clearBtn = document.createElement("button");
    clearBtn.className = "catphis-chat-header-clear";
    clearBtn.textContent = "🔄";
    clearBtn.title = "New Chat";
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      conversationHistory = [];
      saveHistory();
      msgArea.innerHTML = "";
      addMsg("Meow! 🐈‍⬛ I'm CatPhish. Ask me about this page's safety!", "bot");
    };

    const closeBtn = document.createElement("button");
    closeBtn.className = "catphis-chat-header-close";
    closeBtn.innerHTML = "✕";
    closeBtn.onclick = (e) => { e.stopPropagation(); chat.classList.remove("open"); };
    
    actionsArea.append(clearBtn, closeBtn);
    header.append(infoArea, actionsArea);

    const msgArea = document.createElement("div");
    msgArea.className = "catphis-chat-messages";

    function addMsg(text, type) {
      const el = document.createElement("div");
      el.className = `catphis-msg ${type}`;
      el.textContent = text;
      msgArea.appendChild(el);
      msgArea.scrollTop = msgArea.scrollHeight;
    }
    
    if (conversationHistory.length === 0) {
      addMsg("Meow! 🐈‍⬛ I'm CatPhish. Ask me about this page's safety!", "bot");
    } else {
      conversationHistory.forEach(m => addMsg(m.content, m.role === "user" ? "user" : "bot"));
      setTimeout(() => msgArea.scrollTop = msgArea.scrollHeight, 50);
    }

    const inputArea = document.createElement("div");
    inputArea.className = "catphis-chat-input-area";
    const input = document.createElement("input");
    input.className = "catphis-chat-input";
    input.placeholder = "Ask me anything...";
    const sendBtn = document.createElement("button");
    sendBtn.className = "catphis-send-btn";
    sendBtn.textContent = "Send";

    const quickBtnsArea = document.createElement("div");
    quickBtnsArea.className = "catphis-quick-btns";
    const quickQuestions = [
      "Is this website safe?",
      "Why is this website suspicious?",
      "Can I enter my password here?",
      "What should I do now?"
    ];

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      addMsg(text, "user");
      input.value = "";
      sendBtn.disabled = true;
      input.disabled = true;

      conversationHistory.push({ role: "user", content: text });
      saveHistory();

      const t = document.createElement("div");
      t.className = "catphis-msg typing";
      t.textContent = "CatPhish is thinking...";
      msgArea.appendChild(t);
      msgArea.scrollTop = msgArea.scrollHeight;

      const reply = await fetchChatResponse(text, riskScore);
      
      t.remove();
      addMsg(reply, "bot");
      
      conversationHistory.push({ role: "assistant", content: reply });
      saveHistory();

      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }

    quickQuestions.forEach(q => {
      const btn = document.createElement("button");
      btn.className = "catphis-quick-btn";
      btn.textContent = q;
      btn.onclick = () => {
        input.value = q;
        send();
      };
      quickBtnsArea.appendChild(btn);
    });

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
        usingImage = true;
        // When using real PNG — make the wrap a bit wider for better look
        catWrap.style.width = "130px";
        svgWrap.style.width = "130px";
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
      velocityY += 1.6; // gravity
      translateY += velocityY;
      if (translateY >= 0) {
        translateY = 0;
        velocityY = 0;
        applyTransform();
        catWrap.classList.add("catphis-anim-idle");
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
      } else {
        translateX = 0;
        translateY = 0;
        applyTransform();
        catWrap.classList.add("catphis-anim-idle");
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
        injectMascot(result.risk_score, result.verdict);
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
