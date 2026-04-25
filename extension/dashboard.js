// ── Family Safety Dashboard ──────────────────────────────────────────────────

const TYPE_ICONS = {
  website:  "🌍",
  email:    "📧",
  message:  "💬",
  shopping: "🛒",
  link:     "🔗"
};

let allEvents = [];
let activeFilter = "all";

function riskClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderSummary(events) {
  const total = events.length;
  const high = events.filter(e => e.risk_score >= 70).length;
  const medium = events.filter(e => e.risk_score >= 40 && e.risk_score < 70).length;
  const safe = events.filter(e => e.risk_score < 40).length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statHigh").textContent = high;
  document.getElementById("statMedium").textContent = medium;
  document.getElementById("statSafe").textContent = safe;
}

function renderEvents(events) {
  const list = document.getElementById("eventsList");
  const title = document.getElementById("sectionTitle");

  const filtered = activeFilter === "all"
    ? events
    : events.filter(e => e.type === activeFilter);

  title.textContent = `${filtered.length} event${filtered.length !== 1 ? "s" : ""} ${activeFilter !== "all" ? "— " + activeFilter : ""}`;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-cat">🐱</div>
        <div class="empty-title">Nothing to show yet</div>
        <div class="empty-sub">When CatPhish detects something suspicious,<br>it will appear here automatically.</div>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((e, i) => {
    const rc = riskClass(e.risk_score);
    const icon = TYPE_ICONS[e.type] || "🔍";
    const reasons = (e.reasons || []).slice(0, 3).map(r =>
      `<span class="reason-tag">${r}</span>`).join("");
    const typeBadge = `<span class="type-badge type-${e.type}">${e.type}</span>`;

    return `
    <div class="event-card risk-${rc}" style="animation-delay:${i * 30}ms">
      <div class="event-icon risk-${rc}">${icon}</div>
      <div class="event-body">
        ${typeBadge}
        <div class="event-title">${escapeHtml(e.title || e.url || "Unknown")}</div>
        <div class="event-url">${escapeHtml(e.url || "")}</div>
        <div class="event-reasons">${reasons}</div>
        ${e.advice ? `<div class="event-advice">💡 ${escapeHtml(e.advice)}</div>` : ""}
      </div>
      <div class="event-meta">
        <div class="event-score risk-${rc}">${e.risk_score}</div>
        <div class="event-verdict">${escapeHtml(e.verdict || "")}</div>
        <div class="event-time">${formatTime(e.timestamp)}</div>
      </div>
    </div>`;
  }).join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function load() {
  chrome.storage.local.get("familySafetyLog", (data) => {
    allEvents = (data.familySafetyLog || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderSummary(allEvents);
    renderEvents(allEvents);
  });
}

// ── Filters ──
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderEvents(allEvents);
  });
});

// ── Clear history ──
document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  if (confirm("Are you sure you want to clear the entire safety history? This cannot be undone.")) {
    chrome.storage.local.set({ familySafetyLog: [] }, () => {
      allEvents = [];
      renderSummary([]);
      renderEvents([]);
    });
  }
});

// ── Auto-refresh every 10 sec in case another tab logs something ──
setInterval(load, 10000);

// ── Init ──
load();
