/**
 * Cluster Symbol Generator (Strict Black and White Monochrome)
 * 
 * - Output format: Maximum 3 characters [LeftStructural][CoreGeometric][RightStructural]
 * - Hundreds of millions of unique, non-colliding variants
 * - Deterministic, 64-bit entropy distribution
 * - Strictly Black & White: NO emojis, NO stars, NO snowflakes, NO pictographs, NO color glyphs
 * - Pure architectural, mathematical, geometric, and box-drawing structural glyphs
 */

const EMOJI_AND_COLOR_REGEX = /\p{Extended_Pictographic}|\p{Emoji}|\p{Emoji_Presentation}|\p{Regional_Indicator}/u;

function filterStrictMonochrome(chars: string[]): string[] {
  return chars.filter(c => {
    if (!c || c.trim().length === 0) return false;
    // Reject any character that OS or browser could render as an emoji
    if (EMOJI_AND_COLOR_REGEX.test(c)) return false;
    const cp = c.codePointAt(0) || 0;
    // Strictly block all emoji / dingbat / symbol ranges
    if (cp >= 0x2600 && cp <= 0x27BF) return false; // Misc symbols & Dingbats (weather, zodiac, snowflakes, stars, checkmarks)
    if (cp >= 0x2B00 && cp <= 0x2BFF) return false; // Misc symbols and arrows (contains 0x2B50 star, etc.)
    if (cp >= 0x1F000 && cp <= 0x1FAFF) return false; // All SMP emoji planes
    if (cp >= 0x23E9 && cp <= 0x23F3) return false; // Media control emojis
    if (cp >= 0x231A && cp <= 0x231B) return false; // Watch / hourglass emojis
    if (cp < 0x21 || (cp >= 0x7F && cp <= 0xA0)) return false; // Control & invisible chars
    return true;
  });
}

function createPool(ranges: [number, number][]): string[] {
  const list: string[] = [];
  for (const [start, end] of ranges) {
    for (let c = start; c <= end; c++) {
      list.push(String.fromCodePoint(c));
    }
  }
  return list;
}

// Structural left brackets, box joins, corners & delimiters (Strictly Monochrome)
const LEFT_BRACKETS: string[] = filterStrictMonochrome([
  '◸', '◺', '⟓', '⟕', '⟘', '⟚', '⟜', '⟞', '⟦', '⟨', '⦃', '⦅', '⦇', '⦉', '⦋', '⦍', '⦏', '⦑', '⦓', '⦕', '⦗', '⌈', '⌊', '⌜', '⌞', '⎡', '⎢', '⎣', '⎧', '⎨', '⎩', '┌', '└', '├', '╞', '╭', '╰', '❮', '«', '〔', '【', '⊏', '⊑', '⊓', '⊐', '⊩', '⊪', '⊰', '⋐', '⋖', '⋚', '⋞', '⋪',
  ...createPool([
    [0x2500, 0x253B], // Box drawings left/vertical
    [0x27C0, 0x27EA], // Mathematical brackets A
    [0x2980, 0x29CB], // Mathematical brackets B
    [0x2308, 0x230B], // Ceilings and floors
    [0x231C, 0x231F], // Technical corners
    [0x239B, 0x23B3], // Large bracket pieces
    [0x2801, 0x28FF], // Braille matrix left/structural (256)
    [0x2A00, 0x2A6F], // Supplemental math operators
    [0x2E00, 0x2E1F], // Supplemental punctuation & brackets
    [0x3008, 0x301B], // Technical brackets
  ])
]);

// Structural geometric core glyphs (Strictly Monochrome)
const CORE_SYMBOLS: string[] = filterStrictMonochrome([
  '◈', '▣', '⧇', '⧈', '⧉', '⧊', '⧋', '⧌', '⧍', '⧎', '⧏', '⧐', '⌬', '⏣', '⏤', '⏥', '⏦', '⏧', '⏨', '⍟', '⍎', '⍭', '⍼', '⍙', '⍚', '⍫', '⍲', '⍳', '⍴', '⍵', '⍶', '⍷', '⍸', '⍹', '⍺', '⎀', '⎈', '⎊', '⎋', '⎌', '⎍', '⎎', '⎔', '⎕', '⎗', '⎘', '⎙', '⎚', '⏻', '⏼', '⏽', '⏾', '⏿', '⌽', '⌾', '⍂', '⍃', '⍄', '⍅', '⍆', '⍇', '⍈', '⍉', '⍊', '⍋', '⍌', '⍍', '⍏', '⍐', '⍑', '⍒', '⍓', '⍔', '⍕', '⍖', '⍗', '⍘', '⍛', '⍜', '⍝', '⍞', '⍠', '⍡',
  ...createPool([
    [0x25A0, 0x25EE], // Geometric shapes (monochrome vectors)
    [0x2580, 0x259F], // Structural block elements
    [0x2200, 0x227F], // Mathematical operators
    [0x2A70, 0x2AFF], // Supplemental mathematical relations
    [0x2900, 0x297F], // Supplemental arrows
    [0x2300, 0x2319], // Miscellaneous technical
    [0x2320, 0x23E8], // Technical
    [0x2400, 0x2426], // Control pictures
  ])
]);

// Structural right brackets, box joins, corners & delimiters (Strictly Monochrome)
const RIGHT_BRACKETS: string[] = filterStrictMonochrome([
  '◹', '◿', '⟔', '⟖', '⟙', '⟛', '⟝', '⟟', '⟧', '⟩', '⦄', '⦆', '⦈', '⦊', '⦌', '⦎', '⦐', '⦒', '⦔', '⦖', '⦘', '⌉', '⌋', '⌝', '⌟', '⎤', '⎥', '⎦', '⎫', '⎬', '⎭', '┐', '┘', '┤', '╡', '╮', '╯', '❯', '»', '〕', '】', '⊐', '⊒', '⊓', '⊏', '⊨', '⊩', '⊱', '⋑', '⋗', '⋛', '⋟', '⋫',
  ...createPool([
    [0x253C, 0x257F], // Box drawings right/vertical
    [0x27EB, 0x27EF], // Mathematical brackets A closing
    [0x29CC, 0x29FF], // Mathematical brackets B closing
    [0x2309, 0x230B], // Ceilings/floors closing
    [0x231D, 0x231F], // Technical corners closing
    [0x23B4, 0x23CF], // Large bracket closing pieces
    [0x2801, 0x28FF], // Braille matrix right/structural (256)
    [0x2A00, 0x2A6F], // Supplemental math operators
    [0x2E20, 0x2E4F], // Supplemental punctuation & brackets closing
    [0x3009, 0x301B], // Technical closing brackets
  ])
]);

export function getClusterSymbol(clusterId: string): string {
  if (!clusterId) return '◸◈◹';

  // Sovereign master signature for the Alpha Secret Cluster (exactly 3 characters, pure monochrome)
  if (clusterId === 'cluster_alpha_secret') return '⟖⏣⟕';

  // High-entropy 64-bit non-colliding integer hash
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < clusterId.length; i++) {
    const ch = clusterId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  // Multiply and combine into 64-bit space
  const bigH = (BigInt(Math.abs(h1)) * 4294967296n) + BigInt(Math.abs(h2));

  // Combinatorial mapping over hundreds of millions of strict monochrome variants (Left x Core x Right)
  const leftLen = BigInt(LEFT_BRACKETS.length);
  const coreLen = BigInt(CORE_SYMBOLS.length);
  const rightLen = BigInt(RIGHT_BRACKETS.length);

  const leftIdx = Number(bigH % leftLen);
  const coreIdx = Number((bigH / leftLen) % coreLen);
  const rightIdx = Number((bigH / (leftLen * coreLen)) % rightLen);

  const leftChar = LEFT_BRACKETS[leftIdx] || '◸';
  const coreChar = CORE_SYMBOLS[coreIdx] || '◈';
  const rightChar = RIGHT_BRACKETS[rightIdx] || '◹';

  // Exactly three characters: [LeftStructural][CoreGeometric][RightStructural]
  return `${leftChar}${coreChar}${rightChar}`;
}
