# Changelog

This changelog is reconstructed from the repository's tagged release history starting at the first 1.0-series tag found in git (`v1.0.1`).

## 1.6.7
- Refactored mod installation: moved download + install logic into a dedicated `modInstaller` module and moved detection logic into `modDetection`.
- Improved Linux archive extraction by trying multiple extractors and falling back to `adm-zip` for `.zip` files.
- Fixed map extraction/routing so detected maps are installed to the `Maps` folder.
- Added map support in the renderer UI: `Map Mods` section and map badge in the mod details panel.
- Fixed development startup: resolved Electron spawn path and removed duplicate launches so `npm run start` reliably launches the app.
- Resolved an ESLint peer-version conflict and refreshed the lockfile to stabilize CI installs.

## 1.6.4
- Improved build and extraction behavior across platforms.
- Switched Linux packaging to a self-contained AppImage path.
- Refined Electron version handling so Vite config loading no longer depends on launching Electron during build.
- Updated the Node and Chromium targets used by the Vite configs.

## 1.6.3
- Updated dependencies, including Vite and `@types/node`.
- Added search support for existing mods in the sidebar.
- Added and refined UI around game folder selection.

## 1.6.2
- Tagged release with no recorded user-facing commit messages in the repository history.

## 1.6.1
- Fixed issues and cleanup from the previous release cycle.

## 1.6.0
- Updated the README documentation.

## 1.5.0
- Fixed auto-updates.

## 1.4.0
- Fixed updating behavior.
- Added a button to launch the game.

## 1.3.3
- Added a search field in the sidebar to filter mods.
- Updated mod filtering logic to use the search term.
- Added search input styling and improved the no-results placeholder text.
- Added a button for selecting the game folder.

## 1.3.2
- Fixed auto-update behavior.

## 1.3.1
- Fixed the auto-updater.
- Fixed CodeQL-related workflow issues.
- Miscellaneous cleanup and version bump.

## 1.3.0
- Updated dependencies.
- Multiple maintenance updates and dependency refreshes.

## 1.0.5
- Added support for the `mws-pdmm://` protocol.
- Fixed protocol handling.
- Added mod updating and improved auto-updates.

## 1.0.4
- Updated Electron and related dependencies.
- Additional dependency refreshes and version bumps.

## 1.0.3
- Updated tooling dependencies, including Electron Builder, Playwright, ESLint, and React Refresh support.

## 1.0.2
- Added image handling for mods and updated the UI to display mod images.
- Fixed image handling logic in mod data retrieval.

## 1.0.1
- Updated the Electron build configuration and dependencies.
- Cleaned up development logging and comments.
- Initial build changes for the 1.0 line.