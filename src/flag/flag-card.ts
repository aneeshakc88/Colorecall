// Helpers for showing a flag SVG as an image.

const FALLBACK_ASPECT = 256 / 112;

export const flagAspect = (svg: string): number => {
  const vb = /viewBox="([^"]+)"/.exec(svg);
  if (!vb) return FALLBACK_ASPECT;
  const p = vb[1]!.trim().split(/[\s,]+/).map(Number);
  const w = p[2], h = p[3];
  return w && h && w > 0 && h > 0 ? w / h : FALLBACK_ASPECT;
};

/** Data URI for a flag SVG, told not to letterbox itself. A duplicate attribute is a fatal
 *  XML parse error, so an existing one (Qatar) is replaced rather than added to. */
export const flagDataUri = (svg: string): string => {
  const norm = /preserveAspectRatio="[^"]*"/.test(svg)
    ? svg.replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"')
    : svg.replace('<svg', '<svg preserveAspectRatio="none"');
  return `data:image/svg+xml,${encodeURIComponent(norm)}`;
};
