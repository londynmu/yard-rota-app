import React from 'react';

/**
 * Shared Markdown element styling for induction guide (read + admin preview).
 */
export function getInductionMarkdownComponents() {
  return {
    h1: ({ node, ...props }) => (
      <h1 className="text-base font-semibold text-charcoal mt-5 mb-2 first:mt-0" {...props} />
    ),
    h2: ({ node, ...props }) => (
      <h2 className="text-sm font-semibold text-charcoal mt-4 mb-2" {...props} />
    ),
    h3: ({ node, ...props }) => (
      <h3 className="text-sm font-medium text-charcoal mt-3 mb-1.5" {...props} />
    ),
    p: ({ node, ...props }) => <p className="text-sm text-slate-700 mb-3 leading-relaxed" {...props} />,
    ul: ({ node, ...props }) => (
      <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-slate-700" {...props} />
    ),
    ol: ({ node, ...props }) => (
      <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-slate-700" {...props} />
    ),
    li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
    strong: ({ node, ...props }) => <strong className="font-semibold text-charcoal" {...props} />,
    em: ({ node, ...props }) => <em className="italic text-slate-700" {...props} />,
    blockquote: ({ node, ...props }) => (
      <blockquote
        className="border-l-4 border-slate-300 pl-4 my-4 text-sm text-slate-600 italic"
        {...props}
      />
    ),
    hr: () => <hr className="my-6 border-slate-200" />,
    a: ({ href, children, node, ...rest }) => (
      <a
        href={href}
        className="text-blue-600 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    ),
    img: ({ src, alt, node, ...rest }) => (
      <img
        src={src}
        alt={alt || ''}
        loading="lazy"
        className="max-w-full rounded-xl border border-slate-200/80 shadow-sm my-4"
        {...rest}
      />
    ),
    table: ({ node, ...props }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full text-sm border border-slate-200 rounded-lg border-collapse" {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => <thead className="bg-slate-50" {...props} />,
    tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-200" {...props} />,
    tr: ({ node, ...props }) => <tr {...props} />,
    th: ({ node, ...props }) => (
      <th className="px-3 py-2 text-left font-semibold text-charcoal border-b border-slate-200" {...props} />
    ),
    td: ({ node, ...props }) => <td className="px-3 py-2 text-slate-700 border-b border-slate-100" {...props} />,
    code: ({ className, children, ...props }) => {
      if (!className) {
        return (
          <code
            className="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono text-charcoal"
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={`text-sm font-mono ${className}`} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre
        className="bg-slate-50 p-3 rounded-lg text-sm overflow-x-auto my-3 border border-slate-200"
        {...props}
      >
        {children}
      </pre>
    ),
  };
}
