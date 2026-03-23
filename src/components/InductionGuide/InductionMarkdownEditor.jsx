import React, { useCallback } from 'react';

const COLOR_OPTIONS = [
  { value: '', label: 'Text color' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'danger', label: 'Danger' },
  { value: 'success', label: 'Success' },
];

export default function InductionMarkdownEditor({
  value,
  onChange,
  textareaRef,
  rows = 18,
  placeholder = '',
}) {
  const applyTransform = useCallback(
    (transformer) => {
      const ta = textareaRef?.current;
      const text = value || '';

      if (!ta) {
        const fallback = transformer(text, 0, 0);
        onChange(fallback.nextText);
        return;
      }

      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const result = transformer(text, start, end);

      onChange(result.nextText);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(result.nextStart, result.nextEnd);
      });
    },
    [onChange, textareaRef, value]
  );

  const wrapSelection = useCallback(
    (prefix, suffix = prefix, defaultText = 'text') => {
      applyTransform((text, start, end) => {
        const selected = text.slice(start, end);
        const content = selected || defaultText;
        const insert = `${prefix}${content}${suffix}`;
        const nextText = text.slice(0, start) + insert + text.slice(end);
        const selectStart = start + prefix.length;
        const selectEnd = selectStart + content.length;
        return {
          nextText,
          nextStart: selectStart,
          nextEnd: selectEnd,
        };
      });
    },
    [applyTransform]
  );

  const prefixLines = useCallback(
    (linePrefix) => {
      applyTransform((text, start, end) => {
        const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const lineEndIdx = text.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
        const block = text.slice(lineStart, lineEnd);
        const lines = block.split('\n');
        const nextBlock = lines.map((line) => `${linePrefix}${line}`).join('\n');
        const nextText = text.slice(0, lineStart) + nextBlock + text.slice(lineEnd);
        const addedChars = nextBlock.length - block.length;
        return {
          nextText,
          nextStart: start + linePrefix.length,
          nextEnd: end + addedChars,
        };
      });
    },
    [applyTransform]
  );

  const insertBlock = useCallback(
    (content, cursorOffset = content.length) => {
      applyTransform((text, start, end) => {
        const insert = `\n\n${content}\n\n`;
        const nextText = text.slice(0, start) + insert + text.slice(end);
        const nextCursor = start + 2 + cursorOffset;
        return {
          nextText,
          nextStart: nextCursor,
          nextEnd: nextCursor,
        };
      });
    },
    [applyTransform]
  );

  const setHeading = useCallback(
    (level) => {
      applyTransform((text, start, end) => {
        const marker = `${'#'.repeat(level)} `;
        const selected = text.slice(start, end) || 'Heading';
        const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const lineEndIdx = text.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
        const nextLine = `${marker}${selected.replace(/^[#\s]+/, '')}`;
        const nextText = text.slice(0, lineStart) + nextLine + text.slice(lineEnd);
        const selectStart = lineStart + marker.length;
        const selectEnd = selectStart + nextLine.length - marker.length;
        return {
          nextText,
          nextStart: selectStart,
          nextEnd: selectEnd,
        };
      });
    },
    [applyTransform]
  );

  const addLink = useCallback(() => {
    wrapSelection('[', '](https://example.com)', 'link text');
  }, [wrapSelection]);

  const addColorToken = useCallback(
    (token) => {
      if (!token) return;
      wrapSelection(`::color-${token}[`, ']', 'colored text');
    },
    [wrapSelection]
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => wrapSelection('**')} className="btn-secondary btn-modern text-xs py-1 px-2">
          Bold
        </button>
        <button type="button" onClick={() => wrapSelection('*')} className="btn-secondary btn-modern text-xs py-1 px-2">
          Italic
        </button>
        <button type="button" onClick={() => setHeading(1)} className="btn-secondary btn-modern text-xs py-1 px-2">
          H1
        </button>
        <button type="button" onClick={() => setHeading(2)} className="btn-secondary btn-modern text-xs py-1 px-2">
          H2
        </button>
        <button type="button" onClick={() => setHeading(3)} className="btn-secondary btn-modern text-xs py-1 px-2">
          H3
        </button>
        <button type="button" onClick={() => prefixLines('- ')} className="btn-secondary btn-modern text-xs py-1 px-2">
          Bullets
        </button>
        <button type="button" onClick={() => prefixLines('1. ')} className="btn-secondary btn-modern text-xs py-1 px-2">
          Numbered
        </button>
        <button type="button" onClick={() => prefixLines('> ')} className="btn-secondary btn-modern text-xs py-1 px-2">
          Quote
        </button>
        <button type="button" onClick={() => wrapSelection('`')} className="btn-secondary btn-modern text-xs py-1 px-2">
          Inline code
        </button>
        <button
          type="button"
          onClick={() => insertBlock('```\ncode here\n```', 4)}
          className="btn-secondary btn-modern text-xs py-1 px-2"
        >
          Code block
        </button>
        <button type="button" onClick={addLink} className="btn-secondary btn-modern text-xs py-1 px-2">
          Link
        </button>
        <button
          type="button"
          onClick={() => insertBlock('| Column | Value |\n| --- | --- |\n| A | B |', 2)}
          className="btn-secondary btn-modern text-xs py-1 px-2"
        >
          Table
        </button>
        <button type="button" onClick={() => insertBlock('---', 3)} className="btn-secondary btn-modern text-xs py-1 px-2">
          Divider
        </button>
        <select
          className="rounded-xl border border-slate-300 px-2 py-1 text-xs text-charcoal bg-white"
          defaultValue=""
          onChange={(e) => {
            addColorToken(e.target.value);
            e.target.value = '';
          }}
        >
          {COLOR_OPTIONS.map((option) => (
            <option key={option.value || 'placeholder'} value={option.value} disabled={option.value === ''}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono text-charcoal focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
        placeholder={placeholder}
      />
    </div>
  );
}
