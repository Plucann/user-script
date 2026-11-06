// ==UserScript==
// @name         commandcode.ai · 用量看板
// @namespace    https://commandcode.ai/
// @version      1.0.0
// @description  在 commandcode.ai 上挂一块悬浮用量看板：读取 /internal/usage/summary，展示 Credits 消耗环、请求/成功率/均次成本/均次 Token、Tok​en 进出占比、每日 Token 柱状图，并按套餐总额度预测「全部额度可承载 Token」「剩余额度可兑换 Token」「按当日消耗可用天数」「按日均消耗可用天数」「撑到期每日预算」。纯前端只读，不改站点任何数据。
// @author       local
// @homepageURL  https://github.com/Plucann/user-script/blob/main/commandcode-usage.user.js
// @supportURL   https://github.com/Plucann/user-script
// @updateURL    https://raw.githubusercontent.com/Plucann/user-script/refs/heads/main/commandcode-usage.user.js
// @downloadURL  https://raw.githubusercontent.com/Plucann/user-script/refs/heads/main/commandcode-usage.user.js
// @match        https://commandcode.ai/*
// @match        https://www.commandcode.ai/*
// @icon         https://commandcode.ai/favicon.ico
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
   * 0. 常量与站点假设
   * ---------------------------------------------------------
   * 站点：commandcode.ai（登录后才会有用量）
   * 接口：GET https://api.commandcode.ai/internal/usage/summary
   *       - 同站（same-site）请求，靠 __Secure-commandcode_prod_.session_token 鉴权
   *       - 响应带 access-control-allow-origin: https://commandcode.ai，
   *         所以必须由「页面上下文」发 fetch + credentials: 'include'
   *         —— 这也是本脚本用 @grant none 的原因（GM_xmlhttpRequest 反而拿不到 cookie）
   *       - cache-control: private, max-age=30 → 面板按 60s 轮询足够
   * 返回结构：
   *   { totalCount, totalCost, averageCost, successRate, completedCount, failedCount,
   *     totalTokensIn, totalTokensOut, totalTokens, totalCredits,
   *     periodBasis, periodStart,
   *     daily: [{ date: 'YYYY-MM-DD', tokens, requests }] }   ← daily 只含有消耗的日期
   * 关键换算：totalCredits === totalCost（1 credit ≈ $1），
   *           所以「token / credit」单价 = totalTokens / totalCredits，
   *           预测全部建立在这一个比率上。
   * ========================================================= */

  const ROOT_ID = 'cc-usage-root';
  const STYLE_ID = 'cc-usage-style';
  const CFG_KEY = 'cc-usage-board:cfg:v1';
  const DATA_KEY = 'cc-usage-board:data:v1';

  const API = 'https://api.commandcode.ai/internal/usage/summary';
  const REFRESH_MS = 60 * 1000;      // 面板刷新间隔
  const MAX_DAYS = 400;              // 生成日期轴的安全上限

  const DEFAULT_CFG = {
    credits: 70,      // 套餐额度（credits）
    theme: 'auto',    // auto | dark | light
    collapsed: false, // 只留标题栏
    closed: false,    // 整个面板收起，只留胶囊
    pos: null         // 拖拽后的 { left, top }
  };

  /* =========================================================
   * 1. 样式
   * ---------------------------------------------------------
   * 全部挂在 #cc-usage-root 下（提高优先级，避免被站点样式打穿）。
   * 主题由 JS 解析成 dark / light 写到 data-theme 上，
   * 所以这里只需要两套令牌，不用再写媒体查询分支。
   * ========================================================= */

  const CSS = `
#cc-usage-root {
  --cc-accent: #6ea8fe;
  --cc-accent-2: #a78bfa;
  --cc-ok: #4ade80;
  --cc-warn: #f6c177;
  --cc-danger: #f2777a;

  --cc-bg: #0b0e13;
  --cc-bg-2: #11161e;
  --cc-raise: #171d26;
  --cc-line: rgba(255, 255, 255, .08);
  --cc-line-2: rgba(255, 255, 255, .16);
  --cc-text: #e8ecf3;
  --cc-text-2: #9aa6b6;
  --cc-text-3: #67717f;
  --cc-shadow: 0 20px 50px -14px rgba(0, 0, 0, .8), 0 0 0 1px var(--cc-line);

  --cc-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo,
             Consolas, "Sarasa Mono SC", monospace;
  --cc-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
             "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

  position: fixed;
  inset: 0;
  z-index: 2147482000;
  pointer-events: none;
  font-family: var(--cc-sans);
  font-size: 12px;
  line-height: 1.5;
  color: var(--cc-text);
  -webkit-font-smoothing: antialiased;
}

#cc-usage-root[data-theme="light"] {
  --cc-accent: #2563eb;
  --cc-accent-2: #7c3aed;
  --cc-ok: #12924f;
  --cc-warn: #a9620b;
  --cc-danger: #c0262d;

  --cc-bg: #ffffff;
  --cc-bg-2: #f7f9fc;
  --cc-raise: #f1f4f9;
  --cc-line: rgba(16, 24, 40, .09);
  --cc-line-2: rgba(16, 24, 40, .16);
  --cc-text: #101828;
  --cc-text-2: #475467;
  --cc-text-3: #7a8699;
  --cc-shadow: 0 20px 50px -16px rgba(16, 24, 40, .28), 0 0 0 1px var(--cc-line);
}

#cc-usage-root * { box-sizing: border-box; }

/* ---------- 1.1 面板骨架 ---------- */
#cc-usage-root .cc-panel {
  position: fixed;
  top: 76px;
  right: 18px;
  width: 348px;
  max-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(180deg, var(--cc-bg-2), var(--cc-bg) 46%);
  box-shadow: var(--cc-shadow);
  pointer-events: auto;
  animation: cc-in .18s cubic-bezier(.2, .8, .2, 1) both;
}
#cc-usage-root .cc-panel[hidden] { display: none !important; }
#cc-usage-root .cc-panel.is-dragging { cursor: grabbing; }

/* ---------- 1.2 标题栏 ---------- */
#cc-usage-root .cc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 9px 8px 9px 13px;
  border-bottom: 1px solid var(--cc-line);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
#cc-usage-root .cc-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .1em;
  color: var(--cc-text);
  white-space: nowrap;
}
#cc-usage-root .cc-brand .cc-dot {
  width: 6px; height: 6px;
  border-radius: 99px;
  background: var(--cc-accent);
  box-shadow: 0 0 9px var(--cc-accent);
}
#cc-usage-root .cc-brand em {
  font-style: normal;
  font-weight: 600;
  letter-spacing: .14em;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-acts { margin-left: auto; display: flex; gap: 1px; }
#cc-usage-root .cc-acts button {
  width: 24px; height: 24px;
  display: grid; place-items: center;
  padding: 0;
  border: 0; border-radius: 6px;
  background: transparent;
  color: var(--cc-text-3);
  cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
#cc-usage-root .cc-acts button:hover { background: var(--cc-raise); color: var(--cc-text); }
#cc-usage-root .cc-acts svg { width: 13px; height: 13px; display: block; }
#cc-usage-root .cc-acts button.is-busy svg { animation: cc-spin .9s linear infinite; }

/* ---------- 1.3 内容区 ---------- */
#cc-usage-root .cc-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 11px 13px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--cc-line-2) transparent;
}
#cc-usage-root .cc-body[hidden] { display: none !important; }
#cc-usage-root .cc-body::-webkit-scrollbar { width: 8px; }
#cc-usage-root .cc-body::-webkit-scrollbar-thumb {
  background: var(--cc-line-2);
  border-radius: 99px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

#cc-usage-root .cc-period {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 6px;
  margin-bottom: 11px;
  font-family: var(--cc-mono);
  font-size: 9.5px;
  letter-spacing: .02em;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-period b { color: var(--cc-text-2); font-weight: 600; }
#cc-usage-root .cc-period .cc-sep { color: var(--cc-line-2); }

/* ---------- 1.4 额度环 ---------- */
#cc-usage-root .cc-hero { display: flex; align-items: center; gap: 14px; padding: 0 0 12px; }
#cc-usage-root .cc-ring { position: relative; flex: none; width: 78px; height: 78px; }
#cc-usage-root .cc-ring svg { transform: rotate(-90deg); display: block; }
#cc-usage-root .cc-ring .cc-rg-track { stroke: var(--cc-line-2); }
#cc-usage-root .cc-ring .cc-rg-stop-a { stop-color: var(--cc-accent); }
#cc-usage-root .cc-ring .cc-rg-stop-b { stop-color: var(--cc-accent-2); }
#cc-usage-root .cc-ring .cc-rg-bar {
  stroke: url(#cc-rg);
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--cc-accent) 55%, transparent));
  transition: stroke-dashoffset .5s cubic-bezier(.2, .8, .2, 1);
}
#cc-usage-root .cc-ring-txt {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 1px;
}
#cc-usage-root .cc-ring-pct {
  font-family: var(--cc-mono);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -.04em;
  line-height: 1;
}
#cc-usage-root .cc-ring-pct em { font-style: normal; font-size: 9px; color: var(--cc-text-3); margin-left: 1px; }
#cc-usage-root .cc-ring-cap {
  font-size: 8px;
  letter-spacing: .14em;
  color: var(--cc-text-3);
  text-transform: uppercase;
}

#cc-usage-root .cc-hero-main { flex: 1 1 auto; min-width: 0; }
#cc-usage-root .cc-cr {
  font-family: var(--cc-mono);
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -.035em;
  line-height: 1.1;
  color: var(--cc-text);
}
#cc-usage-root .cc-cr small {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-cr-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 10px;
  color: var(--cc-text-2);
}
#cc-usage-root .cc-tag {
  font-family: var(--cc-mono);
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--cc-accent) 15%, transparent);
  color: var(--cc-accent);
  white-space: nowrap;
}
#cc-usage-root .cc-tag.is-warn {
  background: color-mix(in srgb, var(--cc-warn) 16%, transparent);
  color: var(--cc-warn);
}

/* ---------- 1.5 KPI ---------- */
#cc-usage-root .cc-kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding-bottom: 12px;
}
#cc-usage-root .cc-kpi {
  padding: 7px 9px;
  border-radius: 9px;
  background: var(--cc-raise);
}
#cc-usage-root .cc-kpi-k {
  font-size: 9px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-kpi-v {
  margin-top: 2px;
  font-family: var(--cc-mono);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -.02em;
  color: var(--cc-text);
}
#cc-usage-root .cc-kpi-s { margin-top: 1px; font-size: 9px; color: var(--cc-text-3); }

/* ---------- 1.6 分节标题 ---------- */
#cc-usage-root .cc-sec-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 7px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .13em;
  text-transform: uppercase;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-sec-h::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: var(--cc-line);
}

/* ---------- 1.7 Token ---------- */
#cc-usage-root .cc-tok {
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--cc-raise);
  margin-bottom: 13px;
}
#cc-usage-root .cc-tok-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
#cc-usage-root .cc-tok-v {
  font-family: var(--cc-mono);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -.025em;
}
#cc-usage-root .cc-tok-v em {
  margin-left: 4px;
  font-style: normal;
  font-size: 9.5px;
  font-weight: 500;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-tok-io {
  font-family: var(--cc-mono);
  font-size: 9px;
  color: var(--cc-text-3);
  white-space: nowrap;
}
#cc-usage-root .cc-tok-io i { font-style: normal; color: var(--cc-text-2); }
#cc-usage-root .cc-tok-bar {
  display: flex;
  gap: 1px;
  height: 4px;
  margin-top: 8px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--cc-line);
}
#cc-usage-root .cc-tok-bar i { display: block; height: 100%; }
#cc-usage-root .cc-tok-in { background: color-mix(in srgb, var(--cc-accent) 62%, transparent); }
#cc-usage-root .cc-tok-out { background: var(--cc-accent-2); }
#cc-usage-root .cc-tok-note { margin-top: 6px; font-size: 9px; color: var(--cc-text-3); }

/* ---------- 1.8 预测 ---------- */
#cc-usage-root .cc-pred-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}
#cc-usage-root .cc-pred-head .cc-sec-h { flex: 1 1 auto; margin: 0; }
#cc-usage-root .cc-plan {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  font-size: 9px;
  color: var(--cc-text-3);
  white-space: nowrap;
}
#cc-usage-root .cc-cr-in {
  width: 38px;
  padding: 1px 4px;
  border: 1px solid var(--cc-line);
  border-radius: 4px;
  background: var(--cc-raise);
  color: var(--cc-text);
  font-family: var(--cc-mono);
  font-size: 9.5px;
  text-align: right;
  outline: none;
  -moz-appearance: textfield;
  appearance: textfield;
}
#cc-usage-root .cc-cr-in::-webkit-outer-spin-button,
#cc-usage-root .cc-cr-in::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
#cc-usage-root .cc-cr-in:focus { border-color: color-mix(in srgb, var(--cc-accent) 55%, transparent); }

#cc-usage-root .cc-pred { margin-bottom: 13px; }
#cc-usage-root .cc-pred-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--cc-line);
}
#cc-usage-root .cc-pred-row:last-child { border-bottom: 0; padding-bottom: 0; }
#cc-usage-root .cc-pred-k {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--cc-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#cc-usage-root .cc-pred-k i {
  font-style: normal;
  margin-left: 3px;
  font-family: var(--cc-mono);
  font-size: 9px;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-pred-v {
  flex: none;
  font-family: var(--cc-mono);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: -.01em;
  color: var(--cc-text);
}
#cc-usage-root .cc-pred-v.is-danger { color: var(--cc-danger); }
#cc-usage-root .cc-pred-v.is-warn { color: var(--cc-warn); }
#cc-usage-root .cc-pred-v.is-ok { color: var(--cc-ok); }

#cc-usage-root .cc-note {
  display: flex;
  gap: 7px;
  margin-bottom: 13px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--cc-warn) 26%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--cc-warn) 11%, transparent);
  font-size: 10px;
  line-height: 1.6;
  color: var(--cc-text-2);
}
#cc-usage-root .cc-note b { font-weight: 600; color: var(--cc-warn); }
#cc-usage-root .cc-note.is-ok {
  border-color: color-mix(in srgb, var(--cc-ok) 24%, transparent);
  background: color-mix(in srgb, var(--cc-ok) 10%, transparent);
}
#cc-usage-root .cc-note.is-ok b { color: var(--cc-ok); }
#cc-usage-root .cc-note .cc-note-ico { flex: none; font-size: 11px; line-height: 1.45; }

/* ---------- 1.9 图表 ---------- */
#cc-usage-root .cc-chart-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 7px;
}
#cc-usage-root .cc-chart-head .cc-sec-h { flex: 1 1 auto; margin: 0; }
#cc-usage-root .cc-peak {
  flex: none;
  font-family: var(--cc-mono);
  font-size: 9px;
  color: var(--cc-text-3);
  white-space: nowrap;
}
#cc-usage-root .cc-chart {
  display: flex;
  align-items: stretch;
  gap: 3px;
  height: 92px;
  padding-bottom: 1px;
}
#cc-usage-root .cc-bar {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  cursor: default;
}
/* 轨道只做定位，不画底：任何底色都会在空日期上堆出一根「幽灵柱」 */
#cc-usage-root .cc-track {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
}
#cc-usage-root .cc-track i {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--cc-accent) 92%, transparent),
    color-mix(in srgb, var(--cc-accent) 26%, transparent));
  opacity: .82;
  transition: opacity .12s ease, filter .12s ease;
}
#cc-usage-root .cc-bar:hover .cc-track i { opacity: 1; filter: brightness(1.2); }
#cc-usage-root .cc-bar.is-last .cc-track i {
  background: linear-gradient(180deg, var(--cc-accent-2),
    color-mix(in srgb, var(--cc-accent-2) 24%, transparent));
}
#cc-usage-root .cc-bar.is-empty .cc-track i { opacity: .18; }
#cc-usage-root .cc-day {
  flex: none;
  height: 11px;
  margin-top: 4px;
  font-family: var(--cc-mono);
  font-size: 7.5px;
  line-height: 11px;
  text-align: center;
  color: var(--cc-text-3);
  white-space: nowrap;
}

/* ---------- 1.10 底部 / 状态 ---------- */
#cc-usage-root .cc-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 11px;
  padding-top: 9px;
  border-top: 1px solid var(--cc-line);
  font-family: var(--cc-mono);
  font-size: 9px;
  color: var(--cc-text-3);
}
#cc-usage-root .cc-foot .cc-sp { margin-left: auto; }

#cc-usage-root .cc-strip {
  margin-bottom: 9px;
  padding: 5px 8px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--cc-danger) 12%, transparent);
  font-size: 9.5px;
  color: var(--cc-text-2);
}

#cc-usage-root .cc-err { padding: 18px 8px 12px; text-align: center; }
#cc-usage-root .cc-err b { display: block; margin-bottom: 5px; font-size: 11.5px; color: var(--cc-danger); }
#cc-usage-root .cc-err p { margin: 0; font-size: 10px; line-height: 1.7; color: var(--cc-text-3); }
#cc-usage-root .cc-err button {
  margin-top: 11px;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--cc-line-2);
  border-radius: 7px;
  background: var(--cc-raise);
  color: var(--cc-text);
  font-family: var(--cc-sans);
  font-size: 11px;
  cursor: pointer;
}
#cc-usage-root .cc-err button:hover { border-color: color-mix(in srgb, var(--cc-accent) 55%, transparent); }

#cc-usage-root .cc-skel { display: flex; flex-direction: column; gap: 9px; padding: 6px 0 4px; }
#cc-usage-root .cc-skel i {
  display: block;
  height: 12px;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--cc-raise) 0%, var(--cc-line) 50%, var(--cc-raise) 100%);
  background-size: 200% 100%;
  animation: cc-shimmer 1.2s linear infinite;
}
#cc-usage-root .cc-skel i:nth-child(1) { height: 62px; }
#cc-usage-root .cc-skel i:nth-child(2) { height: 46px; }
#cc-usage-root .cc-skel i:nth-child(3) { height: 90px; }

/* ---------- 1.11 收起后的胶囊 ---------- */
#cc-usage-root .cc-pill {
  position: fixed;
  right: 18px;
  bottom: 22px;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid var(--cc-line-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cc-bg) 86%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 30px -14px rgba(0, 0, 0, .85);
  color: var(--cc-text);
  font-family: var(--cc-mono);
  font-size: 10.5px;
  cursor: pointer;
  pointer-events: auto;
  transition: border-color .14s ease, transform .14s ease;
  animation: cc-in .16s ease both;
}
#cc-usage-root .cc-pill[hidden] { display: none !important; }
#cc-usage-root .cc-pill:hover {
  border-color: color-mix(in srgb, var(--cc-accent) 55%, transparent);
  transform: translateY(-1px);
}
#cc-usage-root .cc-pill .cc-pill-dot {
  width: 6px; height: 6px;
  border-radius: 99px;
  background: var(--cc-accent);
  box-shadow: 0 0 8px var(--cc-accent);
}
#cc-usage-root .cc-pill b { font-weight: 600; }

/* ---------- 1.12 图表浮层 ---------- */
#cc-usage-root .cc-tip {
  position: fixed;
  z-index: 5;
  transform: translate(-50%, -100%);
  padding: 5px 8px;
  border: 1px solid var(--cc-line-2);
  border-radius: 7px;
  background: var(--cc-bg-2);
  box-shadow: 0 10px 24px -12px rgba(0, 0, 0, .9);
  font-family: var(--cc-mono);
  font-size: 9.5px;
  line-height: 1.65;
  color: var(--cc-text-2);
  white-space: pre-line;
  pointer-events: none;
  opacity: 0;
  transition: opacity .1s ease;
}

@keyframes cc-in { from { opacity: 0; transform: translateY(-5px) scale(.99); } to { opacity: 1; transform: none; } }
@keyframes cc-spin { to { transform: rotate(360deg); } }
@keyframes cc-shimmer { from { background-position: 200% 0; } to { background-position: -60% 0; } }

@media (max-width: 480px) {
  #cc-usage-root .cc-panel { width: calc(100vw - 24px); right: 12px; top: 72px; }
  #cc-usage-root .cc-pill { right: 12px; bottom: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  #cc-usage-root .cc-panel,
  #cc-usage-root .cc-pill,
  #cc-usage-root .cc-skel i { animation: none !important; }
  #cc-usage-root .cc-ring .cc-rg-bar { transition: none !important; }
}
`;

  /* =========================================================
   * 2. 小工具
   * ========================================================= */

  const q = (sel, root) => (root || document).querySelector(sel);
  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const pad2 = n => (n < 10 ? '0' : '') + n;

  /** 整数千分位 */
  const fmtInt = n => Math.round(num(n)).toLocaleString('en-US');

  /** Token 数：按中文单位压成 亿 / 万 */
  function fmtTok(n) {
    n = num(n);
    const neg = n < 0 ? '-' : '';
    n = Math.abs(n);
    // 千分位要保留：7681.9 万一串数字太难扫读，7,681.9 万才有量级感
    if (n >= 1e8) return neg + Number((n / 1e8).toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' 亿';
    if (n >= 1e4) return neg + Number((n / 1e4).toFixed(1)).toLocaleString('en-US', { minimumFractionDigits: 1 }) + ' 万';
    return neg + Math.round(n).toLocaleString('en-US');
  }

  /** credits：常态两位小数，极小值多给一位 */
  function fmtCr(n) {
    n = num(n);
    return n > 0 && n < 0.01 ? n.toFixed(3) : n.toFixed(2);
  }

  /** 金额：按量级自适应小数位 */
  function fmtMoney(n) {
    n = num(n);
    if (n === 0) return '0';
    if (n < 0.01) return n.toFixed(5);
    if (n < 1) return n.toFixed(4);
    if (n < 100) return n.toFixed(3);
    return n.toFixed(2);
  }

  /** 天数 */
  function fmtDays(v) {
    if (!Number.isFinite(v) || v <= 0) return '—';
    if (v > 999) return '>999 天';
    return v >= 10 ? Math.round(v) + ' 天' : v.toFixed(1) + ' 天';
  }

  const utcStr = d => d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  const parseDay = s => {
    const p = String(s).slice(0, 10).split('-').map(Number);
    return Date.UTC(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1);
  };
  const addDaysStr = (s, n) => utcStr(new Date(parseDay(s) + n * 86400000));
  /** '2026-11-06' → '11-06' */
  const shortDay = s => String(s).slice(5, 10).replace('-', '-');
  /** '2026-11-06' → '11/06' */
  const slashDay = s => String(s).slice(5, 10).replace('-', '/');
  /** 时间戳 → 本地 M-D（「哪天烧完」这类要按本地日历说） */
  const localDay = ts => {
    const d = new Date(ts);
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };
  const clock = ts => {
    const d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  };

  /* =========================================================
   * 3. 配置与缓存
   * ========================================================= */

  let cfg = Object.assign({}, DEFAULT_CFG);
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) cfg = Object.assign(cfg, JSON.parse(raw));
  } catch (e) { /* 忽略损坏的配置 */ }

  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
  }

  /** 上次成功的数据：刷新前先渲染缓存，避免面板空白 */
  let usage = null;
  let usageAt = 0;
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const box = JSON.parse(raw);
      if (box && box.data && typeof box.data.totalTokens === 'number') {
        usage = box.data;
        usageAt = num(box.at);
      }
    }
  } catch (e) { /* 缓存不可用就当没缓存 */ }

  let loading = false;
  let error = '';   // '' | 'auth' | 'net' | 'fail'

  /* =========================================================
   * 4. 数据层
   * ========================================================= */

  /**
   * 面板必须由页面自己发请求：
   * api.commandcode.ai 只对 https://commandcode.ai 放行 CORS，
   * 鉴权靠 same-site cookie，所以 credentials 必须 include。
   */
  async function fetchUsage() {
    if (loading) return;
    loading = true;
    error = '';
    render();

    try {
      const res = await fetch(API, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        mode: 'cors',
        headers: { accept: 'application/json' }
      });

      if (res.status === 401 || res.status === 403) throw new Error('auth');
      if (!res.ok) throw new Error('http:' + res.status);

      const json = await res.json();
      const d = json && json.data ? json.data : json;
      if (!d || typeof d.totalTokens !== 'number') throw new Error('shape');

      usage = d;
      usageAt = Date.now();
      error = '';
      try { localStorage.setItem(DATA_KEY, JSON.stringify({ at: usageAt, data: d })); } catch (e) { }
    } catch (e) {
      const msg = String(e && e.message || '');
      if (msg === 'auth') error = 'auth';
      else if (e instanceof TypeError) error = 'net';   // CORS / 断网 / 被拦截
      else error = 'fail';
    } finally {
      loading = false;
      render();
    }
  }

  /** daily 只含有消耗的日期，补成连续的日期轴（缺的填 0），柱子才不会被压缩 */
  function fillSeries(d) {
    const rows = Array.isArray(d.daily) ? d.daily : [];
    const map = new Map();
    rows.forEach(r => {
      if (r && r.date) map.set(String(r.date).slice(0, 10), r);
    });

    const today = utcStr(new Date());
    let start = d.periodStart
      ? utcStr(new Date(d.periodStart))
      : (rows[0] ? String(rows[0].date).slice(0, 10) : today);
    let end = rows.length ? String(rows[rows.length - 1].date).slice(0, 10) : today;

    if (end < today) end = today;
    if (start > end) start = end;

    const out = [];
    let cur = start;
    let guard = 0;
    while (cur <= end && guard++ < MAX_DAYS) {
      const r = map.get(cur);
      out.push({
        date: cur,
        tokens: r ? num(r.tokens) : 0,
        requests: r ? num(r.requests) : 0,
        has: !!r
      });
      cur = addDaysStr(cur, 1);
    }
    return out;
  }

  /**
   * 预测模型
   * ---------------------------------------------------------
   * 唯一事实：totalCredits 与 totalCost 完全相等（1 credit ≈ $1），
   * 于是 token 单价 = totalTokens / totalCredits，
   * 所有外推都乘这一个比率，不需要猜任何套餐档位。
   *   estTotalTokens  = 单价 × 套餐额度
   *   estRemainTokens = 单价 × 剩余额度
   *   可用天数        = 剩余额度 / 最近一日（或日均）消耗
   */
  function derive(d) {
    const plan = Math.max(1, Math.floor(num(cfg.credits) || 70));

    const totalTokens = num(d.totalTokens);
    const totalCredits = num(d.totalCredits) || num(d.totalCost);
    const perCredit = totalCredits > 0 ? totalTokens / totalCredits : 0;

    const usedPct = Math.min(100, (totalCredits / plan) * 100);
    const remaining = Math.max(0, plan - totalCredits);

    const series = fillSeries(d);
    const last = series.filter(s => s.has).slice(-1)[0] || null;
    const lastCost = last && perCredit > 0 ? last.tokens / perCredit : 0;
    const daysByLast = lastCost > 0 ? remaining / lastCost : Infinity;

    const startTime = d.periodStart ? new Date(d.periodStart).getTime() : 0;
    const elapsedDays = startTime
      ? Math.max(1 / 24, (Date.now() - startTime) / 86400000)
      : Math.max(1, series.length);
    const avgCost = totalCredits / elapsedDays;
    const daysByAvg = avgCost > 0 ? remaining / avgCost : Infinity;

    // 本期结算日：接口没给，按「periodStart + 1 个月」推（站点是月度账单周期）
    let periodEnd = 0;
    let periodLeft = 0;
    if (startTime) {
      const e = new Date(startTime);
      e.setUTCMonth(e.getUTCMonth() + 1);
      periodEnd = e.getTime();
      periodLeft = Math.max(0, (periodEnd - Date.now()) / 86400000);
    }
    const budgetPerDay = periodLeft > 0 ? remaining / periodLeft : remaining;

    const exhaustAt = Number.isFinite(daysByLast) && daysByLast < 9999
      ? Date.now() + daysByLast * 86400000
      : 0;

    const seriesTokens = series.reduce((s, x) => s + x.tokens, 0);
    const peak = series.reduce((a, b) => (b.tokens > a.tokens ? b : a), series[0] || { tokens: 0, date: '' });

    return {
      plan,
      totalTokens,
      totalCredits,
      perCredit,
      usedPct,
      remaining,
      estTotalTokens: perCredit * plan,
      estRemainTokens: perCredit * remaining,
      series,
      seriesTokens,
      peak,
      last,
      lastCost,
      daysByLast,
      avgCost,
      daysByAvg,
      elapsedDays,
      periodEnd,
      periodLeft,
      budgetPerDay,
      exhaustAt
    };
  }

  /* =========================================================
   * 5. 渲染
   * ========================================================= */

  const ICON = {
    refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5',
    auto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 3v18',
    minus: 'M5 12h14',
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18'
  };

  function icon(name, size) {
    const s = size || 13;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="' + ICON[name] + '"/></svg>';
  }

  const resolvedTheme = () => {
    if (cfg.theme === 'dark' || cfg.theme === 'light') return cfg.theme;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };

  /* ---------- 5.1 额度环 ---------- */
  function ringHTML(x) {
    const R = 30;
    const C = 2 * Math.PI * R;
    const pct = Math.max(0, Math.min(100, x.usedPct));
    const off = C * (1 - pct / 100);

    return '<div class="cc-ring">' +
      '<svg viewBox="0 0 72 72" width="78" height="78" aria-hidden="true">' +
        '<defs><linearGradient id="cc-rg" x1="0" y1="0" x2="1" y2="1">' +
          '<stop class="cc-rg-stop-a" offset="0%"/>' +
          '<stop class="cc-rg-stop-b" offset="100%"/>' +
        '</linearGradient></defs>' +
        '<circle class="cc-rg-track" cx="36" cy="36" r="' + R + '" fill="none" stroke-width="6"/>' +
        '<circle class="cc-rg-bar" cx="36" cy="36" r="' + R + '" fill="none" stroke-width="6" ' +
          'stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" ' +
          'stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '</svg>' +
      '<div class="cc-ring-txt">' +
        '<span class="cc-ring-pct">' + pct.toFixed(0) + '<em>%</em></span>' +
        '<span class="cc-ring-cap">已用</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 5.2 Token 卡片 ---------- */
  function tokensHTML(d, x) {
    const tin = num(d.totalTokensIn);
    const tout = num(d.totalTokensOut);
    const tt = x.totalTokens || (tin + tout) || 1;
    const inPct = Math.max(1.2, Math.min(98.8, (tin / tt) * 100));

    return '<div class="cc-tok">' +
      '<div class="cc-tok-top">' +
        '<span class="cc-tok-v">' + fmtTok(x.totalTokens) + '<em>tokens</em></span>' +
        '<span class="cc-tok-io">in <i>' + fmtTok(tin) + '</i> · out <i>' + fmtTok(tout) + '</i></span>' +
      '</div>' +
      '<div class="cc-tok-bar">' +
        '<i class="cc-tok-in" style="width:' + inPct.toFixed(2) + '%"></i>' +
        '<i class="cc-tok-out" style="width:' + (100 - inPct).toFixed(2) + '%"></i>' +
      '</div>' +
      '<div class="cc-tok-note">输入占 ' + ((tin / tt) * 100).toFixed(1) + '% · 输出占 ' +
        ((tout / tt) * 100).toFixed(1) + '% · 合计 ' + fmtInt(d.totalCount) + ' 次请求</div>' +
    '</div>';
  }

  /* ---------- 5.3 预测 ---------- */
  function predHTML(x) {
    const rows = [];

    rows.push({
      k: '套餐额度可承载',
      hint: '全量 ' + x.plan + ' cr',
      v: fmtTok(x.estTotalTokens) + ' token',
      cls: ''
    });

    rows.push({
      k: '剩余 ' + fmtCr(x.remaining) + ' cr 可承载',
      hint: '',
      v: fmtTok(x.estRemainTokens) + ' token',
      cls: ''
    });

    rows.push({
      k: '按最近一日强度可用',
      hint: x.last ? shortDay(x.last.date) + ' · ' + fmtCr(x.lastCost) + ' cr/d' : '无最近数据',
      v: fmtDays(x.daysByLast),
      cls: !isFinite(x.daysByLast) ? ''
        : (x.daysByLast <= 3 ? 'is-danger' : (x.periodLeft && x.daysByLast < x.periodLeft ? 'is-warn' : 'is-ok'))
    });

    rows.push({
      k: '按本期日均强度可用',
      hint: '日均 ' + fmtCr(x.avgCost) + ' cr/d',
      v: fmtDays(x.daysByAvg),
      cls: !isFinite(x.daysByAvg) ? ''
        : (x.daysByAvg <= 3 ? 'is-danger' : (x.periodLeft && x.daysByAvg < x.periodLeft ? 'is-warn' : 'is-ok'))
    });

    rows.push({
      k: '撑到结算每日预算',
      hint: '剩 ' + Math.round(x.periodLeft) + ' 天',
      v: fmtCr(x.budgetPerDay) + ' cr/d',
      cls: ''
    });

    const html = rows.map(r =>
      '<div class="cc-pred-row">' +
        '<span class="cc-pred-k">' + esc(r.k) + (r.hint ? '<i>' + esc(r.hint) + '</i>' : '') + '</span>' +
        '<span class="cc-pred-v ' + r.cls + '">' + esc(r.v) + '</span>' +
      '</div>'
    ).join('');

    // 结论条：按最近一日的速度，会不会在本期结算前烧完
    let note = '';
    if (x.last && isFinite(x.daysByLast)) {
      if (x.remaining <= 0) {
        note = '<div class="cc-note"><span class="cc-note-ico">⚠</span><span>' +
          '额度已用完。<b>' + fmtCr(x.totalCredits - x.plan) + ' cr</b> 超出套餐，' +
          '如需继续使用请充值或等本期结算。</span></div>';
      } else if (x.periodLeft > 0 && x.daysByLast < x.periodLeft) {
        note = '<div class="cc-note"><span class="cc-note-ico">⚠</span><span>' +
          '按最近一日的节奏，额度约 <b>' + localDay(x.exhaustAt) + '</b> 耗尽，' +
          '比本期结算早 <b>' + Math.round(x.periodLeft - x.daysByLast) + ' 天</b>；' +
          '想用满整期，每天别超过 <b>' + fmtCr(x.budgetPerDay) + ' cr</b>（≈ ' +
          fmtTok(x.budgetPerDay * x.perCredit) + ' token）。</span></div>';
      } else {
        note = '<div class="cc-note is-ok"><span class="cc-note-ico">✓</span><span>' +
          '按最近一日的节奏可以撑到本期结算，预计结算时剩余 <b>' +
          fmtCr(Math.max(0, x.remaining - x.lastCost * x.periodLeft)) + ' cr</b>。</span></div>';
      }
    }

    return '<div class="cc-pred-head">' +
        '<span class="cc-sec-h">预测</span>' +
        '<label class="cc-plan">套餐<input class="cc-cr-in" type="number" min="1" step="1" value="' +
          esc(x.plan) + '" aria-label="套餐额度（credits）">cr</label>' +
      '</div>' +
      '<div class="cc-pred">' + html + '</div>' + note;
  }

  /* ---------- 5.4 图表 ---------- */
  function chartHTML(x) {
    const series = x.series;
    if (!series.length) return '';

    const max = Math.max(1, ...series.map(s => s.tokens));
    const step = Math.ceil(series.length / 7);
    const lastIdx = series.length - 1;

    const bars = series.map((s, i) => {
      const h = s.tokens > 0 ? Math.max(2.5, (s.tokens / max) * 100) : 1.5;
      // 从右往左等距取标签：既保证最后一天有日期，又不会跟倒数第二天挤在一起
      const showLabel = (lastIdx - i) % step === 0;
      const cls = ['cc-bar', i === lastIdx ? 'is-last' : '', s.tokens > 0 ? '' : 'is-empty']
        .filter(Boolean).join(' ');
      const tip = s.date + '\n' + fmtTok(s.tokens) + ' tokens · ' + fmtInt(s.requests) + ' 次';

      return '<div class="' + cls + '" data-tip="' + esc(tip) + '">' +
        '<div class="cc-track"><i style="height:' + h.toFixed(2) + '%"></i></div>' +
        '<div class="cc-day">' + (showLabel ? slashDay(s.date) : '') + '</div>' +
      '</div>';
    }).join('');

    const peakTxt = x.peak && x.peak.tokens > 0
      ? '峰值 ' + fmtTok(x.peak.tokens) + ' · ' + shortDay(x.peak.date)
      : '暂无数据';

    return '<div class="cc-chart-head">' +
        '<span class="cc-sec-h">每日 Token</span>' +
        '<span class="cc-peak">' + esc(peakTxt) + '</span>' +
      '</div>' +
      '<div class="cc-chart">' + bars + '</div>';
  }

  /* ---------- 5.5 各种状态 ---------- */
  function errorHTML() {
    const map = {
      auth: ['需要登录才能读取用量', '接口返回 401/403：请先在 commandcode.ai 登录，再回来刷新。'],
      net: ['请求没能发出去', '可能被拦截、跨域受限或断网。确认能正常打开 commandcode.ai 的用量页后重试。'],
      fail: ['接口返回异常', '数据结构与预期不符，可能是接口改版了。']
    };
    const m = map[error] || map.fail;

    return '<div class="cc-err">' +
      '<b>' + esc(m[0]) + '</b>' +
      '<p>' + esc(m[1]) + '</p>' +
      (loading ? '' : '<button data-act="refresh">重新获取</button>') +
    '</div>';
  }

  const skeletonHTML = () =>
    '<div class="cc-skel"><i></i><i></i><i></i></div>';

  function bodyHTML() {
    if (!usage) {
      if (loading) return skeletonHTML();
      return errorHTML();
    }

    const d = usage;
    const x = derive(d);

    const strip = error
      ? '<div class="cc-strip">刷新失败，显示 ' + clock(usageAt) + ' 的缓存 · <span style="color:var(--cc-accent)">稍后自动重试</span></div>'
      : '';

    const period = '<div class="cc-period">' +
      '<span>周期</span><b>' + shortDay(utcStr(new Date(d.periodStart || Date.now()))) + '</b>' +
      '<span class="cc-sep">→</span><b>' + shortDay(utcStr(new Date(x.periodEnd || Date.now()))) + '</b>' +
      '<span class="cc-sep">·</span><span>剩 <b>' + Math.round(x.periodLeft) + '</b> 天</span>' +
      '<span class="cc-sep">·</span><span>已过 <b>' + Math.round(x.elapsedDays) + '</b> 天</span>' +
    '</div>';

    const hero = '<div class="cc-hero">' + ringHTML(x) +
      '<div class="cc-hero-main">' +
        '<div class="cc-cr">' + fmtCr(x.totalCredits) + '<small>/ ' + x.plan + ' cr</small></div>' +
        '<div class="cc-cr-sub">' +
          '<span>剩余 ' + fmtCr(x.remaining) + ' cr</span>' +
          '<span class="cc-tag">' + (100 - x.usedPct).toFixed(1) + '% 余量</span>' +
        '</div>' +
      '</div>' +
    '</div>';

    const avgPerReq = x.totalTokens / Math.max(1, num(d.totalCount));
    const kpis = [
      ['请求总数', fmtInt(d.totalCount), '完成 ' + fmtInt(d.completedCount) + ' · 失败 ' + fmtInt(d.failedCount)],
      ['成功率', num(d.successRate).toFixed(0) + '%', num(d.failedCount) ? '失败 ' + fmtInt(d.failedCount) + ' 次' : '没有失败请求'],
      ['均次成本', '$' + fmtMoney(d.averageCost), '1 cr ≈ $1'],
      ['均次 Token', fmtTok(avgPerReq), '输入 + 输出']
    ].map(k =>
      '<div class="cc-kpi">' +
        '<div class="cc-kpi-k">' + esc(k[0]) + '</div>' +
        '<div class="cc-kpi-v">' + esc(k[1]) + '</div>' +
        '<div class="cc-kpi-s">' + esc(k[2]) + '</div>' +
      '</div>'
    ).join('');

    const foot = '<div class="cc-foot">' +
      '<span>' + (loading ? '更新中…' : '更新于 ' + clock(usageAt)) + '</span>' +
      '<span class="cc-sp">api.commandcode.ai · 60s</span>' +
    '</div>';

    return strip + period + hero +
      '<div class="cc-kpis">' + kpis + '</div>' +
      '<div class="cc-sec-h">Tokens</div>' +
      tokensHTML(d, x) +
      predHTML(x) +
      chartHTML(x) +
      foot;
  }

  function pillHTML() {
    if (!usage) return '<span class="cc-pill-dot"></span><span>用量看板</span>';
    const x = derive(usage);
    return '<span class="cc-pill-dot"></span>' +
      '<span><b>' + x.usedPct.toFixed(0) + '%</b> · 剩 ' + fmtCr(x.remaining) + ' cr</span>';
  }

  /* ---------- 5.6 整体刷新 ---------- */
  function render() {
    const el = document.getElementById(ROOT_ID);
    if (!el) return;

    el.dataset.theme = resolvedTheme();

    const panel = q('.cc-panel', el);
    const body = q('.cc-body', el);
    const pill = q('.cc-pill', el);

    panel.hidden = !!cfg.closed;
    pill.hidden = !cfg.closed;
    body.hidden = !!cfg.collapsed;
    panel.classList.toggle('is-collapsed', !!cfg.collapsed);

    if (cfg.pos) {
      panel.style.left = num(cfg.pos.left) + 'px';
      panel.style.top = num(cfg.pos.top) + 'px';
      panel.style.right = 'auto';
    }

    const themeBtn = q('[data-act="theme"]', el);
    if (themeBtn) {
      themeBtn.innerHTML = icon(cfg.theme === 'auto' ? 'auto' : (cfg.theme === 'dark' ? 'moon' : 'sun'));
      themeBtn.title = '主题：' + ({ auto: '跟随系统', dark: '深色', light: '浅色' }[cfg.theme] || '自动');
    }

    const refreshBtn = q('[data-act="refresh"]', el);
    if (refreshBtn) refreshBtn.classList.toggle('is-busy', loading);

    const collapseBtn = q('[data-act="collapse"]', el);
    if (collapseBtn) {
      collapseBtn.innerHTML = icon(cfg.collapsed ? 'plus' : 'minus');
      collapseBtn.title = cfg.collapsed ? '展开面板' : '只有标题栏';
    }

    if (cfg.closed) {
      pill.innerHTML = pillHTML();
      return;
    }
    if (!cfg.collapsed) body.innerHTML = bodyHTML();
  }

  /* =========================================================
   * 6. 结构 + 交互
   * ========================================================= */

  function buildRoot() {
    const el = document.createElement('div');
    el.id = ROOT_ID;
    el.dataset.theme = resolvedTheme();
    el.innerHTML =
      '<section class="cc-panel" role="dialog" aria-label="Command Code 用量看板">' +
        '<header class="cc-head">' +
          '<div class="cc-brand"><span class="cc-dot"></span>COMMANDCODE<em>USAGE</em></div>' +
          '<div class="cc-acts">' +
            '<button type="button" data-act="refresh" title="刷新数据">' + icon('refresh') + '</button>' +
            '<button type="button" data-act="theme" title="主题">' + icon('auto') + '</button>' +
            '<button type="button" data-act="collapse" title="只有标题栏">' + icon('minus') + '</button>' +
            '<button type="button" data-act="close" title="隐藏面板">' + icon('close') + '</button>' +
          '</div>' +
        '</header>' +
        '<div class="cc-body"></div>' +
      '</section>' +
      '<button type="button" class="cc-pill" hidden></button>' +
      '<div class="cc-tip" aria-hidden="true"></div>';

    bindEvents(el);
    bindDrag(el);
    return el;
  }

  function bindEvents(el) {
    el.addEventListener('click', e => {
      const pill = e.target.closest('.cc-pill');
      if (pill) {
        cfg.closed = false;
        saveCfg();
        render();
        return;
      }

      const btn = e.target.closest('[data-act]');
      if (!btn) return;

      switch (btn.dataset.act) {
        case 'refresh':
          fetchUsage();
          break;
        case 'theme':
          cfg.theme = cfg.theme === 'auto' ? 'dark' : (cfg.theme === 'dark' ? 'light' : 'auto');
          saveCfg();
          render();
          break;
        case 'collapse':
          cfg.collapsed = !cfg.collapsed;
          saveCfg();
          render();
          break;
        case 'close':
          cfg.closed = true;
          saveCfg();
          render();
          break;
      }
    });

    // 套餐额度：改完立刻按缓存重算，不用再请求接口
    el.addEventListener('change', e => {
      const inp = e.target.closest('.cc-cr-in');
      if (!inp) return;
      const v = Math.max(1, Math.min(1000000, Math.floor(num(inp.value) || DEFAULT_CFG.credits)));
      cfg.credits = v;
      saveCfg();
      render();
    });

    // 柱状图浮层
    const tip = q('.cc-tip', el);
    el.addEventListener('mouseover', e => {
      const bar = e.target.closest('.cc-bar');
      if (!bar || !bar.dataset.tip) return;
      const r = bar.getBoundingClientRect();
      tip.textContent = bar.dataset.tip;
      tip.style.left = Math.min(Math.max(r.left + r.width / 2, 92), window.innerWidth - 92) + 'px';
      tip.style.top = (r.top - 6) + 'px';
      tip.style.opacity = '1';
    });
    el.addEventListener('mouseout', e => {
      const bar = e.target.closest('.cc-bar');
      if (!bar) return;
      // 在柱内子元素之间移动时不算离开，否则浮层会闪
      if (e.relatedTarget && bar.contains(e.relatedTarget)) return;
      tip.style.opacity = '0';
    });
  }

  /** 拖标题栏移动面板，位置写回配置 */
  function bindDrag(el) {
    const panel = q('.cc-panel', el);
    const head = q('.cc-head', el);
    let on = false, sx = 0, sy = 0, ox = 0, oy = 0;

    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      on = true;
      sx = e.clientX; sy = e.clientY;
      ox = r.left; oy = r.top;
      panel.style.left = r.left + 'px';
      panel.style.top = r.top + 'px';
      panel.style.right = 'auto';
      panel.classList.add('is-dragging');
      try { head.setPointerCapture(e.pointerId); } catch (err) { }
    });

    head.addEventListener('pointermove', e => {
      if (!on) return;
      const w = panel.offsetWidth;
      const nx = Math.min(Math.max(6, ox + (e.clientX - sx)), Math.max(6, window.innerWidth - w - 6));
      const ny = Math.min(Math.max(6, oy + (e.clientY - sy)), Math.max(6, window.innerHeight - 46));
      panel.style.left = nx + 'px';
      panel.style.top = ny + 'px';
    });

    const stop = () => {
      if (!on) return;
      on = false;
      panel.classList.remove('is-dragging');
      cfg.pos = { left: parseFloat(panel.style.left) || 0, top: parseFloat(panel.style.top) || 0 };
      saveCfg();
    };
    head.addEventListener('pointerup', stop);
    head.addEventListener('pointercancel', stop);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* =========================================================
   * 7. 生命周期
   * ========================================================= */

  function boot() {
    injectStyle();

    const el = buildRoot();
    document.body.appendChild(el);
    render();

    fetchUsage();

    // 定时刷新；标签页不可见时跳过，回来后补一次
    setInterval(() => {
      if (!document.hidden) fetchUsage();
    }, REFRESH_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - usageAt > REFRESH_MS) fetchUsage();
    });

    // 站点是 SPA，极端情况下会重建 body；节点被摘掉就挂回去
    setInterval(() => {
      const node = document.getElementById(ROOT_ID);
      if (node && !node.isConnected && document.body) document.body.appendChild(node);
    }, 3000);

    // 窗口尺寸变化后把拖出去的面板拉回可视区
    window.addEventListener('resize', () => {
      if (!cfg.pos) return;
      const node = document.querySelector('#' + ROOT_ID + ' .cc-panel');
      if (!node) return;
      const maxL = Math.max(6, window.innerWidth - node.offsetWidth - 6);
      const maxT = Math.max(6, window.innerHeight - 46);
      const l = Math.min(cfg.pos.left, maxL);
      const t = Math.min(cfg.pos.top, maxT);
      if (l !== cfg.pos.left || t !== cfg.pos.top) {
        cfg.pos = { left: l, top: t };
        saveCfg();
        render();
      }
    });

    // 跟随系统明暗
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onScheme = () => { if (cfg.theme === 'auto') render(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
