import { Text, View, StyleSheet, Platform } from "react-native";
import { Block } from "../lib/types";

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

interface TextPart {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

function parseInlineMarkdown(text: string): TextPart[] {
  const result: TextPart[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      result.push({ text: boldMatch[2], bold: true });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^(\*|_)(.+?)\1/);
    if (italicMatch) {
      result.push({ text: italicMatch[2], italic: true });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[\*_]/);
    if (nextSpecial === -1) {
      result.push({ text: remaining });
      break;
    } else if (nextSpecial === 0) {
      result.push({ text: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      result.push({ text: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    }
  }

  return result;
}

function RenderMarkdown({ text, style, isDark }: { text: string; style?: object; isDark: boolean }) {
  const parts = parseInlineMarkdown(text);
  return (
    <Text style={[styles.text, isDark && styles.textDark, style]}>
      {parts.map((part, i) => (
        <Text
          key={i}
          style={[
            part.bold && styles.bold,
            part.italic && styles.italic,
          ]}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

interface Props {
  block: Block;
  isDark: boolean;
}

export function MarkdownLine({ block, isDark }: Props) {
  const text = block.text;

  const todoMatch = text.match(/^(\s*)- \[([ x])\] (.*)$/);
  if (todoMatch) {
    const [, indent, checked, content] = todoMatch;
    const isChecked = checked === "x";
    return (
      <View style={[styles.row, { paddingLeft: indent.length * 8 }]}>
        <Text style={[styles.bullet, isDark && styles.bulletDark]}>
          {isChecked ? "☑" : "☐"}
        </Text>
        <RenderMarkdown
          text={content}
          style={isChecked && styles.strikethrough}
          isDark={isDark}
        />
        <Text style={[styles.date, isDark && styles.dateDark]}>
          {formatDate(block.createdAt)}
        </Text>
      </View>
    );
  }

  const bulletMatch = text.match(/^(\s*)- (.*)$/);
  if (bulletMatch) {
    const [, indent, content] = bulletMatch;
    return (
      <View style={[styles.row, { paddingLeft: indent.length * 8 }]}>
        <Text style={[styles.bullet, isDark && styles.bulletDark]}>•</Text>
        <RenderMarkdown text={content} isDark={isDark} />
        <Text style={[styles.date, isDark && styles.dateDark]}>
          {formatDate(block.createdAt)}
        </Text>
      </View>
    );
  }

  const numberMatch = text.match(/^(\s*)(\d+)\. (.*)$/);
  if (numberMatch) {
    const [, indent, num, content] = numberMatch;
    return (
      <View style={[styles.row, { paddingLeft: indent.length * 8 }]}>
        <Text style={[styles.number, isDark && styles.numberDark]}>{num}.</Text>
        <RenderMarkdown text={content} isDark={isDark} />
        <Text style={[styles.date, isDark && styles.dateDark]}>
          {formatDate(block.createdAt)}
        </Text>
      </View>
    );
  }

  if (!text.trim()) {
    return <View style={styles.emptyLine} />;
  }

  return (
    <View style={styles.row}>
      <RenderMarkdown text={text} isDark={isDark} />
      <Text style={[styles.date, isDark && styles.dateDark]}>
        {formatDate(block.createdAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 2,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  textDark: {
    color: "#f5f5f5",
  },
  bold: {
    fontWeight: "bold",
  },
  italic: {
    fontStyle: "italic",
  },
  strikethrough: {
    textDecorationLine: "line-through",
    opacity: 0.5,
  },
  bullet: {
    color: "#999",
    fontSize: 14,
    lineHeight: 21,
  },
  bulletDark: {
    color: "#666",
  },
  number: {
    color: "#999",
    fontSize: 14,
    lineHeight: 21,
    minWidth: 20,
    textAlign: "right",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  numberDark: {
    color: "#666",
  },
  date: {
    fontSize: 10,
    color: "rgba(0,0,0,0.2)",
    marginLeft: "auto",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  dateDark: {
    color: "rgba(255,255,255,0.2)",
  },
  emptyLine: {
    height: 21,
  },
});
