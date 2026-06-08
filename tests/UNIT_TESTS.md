Unit tests (Vitest)

Install dev dependencies (if not already):

```bash
npm install
```

Run unit tests once:

```bash
npm run test:unit:run
```

Run in watch mode:

```bash
npm run test:unit:watch
```

Notes:
- Tests live under `packages/*/src/__tests__` and are picked up by `vitest` according to `vitest.config.ts`.
- We mock Node/Electron APIs where appropriate using Vitest's `vi.mock`.
