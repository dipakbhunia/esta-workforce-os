# Esta Workforce OS Desktop Agent

Electron, React, TypeScript, and Vite foundation for Windows 11 and future macOS support.

The current phase includes authentication, device registration architecture, attendance controls, secure token storage, local settings, offline queue contracts, and inert monitoring service/provider placeholders.

No screenshot capture, application tracking, website tracking, keylogging, or activity collection is implemented.

## Development

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

## Verification and packaging

```powershell
npm run typecheck
npm run build
npm run start
npm run package:win
```

macOS packaging must run on macOS:

```bash
npm run package:mac
```
