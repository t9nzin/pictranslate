import { translateTexts } from "@/services/translation/google-translate";
import {
  Message,
  TranslationResult,
  ExtensionSettings,
  DEFAULT_SETTINGS,
  OcrResult,
} from "@/types/messages";

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get("pt_settings");
  return { ...DEFAULT_SETTINGS, ...stored.pt_settings };
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

// Offscreen document management — serialized with a promise lock
let offscreenReady: Promise<void> | null = null;

function ensureOffscreen(): Promise<void> {
  if (!offscreenReady) {
    offscreenReady = (async () => {
      try {
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        });
        if (existingContexts.length > 0) return;
      } catch {
        // getContexts might not be available in older Chrome
      }

      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Run Tesseract.js OCR on images",
      });
    })();
  }
  return offscreenReady;
}

async function performOcr(imageBase64: string): Promise<OcrResult> {
  await ensureOffscreen();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "OCR_REQUEST",
        imageBase64,
        requestId: crypto.randomUUID(),
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`OCR message error: ${chrome.runtime.lastError.message}`));
          return;
        }
        if (!response) {
          reject(new Error("OCR returned no response"));
          return;
        }
        if (response.type === "OCR_ERROR") {
          reject(new Error(`OCR error: ${response.error}`));
          return;
        }
        resolve(response);
      }
    );
  });
}

// Process a batch of images: OCR all, translate all text in one request, map back
async function processBatch(
  imageUrls: string[],
  targetLang: string
): Promise<Record<string, TranslationResult>> {
  console.log(`[PicTranslate] processBatch: ${imageUrls.length} images, lang=${targetLang}`);

  // Ensure offscreen is ready before starting OCR
  await ensureOffscreen();

  // Step 1: Fetch and OCR all images ONE AT A TIME (Tesseract is CPU-heavy)
  const ocrResults = new Map<string, OcrResult>();

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    try {
      const imageBase64 = await fetchImageAsBase64(url);
      const ocr = await performOcr(imageBase64);
      ocrResults.set(url, ocr);
      if ((i + 1) % 10 === 0 || i === imageUrls.length - 1) {
        console.log(`[PicTranslate] OCR progress: ${i + 1}/${imageUrls.length}`);
      }
    } catch (err) {
      console.warn(`[PicTranslate] Failed image ${i + 1}/${imageUrls.length} (${url.slice(0, 80)}):`, err);
    }
  }

  // Step 2: Collect all text regions from all images into a flat list
  const allTexts: string[] = [];
  const textMap: Array<{ url: string; regionIndex: number }> = [];

  for (const [url, ocr] of ocrResults) {
    for (let i = 0; i < ocr.regions.length; i++) {
      const text = ocr.regions[i].text.trim();
      if (text) {
        allTexts.push(text);
        textMap.push({ url, regionIndex: i });
      }
    }
  }

  console.log(`[PicTranslate] OCR complete: ${ocrResults.size}/${imageUrls.length} succeeded, ${allTexts.length} text regions found`);

  // Step 3: Translate all text in one batch request
  let translations: string[] = [];
  if (allTexts.length > 0) {
    console.log(`[PicTranslate] Translating ${allTexts.length} texts in one request...`);
    translations = await translateTexts(allTexts, targetLang);
    console.log(`[PicTranslate] Translation complete`);
  }

  // Step 4: Map translations back to each image's regions
  const results: Record<string, TranslationResult> = {};

  for (const url of imageUrls) {
    const ocr = ocrResults.get(url);
    if (!ocr) {
      results[url] = { regions: [], imageWidth: 0, imageHeight: 0 };
      continue;
    }

    results[url] = {
      regions: ocr.regions.map((region, i) => {
        const mapIndex = textMap.findIndex(
          (m) => m.url === url && m.regionIndex === i
        );
        const translated =
          mapIndex >= 0 && translations[mapIndex]
            ? translations[mapIndex]
            : region.text;

        return {
          original: region.text,
          translated,
          boundingBox: region.boundingBox,
        };
      }),
      imageWidth: ocr.imageWidth,
      imageHeight: ocr.imageHeight,
    };
  }

  return results;
}

// Message handler
chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    if (message.type === "PROCESS_BATCH") {
      processBatch(message.imageUrls, message.targetLang)
        .then((results) => {
          sendResponse({ type: "BATCH_RESULT", results });
        })
        .catch((error) => {
          console.error("[PicTranslate] processBatch failed:", error);
          sendResponse({
            type: "BATCH_ERROR",
            error: error.message || String(error),
          });
        });

      return true;
    }

    if (message.type === "GET_SETTINGS") {
      getSettings().then((settings) => {
        sendResponse({ type: "SETTINGS_RESULT", settings });
      });
      return true;
    }
  }
);

chrome.runtime.onInstalled.addListener(() => {
  console.log("[PicTranslate] Extension installed");
});
