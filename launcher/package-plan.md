# Extra Games Windows package plan

Target package: Extra-Games-Launcher-Setup.exe

Recommended production flow:
1. Build the launcher web application.
2. Wrap the launcher in a desktop runtime such as Tauri or Electron.
3. Set the application name to Extra Games Launcher.
4. Set a stable application identifier.
5. Add the Extra Games icon.
6. Configure Windows installer creation.
7. Build the Windows installer in CI.
8. Publish the installer as a GitHub Release.
9. Sign the Windows executable before public distribution.
10. Test installation, launching, uninstalling, and updating on a clean Windows machine.

Generated .exe installers should not be committed into the source tree. Release artifacts belong in GitHub Releases or another trusted distribution service.