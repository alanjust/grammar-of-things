// Safe Markdown rendering for untrusted model output.
//
// Analysis text (Pass 1/2/3) and scraped institution documentation are NOT
// trusted input — they can contain raw HTML or scriptable URLs. We render
// Markdown with a hardened renderer that:
//   • escapes any raw HTML the source emitted (it renders as visible text,
//     never as live markup), and
//   • allows only safe URL schemes on links and images (no javascript:,
//     vbscript:, or data: except inline images).
// Everything else is structural HTML produced by marked itself, which is safe
// by construction.

import { Marked, type Tokens } from 'marked';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(href: string | null | undefined, allowImageData = false): string | null {
  if (!href) return null;
  // Remove ASCII control chars (incl. tab/newline) and whitespace before the
  // scheme — browsers ignore these when parsing a scheme, so `java\tscript:`
  // must not slip through.
  // eslint-disable-next-line no-control-regex
  const cleaned = href.replace(/[\u0000-\u0020]/g, '');
  if (/^(https?:|mailto:|tel:)/i.test(cleaned)) return cleaned;
  if (/^(\/|#|\.\/|\.\.\/)/.test(cleaned)) return cleaned;
  if (allowImageData && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(cleaned)) return cleaned;
  return null; // javascript:, vbscript:, data:text/html, etc.
}

const safe = new Marked({ gfm: true, breaks: false });

safe.use({
  renderer: {
    // Neutralize any raw HTML in the source.
    html(this: any, token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text ?? token.raw ?? '');
    },
    link(this: any, token: Tokens.Link) {
      const text =
        this?.parser && token.tokens
          ? this.parser.parseInline(token.tokens)
          : escapeHtml(token.text ?? '');
      const href = safeUrl(token.href);
      if (!href) return text; // drop unsafe link, keep the visible text
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${escapeHtml(href)}"${title} rel="nofollow noopener noreferrer">${text}</a>`;
    },
    image(this: any, token: Tokens.Image) {
      const alt = escapeHtml(token.text ?? '');
      const href = safeUrl(token.href, true);
      if (!href) return alt; // drop unsafe image, keep alt text
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<img src="${escapeHtml(href)}" alt="${alt}"${title} />`;
    },
  },
});

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  return safe.parse(md, { async: false }) as string;
}
