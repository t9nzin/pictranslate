import { createWorker, Worker } from "tesseract.js";

interface OcrRegion {
  text: string;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;
  };
  confidence: number;
}

// Reuse a single worker across all OCR requests
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng+kor+jpn+chi_sim", 1, {
      workerPath: chrome.runtime.getURL("tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL(
        "tesseract/tesseract-core-simd-lstm.wasm.js"
      ),
      langPath: chrome.runtime.getURL("tesseract/lang-data"),
      workerBlobURL: false,
      gzip: true,
    });
  }
  return workerPromise;
}

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; imageBase64: string; requestId: string },
    _sender,
    sendResponse
  ) => {
    if (message.type === "OCR_REQUEST") {
      performOcr(message.imageBase64)
        .then((result) => sendResponse({ type: "OCR_RESULT", ...result }))
        .catch((err) =>
          sendResponse({
            type: "OCR_ERROR",
            error: err?.message || String(err),
          })
        );
      return true;
    }
  }
);

// Filter out OCR noise — comic art lines/patterns that Tesseract misreads as text
function looksLikeRealText(text: string): boolean {
  if (text.length < 2) return false;

  const stripped = text.replace(/\s/g, "");
  if (stripped.length === 0) return false;

  // Count Unicode letters (any script: Latin, Hangul, CJK, Cyrillic, Arabic, etc.)
  const letters = stripped.match(/\p{L}/gu);
  const letterCount = letters?.length || 0;

  // At least 40% of non-whitespace chars should be actual letters
  if (letterCount / stripped.length < 0.4) return false;

  // Must have at least 2 letters
  if (letterCount < 2) return false;

  return true;
}

async function performOcr(imageBase64: string): Promise<{
  regions: OcrRegion[];
  imageWidth: number;
  imageHeight: number;
}> {
  // Get image dimensions
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () =>
      reject(new Error("Failed to load image in offscreen document"));
    img.src = imageBase64;
  });

  const imageWidth = img.naturalWidth;
  const imageHeight = img.naturalHeight;

  const worker = await getWorker();

  // Request blocks output so we get bounding boxes
  const result = await worker.recognize(imageBase64, {}, { blocks: true, text: true });

  const regions: OcrRegion[] = [];

  if (result.data.blocks) {
    for (const block of result.data.blocks) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const text = line.text.trim();
          if (!text) continue;
          if (line.confidence < 70) continue;
          if (!looksLikeRealText(text)) continue;

          const bbox = line.bbox;
          regions.push({
            text,
            boundingBox: {
              vertices: [
                { x: bbox.x0, y: bbox.y0 },
                { x: bbox.x1, y: bbox.y0 },
                { x: bbox.x1, y: bbox.y1 },
                { x: bbox.x0, y: bbox.y1 },
              ],
            },
            confidence: line.confidence,
          });
        }
      }
    }
  }

  console.log(
    `[PicTranslate OCR] ${regions.length} regions, ` +
    `blocks=${result.data.blocks?.length ?? 'null'}, ` +
    `text preview: "${result.data.text.slice(0, 80)}"`
  );

  return { regions, imageWidth, imageHeight };
}
