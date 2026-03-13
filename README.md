# PD2MM (Payday 2 Mod Manager)

PD2MM is a desktop application for installing and managing PAYDAY 2 mods with a fast, modern workflow. It supports common mod packaging formats, keeps your mod folders organized, and includes built-in app update checks for packaged releases.

## Features

- Install mods directly from ModWorkshop URLs.
- Support BLT/BeardLib mods and mod overrides.
- Enable or disable mods without deleting them.
- Remove mods and open mod folders from the app.
- Launch PAYDAY 2 from the manager.
- Built-in app update checks for release builds.

## Download

Download the latest release from:

- [GitHub Releases](https://github.com/CloodDev/PD2MM/releases)

## Getting Started

1. Install and open PD2MM.
2. Click **Select Game Folder** and choose your PAYDAY 2 installation directory.
3. Paste a ModWorkshop URL and click **Download**.
4. Select installed mods in the sidebar to view details, enable/disable, update, or remove.

## Mod Management

- **Install**: Download from ModWorkshop links.
- **Update (mods)**: Use **Check for Updates** on a selected mod.
- **Enable/Disable**: Toggle mod state while preserving files.
- **Uninstall**: Remove a selected mod from disk.
- **Open Folder**: Open the selected mod path in the system file explorer.

## App Updates

PD2MM uses `electron-updater` for release updates.

- Automatic checks run only in packaged builds.
- A manual check is available in the UI via **Check App Update**.
- Manual checks report availability and do not auto-download.

### Update Configuration

Optional environment variables used by the main-process updater:

- `VITE_UPDATE_GITHUB_OWNER` (default: `CloodDev`)
- `VITE_UPDATE_GITHUB_REPO` (default: `PD2MM`)
- `VITE_DISTRIBUTION_CHANNEL` (optional release channel)

If unset, PD2MM defaults to this repository’s public releases.

<sub> might be broken currently as i dont get electron updater </sub>
## Development

### Prerequisites

- Node.js `>= 23`
- npm

### Commands

- Start development mode:
	- `npm run start`
- Build workspace packages:
	- `npm run build`
- Type-check all workspaces:
	- `npm run typecheck`
- Build Windows installer:
	- `npm run compile`
- Run end-to-end tests:
	- `npm test`

### Publishing

- Authenticate GitHub CLI:
	- `gh auth login`
- Publish release artifacts:
	- `npm run publish`

## Troubleshooting

- **App update check says it is skipped**
	- Update checks only run in packaged builds, not development mode.
- **Archive extraction fails**
	- Install 7-Zip or WinRAR for improved extraction compatibility.
- **No mods appear after selecting folder**
	- Ensure the selected directory is the PAYDAY 2 root folder.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

## Contact

- Author: cloodowy
- Email: cloodowy@gmail.com
- GitHub: [CloodDev](https://github.com/CloodDev)