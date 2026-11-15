# Domain Docs

How engineering skills should read this repository's domain documentation before editing code.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you are about to work in.

If any of these files do not exist, proceed silently. The `domain-modeling` skill creates them when terms or decisions are resolved.

## File structure

```
/
├── GLOSSARY.md
├── docs/
│   ├── adr/
│   │   ├── 0001-tool-like-inlining-for-reasoning.md
│   │   └── 0002-reasoning-item-visual-lifecycle.md
│   ├── agents/
│   └── research/
├── client/
├── server/
└── shared/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, or a test name), use the term defined in `GLOSSARY.md`. Do not drift to synonyms the glossary avoids.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than overriding it silently:

> _Contradicts ADR-0001 — worth reopening because…_
