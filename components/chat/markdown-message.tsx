"use client";

import { useState, type PropsWithChildren, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return collectText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeFrame({ children }: PropsWithChildren) {
  const [copied, setCopied] = useState(false);
  const source = collectText(children);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-frame">
      <div className="code-frame-bar">
        <span>CODE</span>
        <button type="button" onClick={() => void copyCode()} aria-label="Copy code">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{ pre: CodeFrame }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
