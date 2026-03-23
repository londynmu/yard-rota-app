import React from 'react';

const COLOR_CLASS_BY_TOKEN = {
  info: 'text-blue-700',
  warning: 'text-amber-700',
  danger: 'text-rose-700',
  success: 'text-emerald-700',
};

const COLOR_TOKEN_REGEX = /::color-(info|warning|danger|success)\[([^\]]+)\]/g;

function tokenizeTextWithColors(text, keyPrefix = 'color') {
  const nodes = [];
  let match;
  let lastIndex = 0;
  let tokenIndex = 0;

  while ((match = COLOR_TOKEN_REGEX.exec(text)) !== null) {
    const [full, token, content] = match;
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    nodes.push(
      <span key={`${keyPrefix}-${tokenIndex}`} className={COLOR_CLASS_BY_TOKEN[token]}>
        {content}
      </span>
    );
    lastIndex = start + full.length;
    tokenIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function renderChildrenWithColorTokens(children, keyPrefix = 'node') {
  return React.Children.toArray(children).flatMap((child, idx) => {
    if (typeof child === 'string') {
      return tokenizeTextWithColors(child, `${keyPrefix}-${idx}`);
    }

    if (React.isValidElement(child) && child.props?.children) {
      return React.cloneElement(child, {
        ...child.props,
        children: renderChildrenWithColorTokens(child.props.children, `${keyPrefix}-${idx}`),
      });
    }

    return child;
  });
}

/**
 * Shared Markdown element styling for induction guide (read + admin preview).
 */
export function getInductionMarkdownComponents() {
  return {
    h1: ({ node, children, ...props }) => (
      <h1 className="text-base font-semibold text-charcoal mt-5 mb-2 first:mt-0" {...props}>
        {renderChildrenWithColorTokens(children, 'h1')}
      </h1>
    ),
    h2: ({ node, children, ...props }) => (
      <h2 className="text-sm font-semibold text-charcoal mt-4 mb-2" {...props}>
        {renderChildrenWithColorTokens(children, 'h2')}
      </h2>
    ),
    h3: ({ node, children, ...props }) => (
      <h3 className="text-sm font-medium text-charcoal mt-3 mb-1.5" {...props}>
        {renderChildrenWithColorTokens(children, 'h3')}
      </h3>
    ),
    p: ({ node, children, ...props }) => (
      <p className="text-sm text-slate-700 mb-3 leading-relaxed" {...props}>
        {renderChildrenWithColorTokens(children, 'p')}
      </p>
    ),
    ul: ({ node, ...props }) => (
      <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-slate-700" {...props} />
    ),
    ol: ({ node, ...props }) => (
      <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-slate-700" {...props} />
    ),
    li: ({ node, children, ...props }) => <li className="leading-relaxed" {...props}>{renderChildrenWithColorTokens(children, 'li')}</li>,
    strong: ({ node, children, ...props }) => <strong className="font-semibold text-charcoal" {...props}>{renderChildrenWithColorTokens(children, 'strong')}</strong>,
    em: ({ node, children, ...props }) => <em className="italic text-slate-700" {...props}>{renderChildrenWithColorTokens(children, 'em')}</em>,
    blockquote: ({ node, children, ...props }) => (
      <blockquote
        className="border-l-4 border-slate-300 pl-4 my-4 text-sm text-slate-600 italic"
        {...props}
      >
        {renderChildrenWithColorTokens(children, 'blockquote')}
      </blockquote>
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
    th: ({ node, children, ...props }) => (
      <th className="px-3 py-2 text-left font-semibold text-charcoal border-b border-slate-200" {...props}>
        {renderChildrenWithColorTokens(children, 'th')}
      </th>
    ),
    td: ({ node, children, ...props }) => (
      <td className="px-3 py-2 text-slate-700 border-b border-slate-100" {...props}>
        {renderChildrenWithColorTokens(children, 'td')}
      </td>
    ),
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
