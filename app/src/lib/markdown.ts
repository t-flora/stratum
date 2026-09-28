import MarkdownIt from 'markdown-it';
import type { LanguageFn } from 'highlight.js';
// `common` bundles cpp, c, python, bash, json, yaml, rust and friends; the depths also want assembly.
import hljs from 'highlight.js/lib/common';
import armasm from 'highlight.js/lib/languages/armasm';
import x86asm from 'highlight.js/lib/languages/x86asm';

// Cast: highlight.js's `exports` map may resolve per-language imports to its main typings.
hljs.registerLanguage('x86asm', x86asm as unknown as LanguageFn);
hljs.registerLanguage('armasm', armasm as unknown as LanguageFn);
hljs.registerAliases(['cu', 'cuda', 'hpp'], { languageName: 'cpp' });
hljs.registerAliases(['asm', 'nasm'], { languageName: 'x86asm' });

/** Write-ups are the user's own files; raw HTML stays off anyway so a stray tag can't break the panel. */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    return '';
  },
});

export function renderMarkdown(src: string): string {
  return md.render(src);
}

/** Prompt and `done` text from the world file: inline Markdown only (code spans, emphasis). */
export function renderInline(src: string): string {
  return md.renderInline(src);
}
