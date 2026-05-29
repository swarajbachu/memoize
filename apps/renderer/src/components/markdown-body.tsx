import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Shared markdown surface for PR descriptions, comments, review bodies, and
 * assistant chat bubbles. Reuses the `fz-prose` typography class already
 * tuned for chat messages so link colors / list spacing / code blocks stay
 * consistent across the app.
 *
 * All http(s) anchors are intercepted and handed to `shell.openExternal` via
 * the preload bridge so a click never navigates the renderer or opens a
 * child Electron window — every clicked link lands in the user's default
 * browser. Non-http schemes (e.g. `memoize://attachments/...`) are left to
 * their own handlers.
 */
export function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="fz-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a
              {...rest}
              href={href}
              onClick={(e) => {
                if (typeof href !== "string") return;
                if (!/^https?:\/\//i.test(href)) return;
                e.preventDefault();
                window.memoize?.app.openExternal(href);
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
