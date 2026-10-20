# Legacy snapshot

This folder is a frozen copy of the earlier implementation that lived in
`Pictures/Portfolio` (tracked in the home-directory git repo as commit
`509fe31`).

It was merged here so that the older world engine, map pipeline, tests and
scripts are preserved alongside the current redesign. It is **not** part of
the Next.js app:

- `legacy/` is excluded from the root `tsconfig.json`.
- Nothing in the current `app/`, `components/` or `lib/` imports from it.
- It has its own `package.json`, `tsconfig.json`, `scripts/` and `tests/`.

Files that exist in both versions (for example `app/globals.css`,
`components/world/city.tsx`, `lib/projects.ts`) keep the **current** redesign
at their original path; the older version is preserved here under `legacy/`.

Source: `C:\Users\NEW USER\Pictures\Portfolio` (working tree matching commit
`509fe31`). The duplicate clone at `Desktop/Portfolio` was identical to this
repository at `2e69b99` and contributed nothing new.
