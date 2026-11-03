// Real IceCube layout (approximate): 78 strings on a hexagonal 125 m grid,
// plus 8 DeepCore strings packed near the centre. Units: 100 m, xz plane.
export function icecubeStrings() {
  const pts = [];
  const a = 1.25;                               // 125 m spacing
  for (let q = -6; q <= 6; q++) {
    for (let r = -6; r <= 6; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > 5) continue;
      const x = a * (q + r / 2), z = a * (r * Math.sqrt(3) / 2);
      pts.push([x, z]);
    }
  }
  // keep the 78 closest to an elongated hexagon footprint (IceCube's is
  // stretched on one axis); trim from the outside in
  const score = ([x, z]) => Math.hypot(x * 0.92, z * 1.08);
  pts.sort((p, q) => score(p) - score(q));
  const std = pts.slice(0, 78);
  const deep = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.2;
    deep.push([Math.cos(ang) * 0.42 + 0.3, Math.sin(ang) * 0.42 + 0.2]);   // ~70 m spacing cluster
  }
  return [...std, ...deep];
}
