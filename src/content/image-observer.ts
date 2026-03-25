const processedImages = new WeakSet<HTMLImageElement>();
let onBatchReady: ((imgs: HTMLImageElement[]) => void) | null = null;

let pendingImages: HTMLImageElement[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
const BATCH_DEBOUNCE_MS = 1500;

function isValidImage(img: HTMLImageElement): boolean {
  // Must have a real src (not empty, not tiny data URI)
  if (!img.src) return false;
  if (img.src.startsWith("data:") && img.src.length < 1000) return false;
  return true;
}

function queueImage(img: HTMLImageElement) {
  if (processedImages.has(img)) return;
  if (!isValidImage(img)) return;
  processedImages.add(img);
  pendingImages.push(img);
  scheduleBatch();
}

function scheduleBatch() {
  if (batchTimeout) clearTimeout(batchTimeout);
  batchTimeout = setTimeout(flushBatch, BATCH_DEBOUNCE_MS);
}

function flushBatch() {
  if (pendingImages.length === 0) return;
  const batch = pendingImages;
  pendingImages = [];
  console.log(`[PicTranslate] Sending batch of ${batch.length} images`);
  onBatchReady?.(batch);
}

function scanAllImages() {
  const images = document.querySelectorAll("img");
  console.log(`[PicTranslate] Found ${images.length} img elements on page`);
  images.forEach((img) => queueImage(img as HTMLImageElement));
  console.log(`[PicTranslate] Queued ${pendingImages.length} images after filtering`);
}

// Watch for dynamically added images (lazy loading, infinite scroll)
const mutationObserver = new MutationObserver((mutations) => {
  let added = 0;
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLImageElement) {
        queueImage(node);
        added++;
      } else if (node instanceof HTMLElement) {
        const imgs = node.querySelectorAll("img");
        imgs.forEach((img) => {
          queueImage(img as HTMLImageElement);
          added++;
        });
      }
    }
  }
  if (added > 0) {
    console.log(`[PicTranslate] MutationObserver: ${added} new images detected`);
  }
});

export function startObserving(
  callback: (imgs: HTMLImageElement[]) => void
) {
  onBatchReady = callback;
  scanAllImages();
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

export function stopObserving() {
  onBatchReady = null;
  if (batchTimeout) clearTimeout(batchTimeout);
  pendingImages = [];
  mutationObserver.disconnect();
}
