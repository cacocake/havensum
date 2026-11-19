// Loads Reanimated's own CSS animation helpers in Node, so native-only animation settings
// can be checked against the validation the Android app runs at startup.
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const k_reanimatedPackagePath = '/react-native-reanimated/';
const k_stubUrlPrefix = 'stub:';
const k_stubbedPackages = ['react-native', 'react-native-worklets'];
// Only the names Reanimated's CSS easing and settings modules import from these packages.
const k_stubSource = `
export const Platform = { OS: 'android', select: (options) => options.android ?? options.default };
export const StyleSheet = { create: (styles) => styles, flatten: (style) => style };
export const RuntimeKind = { ReactNative: 1, UI: 2, Worker: 3 };
`;
const k_reanimatedCssUrl = new URL('../../node_modules/react-native-reanimated/lib/module/css/', import.meta.url);

function resolveReanimatedRelativeImport(specifier, parentUrl) {
  const targetPath = resolvePath(dirname(fileURLToPath(parentUrl)), specifier);
  if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
    return pathToFileURL(`${targetPath}/index.js`).href;
  }
  if (!existsSync(targetPath) && existsSync(`${targetPath}.js`)) {
    return pathToFileURL(`${targetPath}.js`).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (k_stubbedPackages.includes(specifier)) {
      return { url: `${k_stubUrlPrefix}${specifier}`, shortCircuit: true };
    }
    const importsFromReanimated = context.parentURL?.includes(k_reanimatedPackagePath);
    if (!importsFromReanimated || !specifier.startsWith('.')) {
      return nextResolve(specifier, context);
    }
    const resolvedUrl = resolveReanimatedRelativeImport(specifier, context.parentURL);
    return nextResolve(resolvedUrl ?? specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(k_stubUrlPrefix)) {
      return { format: 'module', source: k_stubSource, shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});

export async function loadReanimatedCssHelpers() {
  const { cubicBezier } = await import(new URL('easing/index.js', k_reanimatedCssUrl).href);
  const { normalizeTimingFunction } = await import(new URL('native/normalization/common/settings.js', k_reanimatedCssUrl).href);
  return { cubicBezier, normalizeTimingFunction };
}
