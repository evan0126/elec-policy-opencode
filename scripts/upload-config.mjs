import { readFileSync, existsSync } from 'node:fs';

const configUrl = new URL('../upload.config.json', import.meta.url);

export function normalizeUploadConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('upload.config.json must be an object');
  for (const key of Object.keys(config)) {
    if (!['enabled', 'environments'].includes(key)) throw new Error(`Unknown upload config field: ${key}`);
  }
  const enabled = config.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');

  const environments = {};
  const raw = config.environments ?? {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('environments must be an object');
  for (const [id, target] of Object.entries(raw)) {
    if (!['test', 'production'].includes(id)) throw new Error(`Unknown upload environment: ${id}`);
    if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error(`environments.${id} must be an object`);
    for (const key of Object.keys(target)) {
      if (!['enabled', 'base', 'user', 'password'].includes(key)) throw new Error(`Unknown upload config field: environments.${id}.${key}`);
    }
    const result = {
      enabled: target.enabled ?? false,
      base: target.base ?? '',
      user: target.user ?? '',
      password: target.password ?? '',
    };
    if (typeof result.enabled !== 'boolean') throw new Error(`environments.${id}.enabled must be boolean`);
    for (const key of ['base', 'user', 'password']) {
      if (typeof result[key] !== 'string') throw new Error(`environments.${id}.${key} must be a string`);
    }
    environments[id] = result;
  }
  return { enabled, environments };
}

export function parseUploadConfig(text) {
  // 匹配字符串或注释，只移除字符串外的注释，保留 URL 和密码中的特殊字符。
  const json = text.replace(/^\uFEFF/, '').replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, token =>
    token.startsWith('"') ? token : token.replace(/[^\r\n]/g, ' '));
  return normalizeUploadConfig(JSON.parse(json));
}

export function loadUploadConfig() {
  return existsSync(configUrl) ? parseUploadConfig(readFileSync(configUrl, 'utf8')) : normalizeUploadConfig({});
}
