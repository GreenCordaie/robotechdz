// Vitest shim: the real `server-only` package throws at import in any non-RSC
// context. Tests run in node so we replace it with a no-op module.
export {};
