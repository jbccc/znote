import { Block } from "../lib/app-types";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      result.push(<strong key={key++}>{renderInlineMarkdown(boldMatch[2])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^(\*|_)(.+?)\1/);
    if (italicMatch) {
      result.push(<em key={key++}>{renderInlineMarkdown(italicMatch[2])}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[\*_]/);
    if (nextSpecial === -1) {
      result.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      result.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      result.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return result;
}

export function MarkdownLine({ block }: { block: Block }) {
  const text = block.text;

  const todoMatch = text.match(/^(\s*)- \[([ x])\] (.*)$/);
  if (todoMatch) {
    const [, indent, checked, content] = todoMatch;
    return (
      <div className="group flex items-start gap-2" style={{ paddingLeft: indent.length * 8 }}>
        <span className="text-foreground/40 select-none">{checked === "x" ? "☑" : "☐"}</span>
        <span className={checked === "x" ? "line-through text-foreground/40" : ""}>
          {renderInlineMarkdown(content)}
        </span>
        <span className="ml-auto text-[10px] text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatDate(block.createdAt)}
        </span>
      </div>
    );
  }

  const bulletMatch = text.match(/^(\s*)- (.*)$/);
  if (bulletMatch) {
    const [, indent, content] = bulletMatch;
    return (
      <div className="group flex items-start gap-2" style={{ paddingLeft: indent.length * 8 }}>
        <span className="text-foreground/40 select-none">•</span>
        <span>{renderInlineMarkdown(content)}</span>
        <span className="ml-auto text-[10px] text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatDate(block.createdAt)}
        </span>
      </div>
    );
  }

  const numberMatch = text.match(/^(\s*)(\d+)\. (.*)$/);
  if (numberMatch) {
    const [, indent, num, content] = numberMatch;
    return (
      <div className="group flex items-start gap-2" style={{ paddingLeft: indent.length * 8 }}>
        <span className="text-foreground/40 select-none min-w-[1.5em] text-right">{num}.</span>
        <span>{renderInlineMarkdown(content)}</span>
        <span className="ml-auto text-[10px] text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatDate(block.createdAt)}
        </span>
      </div>
    );
  }

  if (!text.trim()) {
    return <div className="h-[1.5em]" />;
  }

  return (
    <div className="group flex items-start">
      <span>{renderInlineMarkdown(text)}</span>
      <span className="ml-auto text-[10px] text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pl-4">
        {formatDate(block.createdAt)}
      </span>
    </div>
  );
}
