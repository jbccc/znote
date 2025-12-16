# znote

A single infinite log. Open, write at the bottom, close.

## Core behavior

- Always scrolled to bottom (it's a log)
- Bottom padding allows last line to scroll near top - click anywhere to position cursor
- Auto-save as you type
- Day headers group entries by date
- Past days are locked (read-only, dimmed)
- Current day is editable

## Tomorrow section

- Fixed at bottom, hidden by default, appears on hover/focus
- Simple `-` list for next day tasks
- Time picker: hover the `-` to set time (HH:MM), always visible once set
- Converts to `- [14:30] task` or `- task` when day changes
- Max height with scroll for long lists

## Header

- Sticky top, hidden by default, appears on hover
- "znote" left, `···` settings right

## Settings

- Sign in/out (Google)
- Theme: system/light/dark
- Day cut hour: when a new "day" starts (default 4am)

## Stack

Next.js 16 + Prisma/SQLite + NextAuth + Electron

## Build

```
npm run electron:build
cp -R dist/mac-arm64/znote.app /Applications/
```
