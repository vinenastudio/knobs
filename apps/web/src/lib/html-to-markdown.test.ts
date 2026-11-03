import { describe, expect, test } from 'vitest';
import { decodeEntities, findElement, parseHtml, toMarkdown } from './html-to-markdown.ts';

const BASE = 'https://example.com/docs/start';

function markdown(body: string, headingOffset = 0): string {
  const root = parseHtml(`<!doctype html><html><body>${body}</body></html>`);
  const main = findElement(root, (element) => element.tag === 'main') ?? root;
  return toMarkdown(main, { base: BASE, headingOffset });
}

describe('toMarkdown', () => {
  test('headings and paragraphs, whitespace collapsed', () => {
    expect(
      markdown(
        '<main><h1>Title</h1><p>One\n   two <strong>bold</strong> <em>soft</em></p><h3>Sub</h3></main>',
      ),
    ).toBe('# Title\n\nOne two **bold** *soft*\n\n### Sub');
  });

  test('heading offset shifts levels, capped at 6', () => {
    expect(markdown('<main><h1>A</h1><h5>B</h5></main>', 2)).toBe('### A\n\n###### B');
  });

  test('links become absolute, empty and script links drop', () => {
    expect(
      markdown(
        '<main><p><a href="/features">Features</a>, <a href="next">Next</a>, <a href="#faq">FAQ</a>, <a href="https://x.com/a">X</a>, <a href="javascript:void 0">Run</a>, <a href="/empty"></a></p></main>',
      ),
    ).toBe(
      '[Features](https://example.com/features), [Next](https://example.com/docs/next), [FAQ](https://example.com/docs/start#faq), [X](https://x.com/a), Run,',
    );
  });

  test('links side by side with no space between them get one', () => {
    expect(markdown('<main><div><a href="/a">A</a><a href="/b">B</a></div></main>')).toBe(
      '[A](https://example.com/a) [B](https://example.com/b)',
    );
  });

  test('a card link around blocks stays one link', () => {
    expect(markdown('<main><a href="/blog/a"><h3>Post</h3><p>About it</p></a></main>')).toBe(
      '[Post About it](https://example.com/blog/a)',
    );
  });

  test('lists, nested and ordered', () => {
    expect(
      markdown(
        '<main><ul><li>One</li><li>Two<ul><li>Inner</li></ul></li></ul><ol start="3"><li>Three</li><li><p>Four</p></li></ol></main>',
      ),
    ).toBe('- One\n- Two\n  - Inner\n\n3. Three\n4. Four');
  });

  test('pre keeps code as it is in a fence with its language, inline code gets ticks', () => {
    expect(
      markdown(
        '<main><p>Run <code>npx  x</code></p><pre><code class="language-sh">pnpm add x\n  --save &amp;&amp; go\n</code></pre></main>',
      ),
    ).toBe('Run `npx x`\n\n```sh\npnpm add x\n  --save && go\n```');
  });

  test('details become question and answer', () => {
    expect(
      markdown(
        '<main><details><summary>Is it free?</summary><p>Yes.</p><p>Always.</p></details></main>',
      ),
    ).toBe('**Is it free?**\n\nYes.\n\nAlways.');
  });

  test('nav, header, footer, scripts, styles, hidden and aria-hidden content are left out', () => {
    expect(
      markdown(
        '<header><a href="/">Home</a></header><nav>Menu</nav><main><p>Keep</p><script>var a = "<p>x</p>";</script><style>p{}</style><p hidden>Hidden</p><span aria-hidden="true">Icon</span><svg><text>Logo</text></svg><button>Copy</button></main><footer>Made by</footer>',
      ),
    ).toBe('Keep');
  });

  test('without a main, the body is read, header and footer still left out', () => {
    expect(markdown('<header>Top</header><p>Body text</p><footer>Bottom</footer>')).toBe(
      'Body text',
    );
  });

  test('an article keeps its own header', () => {
    expect(
      markdown('<main><article><header><h1>Post</h1></header><p>Text</p></article></main>'),
    ).toBe('# Post\n\nText');
  });

  test('tables, blockquotes, line breaks and rules', () => {
    expect(
      markdown(
        '<main><table><thead><tr><th>Plan</th><th>Price</th></tr></thead><tbody><tr><td>Pro</td><td>$5</td></tr></tbody></table><blockquote><p>Quote</p><p>More</p></blockquote><p>a<br>b</p><hr></main>',
      ),
    ).toBe('| Plan | Price |\n| --- | --- |\n| Pro | $5 |\n\n> Quote\n>\n> More\n\na\nb\n\n---');
  });

  test('a faq block question in a heading button stays, its icon and a plain button do not', () => {
    expect(
      markdown(
        '<main><section id="faq"><h2>Questions</h2><div class="x"><h3 class="x"><button aria-controls="r1-answer" aria-expanded="false" id="r1-question" type="button" class="x">Is it free?<svg aria-hidden="true" width="16"><path d="M0 0"></path></svg></button></h3><div aria-labelledby="r1-question" id="r1-answer" inert="" role="region" class="x"><div class="x"><p class="x">Yes, always.</p></div></div></div><button type="button">Copy</button></section></main>',
      ),
    ).toBe('## Questions\n\n### Is it free?\n\nYes, always.');
  });

  test('a header or footer inside main, section or aside stays', () => {
    expect(
      markdown(
        '<main><header><h1>Main head</h1></header><section><footer>Section foot</footer></section><aside><header>Aside head</header></aside></main>',
      ),
    ).toBe('# Main head\n\nSection foot\n\nAside head');
  });

  test('inline code with backticks gets a longer fence, padded at a backtick edge', () => {
    expect(
      markdown('<main><p><code>a `b` c</code> <code>`x`</code> <code>``y</code></p></main>'),
    ).toBe('``a `b` c`` `` `x` `` ``` ``y ```');
  });

  test('elements with a page chrome role are left out wherever they sit', () => {
    expect(
      markdown(
        '<main><div role="navigation"><a href="/">Home</a></div><p>Keep</p><section role="banner">Top</section><div role="contentinfo"><p>Made by us</p></div></main>',
      ),
    ).toBe('Keep');
  });

  test('data-llms="skip" leaves out the element and all its children', () => {
    expect(
      markdown(
        '<main><p>Keep</p><div data-llms="skip"><a href="/download">Not ready yet</a><p>Inner</p></div><h2 data-llms="skip"><button>Hidden question</button></h2></main>',
      ),
    ).toBe('Keep');
  });

  test('a blog index card link keeps its title, description and date apart', () => {
    expect(
      markdown(
        '<main id="main" class="x"><section class="x"><h1 class="x">Blog</h1><ul><li class="x"><a class="x" href="/blog/lid-closed"><span class="x">Keep coding with the lid closed too</span><span class="x">Keep a Mac awake while agents work.</span><time dateTime="2026-10-01" class="x">October 1, 2026</time></a></li><li class="x"><a class="x" href="/blog/second"><span class="x">Second</span><span class="x">More.</span><time dateTime="2026-09-01" class="x">September 1, 2026</time></a></li></ul></section></main>',
      ),
    ).toBe(
      '# Blog\n\n- [Keep coding with the lid closed too Keep a Mac awake while agents work. October 1, 2026](https://example.com/blog/lid-closed)\n- [Second More. September 1, 2026](https://example.com/blog/second)',
    );
  });

  test('block children inside a link are separated, text-level tags still touch', () => {
    expect(
      markdown(
        '<main><a href="/a"><h3>Title</h3><p>Text</p></a><p><b>bo</b><i>ld</i>, <span>x</span>.</p></main>',
      ),
    ).toBe('[Title Text](https://example.com/a)\n\n**bo***ld*, x.');
  });

  test('aria-hidden content is left out of inline code and code blocks', () => {
    expect(
      markdown(
        '<main><div><code><span aria-hidden="true">$ </span>sudo make install</code></div><pre><code><span aria-hidden="true">1 </span>echo hi</code></pre></main>',
      ),
    ).toBe('`sudo make install`\n\n```\necho hi\n```');
  });

  test('a key glyph and its screen reader name in a kbd are separate words', () => {
    expect(
      markdown(
        '<main><p>Press <kbd>⇧⌘V<span class="x">Shift Command V</span></kbd> or <kbd><span aria-hidden="true">⌘C</span><span class="x">Command C</span></kbd>.</p></main>',
      ),
    ).toBe('Press `⇧⌘V Shift Command V` or `Command C`.');
  });

  test('data-llms="pre" keeps the line breaks in a fence', () => {
    expect(
      markdown(
        '<main><figure><figcaption>Claude Code</figcaption><p data-llms="pre" class="x">Install it.\n\nThen run:\n  example init</p><button>Copy</button></figure></main>',
      ),
    ).toBe('Claude Code\n\n```\nInstall it.\n\nThen run:\n  example init\n```');
  });

  test('a price row of spans, a struck old price and a mark stays separate words', () => {
    expect(
      markdown(
        '<main><p class="x"><span class="x">$29</span><span class="x">Full price</span><s class="x">$49</s><span class="x">per year</span></p><p><span>Save</span><mark>40%</mark><span>today</span></p></main>',
      ),
    ).toBe('$29 Full price $49 per year\n\nSave 40% today');
  });

  test('no space after an opening sign or before a closing one', () => {
    expect(
      markdown(
        '<main><p><span>$</span><span>29</span><span>/month</span>, <span>10</span><span>%</span>, <span>(</span><span>beta</span><span>)</span>, <span>“</span><span>quote</span><span>”</span>, <span>more</span><span>…</span></p></main>',
      ),
    ).toBe('$29 /month, 10%, (beta), “quote”, more…');
  });

  test('a straight-quoted span and a name span stay apart in both orders', () => {
    expect(
      markdown(
        '<main><p><span>"Saved us hours"</span><span>Jane Doe</span></p><p><span>Jane Doe</span><span>"Saved us hours"</span></p><p><span>\'Fast\'</span><span>Ada</span></p></main>',
      ),
    ).toBe('"Saved us hours" Jane Doe\n\nJane Doe "Saved us hours"\n\n\'Fast\' Ada');
  });

  test('emphasis of the same kind side by side merges, other text-level tags touch', () => {
    expect(
      markdown(
        '<main><p><b>a</b><b>b</b> <em>c</em><i>d</i> <strong>e</strong><code>f</code></p></main>',
      ),
    ).toBe('**ab** *cd* **e**`f`');
  });

  test('React text separators and comments disappear', () => {
    expect(markdown('<main><p>Hello<!-- -->, <!-- -->world</p></main>')).toBe('Hello, world');
  });
});

describe('parseHtml', () => {
  test('a dotted capital I before a closing tag does not shift where the tag ends', () => {
    const root = parseHtml(
      '<html><head><title>İletişim İstanbul İzmir</title><script>var a = "İİİ";</script></head><body><main><p>İyi</p></main></body></html>',
    );
    const title = findElement(root, (element) => element.tag === 'title');
    const script = findElement(root, (element) => element.tag === 'script');
    expect(title?.children).toStrictEqual(['İletişim İstanbul İzmir']);
    expect(script?.children).toStrictEqual(['var a = "İİİ";']);
    const main = findElement(root, (element) => element.tag === 'main');
    expect(main && toMarkdown(main, { base: BASE })).toBe('İyi');
  });
});

describe('decodeEntities', () => {
  test('named and numeric', () => {
    expect(decodeEntities('&lt;a&gt; &amp; &#39;x&#x27; &nbsp;&unknown;')).toBe(
      "<a> & 'x'  &unknown;",
    );
  });
});
