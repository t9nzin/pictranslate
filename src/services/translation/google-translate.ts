export async function translateTexts(
  texts: string[],
  targetLang: string
): Promise<string[]> {
  if (texts.length === 0) return [];

  // Filter out empty strings, keep track of indices
  const nonEmpty: { text: string; index: number }[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (texts[i].trim()) {
      nonEmpty.push({ text: texts[i], index: i });
    }
  }

  if (nonEmpty.length === 0) return texts.map(() => "");

  const result = texts.map(() => "");

  // Join all texts with a unique separator
  const separator = "\n\n---SPLIT---\n\n";
  const joinedText = nonEmpty.map((e) => e.text).join(separator);

  // Use POST to handle large text payloads (full chapters)
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx` +
    `&sl=auto` +
    `&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `q=${encodeURIComponent(joinedText)}`,
  });

  if (!response.ok) {
    throw new Error(`Google Translate error: ${response.status}`);
  }

  // Response format: [[["translated text","original text",null,null,confidence],...]]
  const data = await response.json();

  // Extract all translated segments and join them
  let fullTranslation = "";
  if (Array.isArray(data) && Array.isArray(data[0])) {
    for (const segment of data[0]) {
      if (segment && segment[0]) {
        fullTranslation += segment[0];
      }
    }
  }

  // Split back into individual translations
  const parts = fullTranslation.split(/---SPLIT---/);

  for (let i = 0; i < nonEmpty.length && i < parts.length; i++) {
    result[nonEmpty[i].index] = parts[i].trim();
  }

  return result;
}
