import { TranslationResult } from "@/types/messages";

const CACHE_PREFIX = "pt_cache_";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  result: TranslationResult;
  timestamp: number;
}

async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getCached(
  imageUrl: string
): Promise<TranslationResult | null> {
  const key = CACHE_PREFIX + (await hashUrl(imageUrl));
  const stored = await chrome.storage.local.get(key);
  const entry: CacheEntry | undefined = stored[key];

  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry.result;
}

export async function setCache(
  imageUrl: string,
  result: TranslationResult
): Promise<void> {
  const key = CACHE_PREFIX + (await hashUrl(imageUrl));
  const entry: CacheEntry = { result, timestamp: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
}

export async function getUsageCount(): Promise<number> {
  const stored = await chrome.storage.local.get("pt_usage");
  const usage = stored.pt_usage || { count: 0, month: new Date().getMonth() };

  // Reset if new month
  if (usage.month !== new Date().getMonth()) {
    await chrome.storage.local.set({
      pt_usage: { count: 0, month: new Date().getMonth() },
    });
    return 0;
  }

  return usage.count;
}

export async function incrementUsage(): Promise<number> {
  const stored = await chrome.storage.local.get("pt_usage");
  const currentMonth = new Date().getMonth();
  let usage = stored.pt_usage || { count: 0, month: currentMonth };

  if (usage.month !== currentMonth) {
    usage = { count: 0, month: currentMonth };
  }

  usage.count++;
  await chrome.storage.local.set({ pt_usage: usage });
  return usage.count;
}
