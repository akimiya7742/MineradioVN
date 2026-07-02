This project was forked and is currently maintained by [akimiya7742](https://github.com/akimiya7742). Original developer: [XxHuberrr](https://github.com/XxHuberrr) | [Show original Chinese README](./README_cn.md)

# Mineradio
![Mineradio Dark Mode Boot Page](./docs/assets/readme/cinema-beat-smoke.png) 

Mineradio is an immersive music player for the Windows desktop. It combines a weather radio, search & play, a lyric stage, particle visuals, and a 3D playlist rack into a personal music space that feels closer to a live concert experience.

## Download the Windows Installer Now

> **For users in mainland China:** We highly recommend using Lanzou Cloud to download. Open the link and download `Mineradio-1.1.2-Setup.exe` directly. The speed is usually more stable and closer to your full bandwidth compared to GitHub Releases.

| Download Link | Target Users | URL |
| --- | --- | --- |
| Lanzou Cloud (Full Speed) | Preferred for Mainland China users | [Download Mineradio 1.1.2 Installer](https://xxhuber.lanzout.com/s/Mineradio) |
| GitHub Release (Repo Fork) | Users with stable access to GitHub | [v1.1.2 Release](https://github.com/akimiya7742/MineradioVN/releases/tag/v1.1.2) |

To install, simply download and run `Mineradio-1.1.2-Setup.exe`. **Do not** download `Source code`, `.blockmap`, or `latest.yml`, and do not treat `win-unpacked` as the official installation package.

## What to do if the Download or Installation is Blocked?

As an indie Electron desktop app, unsigned installers may sometimes be flagged as risky by browsers, Windows Defender, or SmartScreen. First, ensure that your installer comes from the official Lanzou Cloud link or the GitHub Release links from this fork above, and that the filename is exactly `Mineradio-1.1.1-Setup.exe`.

1. **If your browser warns you about the file:** Open the download history, click the three dots `...` on the right side of the item, and choose `Keep` / `Keep anyway` / `Show more` to proceed.
2. **If Windows SmartScreen pops up a blue blocking window:** Click `More info`, then click `Run anyway`.
3. **If your antivirus software explicitly flags it as a trojan, high-risk, or has quarantined it:** Do not force it to run. Delete the file and re-download it. If the issue persists, please send a feedback report with screenshots.

## Support the Original Author

If Mineradio has accompanied you through an extra song or two, feel free to buy the original author a cup of coffee to support their incredible initial design.

[View the Original Support Page](./docs/SUPPORT.md)

The core goal of version 1.1.1 is to clean up and reorganize Mineradio into a clean, publicly downloadable installation version. The default visual parameters are pulled from the built-in "Default Test" user profile, allowing users to experience a unified visual feel from the very first boot. The 3D playlist rack, lyric layers, user profiles, and background performance strategies have all been wrapped up and finalized in this single release cycle.

## Current Version

Current Version: `1.1.2`

Status: 1.1.2 Clean Installation Release (Fork Version).

> **Security Notice:** Installing or distributing `v1.0.10` and earlier legacy installers is no longer recommended. Please isolate old installer packages and use the `Mineradio-1.1.2-Setup.exe` provided on this page for a fresh, clean installation.

## Core Features

* **Dynamic Home Page:** Daily recommendations, personal radio, "continue listening", listening profile insights, and quick access to your custom playlists.
* **Immersive Playback Visuals:** Switches to the *Emily* / *Default* playback state once music starts, where the lyric stage and particle stage work in perfect sync.
* **Beat-Based Cinematic Camera System:** A visual engine that adapts dynamically to the rhythm of the music.
* **Lyric Stage Control:** Supports custom lyrics, lyric positioning, and advanced visual tweaking.
* **Custom Album Art:** Supports image uploading and built-in cropping.
* **3D Playlist Rack:** Triggered via right-click to let you intuitively browse through your playlist queues.
* **GitHub Releases Update Detection:** Automated update checks with an in-app download entrance linking to this fork.
* **YouTube integration:** Search and play songs from YouTube.
* **Instant Out-of-the-Box Experience:** Ships with a built-in "Default Test" visual user profile so the software's default look matches this preset perfectly on its first launch.

## User Guide

Windows users can download the installer from the Releases section of this fork.

Official distribution relies strictly on `Mineradio-1.1.2-Setup.exe`. It is not recommended to use the `win-unpacked` directory as a portable version. The installer will automatically create a desktop shortcut. If you directly run the packed `Mineradio.exe`, the application will also generate a desktop shortcut on its first run.

If you have an older version installed, we recommend uninstalling it and isolating the old installer before performing a clean installation with the `v1.1.2` package.

## Development and Setup

```bash
npm install
npm start
npm run build:win
npm run build:linux # for linux build

```

The desktop entry point is loaded into a local server by the Electron main process. Running `npm run build:win` will generate a Windows NSIS installer, with the output files located in the `dist/` directory.

## Update Mechanism

Mineradio checks for new releases by querying the GitHub Releases API from this repository (`akimiya7742/MineradioVN`). If the remote version is higher than the local version, the in-app update prompt will display the Release notes, download the installer to the local user data directory, and launch the installer via the OS system shell.

To test the update pipeline locally, you can set `MINERADIO_UPDATE_MANIFEST` to point to a local manifest JSON file or a local HTTP address to simulate an online GitHub Release.

## Third-Party Music Platforms Disclaimer

Mineradio is **not** an official client of NetEase Cloud Music, QQ Music, or Tencent Music Entertainment Group, nor is it affiliated with any music platform.

The integration of third-party platforms in this project is strictly for personal learning, local client experience, and assisting users in playing content from their own accounts. Please abide by the respective platforms' user agreements, copyright regulations, and premium membership terms. This project **does not** provide features to bypass paywalls, circumvent VIP requirements, crack audio quality, or redistribute music content.

## User Data and Privacy

Sensitive data—including login cookies, search history, custom covers, custom lyrics, and beat analysis caches—must only be saved in the local user data directory or the browser's local storage. This data should never be committed to the repository.

For more details, see [PRIVACY.md](./PRIVACY.md).

## Acknowledgments

Mineradio was originally designed and developed by XxHuberrr, and is now being maintained and localized for global users by akimiya7742. Special thanks to **emily**, who co-created early concepts for the visual foundation and inspired the optimization direction for the `emily` visual preset.

We also want to thank **小天才e宝**, **应春日**, **锋将军**, **軌跡**, **林中**, **骊**, **风痕**, and **花椰菜🥦** for their invaluable help with early hands-on testing, feedback, and release preparations.

## Copyright and License

Copyright (C) 2026 XxHuberrr.
Copyright (C) 2026 akimiya7742 (For modifications and maintenance).

This project is licensed under the GPL-3.0 License. See the [LICENSE](./LICENSE) file for details.

The MR Logo, the name "Mineradio," the UI visual design, and original visual assets belong entirely to the original author. Third-party dependencies and services follow their respective open-source licenses and terms of service.
