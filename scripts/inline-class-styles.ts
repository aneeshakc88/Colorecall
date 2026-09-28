// MLS sources paint through a <style> block of class rules (.st0 { fill: #7ccdef }),
// never inline. Everything downstream reads inline style/fill, so copy each class's
// declarations onto the elements that use it and drop the stylesheet.
export function inlineClassStyles(raw: string): string {
  const rules = new Map<string, string>();
  for (const block of raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const r of block[1]!.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decls = r[2]!.replace(/\s+/g, ' ').trim().replace(/;?$/, ';');
      for (const sel of r[1]!.split(',')) {
        const m = sel.trim().match(/^\.([\w-]+)$/);
        if (m) rules.set(m[1]!, (rules.get(m[1]!) ?? '') + decls);
      }
    }
  }
  if (!rules.size) return raw;
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<(\w+)([^>]*?)\sclass="([^"]+)"([^>]*)>/g, (_m, tag: string, pre: string, cls: string, post: string) => {
      const decls = cls.split(/\s+/).map(c => rules.get(c) ?? '').join('');
      const attrs = pre + post;
      // Inline style beats the stylesheet, so any existing declarations go last.
      const own = attrs.match(/\sstyle="([^"]*)"/);
      const rest = own ? attrs.replace(own[0], '') : attrs;
      return `<${tag} style="${decls}${own ? own[1] : ''}"${rest}>`;
    });
}
