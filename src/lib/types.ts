export interface Block {
  id: string;
  text: string;
  createdAt: string;
}

export interface NoteData {
  blocks: Block[];
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function parseNoteData(content: string): NoteData {
  if (!content) return { blocks: [] };

  try {
    const parsed = JSON.parse(content);
    if (parsed.blocks) return parsed;
  } catch {
    // Legacy plain text - convert to blocks
    const lines = content.split("\n");
    return {
      blocks: lines.map((text) => ({
        id: generateId(),
        text,
        createdAt: new Date().toISOString(),
      })),
    };
  }

  return { blocks: [] };
}

export function serializeNoteData(data: NoteData): string {
  return JSON.stringify(data);
}
