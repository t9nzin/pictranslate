# PicTranslate

Chrome extension that translates text in images directly in your browser. Uses local OCR (Tesseract.js) and Google Translate — no API keys needed.

Supports English, Korean, Japanese, and Chinese text detection.

## Install

```bash
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

## Usage

1. Navigate to any page with images containing text
2. Click the PicTranslate extension icon
3. Choose your target language
4. Click **Translate Images on Page**

Translated text overlays appear on top of detected text regions. The extension only runs on the tab where you trigger it.

## How it works

- **OCR**: Tesseract.js runs locally in an offscreen document (no server)
- **Translation**: Google Translate free endpoint (no API key)
- **Overlay**: Translated text is positioned over the original using bounding boxes from OCR
- Images are processed in batches — all text is collected and translated in a single request
