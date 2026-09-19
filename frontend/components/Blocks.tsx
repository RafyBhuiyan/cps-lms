/**
 * Renderer for Strapi's `blocks` rich-text format (lesson content, blog bodies).
 *
 * Written here rather than pulled in as a dependency — the format is a small tree
 * and this project adds no packages. Unknown node types fall through to their
 * text, so content authored with a block this does not know about degrades to
 * readable prose instead of an empty page.
 */

import type { ReactNode } from 'react';
import type { BlockNode } from '@/lib/types';

const headingClasses: Record<number, string> = {
  1: 'mt-8 mb-3 text-2xl font-semibold tracking-tight',
  2: 'mt-8 mb-3 text-xl font-semibold tracking-tight',
  3: 'mt-6 mb-2 text-lg font-semibold',
  4: 'mt-6 mb-2 text-base font-semibold',
  5: 'mt-4 mb-2 text-sm font-semibold',
  6: 'mt-4 mb-2 text-sm font-semibold uppercase tracking-wide',
};

/** A leaf: text plus any combination of formatting flags. */
function Leaf({ node }: { node: BlockNode }) {
  let content: ReactNode = node.text ?? '';

  if (node.code) {
    content = (
      <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.10]">
        {content}
      </code>
    );
  }
  if (node.bold) content = <strong>{content}</strong>;
  if (node.italic) content = <em>{content}</em>;
  if (node.underline) content = <u>{content}</u>;
  if (node.strikethrough) content = <s>{content}</s>;

  return <>{content}</>;
}

function Children({ nodes }: { nodes?: BlockNode[] }) {
  return (
    <>
      {(nodes ?? []).map((child, index) => (
        <Node key={index} node={child} />
      ))}
    </>
  );
}

function Node({ node }: { node: BlockNode }) {
  switch (node.type) {
    case 'paragraph':
      // An empty paragraph is how the editor represents a blank line; rendering
      // `<p>` with no content would collapse it, so it becomes a spacer.
      return (node.children ?? []).some((child) => child.text) ? (
        <p className="my-4 leading-7">
          <Children nodes={node.children} />
        </p>
      ) : (
        <p className="h-4" />
      );

    case 'heading': {
      const level = Math.min(6, Math.max(1, node.level ?? 2));
      const Tag = `h${level}` as 'h1';
      return (
        <Tag className={headingClasses[level]}>
          <Children nodes={node.children} />
        </Tag>
      );
    }

    case 'list':
      return node.format === 'ordered' ? (
        <ol className="my-4 list-decimal space-y-1 pl-6 leading-7">
          <Children nodes={node.children} />
        </ol>
      ) : (
        <ul className="my-4 list-disc space-y-1 pl-6 leading-7">
          <Children nodes={node.children} />
        </ul>
      );

    case 'list-item':
      return (
        <li>
          <Children nodes={node.children} />
        </li>
      );

    case 'quote':
      return (
        <blockquote className="my-4 border-l-2 border-black/20 pl-4 italic dark:border-white/25">
          <Children nodes={node.children} />
        </blockquote>
      );

    case 'code':
      return (
        <pre className="my-4 overflow-x-auto rounded-md bg-black/[.06] p-4 text-sm dark:bg-white/[.08]">
          <code className="font-mono">
            {(node.children ?? []).map((child) => child.text ?? '').join('\n')}
          </code>
        </pre>
      );

    case 'link':
      return (
        <a
          href={node.url}
          className="underline decoration-zinc-400 underline-offset-2 hover:decoration-current"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Children nodes={node.children} />
        </a>
      );

    case 'image': {
      if (!node.image?.url) {
        return null;
      }

      // Plain <img>: these URLs come from the API and may point anywhere, which
      // next/image would need configured host allowlisting for.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={node.image.url} alt={node.image.alternativeText ?? ''} className="my-4 max-w-full rounded-md" />;
    }

    default:
      // Leaves (`type: 'text'`) and anything unrecognized.
      return node.children ? <Children nodes={node.children} /> : <Leaf node={node} />;
  }
}

export function Blocks({ content }: { content?: BlockNode[] | null }) {
  if (!content || content.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">No content yet.</p>;
  }

  return (
    <div className="text-[15px]">
      {content.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </div>
  );
}
