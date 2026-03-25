export interface BoundingBox {
  vertices: Array<{ x: number; y: number }>;
}

export interface TextRegion {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
}

export interface OcrResult {
  regions: TextRegion[];
  imageWidth: number;
  imageHeight: number;
}

export interface TranslatedRegion {
  original: string;
  translated: string;
  boundingBox: BoundingBox;
}

export interface TranslationResult {
  regions: TranslatedRegion[];
  imageWidth: number;
  imageHeight: number;
}

// Messages between content script <-> service worker
export type Message =
  | {
      type: "PROCESS_BATCH";
      imageUrls: string[];
      targetLang: string;
    }
  | {
      type: "BATCH_RESULT";
      results: Record<string, TranslationResult>;
    }
  | {
      type: "BATCH_ERROR";
      error: string;
    }
  | { type: "GET_SETTINGS" }
  | { type: "SETTINGS_RESULT"; settings: ExtensionSettings }
  | { type: "TOGGLE_EXTENSION"; enabled: boolean };

export interface ExtensionSettings {
  enabled: boolean;
  targetLang: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  targetLang: "en",
};
