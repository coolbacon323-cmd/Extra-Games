# Extra Games

Extra Games is a Windows game-store and launcher project for discovering, publishing, buying, downloading and managing PC games.

## Windows launcher

The project builds a real Electron desktop application named **Extra Games**.

The Windows installer is:

`Extra-Games-Launcher-Setup.exe`

The installer installs the actual desktop application, creates a Start Menu shortcut, creates a desktop shortcut, provides an uninstaller, and can launch the application immediately after installation.

The installed application executable is:

`ExtraGamesLauncher.exe`

The desktop application opens the same Extra Games interface used by the project web UI, including Home, Store, Library, Wishlist, Community, News, Account, Upload Game and Settings.

## Create an account

1. Open **Account**.
2. Enter a display name, email address and password.
3. Click **Sign up**.
4. After registration, the launcher signs you in automatically.

## Store

The Store loads approved games and supports searching, wishlist controls, free-game claiming and paid checkout.

## Upload a game

You must be signed in.

1. Open **Upload Game**.
2. Enter the game name.
3. Add a description.
4. Set the price in EUR.
5. Select the game package.
6. Supported package formats are **.ZIP** and **.EXE**.
7. Click **Upload Game**.

Uploaded games are stored with a **pending** approval status. The store only exposes approved games.

## Stripe

Payments require a Stripe secret key on the server. Never put a Stripe secret key in browser code or commit real keys to GitHub.

Use environment variables such as:

```text
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

## Running from source

Requirements:

- Windows
- Node.js 22 or newer
- npm

Install dependencies:

```bash
npm install
```

Start the desktop launcher:

```bash
npm start
```

Build the Windows installer:

```bash
npm install
npm run dist
```

The installer is generated in the `release` directory as:

`Extra-Games-Launcher-Setup-0.5.1.exe`

## Packaging details

The packaged launcher stores its writable account, session, purchase and upload data under Electron's Windows application-data directory instead of inside the read-only packaged application.

The launcher also waits for its local Express server to finish listening before opening the Electron window. This avoids a startup race where the desktop application could close before its local service was ready.

## Automated Windows build

`.github/workflows/windows-launcher.yml` builds the Windows installer on GitHub Actions and uploads the installer as a workflow artifact. Tagged builds can also publish the installer to a GitHub Release.

## Project layout

- `index.html` — shared Extra Games interface.
- `styles.css` — interface styling.
- `app.js` — navigation, store, wishlist, account, uploads and checkout actions.
- `server.js` — Express server, authentication and game APIs.
- `electron/main.js` — desktop launcher entry point.
- `electron/preload.js` — secure renderer bridge.
- `electron/updater.js` — desktop launcher update integration.
- `.github/workflows/windows-launcher.yml` — automated Windows installer build.

Never commit Stripe secrets, webhook secrets, account passwords or private credentials.
