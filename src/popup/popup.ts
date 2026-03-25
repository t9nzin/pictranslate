import { ExtensionSettings, DEFAULT_SETTINGS, Message } from "@/types/messages";

const toggleEnabled = document.getElementById(
  "toggle-enabled"
) as HTMLInputElement;
const targetLang = document.getElementById("target-lang") as HTMLSelectElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const statusDiv = document.querySelector(".status") as HTMLDivElement;
const translateBtn = document.getElementById(
  "translate-page"
) as HTMLButtonElement;

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  const stored = await chrome.storage.sync.get("pt_settings");
  settings = { ...DEFAULT_SETTINGS, ...stored.pt_settings };

  toggleEnabled.checked = settings.enabled;
  targetLang.value = settings.targetLang;

  updateStatus();
}

async function saveSettings() {
  settings.enabled = toggleEnabled.checked;
  settings.targetLang = targetLang.value;

  await chrome.storage.sync.set({ pt_settings: settings });
  updateStatus();
}

function updateStatus() {
  if (!settings.enabled) {
    statusText.textContent = "Disabled";
    statusDiv.className = "status";
  } else {
    statusText.textContent = "Ready";
    statusDiv.className = "status";
  }
}

// Event listeners
toggleEnabled.addEventListener("change", async () => {
  await saveSettings();

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_EXTENSION",
      enabled: toggleEnabled.checked,
    } satisfies Message);
  }
});

targetLang.addEventListener("change", saveSettings);

translateBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_EXTENSION",
      enabled: true,
    } satisfies Message);

    statusText.textContent = "Translating...";
    translateBtn.textContent = "Translating...";
    translateBtn.disabled = true;

    setTimeout(() => {
      translateBtn.textContent = "Translate Images on Page";
      translateBtn.disabled = false;
    }, 3000);
  }
});

loadSettings();
