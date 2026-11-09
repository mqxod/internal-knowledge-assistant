import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";

const ALLOWED = ["p", "strong", "em", "ul", "ol", "li", "code", "pre", "a", "blockquote", "h3", "h4", "br", "hr", "del"];

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium underline underline-offset-4">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
};

/**
 * Renders model output as Markdown without raw HTML (skipHtml), with an element allow-list
 * and the default URL sanitiser (blocks javascript: and other unsafe protocols).
 * Headings are demoted and images are not rendered.
 */
export function SafeMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h3]:font-semibold [&_h4]:font-semibold">
      <ReactMarkdown
        skipHtml
        allowedElements={ALLOWED}
        unwrapDisallowed
        urlTransform={defaultUrlTransform}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
