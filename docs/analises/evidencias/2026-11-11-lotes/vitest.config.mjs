const root = new URL("../../../../", import.meta.url).pathname;
export default { root, test: { include: ["docs/analises/evidencias/2026-11-11-lotes/*.test.ts"], testTimeout: 30000, hookTimeout: 120000, maxWorkers: 1 } };
