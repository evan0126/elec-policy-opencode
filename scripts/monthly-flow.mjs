/**
 * 月末窗口触发 flow：每月最后 3 个自然日各跑一次。
 * 非窗口日退出 0，不调 opencode run。
 *
 * 动态参数（与 docs/skill方案设计.md §5.2 一致）：
 *   {目标月}  下月 YYYY‑MM
 *   {MM‑DD}   触发日的月‑日
 *
 * flow 写入 data/report/{目标月}/{MM‑DD}.txt；本脚本读该文件后发 1 条短信。
 * 短信环境变量：ELEC_POLICY_SMS_URL / ELEC_POLICY_SMS_TO / ELEC_POLICY_SMS_TOKEN
 * 【临时修改：短信发送逻辑已注释，暂不启用】
 *
 * 新增环境变量：
 *   FORCE_RUN=1 强制跳过日期校验，完整执行业务流程，用于本地/服务器测试
 *
 * 用法（仓库根）：node scripts/monthly‑flow.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// 获取项目根目录，脚本文件向上回退一层到仓库根路径
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * 判断是否处于当月最后3个自然日窗口
 * @param {Date} [now] - 当前时间，不传默认取系统当前时间
 * @returns {boolean} true=在月末3天窗口；false=不在窗口
 */
function inLastThreeDays(now = new Date()) {
  // 获取当月总天数：取下个月第0天即为当月最后一天
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() > last - 3;
}
/**
 * 计算目标月：当前时间的下一个月，格式 YYYY‑MM
 * @param {Date} [now] - 基准日期，默认系统当前时间
 * @returns {string} 格式化后的下月，例："2026‑10"
 */
export function targetMonth(now = new Date()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/**
 * 获取触发当日的月‑日字符串，格式 MM‑DD
 * @param {Date} [now] - 基准日期，默认系统当前时间
 * @returns {string} 格式化日期，例："09‑29"
 */
export function triggerDay(now = new Date()) {
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
/**
 * 拼接报告文件相对路径 data/report/{目标月}/{MM‑DD}.txt
 * @param {string} targetYm - 目标月份 YYYY‑MM
 * @param {string} mmDd - 触发日月日 MM‑DD
 * @returns {string} 相对报告文件路径
 */
export function reportRelPath(targetYm, mmDd) {
  return `data/report/${targetYm}/${mmDd}.txt`;
}
/**
 * 构造传给 opencode agent 的提示词，指导生成电价更新报告并写入文件
 * @param {string} targetYm - 目标月份 YYYY‑MM
 * @param {string} mmDd - 触发日月日 MM‑DD
 * @returns {string} 完整prompt文本
 */
function buildPrompt(targetYm, mmDd) {
  const report = reportRelPath(targetYm, mmDd);
  return [
    `更新：${targetYm}`,
    '禁止追问。按项汇报状态（有区用 regions.json 的 label；无分区用中文省）：下载失败，原因：xxx / 解析失败，原因：xxx / 更新成功 / 上传失败，原因：xxx。不要贴电价 JSON。',
    '末尾空一行后再写汇总：汇总：成功更新 N 项，分别为 …；未更新 M 项：…。（范围=本次目标展开后的全部应报项；M=0 写未更新 0 项。）',
    `把对用户的最终按项汇报全文（含汇总）写入 ${report}（已有则覆盖）。`,
  ].join('\n');
}
/**
 * 读取 agent 输出的报告文本
 * @param {string} targetYm - 目标月份 YYYY‑MM
 * @param {string} mmDd - 触发日月日 MM‑DD
 * @returns {string} 文件内容；文件不存在返回空字符串
 */
export function readReplyFile(targetYm, mmDd) {
  const abs = path.join(root, reportRelPath(targetYm, mmDd));
  if (!existsSync(abs)) return '';
  return readFileSync(abs, 'utf8').trim();
}
/**
 * POST 请求调用短信接口发送报告内容
 * 未配置环境变量则跳过发送，仅控制台输出待发短信内容
 * 【临时注释：暂不启用短信发送，保留函数供后续打开】
 * @param {string} content - 需要发送的短信正文
 */
async function sendSms(content) {
  const url = process.env.ELEC_POLICY_SMS_URL;
  const to = process.env.ELEC_POLICY_SMS_TO;
  const token = process.env.ELEC_POLICY_SMS_TOKEN;
  // 缺少必填配置，跳过短信发送
  if (!url || !to) {
    console.error('[sms] skip: set ELEC_POLICY_SMS_URL, ELEC_POLICY_SMS_TO');
    console.error('[sms] content:\n' + content);
    return;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to, content }),
  });
  if (!res.ok) {
    throw new Error(`SMS response ${res.status}`);
  }
}
/**
 * 脚本主入口逻辑
 * 1. 判断月末窗口，不在窗口直接退出；FORCE_RUN=1 强制跳过窗口校验
 * 2. 在窗口则调用 opencode agent 执行电价更新任务
 * 3. 读取生成报告，【暂注释】调用短信接口推送结果
 */
async function main() {
  console.log('[monthly‑flow] 任务开始执行');
  const forceRun = process.env.FORCE_RUN === '1';
  if (forceRun) {
    console.log('[monthly‑flow] FORCE_RUN=1，跳过月末日期校验，强制执行');
  }

  // 判断日期窗口，非月末最后3天且未开启FORCE_RUN则直接结束
  if (!forceRun && !inLastThreeDays()) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    console.log(`[monthly‑flow] ${dateStr} 不在月末最后3日窗口，直接退出。`);
    process.exit(0);
  }

  const now = new Date();
  const targetYm = targetMonth(now); // {目标月}
  const mmDd = triggerDay(now); // {MM‑DD}
  const report = reportRelPath(targetYm, mmDd);
  const prompt = buildPrompt(targetYm, mmDd);
  console.log(`[monthly‑flow] 进入执行，目标月=${targetYm}，触发日=${mmDd}`);
  // 同步调用 opencode run，执行智能体任务
  const result = spawnSync(
    'opencode',
    ['run', '--agent', 'build', '--dir', '.', prompt],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );
  // 子进程调用异常
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  const exitCode = result.status ?? 1;
  const reply = readReplyFile(targetYm, mmDd);
  // 组装报文，后续启用短信时使用
  const smsBody =
    reply || `电价更新 ${targetYm}\n（未找到 ${report}）\nexit=${exitCode}`;
  // ========== 【临时注释：短信发送，后续启用再取消注释 ==========
  // try {
  //   await sendSms(smsBody);
  // } catch (e) {
  //   console.error(e instanceof Error ? e.message : String(e));
  //   process.exit(exitCode === 0 ? 1 : exitCode);
  // }
  // ==========================================================
  console.log(`[monthly‑flow] 任务结束，exitCode=${exitCode}`);
  process.exit(exitCode);
}
/**
 * 判断是否直接运行本文件，是则执行main；被import导入时不自动执行
 */
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main();
}
