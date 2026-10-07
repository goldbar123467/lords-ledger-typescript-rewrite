import type {Page} from '@playwright/test';

// Common blocks containing the icon candidates this heuristic looks for.
// The scan retains non-ASCII text except configured prose and selected formatting
// characters; it does not prove icon classification or count rendered graphemes.
//   - Miscellaneous Symbols (U+2600–U+26FF)
//   - Dingbats (U+2700–U+27BF)
//   - Miscellaneous Technical (U+2300–U+23FF)
//   - Geometric Shapes (U+25A0–U+25FF)
//   - Arrows (U+2190–U+21FF)
//   - Mathematical Operators used as icons (U+2200–U+22FF)
//   - Box Drawing / Block Elements (U+2500–U+259F)
//   - Supplemental Arrows / Misc Symbols (U+2900–U+297F, U+2980–U+29FF)
//   - General Punctuation used as icons (U+2020–U+206F subset)
//   - Letterlike Symbols (U+2100–U+214F)
//   - Music Symbols, playing cards, etc.
//
// We exclude normal prose characters: em dash (—), en dash (–), smart quotes,
// ellipsis (…), middle dot for sentences, accent marks, etc.

const PROSE_EXCLUDE = new Set([
  "\u2014", // — em dash
  "\u2013", // – en dash
  "\u2018", // ' left single quote
  "\u2019", // ' right single quote
  "\u201C", // " left double quote
  "\u201D", // " right double quote
  "\u2026", // … ellipsis
  "\u00B7", // · middle dot (used in prose)
  "\u00D7", // × multiplication sign (used in prose like "×1.5")
  "\u2212", // − minus sign
  "\u00E9", // é
  "\u00F3", // ó
  "\u00FC", // ü
]);

/**
 * Scans text for Unicode icon code-point candidates, not rendered glyph counts.
 * Returns an array of { char, codePoint, context, tagName, x, y }.
 */
export interface UnicodeFinding {
  char: string; codePoint: string; unicodeName: string; context: string;
  tagName: string; className: string; x: number; y: number; visible: boolean;
}
export async function scanForUnicodeIcons(page: Page): Promise<UnicodeFinding[]> {
  return page.evaluate((excludeList) => {
    const results: UnicodeFinding[] = [];
    const seen = new Map<string, boolean>(); // track unique char+context combos

    // Walk all text nodes in the document
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent;
      if (!text) continue;

      // Check if parent is visible
      const parent = node.parentElement;
      if (!parent) continue;
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;

      // Scan for non-ASCII characters in icon ranges
      for (const char of text) {
        const cp = char.codePointAt(0);
        if (cp === undefined) throw new Error('Missing code point in a string iteration.');

        // Skip basic ASCII and Latin-1 prose characters
        if (cp < 0x2000) continue;
        // Ignore malformed UTF-16 units and selected non-glyph formatting characters.
        // Variation selector ranges: https://www.unicode.org/charts/PDF/UE0100.pdf
        if ((cp >= 0xd800 && cp <= 0xdfff) ||
            (cp >= 0xfe00 && cp <= 0xfe0f) ||
            (cp >= 0xe0100 && cp <= 0xe01ef) || cp === 0x200c || cp === 0x200d) continue;
        // Skip excluded prose characters
        if (excludeList.includes(char)) continue;

        // Check if this char is inside an SVG or an <img> (already replaced)
        let el: Element | null = parent;
        let insideSvgOrImg = false;
        while (el) {
          if (el.tagName === "SVG" || el.tagName === "svg" || el.tagName === "IMG") {
            insideSvgOrImg = true;
            break;
          }
          el = el.parentElement;
        }
        if (insideSvgOrImg) continue;

        // Get surrounding context (trim to 60 chars)
        const fullText = text.trim();
        const context = fullText.length > 60
          ? fullText.substring(0, 60) + "..."
          : fullText;

        const rect = parent.getBoundingClientRect();
        const key = `${char}|${parent.tagName}|${context.substring(0, 30)}`;

        if (!seen.has(key)) {
          seen.set(key, true);
          results.push({
            char,
            codePoint: "U+" + cp.toString(16).toUpperCase().padStart(4, "0"),
            unicodeName: "", // filled in post-processing
            context,
            tagName: parent.tagName.toLowerCase(),
            className: (parent.className || "").toString().substring(0, 80),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            visible: rect.width > 0 && rect.height > 0,
          });
        }
      }
    }
    return results;
  }, [...PROSE_EXCLUDE]);
}
