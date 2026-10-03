# Launcher security

- Store and API traffic must use HTTPS.
- Never embed passwords, API keys, or private signing secrets in the launcher.
- Game download URLs should be validated against trusted Extra Games infrastructure before installation.
- Game packages should be verified with a signed manifest/checksum before installation.
- Auto-updates should be delivered through the configured GitHub Release update provider and signed before public distribution.
- The Windows installer should be code-signed before release.