import { TranslatedRegion, TranslationResult } from "@/types/messages";

const overlayContainers = new WeakMap<HTMLImageElement, HTMLDivElement>();

function getOrCreateContainer(img: HTMLImageElement): HTMLDivElement {
  const existing = overlayContainers.get(img);
  if (existing && existing.parentNode) return existing;

  // Position overlay using the image's page coordinates — no parent modification
  const rect = img.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const container = document.createElement("div");
  container.className = "pictranslate-overlay-container";
  container.style.position = "absolute";
  container.style.top = rect.top + scrollY + "px";
  container.style.left = rect.left + scrollX + "px";
  container.style.width = rect.width + "px";
  container.style.height = rect.height + "px";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";

  // Append to body — completely non-invasive
  document.body.appendChild(container);

  overlayContainers.set(img, container);
  return container;
}

function computeOverlayRect(
  vertices: Array<{ x: number; y: number }>,
  imgNaturalWidth: number,
  imgNaturalHeight: number,
  imgRenderedWidth: number,
  imgRenderedHeight: number
): { left: number; top: number; width: number; height: number } {
  const scaleX = imgRenderedWidth / imgNaturalWidth;
  const scaleY = imgRenderedHeight / imgNaturalHeight;

  const xs = vertices.map((v) => v.x * scaleX);
  const ys = vertices.map((v) => v.y * scaleY);

  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return { left, top, width: right - left, height: bottom - top };
}

function computeFontSize(
  text: string,
  boxWidth: number,
  boxHeight: number
): number {
  const lineCount = Math.max(1, Math.ceil(text.length / (boxWidth / 10)));
  let fontSize = (boxHeight / lineCount) * 0.75;
  fontSize = Math.max(8, Math.min(fontSize, 28));
  return Math.round(fontSize);
}

export function renderOverlays(
  img: HTMLImageElement,
  result: TranslationResult
): void {
  if (result.regions.length === 0) return;

  const container = getOrCreateContainer(img);
  container.innerHTML = "";

  const renderedWidth = img.clientWidth;
  const renderedHeight = img.clientHeight;
  const naturalWidth = result.imageWidth || img.naturalWidth;
  const naturalHeight = result.imageHeight || img.naturalHeight;

  if (!naturalWidth || !naturalHeight) return;

  for (const region of result.regions) {
    const rect = computeOverlayRect(
      region.boundingBox.vertices,
      naturalWidth,
      naturalHeight,
      renderedWidth,
      renderedHeight
    );

    const fontSize = computeFontSize(
      region.translated,
      rect.width,
      rect.height
    );

    const overlay = document.createElement("div");
    overlay.className = "pictranslate-overlay";
    overlay.textContent = region.translated;
    overlay.title = region.original;
    overlay.style.position = "absolute";
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.fontSize = fontSize + "px";

    container.appendChild(overlay);
  }
}

export function removeAllOverlays(): void {
  const containers = document.querySelectorAll(
    ".pictranslate-overlay-container"
  );
  containers.forEach((c) => c.remove());
}
