// ── CatPhish Appearance Settings ─────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  mascotVisible: true,
  mascotSize:    "medium",
  chatTheme:     "dark",
  fontFamily:    "inter",
  fontSize:      "medium"
};

let settings = { ...DEFAULT_SETTINGS };

// ── Load settings ─────────────────────────────────────────────────────────────
function loadSettings(cb) {
  chrome.storage.local.get("catphishSettings", (data) => {
    if (data.catphishSettings) {
      settings = { ...DEFAULT_SETTINGS, ...data.catphishSettings };
    }
    cb();
  });
}

// ── Save & broadcast to active tab ────────────────────────────────────────────
function saveAndApply() {
  chrome.storage.local.set({ catphishSettings: settings }, () => {
    // Send message to active tab to apply live
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "CATPHISH_SETTINGS_CHANGED",
          settings: settings
        });
      }
    });
    // Show save notice
    const notice = document.getElementById("saveNotice");
    notice.classList.add("show");
    setTimeout(() => notice.classList.remove("show"), 2000);
  });
}

// ── Update preview ────────────────────────────────────────────────────────────
function updatePreview() {
  const cat  = document.getElementById("previewCat");
  const chat = document.getElementById("previewChat");

  // Mascot visibility
  cat.style.opacity = settings.mascotVisible ? "1" : "0.15";
  cat.style.filter  = settings.mascotVisible ? "" : "grayscale(1)";

  // Mascot size
  cat.className = `preview-cat size-${settings.mascotSize}`;

  // Chat theme
  chat.className = [
    "preview-chat-box",
    settings.chatTheme,
    `font-${settings.fontFamily}`,
    `text-${settings.fontSize}`
  ].join(" ");
}

// ── Sync UI controls to current settings ──────────────────────────────────────
function syncControls() {
  // Toggle
  document.getElementById("mascotVisible").checked = settings.mascotVisible;

  // Option groups
  document.querySelectorAll("#mascotSizeGroup .option-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.val === settings.mascotSize);
  });
  document.querySelectorAll("#chatThemeGroup .option-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.val === settings.chatTheme);
  });
  document.querySelectorAll("#fontFamilyGroup .option-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.val === settings.fontFamily);
  });
  document.querySelectorAll("#fontSizeGroup .option-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.val === settings.fontSize);
  });

  updatePreview();
}

// ── Wire toggle ───────────────────────────────────────────────────────────────
document.getElementById("mascotVisible").addEventListener("change", (e) => {
  settings.mascotVisible = e.target.checked;
  updatePreview();
  saveAndApply();
});

// ── Wire option groups ────────────────────────────────────────────────────────
function wireGroup(groupId, settingKey) {
  document.getElementById(groupId).addEventListener("click", (e) => {
    const btn = e.target.closest(".option-btn");
    if (!btn) return;
    settings[settingKey] = btn.dataset.val;
    document.querySelectorAll(`#${groupId} .option-btn`).forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    updatePreview();
    saveAndApply();
  });
}

wireGroup("mascotSizeGroup",   "mascotSize");
wireGroup("chatThemeGroup",    "chatTheme");
wireGroup("fontFamilyGroup",   "fontFamily");
wireGroup("fontSizeGroup",     "fontSize");

// ── Init ──────────────────────────────────────────────────────────────────────
loadSettings(syncControls);
