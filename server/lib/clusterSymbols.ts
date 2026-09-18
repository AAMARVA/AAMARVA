/**
 * Cluster Symbol Generator for Server-Side Floor Telemetry
 * Deterministic mapping to 3-char monochrome bracket-symbol-bracket
 */

const LEFT_BRACKETS: string[] = [
  '◸', '◺', '⟓', '⟕', '⟘', '⟚', '⟜', '⟞', '⟦', '⟨', '⦃', '⦅', '⦇', '⦉', '⦋', '⦍', '⦏', '⦑', '⦓', '⦕', '⦗', '⌈', '⌊', '⌜', '⌞', '⎡', '⎢', '⎣', '┌', '└', '├', '╞', '╭', '╰', '❮', '«', '〔', '【', '⊏', '⊑', '⊓', '⊐', '⊩', '⊪', '⊰', '⋐', '⋖', '⋚', '⋞', '⋪'
];

const CORE_SYMBOLS: string[] = [
  '◈', '◇', '◆', '⬡', '⬢', '⬨', '⬩', '⬪', '⬫', '⬬', '⬭', '⬮', '⬯', '⬰', '⬱', '⬲', '⬳', '⬴', '⬵', '⬶', '⬷', '⬸', '⬹', '⬺', '⬻', '⬼', '⬽', '⬾', '⬿', '⭀', '⭁', '⭂', '⭃', '⭄', '⭅', '⭆', '⭇', '⭈', '⭉', '⭊', '⭋', '⭌', '⭍', '⭎', '⭏',
  '▲', '▼', '◄', '►', '■', '□', '▪', '▫', '▬', '▭', '▮', '▯', '▰', '▱', '▲', '△', '▴', '▵', '▲', '△', '▴', '▵', '▶', '▷', '▸', '▹', '►', '▻', '▼', '▽', '▾', '▿', '◀', '◁', '◂', '◃', '◄', '◅', '◆', '◇', '◈', '◉', '◊', '○', '◌', '◍', '◎', '●', '◐', '◑', '◒', '◓', '◔', '◕', '◖', '◗', '◘', '◙', '◚', '◛', '◜', '◝', '◞', '◟', '◠', '◡', '◢', '◣', '◤', '◥', '◦', '◧', '◨', '◩', '◪', '◫', '◬', '◭', '◮', '◯'
];

const RIGHT_BRACKETS: string[] = [
  '◹', '◿', '⟔', '⟖', '⟙', '⟛', '⟝', '', '⟧', '⟩', '⦄', '⦆', '⦈', '⦊', '⦌', '⦎', '⦐', '⦒', '⦔', '⦖', '⦘', '⌉', '⌋', '⌝', '⌟', '⎤', '⎥', '⎦', '┐', '┘', '┤', '╡', '╮', '╯', '❯', '»', '〕', '】', '⊐', '⊒', '⊔', '⊓', '⊣', '⊪', '⊱', '⋑', '⋗', '⋛', '⋟', '⋫'
];

export function getClusterSymbol(clusterId: string): string {
  if (!clusterId) return '◸◈◹';
  const clean = clusterId.toLowerCase().trim();

  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  const bigH = (BigInt(Math.abs(h1)) * 4294967296n) + BigInt(Math.abs(h2));
  const leftLen = BigInt(LEFT_BRACKETS.length);
  const coreLen = BigInt(CORE_SYMBOLS.length);
  const rightLen = BigInt(RIGHT_BRACKETS.length);

  const leftIdx = Number(bigH % leftLen);
  const coreIdx = Number((bigH / leftLen) % coreLen);
  const rightIdx = Number((bigH / (leftLen * coreLen)) % rightLen);

  const leftChar = LEFT_BRACKETS[leftIdx] || '◸';
  const coreChar = CORE_SYMBOLS[coreIdx] || '◈';
  const rightChar = RIGHT_BRACKETS[rightIdx] || '◹';

  return `${leftChar}${coreChar}${rightChar}`;
}
