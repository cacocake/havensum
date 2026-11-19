export function installBrowserStorage(context, search = '') {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
  const globals = { window: { location: { search } }, localStorage: storage };

  for (const [name, value] of Object.entries(globals)) {
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    context.after(() => {
      delete globalThis[name];
      if (previousDescriptor) {
        Object.defineProperty(globalThis, name, previousDescriptor);
      }
    });
  }
  return storage;
}
