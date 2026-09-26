import React from 'react';

interface WhatsAppFormattedTextProps {
  text: string;
  className?: string;
}

export const WhatsAppFormattedText: React.FC<WhatsAppFormattedTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Split by code blocks ```...``` first
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const blocks: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIdx = 0;

  const parseInlineFormatting = (inlineText: string, prefix: string): React.ReactNode[] => {
    const lines = inlineText.split('\n');

    return lines.map((line, lineIdx) => {
      // Regex for `inline code`, *bold*, _italic_, and ~strikethrough~
      // Match inline code first to prevent inner characters from triggering other styles
      const tokenRegex = /(`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~)/g;
      const elements: React.ReactNode[] = [];
      let lastTokenIndex = 0;
      let tokenMatch: RegExpExecArray | null;

      while ((tokenMatch = tokenRegex.exec(line)) !== null) {
        if (tokenMatch.index > lastTokenIndex) {
          elements.push(line.slice(lastTokenIndex, tokenMatch.index));
        }

        const fullMatch = tokenMatch[0];
        const key = `${prefix}-${lineIdx}-${tokenMatch.index}`;

        if (fullMatch.startsWith('`')) {
          // Inline monospace code
          elements.push(
            <code
              key={key}
              className="font-mono text-[11px] bg-[#111b21] px-1 py-0.5 rounded border border-[#2a3942] text-[#00a884]"
            >
              {tokenMatch[2]}
            </code>
          );
        } else if (fullMatch.startsWith('*')) {
          // Bold
          elements.push(
            <strong key={key} className="font-bold text-[#e9edef]">
              {tokenMatch[3]}
            </strong>
          );
        } else if (fullMatch.startsWith('_')) {
          // Italic
          elements.push(
            <em key={key} className="italic text-[#d1d7db]">
              {tokenMatch[4]}
            </em>
          );
        } else if (fullMatch.startsWith('~')) {
          // Strikethrough
          elements.push(
            <del key={key} className="line-through text-[#8696a0]">
              {tokenMatch[5]}
            </del>
          );
        }

        lastTokenIndex = tokenRegex.lastIndex;
      }

      if (lastTokenIndex < line.length) {
        elements.push(line.slice(lastTokenIndex));
      }

      return (
        <React.Fragment key={`${prefix}-line-${lineIdx}`}>
          {elements}
          {lineIdx < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push(parseInlineFormatting(text.slice(lastIndex, match.index), `text-${blockIdx}`));
    }
    blocks.push(
      <pre
        key={`codeblock-${blockIdx}`}
        className="font-mono text-[11px] bg-[#111b21] p-2.5 rounded my-1.5 border border-[#2a3942] text-[#00a884] overflow-x-auto whitespace-pre select-text"
      >
        <code>{match[1]}</code>
      </pre>
    );
    lastIndex = codeBlockRegex.lastIndex;
    blockIdx++;
  }

  if (lastIndex < text.length) {
    blocks.push(parseInlineFormatting(text.slice(lastIndex), `text-${blockIdx}`));
  }

  return (
    <div className={`leading-relaxed select-text text-left whitespace-pre-wrap break-words ${className}`}>
      {blocks}
    </div>
  );
};
