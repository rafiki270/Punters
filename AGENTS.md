# Agent Collaboration Guidelines

- Do not revert work outside the code or files you are actively editing, since multiple LLM tabs may be working in parallel on this codebase.
- Any new source code you generate must stay under 500 lines; break larger changes into smaller, focused chunks (docs, config, JSON, etc. are exempt).
- Follow the canonical backup/restore spec in `Docs/backup.md` when touching admin backup flows or data export logic.
- When you touch core functionality (rotation, pairing, admin controls, etc.), add or update automated tests to cover the new or changed behavior.
- Keep `README.md`, `TECH.md`, and this `AGENTS.md` in sync with feature changes—treat them as required deliverables, not optional follow-up work.
