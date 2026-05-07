import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Shared markdown surface for PR descriptions, comments, and review bodies.
 * Reuses the `fz-prose` typography class already tuned for chat messages so
 * link colors / list spacing / code blocks stay consistent across the app.
 */
export function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="fz-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
