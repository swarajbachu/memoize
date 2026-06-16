import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "~/lib/utils";

import { CodeBlock } from "./code-block.tsx";

const languageFromClassName = (className: unknown): string | undefined => {
  if (typeof className !== "string") return undefined;
  const match = /(?:^|\s)language-([^\s]+)/.exec(className);
  return match?.[1];
};

const textFromReactNode = (node: ReactNode): string => {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "bigint") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textFromReactNode).join("");
  return "";
};

const codeChildFromPre = (node: ReactNode): ReactNode => {
  if (isValidElement(node) && node.type === "code") return node;
  if (Array.isArray(node)) {
    return node.find((child) => isValidElement(child) && child.type === "code");
  }
  return undefined;
};

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
export function MarkdownBody({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("fz-prose", className)}>
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
                window.memoize?.app?.openExternal(href);
              }}
            >
              {children}
            </a>
          ),
          pre: ({ children }) => {
            const codeChild = codeChildFromPre(children);
            if (!isValidElement(codeChild)) {
              return <pre>{children}</pre>;
            }

            const codeProps = codeChild.props as {
              className?: string;
              children?: ReactNode;
            };
            const language = languageFromClassName(codeProps.className);
            const text = textFromReactNode(codeProps.children).replace(
              /\n$/,
              "",
            );
            const filename =
              language === undefined ? "snippet.txt" : `snippet.${language}`;

            return (
              <div className="markdown-code-block">
                <CodeBlock
                  filename={filename}
                  language={language}
                  text={text}
                  maxHeight={360}
                />
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
