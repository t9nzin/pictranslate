import { startObserving, stopObserving } from "./image-observer";
import { renderOverlays, removeAllOverlays } from "./overlay-renderer";
import {
  Message,
  TranslationResult,
  ExtensionSettings,
  DEFAULT_SETTINGS,
} from "@/types/messages";

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let active = false;

function showLoading(img: HTMLImageElement) {
  // Use a body-level positioned spinner — never modify existing elements
  const rect = img.getBoundingClientRect();
  const spinner = document.createElement("div");
  spinner.className = "pictranslate-loading";
  spinner.dataset.pictranslateFor = img.src;
  spinner.style.position = "absolute";
  spinner.style.top = rect.top + window.scrollY + 8 + "px";
  spinner.style.left = rect.right + window.scrollX - 32 + "px";
  document.body.appendChild(spinner);
}

function hideLoading(img: HTMLImageElement) {
  const spinner = document.querySelector(
    `[data-pictranslate-for="${CSS.escape(img.src)}"]`
  );
  spinner?.remove();
}

async function processBatch(images: HTMLImageElement[]) {
  if (images.length === 0) return;

  const imageUrls = [...new Set(images.map((img) => img.src).filter(Boolean))];
  const urlToImgs = new Map<string, HTMLImageElement[]>();
  for (const img of images) {
    if (!img.src) continue;
    const list = urlToImgs.get(img.src) || [];
    list.push(img);
    urlToImgs.set(img.src, list);
  }

  console.log(
    `[PicTranslate] processBatch: ${imageUrls.length} unique URLs from ${images.length} images`
  );

  images.forEach(showLoading);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "PROCESS_BATCH",
      imageUrls,
      targetLang: settings.targetLang,
    } satisfies Message);

    console.log("[PicTranslate] Got response:", response?.type);

    if (response?.type === "BATCH_RESULT") {
      const results: Record<string, TranslationResult> = response.results;
      let totalRegions = 0;
      for (const [url, result] of Object.entries(results)) {
        totalRegions += result.regions.length;
        const imgs = urlToImgs.get(url);
        if (imgs) {
          for (const img of imgs) {
            renderOverlays(img, result);
          }
        }
      }
      console.log(
        `[PicTranslate] Rendered ${totalRegions} translated regions across ${Object.keys(results).length} images`
      );
    } else if (response?.type === "BATCH_ERROR") {
      console.warn("[PicTranslate] Batch error:", response.error);
    } else {
      console.warn("[PicTranslate] Unexpected response:", response);
    }
  } catch (err) {
    console.warn("[PicTranslate] Failed to process batch:", err);
  } finally {
    images.forEach(hideLoading);
  }
}

function activate() {
  if (active) return;
  active = true;
  startObserving(processBatch);
}

function deactivate() {
  active = false;
  stopObserving();
  removeAllOverlays();
}

async function init() {
  const stored = await chrome.storage.sync.get("pt_settings");
  if (stored.pt_settings) {
    settings = { ...DEFAULT_SETTINGS, ...stored.pt_settings };
  }
  // Do NOT auto-start — wait for user to click "Translate Images on Page"
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.pt_settings) {
    settings = { ...DEFAULT_SETTINGS, ...changes.pt_settings.newValue };
  }
});

// Only activate when explicitly triggered from the popup
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === "TOGGLE_EXTENSION") {
    if (message.enabled) {
      activate();
    } else {
      deactivate();
    }
  }
});

init();
