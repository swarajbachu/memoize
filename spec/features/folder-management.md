# Feature: Folder management

The sidebar is the spine of the app. Folders are the unit of work.

## Behavior

- Sidebar lists folders in user-defined order (drag to reorder, Phase 2+)
- `+` button opens OS folder picker
- Folders are referenced by absolute path; the `id` is a stable hash of the path
- Removing a folder from the sidebar does not delete the folder on disk
- Right-click → Reveal in Finder / Show path / Remove

## Validation when adding

- Reject if path doesn't exist or isn't a directory
- Reject duplicates (same canonical path)
- Warn (don't reject) for very large folders (>10k files at top level) — shown as a one-line note, no modal

## Persistence

`userData/workspaces.json`:

```json
{
  "version": 1,
  "folders": [
    { "id": "ab12...", "path": "/Users/me/code/proj", "name": "proj", "addedAt": "2026-05-02T..." }
  ],
  "activeId": "ab12..."
}
```

## Edge cases

- Path becomes invalid (folder deleted) — show in sidebar with red dot, disable selection
- Path moved (basename matches but dir gone) — same as deleted; user removes manually
- Symlinks — resolve to canonical path before hashing
