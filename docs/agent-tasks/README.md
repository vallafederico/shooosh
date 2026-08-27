# Agent tasks

Executable split of [ROADMAP.md](../../ROADMAP.md). Cloud and local agents take the **lowest numbered file** whose front matter says `status: todo`.

Docs that are not a queue item: [shader contract](../shader-contract.md), [translation](../shader-translation.md), [API](../api.md), [site patterns](../site-patterns.md), [MSDF generators](../msdf.md). Skills live in `.cursor/skills/`.

When you finish a task:

1. Set `status: done` in that file.
2. Leave a short "Done" note (what landed, how to verify).
3. Stop. The next agent picks up the next `todo`.

Do not implement later tasks early unless they are blocked on a type you must introduce now — then keep the change minimal and mention it in the Done note.
