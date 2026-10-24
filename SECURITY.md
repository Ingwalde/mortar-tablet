# Security

Threat model: the application runs on the user's PC, in a browser (the site) or on an Android phone. Everything works without a server;
the only server component is the optional relay for squad mode (see below), which the application uses only when the user creates or joins a squad.
We trust the operating system and the user; we do not trust content that comes from outside
(imported JSON, images, server responses, squad messages) and, as defence in depth, the renderer itself.

## What has been done

**The application window**
- The renderer is sandboxed (`sandbox: true`, `contextIsolation`, no `nodeIntegration`); the preload is built as CommonJS
  and exposes only a narrow typed `window.api`.
- A content security policy (CSP) in the built `index.html`: only own scripts, `eval` is forbidden, no embedded plugins, forms or `<base>`.
- Navigation and new windows are forbidden: only `http(s)` links are opened in the system browser; `<webview>` is turned off.
- Page permissions (camera, geolocation, notifications and so on) are denied, except writing to the clipboard.
- Electron fuses: no `ELECTRON_RUN_AS_NODE`, `--inspect` or `NODE_OPTIONS`; code is loaded only from `app.asar`
  with an integrity check. Verified by `npm run smoke`.

**IPC (renderer → main)**: every call is validated, not taken on trust:
- terrain identifiers are only `[A-Za-z0-9_-]{1,64}`, map sizes are within sensible limits;
- a map file is accepted only if the user has just chosen it in the system dialog (the renderer cannot make the main process
  read an arbitrary file);
- images and heights are downloaded only from a URL in the terrain catalogue, only over `https`, with a size limit (4 GB);
- the folder for downloaded data is accepted only if the user has just chosen it in the system dialog; moving the data is refused while a download or an import runs, refuses a folder inside the current one, and removes the old files only after everything has been copied. The choice is stored in `data-dir.txt`, which is read as a plain absolute path (relative or malformed content is ignored).

## Standalone version and Android

- **The site (PWA) and the APK** work without a server: the state lives only in the device storage, the CSP does not allow third-party scripts; the only external requests are
  the reforger.recoil.org tiles (images) and the check for a new version at api.github.com.
- **Sharing by link/QR:** markers are compressed into the address fragment (they do not go to a server). Unpacking has limits (400 thousand characters, 2 MB unpacked,
  1000 markers), coordinates and names are sanitised, and an import always goes through a confirmation dialog. A terrain id from a foreign link is compared only
  with own keys (`Object.hasOwn`): `__proto__` and similar do not become terrains.
- **Updates:** on Android and the web the app only reports a new version; links from the GitHub API response are opened only if they are https on github.com
  within this repository. On the PC, Windows (installer) and Linux (AppImage) update through `electron-updater`; macOS and the .deb package only
  report a new release and open its page. The Android app opens share links only from this site.
- **Build:** the mod terrain maps are downloaded from a service release with a SHA-256 check (`scripts/web-mod-maps.sha256`) and a check of the paths
  in the tar before unpacking. The APK is signed with a key stored in the repository secrets (a copy of the key is kept outside the repository).

## Squad mode (the relay)

The relay is a Cloudflare Worker with one Durable Object per squad (`server/`, design in `docs/squad-mode.md`).

- **Access:** a squad is reached by a secret room id plus a random join code (128 bits each). The join code travels in the address fragment, so browsers do not send it to any server,
  and the relay never writes it to a log. The relay stores only SHA-256 hashes of the join code and of every member key; a member key lives only on that member's device.
- **Permissions are enforced on the server** for every message (role, own marks, kind of mark; table-driven tests cover every cell of the matrix). The client only hides what a role may not do.
- **Input limits:** a message is at most 8 KB (counted in bytes), at most 40 operations per member per minute, 20 members and 100 marks per squad; every field is validated and
  cleaned (control characters removed, lengths and coordinates bounded). A removed member's key stops working at once; the commander can restore it.
- **Retention:** the relay deletes a squad when the report has been saved, 24 hours after the game ended, or after 3 days without activity; the commander can delete it at any time.
  What it holds is marks and coordinates of a video game, callsigns, roles, timestamps and firing-log entries; there are no accounts, names or e-mail addresses.
- **Abuse:** creating a squad is limited per address per day (the address is kept only as a one-day hash) and overall per day; `CREATE_DISABLED=1` switches creation off.
- **Client:** all squad text is shown as text (never as HTML); the report page is escaped and has no scripts or external resources; a report file is validated on opening
  (schema, lengths, own keys only); the terrain id from the relay is compared only with own keys. The CSP allows connections only to the relay's address.
- **Limitations:** whoever has the invitation link can join and take a free callsign (the commander can remove them); callsigns that differ only in look-alike letters from other alphabets are
  not detected; the relay's operator (the hosting provider) can see network metadata under its own policy; a device that is lost still holds a member key until the commander removes that member.

## Known limitations

- **The builds are not code-signed** (Windows and macOS): Windows SmartScreen and macOS Gatekeeper show a warning at the first launch.
  Download only from this repository's [Releases](https://github.com/Ingwalde/mortar-tablet/releases).
- **Automatic updates** trust the releases of this GitHub repository (the hash of the file from `latest.yml` / `latest-linux.yml` is checked, but not the publisher's signature).
- **The APK** is installed from unknown sources and not from Google Play; make sure you download it only from this repository's [Releases](https://github.com/Ingwalde/mortar-tablet/releases).
  Android auto backup (`allowBackup`) is on: markers can end up in a Google backup.
- The site pages cannot set `frame-ancestors` (GitHub Pages does not allow headers): in theory they can be embedded in a foreign page; there are no secrets there.
- GitHub Actions are pinned by major version (not by SHA); the development dependencies (vitest and the build chain) have known advisories, but they do not get into the
  released application.
- `node-forge` is a development dependency (it was used once to create the Android signing key) and is not part of any build.

## Reporting a vulnerability

Write to the author at the address in the `author` field of `package.json`. Please do not publish details before a fix.
