# W4-B Agent Center 2.0 Product Spec Report

## Summary

Produced a docs-only Agent Center 2.0 product specification for evolving Pixel Agents Multi from an
office plus modal into a page-like local agent operations cockpit.

The proposed model:

- Office remains the default pixel-art real-time state page.
- Agents becomes the dense all-agent management page.
- Usage becomes the analytics and token intelligence page.
- Timeline becomes the global event history and handoff page.
- Agents uses a table/list plus detail drawer rather than decorative cards.
- Dangerous actions remain in the drawer or confirmation modal.

## Key Decisions

- Agent Center is an all-agent management view by default. The bottom-toolbar provider filter should
  continue to affect only Office/canvas visibility.
- Agents page should have its own provider, project, status, hidden/archived, search, and sorting
  controls.
- Hide, Archive, and Kill remain separate product actions:
  - Hide is a visibility filter only.
  - Archive removes from active tracking/history scope and must prevent provider re-adoption where
    supported.
  - Kill requires confirmation and only removes external agents after confirmed termination.
- Usage and Timeline should be page-level destinations, not just modal tabs.
- Current modal behavior is treated as the migration source, preserving existing message protocol and
  action semantics.
- Narrow VS Code panels are first-class. The spec requires a responsive list/drawer behavior instead
  of horizontal-scroll-heavy tables for primary workflows.

## Unresolved Questions

- How much archived-agent history should be kept in webview state versus loaded on demand from
  extension state?
- Should archived agents appear in the Agents page through a scope selector, or should Timeline own
  most archived-history navigation?
- Should the future Usage page add model-level and daily/monthly aggregation in Agent Center 2.0, or
  wait for a separate Usage Intelligence package?
- Which keyboard shortcuts should be reserved for page navigation versus table search and row
  actions?
- Should Team/role filters remain first-class in Agents 2.0 phase 1, or stay as a later workflow
  enhancement?

## Files Changed

- `docs/roadmap/product/agent-center-2-product-spec.md`
- `docs/roadmap/supervision/reports/W4-B-agent-center-2-product-spec-report.md`

## Validation

- `git diff --check`: passed
