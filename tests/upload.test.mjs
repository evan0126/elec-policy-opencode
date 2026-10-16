import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeUploadConfig, parseUploadConfig } from '../scripts/upload-config.mjs';
import { uploadJsonMap } from '../.opencode/skills/upload/scripts/post.mjs';

const row = {
  province: '浙江', provinceId: 186, region: null, yearMonth: '2026-11',
  tariffMode: 'SINGLE_PART', customerCategory: 'GENERAL_COMMERCIAL', voltageLevel: 'LEVEL_1_10',
  periods: [{ start: '00:00', end: '24:00', type: 'flat' }], prices: { flatPrice: 0.5 },
};
const target = id => ({ enabled: true, base: `https://${id}.example.test`, user: id, password: 'dummy' });
const config = environments => normalizeUploadConfig({ enabled: true, environments });

function mockApi(t, fail = () => false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    const failed = fail(url);
    return {
      ok: true,
      json: async () => failed ? { status: 5000, message: 'mock failure' }
        : { status: 2000, data: url.endsWith('/login') ? `${new URL(url).hostname}-token` : null },
    };
  });
  return calls;
}

test('配置支持注释，保留 URL 和密码中的注释符号、引号及转义字符', () => {
  const credentials = { enabled: true, base: 'https://example.test/api', user: 'test', password: 'a//b/*c*/"d\\e' };
  const text = '\uFEFF{ // 总开关\n "enabled": true, /* 环境列表 */ "environments": { "test": ' + JSON.stringify(credentials) + ' } }';
  assert.deepEqual(parseUploadConfig(text).environments.test, credentials);
  const example = parseUploadConfig(readFileSync(new URL('../upload.config.example.json', import.meta.url), 'utf8'));
  assert.equal(example.enabled, false);
  assert.deepEqual(Object.keys(example.environments), ['test', 'production']);
});

test('接受分环境配置，缺省关闭，错误配置拒绝', () => {
  assert.equal(normalizeUploadConfig({}).enabled, false);
  assert.throws(() => normalizeUploadConfig({ ENABLED: true }), /Unknown upload config field/);
  assert.throws(() => normalizeUploadConfig({ environments: { TEST: {} } }), /Unknown upload environment/);
  assert.throws(() => config({ test: { USER: 'old' } }), /Unknown upload config field/);
  assert.throws(() => config({ production: { enabled: 'true' } }), /enabled must be boolean/);
  assert.throws(() => config({ prodution: target('production') }), /Unknown upload environment/);
});

test('总开关或全部环境关闭时不读 JSON、不发请求', async t => {
  const calls = mockApi(t);
  for (const settings of [normalizeUploadConfig({ enabled: false }), config({ test: { enabled: false } })]) {
    assert.equal((await uploadJsonMap('2026-11', { zhejiang: '/nonexistent.json' }, settings)).status, '仅解析');
  }
  assert.equal(calls.length, 0);
});

for (const id of ['test', 'production']) {
  test(`只上传 ${id}`, async t => {
    const calls = mockApi(t);
    const other = id === 'test' ? 'production' : 'test';
    const result = await uploadJsonMap('2026-11', { zhejiang: [row] }, config({ [id]: target(id), [other]: { enabled: false } }));
    assert.equal(result.status, '更新成功');
    assert.deepEqual(Object.keys(result.environments), [id]);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.url.startsWith(`https://${id}.example.test/`)));
  });
}

test('双环境使用独立账号及 token，提交相同数组', async t => {
  const calls = mockApi(t);
  const result = await uploadJsonMap('2026-11', { zhejiang: [row] }, config({ test: target('test'), production: target('production') }));
  assert.equal(result.status, '更新成功');
  assert.equal(calls.length, 4);
  assert.equal(calls[0].body.name, 'test');
  assert.equal(calls[2].body.name, 'production');
  assert.equal(calls[1].headers.Authorization, 'test.example.test-token');
  assert.equal(calls[3].headers.Authorization, 'production.example.test-token');
  assert.deepEqual(calls[1].body, calls[3].body);
  assert.deepEqual(result.environments.production.submitted, ['zhejiang']);
});

for (const stage of ['login', 'electricity-policy/save']) {
  test(`测试环境 ${stage} 失败仍上传生产环境`, async t => {
    const calls = mockApi(t, url => url === `https://test.example.test/${stage}`);
    const result = await uploadJsonMap('2026-11', { zhejiang: [row] }, config({ test: target('test'), production: target('production') }));
    assert.equal(result.status, '上传失败');
    assert.equal(result.environments.test.status, '上传失败');
    assert.equal(result.environments.production.status, '更新成功');
    assert.match(result.error, /test: mock failure/);
    assert.equal(calls.filter(call => call.url === 'https://test.example.test/electricity-policy/save').length, stage === 'login' ? 0 : 1);
  });
}

test('缺少某环境账密不影响另一环境，空数据不登录', async t => {
  const calls = mockApi(t);
  const settings = config({ test: { enabled: true }, production: target('production') });
  const result = await uploadJsonMap('2026-11', { zhejiang: [row] }, settings);
  assert.equal(result.environments.test.status, '上传失败');
  assert.equal(result.environments.production.status, '更新成功');
  assert.equal(calls.length, 2);
  assert.equal((await uploadJsonMap('2026-11', {}, settings)).status, '跳过');
  assert.equal(calls.length, 2);
});
