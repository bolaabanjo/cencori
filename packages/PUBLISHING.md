# Publishing to npm

| Package | npm name | Directory |
|---------|----------|-----------|
| SDK | [`cencori`](https://www.npmjs.com/package/cencori) | `packages/sdk` |
| CLI scaffold | [`create-cencori-app`](https://www.npmjs.com/package/create-cencori-app) | `packages/create-cencori-app` |
| MCP (docs) | [`@cencori/mcp`](https://www.npmjs.com/package/@cencori/mcp) | `packages/mcp` |
| Security scanner | [`@cencori/scan`](https://www.npmjs.com/package/@cencori/scan) | `packages/scan` |

## Prerequisites

- npm account with publish access to both packages (Cencori org).
- `NPM_TOKEN` with **Automation** or **Publish** scope (for CI), or `npm login` locally.

## Local publish

```bash
# CLI (hackathon starter, celo-agent template)
cd packages/create-cencori-app
npm test
npm publish --access public

# SDK (bump version in package.json first if unchanged)
cd packages/sdk
npm run build
npm publish --access public
```

## GitHub Actions

1. Add repo secret: **Settings → Secrets → `NPM_TOKEN`**
2. **Actions → Publish npm packages → Run workflow**
3. Choose `create-cencori-app`, `cencori`, or `both`

## Version bumps

- Bump `version` in the package’s `package.json` before every publish.
- `prepublishOnly` runs `build` (and `test` is recommended for the CLI).
