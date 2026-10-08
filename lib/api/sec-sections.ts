import { load } from 'cheerio';
import { z } from 'zod';

const characterLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(50_000)
  .default(20_000);

export const secSectionsInputSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[A-Za-z0-9.-]+$/),
  accessionNumber: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
  formType: z.enum(['10-K', '10-Q']),
  maxCharacters: characterLimitSchema,
});

export interface SECSection {
  item: string | null;
  text: string | null;
  truncated: boolean;
  warnings: string[];
}

export interface SECSectionsResult {
  formType: '10-K' | '10-Q';
  sections: {
    business: SECSection;
    riskFactors: SECSection;
    mdAndA: SECSection;
  };
}

type DOMNode = ReturnType<ReturnType<typeof load>>[number];
type SectionKey = keyof SECSectionsResult['sections'];
type TextBlock = { text: string; linked: boolean };
type Heading = {
  start: number;
  end: number;
  item: string | null;
  part: 'I' | 'II' | null;
  section: SectionKey | null;
};

const blockTags = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'div',
  'dl',
  'dt',
  'dd',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

function normalize(text: string): string {
  return text
    .replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textBlocks(html: string): TextBlock[] {
  if (html.length > 25_000_000)
    throw new Error('SEC HTML exceeds the 25,000,000 character parsing limit');
  const $ = load(html);
  $(
    'script, style, noscript, template, head, nav, [role="navigation"], [hidden], [inert]',
  ).remove();
  $('*').each((_, element) => {
    const node = $(element);
    const style = (node.attr('style') ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const identity = `${node.attr('id') ?? ''} ${node.attr('class') ?? ''}`;
    if (
      ('name' in element && element.name.toLowerCase() === 'ix:hidden') ||
      node.attr('aria-hidden')?.toLowerCase() === 'true' ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?)\s*(?:!\s*important)?\s*(?:;|$)/i.test(
        style,
      ) ||
      /(?:^|[\s_-])(?:toc|table[-_]?of[-_]?contents)(?:$|[\s_-])/i.test(
        identity,
      )
    ) {
      node.remove();
    }
  });
  $('table').each((_, table) => {
    const linkedItems = $(table)
      .find('a[href]')
      .toArray()
      .filter((anchor) => /^item\s+\d/i.test(normalize($(anchor).text())));
    if (linkedItems.length >= 2) $(table).remove();
  });

  const blocks: TextBlock[] = [];
  let fragments: string[] = [];
  let hasLinkedText = false;
  let hasUnlinkedText = false;
  const flush = () => {
    const text = normalize(fragments.join(''));
    if (text) blocks.push({ text, linked: hasLinkedText && !hasUnlinkedText });
    fragments = [];
    hasLinkedText = false;
    hasUnlinkedText = false;
  };
  const stack: { node: DOMNode; exit: boolean; linked: boolean }[] = [];
  for (const node of $.root().contents().toArray().reverse()) {
    stack.push({ node, exit: false, linked: false });
  }
  let visited = 0;
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    if (entry.exit) {
      flush();
      continue;
    }
    visited += 1;
    if (visited > 500_000)
      throw new Error('SEC HTML exceeds the 500,000 node parsing limit');
    const { node } = entry;
    if (node.type === 'text') {
      fragments.push(node.data);
      if (normalize(node.data)) {
        if (entry.linked) hasLinkedText = true;
        else hasUnlinkedText = true;
      }
    } else if ('children' in node) {
      const name = 'name' in node ? node.name.toLowerCase() : '';
      const boundary = blockTags.has(name);
      if (boundary) {
        flush();
        stack.push({ ...entry, exit: true });
      }
      const linked =
        entry.linked ||
        (name === 'a' && 'attribs' in node && Boolean(node.attribs.href));
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: node.children[index], exit: false, linked });
      }
    }
  }
  flush();
  return blocks;
}

function sectionFor(
  item: string,
  title: string,
  form: '10-K' | '10-Q',
): SectionKey | null {
  const cleanTitle = title.replace(/^[.\s:;\-\u2013\u2014]+/, '');
  if (form === '10-K' && item === '1' && /^business\b/i.test(cleanTitle))
    return 'business';
  if (item === '1A' && /^risk\s+factors\b/i.test(cleanTitle))
    return 'riskFactors';
  if (
    item === (form === '10-K' ? '7' : '2') &&
    /^(?:management(?:['\u2019]s)?\s+discussion\s*(?:and|&)\s*analysis|md\s*&\s*a)\b/i.test(
      cleanTitle,
    )
  )
    return 'mdAndA';
  return null;
}

function headings(blocks: TextBlock[], form: '10-K' | '10-Q'): Heading[] {
  const result: Heading[] = [];
  let part: Heading['part'] = null;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.text.length > 400) continue;
    if (/^(?:signatures|exhibit\s+index)\s*\.?$/i.test(block.text)) {
      result.push({
        start: index,
        end: index + 1,
        item: null,
        part,
        section: null,
      });
      continue;
    }
    const partMatch =
      /^part\s+(II|I|2|1)(?:\s*[.\-\u2013\u2014:]?\s*(?:financial\s+information|other\s+information))?\s*\.?$/i.exec(
        block.text,
      );
    if (partMatch) {
      part = /^(?:II|2)$/i.test(partMatch[1]) ? 'II' : 'I';
      result.push({
        start: index,
        end: index + 1,
        item: null,
        part,
        section: null,
      });
      continue;
    }
    const match =
      /^item\s+(\d{1,2}[a-z]?)(?=[\s.\-\u2013\u2014:]|$)\s*[.\-\u2013\u2014:]?\s*(.*)$/i.exec(
        block.text,
      );
    if (!match) continue;
    const item = match[1].toUpperCase();
    let title = match[2];
    let end = index + 1;
    if (
      !title &&
      blocks[end] &&
      blocks[end].text.length <= 300 &&
      !/^(?:item\s+\d|part\s+[i12])/i.test(blocks[end].text)
    ) {
      title = blocks[end].text;
      end += 1;
    }
    while (
      end - index < 4 &&
      blocks[end] &&
      blocks[end].text.length <= 300 &&
      /^(?:risk|management(?:['\u2019]s)?(?:\s+discussion)?(?:\s*(?:and|&))?)$/i.test(
        title,
      ) &&
      /^(?:factors\b|discussion\b|(?:and|&)\s+analysis\b|analysis\b)/i.test(
        blocks[end].text,
      )
    ) {
      title += ` ${blocks[end].text}`;
      end += 1;
    }
    if (!title || /^(?:of|in|above|below|herein)\b/i.test(title)) continue;
    result.push({
      start: index,
      end,
      item,
      part,
      section: sectionFor(item, title, form),
    });
    index = end - 1;
  }
  return result;
}

export function extractSECSections(
  html: string,
  form: '10-K' | '10-Q',
  maxCharacters?: number,
): SECSectionsResult {
  const formType = secSectionsInputSchema.shape.formType.parse(form);
  const limit = characterLimitSchema.parse(maxCharacters);
  const blocks = textBlocks(html);
  const boundaries = headings(blocks, formType);
  const empty = (): SECSection => ({
    item: null,
    text: null,
    truncated: false,
    warnings: [],
  });
  const sections: SECSectionsResult['sections'] = {
    business: empty(),
    riskFactors: empty(),
    mdAndA: empty(),
  };
  const scores: Record<SectionKey, number> = {
    business: 0,
    riskFactors: 0,
    mdAndA: 0,
  };
  for (let index = 0; index < boundaries.length; index += 1) {
    const heading = boundaries[index];
    const key = heading.section;
    if (!key) continue;
    if (
      formType === '10-Q' &&
      heading.part !== null &&
      heading.part !== (key === 'riskFactors' ? 'II' : 'I')
    )
      continue;
    const content: string[] = [];
    let spanIndex = index;
    while (true) {
      const span = boundaries[spanIndex];
      const next = boundaries[spanIndex + 1];
      for (
        let blockIndex = span.end;
        blockIndex < (next?.start ?? blocks.length);
        blockIndex += 1
      ) {
        const block = blocks[blockIndex];
        if (
          /^(?:table\s+of\s+contents|\d+|[ivxlcdm]+)$/i.test(block.text) ||
          (block.linked &&
            /^(?:back\s+to|return\s+to|contents\b|next\b|previous\b|page\s+\d)/i.test(
              block.text,
            ))
        )
          continue;
        content.push(block.text);
      }
      if (
        !next ||
        next.item !== heading.item ||
        next.section !== key ||
        next.part !== heading.part
      )
        break;
      spanIndex += 1;
    }
    index = spanIndex;
    const text = content.join('\n\n').trim();
    const score = text.replace(/[^a-z]/gi, '').length;
    if (!score || score <= scores[key]) continue;
    scores[key] = score;
    const truncated = text.length > limit;
    let boundedText = text.slice(0, limit);
    if (truncated && /[\uD800-\uDBFF]$/.test(boundedText))
      boundedText = boundedText.slice(0, -1);
    sections[key] = {
      item: heading.item,
      text: boundedText,
      truncated,
      warnings: truncated
        ? [
            `Section truncated to at most ${limit} characters (originally ${text.length}).`,
          ]
        : [],
    };
  }
  return { formType, sections };
}
