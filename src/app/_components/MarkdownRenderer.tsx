"use client";

import { useDeferredValue, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Single dollars are currency ("$1,200 to $5,000"), not math: inline math needs $$…$$
const remarkPlugins: Options["remarkPlugins"] = [
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }],
];
const rehypePlugins = [rehypeHighlight, rehypeKatex];

/** Fenced code blocks and inline code spans, left untouched by the LaTeX rewrite. */
const CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

/**
 * Normalize LaTeX delimiters so remark-math can parse them.
 * remark-math (single dollars disabled) recognises `$$...$$` only.
 * Many LLMs emit `\[...\]` (display) / `\(...\)` (inline) or even
 * bare `[ ... ]` blocks that contain LaTeX commands — convert them all,
 * except inside code.
 */
export function preprocessLaTeX(content: string): string {
  return content
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : convertLaTeX(part)))
    .join("");
}

function convertLaTeX(text: string): string {
  // \[...\]  →  $$...$$
  let result = text.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_m, inner: string) => `$$${inner}$$`,
  );
  // \(...\)  →  $$...$$ (inline math needs two dollars)
  result = result.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_m, inner: string) => `$$${inner}$$`,
  );
  // Bare [ ... ] on its own line that contains obvious LaTeX commands
  result = result.replace(
    /^\[\s*(\\(?:text|frac|sqrt|sum|prod|int|left|right|bar|hat|vec|mathbb|mathrm|operatorname)\b[\s\S]*?)\s*\]$/gm,
    (_m, inner: string) => `$$${inner}$$`,
  );
  return result;
}

type MdProps<
  T extends
    | "h1"
    | "h2"
    | "h3"
    | "p"
    | "ul"
    | "ol"
    | "li"
    | "strong"
    | "em"
    | "code"
    | "pre"
    | "table"
    | "thead"
    | "th"
    | "td"
    | "blockquote"
    | "a"
    | "hr",
> = ComponentPropsWithoutRef<T> & { node?: unknown };

/** react-markdown passes its AST `node`: never forward it to the DOM. */
function withoutNode<P extends { node?: unknown }>(props: P): Omit<P, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

// Stable component map — extracted to module level so ReactMarkdown
// doesn't reconcile a new object on every streaming chunk.
const mdComponents = {
  h1: (props: MdProps<"h1">) => (
    <h1
      className="mt-4 mb-3 text-xl font-bold text-white first:mt-0"
      {...withoutNode(props)}
    />
  ),
  h2: (props: MdProps<"h2">) => (
    <h2
      className="mt-3 mb-2 text-lg font-semibold text-white first:mt-0"
      {...withoutNode(props)}
    />
  ),
  h3: (props: MdProps<"h3">) => (
    <h3
      className="mt-3 mb-2 text-base font-semibold text-white first:mt-0"
      {...withoutNode(props)}
    />
  ),
  p: (props: MdProps<"p">) => (
    <p
      className="mb-2 leading-relaxed text-gray-300 last:mb-0"
      {...withoutNode(props)}
    />
  ),
  ul: (props: MdProps<"ul">) => (
    <ul
      className="mb-2 ml-4 list-disc space-y-1 text-gray-300"
      {...withoutNode(props)}
    />
  ),
  ol: (props: MdProps<"ol">) => (
    <ol
      className="mb-2 ml-4 list-decimal space-y-1 text-gray-300"
      {...withoutNode(props)}
    />
  ),
  li: (props: MdProps<"li">) => (
    <li className="text-gray-300" {...withoutNode(props)} />
  ),
  strong: (props: MdProps<"strong">) => (
    <strong className="font-semibold text-white" {...withoutNode(props)} />
  ),
  em: (props: MdProps<"em">) => (
    <em className="text-gray-200" {...withoutNode(props)} />
  ),
  code: ({ className: codeClassName, children, ...props }: MdProps<"code">) => {
    const isInline = !codeClassName;
    if (isInline) {
      return (
        <code
          className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-emerald-300"
          {...withoutNode(props)}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={codeClassName} {...withoutNode(props)}>
        {children}
      </code>
    );
  },
  pre: (props: MdProps<"pre">) => (
    <pre
      className="mb-3 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-4 text-sm"
      {...withoutNode(props)}
    />
  ),
  table: (props: MdProps<"table">) => (
    <div className="mb-3 overflow-x-auto">
      <table
        className="min-w-full border-collapse text-sm"
        {...withoutNode(props)}
      />
    </div>
  ),
  thead: (props: MdProps<"thead">) => (
    <thead className="border-b border-white/20" {...withoutNode(props)} />
  ),
  th: (props: MdProps<"th">) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-gray-300"
      {...withoutNode(props)}
    />
  ),
  td: (props: MdProps<"td">) => (
    <td
      className="border-t border-white/5 px-3 py-2 text-gray-400"
      {...withoutNode(props)}
    />
  ),
  blockquote: (props: MdProps<"blockquote">) => (
    <blockquote
      className="mb-2 border-l-2 border-violet-500/50 pl-4 text-gray-400 italic"
      {...withoutNode(props)}
    />
  ),
  a: (props: MdProps<"a">) => (
    <a
      className="text-violet-400 underline hover:text-violet-300"
      target="_blank"
      rel="noopener noreferrer"
      {...withoutNode(props)}
    />
  ),
  hr: (props: MdProps<"hr">) => (
    <hr className="my-3 border-white/10" {...withoutNode(props)} />
  ),
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

export function MarkdownRenderer({
  content,
  className = "",
  isStreaming = false,
}: MarkdownRendererProps) {
  const deferred = useDeferredValue(content);
  const processed = preprocessLaTeX(deferred);

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={mdComponents}
      >
        {processed}
      </ReactMarkdown>
      {isStreaming && content && (
        <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-emerald-400" />
      )}
    </div>
  );
}
