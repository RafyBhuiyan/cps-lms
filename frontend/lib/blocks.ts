/**
 * Plain text ↔ Strapi's `blocks` rich-text format.
 *
 * Both authoring forms in this app — the blog editor and the lesson editor — take
 * a plain `<textarea>` and store blocks, because that is the field type and the
 * REST API will not accept a string. Anything richer belongs in the Strapi editor,
 * which is a block editor already; [components/Blocks.tsx](../components/Blocks.tsx)
 * renders the full format either way.
 *
 * The round trip is deliberately lossy. `fromBlocks` flattens headings, lists and
 * quotes to their text, so re-saving content authored in the Strapi admin through
 * one of these forms turns it into paragraphs. That is why the lesson editor says
 * so next to the field.
 */

import type { BlockNode } from './types';

/** Plain text to blocks: blank lines separate paragraphs. */
export const toBlocks = (text: string): BlockNode[] => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return (paragraphs.length > 0 ? paragraphs : ['']).map((paragraph) => ({
    type: 'paragraph',
    children: [{ type: 'text', text: paragraph }],
  }));
};

/** Every leaf's text, in order. Unknown node types contribute their children. */
const textOf = (node: BlockNode): string =>
  node.children ? node.children.map(textOf).join('') : (node.text ?? '');

/**
 * Blocks back to plain text, as the inverse of `toBlocks`: one top-level block per
 * paragraph, separated by a blank line so editing and re-saving is a no-op for
 * anything this form produced. A list becomes one line per item, which is the
 * closest readable equivalent.
 */
export const fromBlocks = (content?: BlockNode[] | null): string => {
  if (!content || content.length === 0) {
    return '';
  }

  return content
    .map((node) =>
      node.type === 'list'
        ? (node.children ?? []).map(textOf).join('\n')
        : textOf(node)
    )
    .join('\n\n')
    .trim();
};
