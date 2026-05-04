# Phase 5 — Polish & distribution

**Goal**: ship a 1.0 that someone other than you would happily install.

**Status**: 📐 Spec

**Estimate**: ~3 weeks

**Depends on**: Phase 4

> **Note:** Renumbered from "Phase 4" when the chat-first pivot inserted Phase 3 (chat MVP). The "multiple terminals per folder (tabs)" deliverable from the original Phase 4 is dropped — the v1 UI has one terminal per project in the right pane and that's enough. Git diff viewer / branch indicator / branch switcher are also dropped (the old git-history pane is removed in Phase 3). What remains: cross-project session search, themes, keybindings, code signing, auto-update, multi-OS packaging.

## Deliverables

1. Multiple terminals per folder (tab strip)
2. Git diff viewer (per-commit + working tree)
3. Branch indicator + simple branch switcher
4. Themes (light + dark + one accent)
5. Keybindings, listed in a discoverable cheat sheet
6. Auto-update via electron-updater
7. macOS code signing + notarization
8. Linux AppImage build
9. Windows installer (signed if budget allows)
10. Public landing page + install instructions

## Acceptance criteria

- [ ] Cmd+T opens new terminal tab in active folder
- [ ] Click any commit in git pane → diff viewer with file tree + side-by-side diff
- [ ] Branch indicator shows current branch + dirty state in folder sidebar
- [ ] Theme switch is instant (no flash)
- [ ] Auto-update prompts on app start when update available
- [ ] Notarized DMG installs cleanly on a fresh macOS

## Risks

- **Notarization is fiddly.** Mitigation: use `electron-notarize` and a CI workflow with Apple credentials in secrets.
- **Diff viewer scope creep.** Mitigation: use an existing component (e.g. react-diff-view) — do not write our own.
