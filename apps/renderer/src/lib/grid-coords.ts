export type DotCoord = {
  i: number;
  col: number;
  row: number;
  dist: number;
  diag: number;
  antiDiag: number;
  angle: number;
  rand: number;
  cornerDist: number;
  pairOrder: number;
};

const SEED = 0x9e3779b1;

function pseudoRandom(seed: number): number {
  let t = (seed + SEED) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 2246822507);
  t = Math.imul(t ^ (t >>> 13), 3266489909);
  t ^= t >>> 16;
  return (t >>> 0) / 0xffffffff;
}

function buildCoords(size: number): DotCoord[] {
  const center = (size - 1) / 2;
  const total = size * size;
  return Array.from({ length: total }, (_, i) => {
    const col = i % size;
    const row = Math.floor(i / size);
    const dx = col - center;
    const dy = row - center;
    const angleRad = Math.atan2(dy, dx);
    const normalized = (angleRad + Math.PI * 2.5) % (Math.PI * 2);
    return {
      i,
      col,
      row,
      dist: Math.max(Math.abs(dx), Math.abs(dy)),
      diag: col + row,
      antiDiag: col + (size - 1 - row),
      angle: normalized / (Math.PI * 2),
      rand: pseudoRandom(i),
      cornerDist: Math.max(
        Math.min(col, size - 1 - col),
        Math.min(row, size - 1 - row),
      ),
      pairOrder: Math.min(i, total - 1 - i),
    };
  });
}

export const coords5: DotCoord[] = buildCoords(5);
export const coords4: DotCoord[] = buildCoords(4);
export const coords3: DotCoord[] = buildCoords(3);
