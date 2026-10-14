import { readFileSync, existsSync } from 'node:fs';

const configUrl = new URL('../upload.config.json', import.meta.url);

export function loadUploadConfig() {
  const config = existsSync(configUrl) ? JSON.parse(readFileSync(configUrl, 'utf8').replace(/^\uFEFF/, '')) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('upload.config.json must be an object');
  const enabled = config.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
  const result = {
    enabled,
    base: config.base ?? '',
    user: config.user ?? '',
    password: config.password ?? '',
  };
  for (const key of ['base', 'user', 'password']) {
    if (typeof result[key] !== 'string') throw new Error(`Upload config ${key} must be a string`);
  }
  return result;
}
