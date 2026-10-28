// ==UserScript==
// @name         shencaiyoudao · Codex Skin
// @namespace    https://shenlunsucai.com/
// @version      1.4.0
// @description  把「申材有道」重绘为 Codex 桌面应用风格：52px 图标条 + 双层左侧栏、令牌级配色重映射、⌘K 跳转面板、强调色/明暗/栏宽可调；素材页的 AI 解读面板与「问 AI」抽屉按 Codex 对话形态重绘，素材详情页改成等宽终端会话流（随机英文思考块、工具调用行、回复框与状态栏）。只改外观与导航增强，不碰站点数据。
// @author       local
// @homepageURL  https://github.com/Plucann/user-script/blob/main/shenlunsucai-codex.user.js
// @supportURL   https://github.com/Plucann/user-script
// @updateURL    https://raw.githubusercontent.com/Plucann/user-script/refs/heads/main/shenlunsucai-codex.user.js
// @downloadURL  https://raw.githubusercontent.com/Plucann/user-script/refs/heads/main/shenlunsucai-codex.user.js
// @match        https://shenlunsucai.com/app
// @match        https://shenlunsucai.com/app/*
// @match        https://www.shenlunsucai.com/app
// @match        https://www.shenlunsucai.com/app/*
// @icon         https://shenlunsucai.com/app/favicon-32.png
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
   * 0. 常量与站点结构假设
   * ---------------------------------------------------------
   * 站点是 React SPA，外壳结构：
   *   .app-shell
   *     > .nav (.is-collapsed 时 52px)        ← 导航栏
   *         .nav-brand / .nav-new-chat / .nav-item / .session-row / .nav-user
   *     > .shell-main-col                     ← 主内容
   *         .session-tabs / .chat-thread / .composer
   * 配色走 CSS 变量：--bg --surface --text --border --accent ...（见 :root[data-theme]）
   * AI 区再映射一层：--ac-card --ac-line --ac-ink --ac-r-input ...
   * ========================================================= */

  const STORE_KEY = 'sls-codex-ui:v1';
  const STYLE_ID = 'sls-codex-style';
  const ROOT_CLASS = 'cx-on';
  const STRIP_W = 52;
  const PAGE_TITLE = 'codx';   // 浏览器标签页标题（站点会改，脚本负责压住）

  // 站点导航项（取自 bundle 内 NAV 数组，label 与 .nav-item[title] 一致）
  const VIEWS = [
    ['home', 'AI 教练'],
    ['supervision', '督学吧'],
    ['study-plan', '学习计划'],
    ['materials', '申论素材'],
    ['ears', '磨耳朵'],
    ['shenlun', '申论练习'],
    ['xingce', '行测练习'],
    ['shiye', '事业单位'],
    ['interview', '面试练习'],
    ['flashcard', '知识速记'],
    ['fun-games', '趣味游戏']
  ];

  const ACCENTS = {
    blue: { dark: '#83c3fe', light: '#2a98ff', onDark: '#101418', onLight: '#ffffff', name: ' Codex 蓝' },
    amber: { dark: '#e9b45c', light: '#b47a12', onDark: '#141008', onLight: '#ffffff', name: '琥珀' },
    wine: { dark: '#e2796a', light: '#a8332c', onDark: '#140c0b', onLight: '#ffffff', name: '酒红' }
  };

  const DEFAULTS = {
    theme: 'auto',   // auto | light | dark
    accent: 'blue',  // blue | amber | wine
    rail: 276,       // 侧栏宽度 px
    strip: true,     // 是否显示 52px 图标条
    glass: true      // 半透明/毛玻璃
  };

  const RAIL_STEPS = [[248, '紧凑'], [276, '标准'], [300, '宽松']];

  /* =========================================================
   * 1. 样式：令牌层 + 外壳重绘
   * ========================================================= */

  const CSS = String.raw`
/* ---------- 1.1 明暗基色（Codex 桌面端实测色） ---------- */
:root.cx-on {
  --cx-strip-w: ${STRIP_W}px;
  --cx-rail-w: 276px;
  --cx-r-sm: 8px;
  --cx-r-md: 12px;
  --cx-r-lg: 16px;

  --cx-strip-bg: #171819;
  --cx-rail-bg: #242526;
  --cx-bg: #1e1f20;
  --cx-raised: #262728;
  --cx-raised-2: #2c2d2e;
  --cx-elevated: #313233;
  --cx-text: #ececec;
  --cx-text-2: #b6b6b6;
  --cx-text-3: #8c8c8c;
  --cx-line: #ffffff14;
  --cx-line-strong: #ffffff26;
  --cx-hover: #ffffff0d;
  --cx-active: color-mix(in srgb, var(--cx-accent) 15%, transparent);
  --cx-accent: #83c3fe;
  --cx-on-accent: #101418;
  --cx-shadow: 0 8px 24px #00000033;
  --cx-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
             "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

  /* —— 基础令牌重映射：站点所有组件都会跟着变 —— */
  --bg: var(--cx-bg) !important;
  --bg-solid: var(--cx-bg) !important;
  --surface: var(--cx-raised) !important;
  --surface-2: var(--cx-raised-2) !important;
  --elevated: var(--cx-elevated) !important;
  --bg-elevated: var(--cx-elevated) !important;
  --text: var(--cx-text) !important;
  --text-muted: var(--cx-text-2) !important;
  --border: var(--cx-line) !important;
  --border-strong: var(--cx-line-strong) !important;
  --accent: var(--cx-accent) !important;
  --accent-soft: color-mix(in srgb, var(--cx-accent) 14%, transparent) !important;
  --accent-contrast: var(--cx-on-accent) !important;

  /* —— AI 区令牌：几何与投影 —— */
  --ac-page: var(--cx-bg) !important;
  --ac-card: var(--cx-raised) !important;
  --ac-input: var(--cx-raised-2) !important;
  --ac-line: var(--cx-line) !important;
  --ac-line-soft: var(--cx-line) !important;
  --ac-ink: var(--cx-text) !important;
  --ac-ink-2: var(--cx-text-2) !important;
  --ac-ink-3: var(--cx-text-3) !important;
  --ac-on-primary: var(--cx-on-accent) !important;
  --ac-primary: var(--cx-accent) !important;
  --ac-primary-soft: var(--cx-active) !important;
  --ac-r-bubble: 14px;
  --ac-r-card: 14px;
  --ac-r-input: 15px;
  --ac-col: 800px;
  --ac-shadow-card: 0 1px 2px #00000026, 0 6px 20px #0000001f;
  --ac-shadow-pop: 0 18px 44px #00000059;
}

/* 浅色（站点 data-theme="light"） */
:root.cx-on[data-theme="light"] {
  --cx-strip-bg: #dddfe1;
  --cx-rail-bg: #eff0f1;
  --cx-bg: #fafafa;
  --cx-raised: #ffffff;
  --cx-raised-2: #f2f3f4;
  --cx-elevated: #ffffff;
  --cx-text: #1b1c1e;
  --cx-text-2: #5f6165;
  --cx-text-3: #717378;
  --cx-line: #1b1c1e14;
  --cx-line-strong: #1b1c1e26;
  --cx-hover: #1b1c1e08;
  --cx-shadow: 0 8px 24px #1b1c1e14;
  --ac-shadow-card: 0 1px 2px #1b1c1e0f, 0 6px 20px #1b1c1e12;
  --ac-shadow-pop: 0 18px 44px #1b1c1e33;
}
/* 浅色（系统偏好、站点未显式指定） */
@media (prefers-color-scheme: light) {
  :root.cx-on:not([data-theme="dark"]) {
    --cx-strip-bg: #dddfe1;
    --cx-rail-bg: #eff0f1;
    --cx-bg: #fafafa;
    --cx-raised: #ffffff;
    --cx-raised-2: #f2f3f4;
    --cx-elevated: #ffffff;
    --cx-text: #1b1c1e;
    --cx-text-2: #5f6165;
    --cx-text-3: #717378;
    --cx-line: #1b1c1e14;
    --cx-line-strong: #1b1c1e26;
    --cx-hover: #1b1c1e08;
    --cx-shadow: 0 8px 24px #1b1c1e14;
    --ac-shadow-card: 0 1px 2px #1b1c1e0f, 0 6px 20px #1b1c1e12;
    --ac-shadow-pop: 0 18px 44px #1b1c1e33;
  }
}

/* ---------- 1.2 强调色预设 ---------- */
:root.cx-on[data-cx-accent="blue"]  { --cx-accent: #83c3fe; --cx-on-accent: #101418; }
:root.cx-on[data-cx-accent="amber"] { --cx-accent: #e9b45c; --cx-on-accent: #141008; }
:root.cx-on[data-cx-accent="wine"]  { --cx-accent: #e2796a; --cx-on-accent: #140c0b; }
:root.cx-on[data-theme="light"][data-cx-accent="blue"]  { --cx-accent: #2a98ff; --cx-on-accent: #ffffff; }
:root.cx-on[data-theme="light"][data-cx-accent="amber"] { --cx-accent: #b47a12; --cx-on-accent: #ffffff; }
:root.cx-on[data-theme="light"][data-cx-accent="wine"]  { --cx-accent: #a8332c; --cx-on-accent: #ffffff; }
@media (prefers-color-scheme: light) {
  :root.cx-on:not([data-theme="dark"])[data-cx-accent="blue"]  { --cx-accent: #2a98ff; --cx-on-accent: #ffffff; }
  :root.cx-on:not([data-theme="dark"])[data-cx-accent="amber"] { --cx-accent: #b47a12; --cx-on-accent: #ffffff; }
  :root.cx-on:not([data-theme="dark"])[data-cx-accent="wine"]  { --cx-accent: #a8332c; --cx-on-accent: #ffffff; }
}

/* ---------- 1.3 外壳：图标条占位 ---------- */
@media (min-width: 900px) {
  :root.cx-on .app-shell { padding-left: var(--cx-strip-w) !important; }
}
:root.cx-on.cx-nostrip .app-shell { padding-left: 0 !important; }
:root.cx-on .app-shell,
:root.cx-on .shell-main-col { background: var(--cx-bg) !important; }
:root.cx-on body { font-family: var(--cx-font); }

/* 站点进入沉浸/全屏/禅模式时让出宽度 */
:root.cx-on[data-ep-desktop-fs] .app-shell { padding-left: 0 !important; }
:root.cx-on[data-ep-desktop-fs] .cx-strip { display: none !important; }
:root.cx-on:has(.xc-desk.is-zen) .app-shell,
:root.cx-on:has(.sy-desk.is-zen) .app-shell { padding-left: 0 !important; }
:root.cx-on:has(.xc-desk.is-zen) .cx-strip,
:root.cx-on:has(.sy-desk.is-zen) .cx-strip { display: none !important; }

/* ---------- 1.4 图标条 ---------- */
.cx-strip {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: var(--cx-strip-w, 52px);
  z-index: 60;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0 12px;
  background: var(--cx-strip-bg, #171819);
  border-right: 1px solid var(--cx-line-strong, #ffffff26);
  font-family: var(--cx-font);
  -webkit-app-region: no-drag;
}
:root.cx-on .cx-strip { display: flex; }
:root.cx-on.cx-nostrip .cx-strip { display: none !important; }
@media (max-width: 899px) {
  :root.cx-on .cx-strip { display: none; }
}

.cx-strip-btn {
  position: relative;
  width: 36px; height: 36px;
  display: grid; place-items: center;
  border: 0; padding: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--cx-text-3, #8c8c8c);
  cursor: pointer;
  transition: background .14s ease, color .14s ease, transform .14s ease;
}
.cx-strip-btn:hover { background: var(--cx-hover, #ffffff0d); color: var(--cx-text, #ececec); }
.cx-strip-btn:active { transform: scale(.94); }
.cx-strip-btn.is-on { background: var(--cx-active, #ffffff1a); color: var(--cx-text, #ececec); }
.cx-strip-btn svg { width: 19px; height: 19px; display: block; }
.cx-strip-btn .cx-strip-badge {
  position: absolute; top: 5px; right: 5px;
  min-width: 13px; height: 13px; padding: 0 3px;
  border-radius: 999px;
  background: var(--cx-accent, #83c3fe);
  color: var(--cx-on-accent, #101418);
  font-size: 9px; font-weight: 700; line-height: 13px;
  text-align: center;
}
.cx-strip-sep { width: 24px; height: 1px; background: var(--cx-line, #ffffff14); margin: 6px 0; }
.cx-strip-grow { flex: 1 1 auto; }

.cx-brand {
  width: 32px; height: 32px; margin-bottom: 6px;
  display: grid; place-items: center;
  border-radius: 9px;
  border: 1px solid var(--cx-line-strong, #ffffff26);
  background: linear-gradient(160deg, color-mix(in srgb, var(--cx-accent) 26%, transparent), transparent 70%);
  color: var(--cx-text, #ececec);
  font-size: 14px; font-weight: 700; letter-spacing: 0;
  cursor: pointer;
  transition: border-color .14s ease, transform .14s ease;
}
.cx-brand:hover { border-color: color-mix(in srgb, var(--cx-accent) 55%, transparent); transform: translateY(-1px); }

/* ---------- 1.5 导航栏（rail） ---------- */
:root.cx-on .app-shell > .nav {
  background: var(--cx-rail-bg) !important;
  border-right: 1px solid var(--cx-line) !important;
  font-family: var(--cx-font);
}
@media (min-width: 900px) {
  :root.cx-on .app-shell > .nav:not(.is-collapsed) {
    width: var(--cx-rail-w) !important;
    max-width: var(--cx-rail-w) !important;
  }
}
:root.cx-on .nav-scroll { padding: 8px 8px 10px; }

:root.cx-on .nav-brand {
  height: 48px;
  padding: 0 8px;
  border-bottom: 0 !important;
  color: var(--cx-text) !important;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .01em;
  gap: 8px;
}
:root.cx-on .nav-brand .mark { width: 24px; height: 24px; border-radius: 7px; }
:root.cx-on .nav-brand .title { color: var(--cx-text); }

:root.cx-on .nav-tools { gap: 4px; margin-bottom: 6px; }
:root.cx-on .nav-new-chat {
  height: 32px;
  margin-bottom: 2px;
  padding: 0 10px;
  gap: 8px;
  border: 1px solid var(--cx-line) !important;
  border-radius: var(--cx-r-sm);
  background: var(--cx-raised);
  color: var(--cx-text) !important;
  font-size: 13px;
  font-weight: 500;
}
:root.cx-on .nav-new-chat:hover { background: var(--cx-raised-2) !important; border-color: var(--cx-line-strong) !important; }
:root.cx-on .nav-list-settings-btn {
  width: 32px; height: 32px;
  border-radius: var(--cx-r-sm);
  border: 1px solid var(--cx-line);
  color: var(--cx-text-3);
}

:root.cx-on .nav-item {
  height: 32px;
  padding: 0 9px;
  gap: 9px;
  margin-bottom: 1px;
  border-radius: var(--cx-r-sm);
  color: var(--cx-text-2) !important;
  font-size: 13px;
  font-weight: 500;
}
:root.cx-on .nav-item .ico { width: 18px; opacity: .72; }
:root.cx-on .nav-item:hover:not(:disabled) {
  background: var(--cx-hover) !important;
  color: var(--cx-text) !important;
}
:root.cx-on .nav-item:hover:not(:disabled) .ico { opacity: .95; }
:root.cx-on .nav-item.is-active {
  background: var(--cx-active) !important;
  color: var(--cx-text) !important;
  font-weight: 560;
}
:root.cx-on .nav-item.is-active .ico { opacity: 1; color: var(--cx-accent); }
:root.cx-on .nav-item.is-soon { opacity: .45; }

:root.cx-on .nav-section {
  margin: 14px 0 4px;
  padding-left: 9px;
  color: var(--cx-text-3) !important;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
}

:root.cx-on .session-block { border-top: 1px solid var(--cx-line) !important; margin-top: 10px; padding-top: 4px; }
:root.cx-on .session-block-toggle { color: var(--cx-text-3) !important; font-size: 11px; }
:root.cx-on .session-row {
  border-radius: 7px;
  min-height: 30px;
  font-size: 12.5px;
  color: var(--cx-text-2);
  transition: background .13s ease;
}
:root.cx-on .session-row:hover { background: var(--cx-hover); }
:root.cx-on .session-row.is-active { background: var(--cx-active); }
:root.cx-on .session-row.is-active * { color: var(--cx-text) !important; }

:root.cx-on .nav-user { height: 40px; border-radius: var(--cx-r-sm); }
:root.cx-on .nav-user:hover { background: var(--cx-hover); }
:root.cx-on .nav-user-name { font-size: 12.5px; color: var(--cx-text-2); }
:root.cx-on .nav-msg-bell { border-radius: var(--cx-r-sm); }
:root.cx-on .nav-msg-bell-badge { background: var(--cx-accent) !important; color: var(--cx-on-accent) !important; }

/* ---------- 1.6 主内容区 ---------- */
:root.cx-on .session-tabs {
  min-height: 42px;
  padding: 6px 10px 0 !important;
  border-bottom: 1px solid var(--cx-line) !important;
  background: var(--cx-bg) !important;
}
:root.cx-on .session-tab { border-radius: 8px !important; font-size: 12.5px; }
:root.cx-on .session-tab:hover { background: var(--cx-hover); }

:root.cx-on .chat-thread { gap: 18px; }
:root.cx-on .msg-row.user .bubble.user {
  border-radius: 14px 14px 4px 14px !important;
  background: var(--cx-raised-2) !important;
  color: var(--cx-text) !important;
}
:root.cx-on .msg-row.assistant .bubble.assistant {
  background: transparent !important;
  border: 1px solid var(--cx-line) !important;
  box-shadow: none !important;
  border-radius: 4px 14px 14px 14px !important;
}

:root.cx-on .composer {
  border-radius: var(--cx-r-lg) !important;
  border: 1px solid var(--cx-line) !important;
  background: var(--cx-raised) !important;
  box-shadow: 0 1px 0 #ffffff08 inset, var(--cx-shadow) !important;
  transition: border-color .16s ease, box-shadow .16s ease;
}
:root.cx-on .composer:focus-within {
  border-color: color-mix(in srgb, var(--cx-accent) 55%, transparent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cx-accent) 13%, transparent), var(--cx-shadow) !important;
}
:root.cx-on .send-btn { border-radius: 10px !important; }
:root.cx-on .skill-chip,
:root.cx-on .skill-trigger { border-radius: 999px; font-size: 12px; }

:root.cx-on .pcw-row {
  border-radius: var(--cx-r-md) !important;
  background: var(--cx-raised) !important;
  border-color: var(--cx-line) !important;
}
:root.cx-on .pcw-row:hover {
  border-color: var(--cx-line-strong) !important;
  background: var(--cx-raised-2) !important;
}

/* ---------- 1.7 毛玻璃开关 ---------- */
/* 图标条与侧栏必须各用各的底色，否则双层结构会糊成一块 */
:root.cx-on.cx-glass .composer,
:root.cx-on.cx-glass .session-tabs {
  background: color-mix(in srgb, var(--cx-raised) 78%, transparent) !important;
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  backdrop-filter: blur(14px) saturate(1.2);
}
:root.cx-on.cx-glass .cx-strip {
  background: color-mix(in srgb, var(--cx-strip-bg) 94%, transparent) !important;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
:root.cx-on.cx-glass .app-shell > .nav {
  background: color-mix(in srgb, var(--cx-rail-bg) 94%, transparent) !important;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

/* ---------- 1.8 收起图标条后的悬浮入口 ---------- */
.cx-fab {
  position: fixed; left: 10px; bottom: 12px;
  z-index: 60;
  width: 30px; height: 30px;
  display: none; place-items: center;
  border: 1px solid var(--cx-line-strong);
  border-radius: 9px;
  background: var(--cx-rail-bg, #242526);
  color: var(--cx-text-3, #8c8c8c);
  box-shadow: 0 4px 14px #00000040;
  cursor: pointer;
  opacity: .55;
  transition: opacity .14s ease, color .14s ease;
}
:root.cx-on.cx-nostrip .cx-fab { display: grid; }
.cx-fab:hover { opacity: 1; color: var(--cx-text, #ececec); }
.cx-fab svg { width: 17px; height: 17px; }
@media (max-width: 899px) { .cx-fab { display: none !important; } }

/* ---------- 1.9 滚动条 / 选中态 ---------- */
:root.cx-on ::-webkit-scrollbar { width: 10px; height: 10px; }
:root.cx-on ::-webkit-scrollbar-track { background: transparent; }
:root.cx-on ::-webkit-scrollbar-thumb {
  background: var(--cx-line-strong);
  border: 3px solid transparent;
  background-clip: padding-box;
  border-radius: 999px;
}
:root.cx-on ::-webkit-scrollbar-thumb:hover { background: #ffffff33; background-clip: padding-box; }
:root.cx-on * { scrollbar-width: thin; scrollbar-color: var(--cx-line-strong) transparent; }
:root.cx-on ::selection { background: color-mix(in srgb, var(--cx-accent) 30%, transparent); }
:root.cx-on :focus-visible { outline: 2px solid color-mix(in srgb, var(--cx-accent) 60%, transparent); outline-offset: 2px; }

/* ---------- 1.10 ⌘K 命令面板 ---------- */
.cx-pal-mask {
  position: fixed; inset: 0; z-index: 3000;
  display: flex; justify-content: center; align-items: flex-start;
  padding: 12vh 16px 16px;
  background: #08090a73;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  font-family: var(--cx-font);
  animation: cx-fade .12s ease;
}
.cx-pal {
  width: min(580px, 100%);
  max-height: min(66vh, 520px);
  display: flex; flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--cx-line-strong);
  border-radius: 14px;
  background: var(--cx-raised);
  box-shadow: 0 28px 70px #00000080;
  animation: cx-rise .16s cubic-bezier(.2, .8, .2, 1);
}
.cx-pal-in {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cx-line);
}
.cx-pal-in svg { width: 16px; height: 16px; color: var(--cx-text-3); flex: none; }
.cx-pal-in input {
  flex: 1; min-width: 0;
  border: 0; outline: 0; background: transparent;
  color: var(--cx-text);
  font: inherit; font-size: 14px;
}
.cx-pal-in input::placeholder { color: var(--cx-text-3); }
.cx-pal-kbd {
  flex: none; padding: 2px 6px;
  border: 1px solid var(--cx-line-strong); border-radius: 5px;
  color: var(--cx-text-3); font-size: 10.5px;
}
.cx-pal-list { flex: 1; overflow: auto; padding: 6px; }
.cx-pal-group {
  padding: 8px 10px 4px;
  color: var(--cx-text-3); font-size: 10.5px; font-weight: 600; letter-spacing: .05em;
}
.cx-pal-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; min-height: 34px;
  padding: 0 10px;
  border: 0; border-radius: 8px;
  background: transparent; color: var(--cx-text-2);
  font: inherit; font-size: 13px; text-align: left;
  cursor: pointer;
}
.cx-pal-item .cx-pal-ico { width: 18px; display: grid; place-items: center; opacity: .7; }
.cx-pal-item .cx-pal-ico svg { width: 16px; height: 16px; }
.cx-pal-item .cx-pal-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cx-pal-item .cx-pal-hint { color: var(--cx-text-3); font-size: 11px; }
.cx-pal-item.is-cur { background: var(--cx-active); color: var(--cx-text); }
.cx-pal-item.is-cur .cx-pal-ico { opacity: 1; color: var(--cx-accent); }
.cx-pal-empty { padding: 26px 10px; text-align: center; color: var(--cx-text-3); font-size: 12.5px; }
.cx-pal-foot {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 14px;
  border-top: 1px solid var(--cx-line);
  color: var(--cx-text-3); font-size: 10.5px;
}

/* ---------- 1.11 外观面板 ---------- */
.cx-pop {
  position: fixed; left: calc(var(--cx-strip-w) + 8px); bottom: 12px;
  z-index: 2400;
  width: 244px;
  padding: 12px;
  border: 1px solid var(--cx-line-strong);
  border-radius: 12px;
  background: var(--cx-raised);
  box-shadow: 0 20px 50px #00000073;
  font-family: var(--cx-font);
  animation: cx-rise .14s cubic-bezier(.2, .8, .2, 1);
}
.cx-pop-h {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
  color: var(--cx-text); font-size: 12.5px; font-weight: 600;
}
.cx-pop-x {
  width: 22px; height: 22px; display: grid; place-items: center;
  border: 0; border-radius: 6px; background: transparent;
  color: var(--cx-text-3); cursor: pointer;
}
.cx-pop-x:hover { background: var(--cx-hover); color: var(--cx-text); }
.cx-row { margin-bottom: 10px; }
.cx-row > span { display: block; margin-bottom: 5px; color: var(--cx-text-3); font-size: 11px; }
.cx-seg { display: flex; gap: 3px; padding: 3px; border-radius: 8px; background: var(--cx-raised-2); }
.cx-seg button {
  flex: 1; height: 24px;
  border: 0; border-radius: 6px;
  background: transparent; color: var(--cx-text-2);
  font: inherit; font-size: 11.5px; cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
.cx-seg button:hover { color: var(--cx-text); }
.cx-seg button.is-on { background: var(--cx-elevated); color: var(--cx-text); font-weight: 560; }
.cx-seg button.cx-sw { display: flex; align-items: center; justify-content: center; gap: 4px; }
.cx-dot { width: 10px; height: 10px; border-radius: 999px; }
.cx-pop-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 4px; padding-top: 9px;
  border-top: 1px solid var(--cx-line);
  color: var(--cx-text-3); font-size: 10.5px;
}
.cx-link { border: 0; background: transparent; color: var(--cx-text-3); font: inherit; font-size: 10.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.cx-link:hover { color: var(--cx-text); }

/* ---------- 1.12 素材页 / AI 解读对话框（.pa-* 体系） ----------
 * 「申论素材」详情页右侧的 AI 解读是一个独立抽屉，用自己的 pa-* 类，
 * 既不是 .composer 也不是 .bubble，所以上面那套样式覆盖不到。
 * 这里按 Codex 的对话形态重绘：无边框助手消息 + 单卡片输入框 + 圆形按钮。
 */
:root.cx-on .pa-iit-panel {
  background: var(--cx-bg) !important;
  border-left: 1px solid var(--cx-line) !important;
  box-shadow: -10px 0 30px #0000002e !important;
}
:root.cx-on .pa-iit-resizer { width: 6px !important; }
:root.cx-on .pa-iit-resizer:hover,
:root.cx-on .pa-iit-panel.is-dragging .pa-iit-resizer {
  background: color-mix(in srgb, var(--cx-accent) 45%, transparent) !important;
}

/* 标题栏：压到 52px，和图标条 / 主区顶栏同一条水平线 */
:root.cx-on .pa-iit-head {
  min-height: 52px;
  padding: 9px 10px 9px 14px !important;
  align-items: center !important;
  border-bottom: 1px solid var(--cx-line) !important;
}
:root.cx-on .pa-iit-head strong {
  font-size: 13px !important;
  font-weight: 600;
  letter-spacing: .01em;
  color: var(--cx-text) !important;
}
:root.cx-on .pa-iit-head strong svg { color: var(--cx-accent); }
:root.cx-on .pa-iit-head .muted {
  margin-top: 2px !important;
  font-size: 11.5px !important;
  color: var(--cx-text-3) !important;
}
:root.cx-on .pa-iit-close {
  width: 26px; height: 26px;
  border-radius: 7px !important;
  color: var(--cx-text-3) !important;
  transition: background .14s ease, color .14s ease;
}
:root.cx-on .pa-iit-close:hover {
  background: var(--cx-hover) !important;
  color: var(--cx-text) !important;
}

/* 消息区：内边距沿用站点（12/14），只改间距与气泡形态 */
:root.cx-on .pa-iit-thread,
:root.cx-on .pa-thread { gap: 14px; }
:root.cx-on .pa-msg {
  border-radius: var(--cx-r-md) !important;
  padding: 9px 12px !important;
  font-size: 13px !important;
  line-height: 1.62 !important;
}
:root.cx-on .pa-msg-user {
  background: var(--cx-raised-2) !important;
  border: 1px solid var(--cx-line) !important;
  color: var(--cx-text) !important;
  border-radius: 14px 14px 4px 14px !important;
}
:root.cx-on .pa-msg-assistant {
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 0 !important;
  max-width: 100% !important;
  color: var(--cx-text) !important;
}
:root.cx-on .pa-msg-role {
  font-size: 10.5px !important;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--cx-text-3) !important;
}
:root.cx-on .pa-msg.is-failed {
  border-color: color-mix(in srgb, #e2796a 45%, transparent) !important;
}

/* 素材回跳卡 / 引用卡 */
:root.cx-on .pa-iit-return-card,
:root.cx-on .pa-iit-source-card {
  border: 1px solid var(--cx-line) !important;
  border-radius: var(--cx-r-md) !important;
  background: var(--cx-raised) !important;
  box-shadow: none !important;
  transition: border-color .14s ease, background .14s ease;
}
:root.cx-on .pa-iit-return-card:hover,
:root.cx-on .pa-iit-source-card:hover {
  border-color: var(--cx-line-strong) !important;
  background: var(--cx-raised-2) !important;
}

/* 登录等提示条：压成低饱和暖色，别抢注意力 */
:root.cx-on .pa-tip {
  border-radius: var(--cx-r-sm) !important;
  border: 1px solid color-mix(in srgb, #e9b45c 26%, transparent) !important;
  background: color-mix(in srgb, #e9b45c 9%, var(--cx-raised)) !important;
  color: var(--cx-text-2) !important;
  font-size: 11.5px !important;
  line-height: 1.5 !important;
}

/* ---- 输入框：整块做成一张卡片，输入区无边框，聚焦时强调色描边 ---- */
:root.cx-on .pa-iit-followup {
  /* 左右/底部留白由 .pa-iit-body 的 12px 14px 14px 提供，这里只补上间距 */
  margin: 2px 0 0 !important;
  padding: 7px 7px 7px 11px !important;
  gap: 8px !important;
  border: 1px solid var(--cx-line) !important;
  border-top: 1px solid var(--cx-line) !important;
  border-radius: var(--cx-r-lg) !important;
  background: var(--cx-raised) !important;
  align-items: flex-end !important;
  box-shadow: 0 1px 0 #ffffff08 inset, var(--cx-shadow) !important;
  transition: border-color .16s ease, box-shadow .16s ease;
}
:root.cx-on .pa-iit-followup:focus-within {
  border-color: color-mix(in srgb, var(--cx-accent) 55%, transparent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cx-accent) 13%, transparent), var(--cx-shadow) !important;
}
:root.cx-on .pa-iit-followup-input,
:root.cx-on .pa-composer textarea {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 5px 2px !important;
  min-height: 38px !important;
  max-height: 140px !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
  color: var(--cx-text) !important;
  resize: none !important;   /* 卡片圆角内露原生缩放抓手很丑，高度交给站点自动撑开 */
  scrollbar-width: thin;
}
:root.cx-on .pa-iit-followup-input::placeholder,
:root.cx-on .pa-composer textarea::placeholder { color: var(--cx-text-3) !important; }
:root.cx-on .pa-iit-followup-input:focus { border: 0 !important; box-shadow: none !important; }
/* 全局 :focus-visible 的 outline 会在卡片里再画一圈内描边，聚焦由卡片的 focus-within 光晕表达 */
:root.cx-on .pa-iit-followup-input:focus,
:root.cx-on .pa-iit-followup-input:focus-visible,
:root.cx-on .pa-composer textarea:focus,
:root.cx-on .pa-composer textarea:focus-visible {
  outline: none !important;
}

:root.cx-on .pa-iit-followup .btn,
:root.cx-on .pa-iit-actions .btn,
:root.cx-on .pa-composer .btn {
  height: 32px !important;
  padding: 0 13px !important;
  border-radius: 999px !important;
  font-size: 12.5px !important;
  font-weight: 550;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  box-shadow: none !important;
}
:root.cx-on .pa-iit-followup .btn.btn-primary,
:root.cx-on .pa-iit-actions .btn.btn-primary {
  background: var(--cx-accent) !important;
  color: var(--cx-on-accent) !important;
  border: 1px solid transparent !important;
}
:root.cx-on .pa-iit-followup .btn.btn-primary:hover:not(:disabled),
:root.cx-on .pa-iit-actions .btn.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}
:root.cx-on .pa-iit-followup .btn:disabled,
:root.cx-on .pa-iit-actions .btn:disabled { opacity: .45 !important; }

/* 「AI 解读」这类药丸按钮，统一到强调色语义 */
:root.cx-on .pa-iit-btn {
  background: var(--cx-active) !important;
  border-color: color-mix(in srgb, var(--cx-accent) 30%, transparent) !important;
  color: var(--cx-accent) !important;
  border-radius: 999px !important;
  font-size: 12px !important;
}
:root.cx-on .pa-iit-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--cx-accent) 18%, transparent) !important;
}

/* 裸输入（部分面板用的是 .pa-composer 里的 textarea 之外的表单） */
:root.cx-on .pa-composer { gap: 8px; }

/* ---- 1.12b 素材页「问 AI」抽屉（.mat-ai-*） ----
 * 和上面的 AI 解读是两套组件：解读在右侧 pa-iit-panel，问 AI 是这层抽屉。
 * 两边视觉必须一致，否则同一页开两个助手会像两个产品。
 */
:root.cx-on .mat-ai-drawer {
  background: var(--cx-bg) !important;
  border-left: 1px solid var(--cx-line) !important;
  box-shadow: -10px 0 30px #0000002e !important;
}
:root.cx-on .mat-ai-head {
  height: 52px !important;
  padding: 0 10px 0 14px !important;
  border-bottom: 1px solid var(--cx-line) !important;
}
:root.cx-on .mat-ai-title {
  font-size: 13px !important;
  font-weight: 600;
  color: var(--cx-text) !important;
}
:root.cx-on .mat-ai-title svg { color: var(--cx-accent); }
:root.cx-on .mat-ai-close {
  border-radius: 7px !important;
  width: 26px; height: 26px;
  color: var(--cx-text-3) !important;
  transition: background .14s ease, color .14s ease;
}
:root.cx-on .mat-ai-close:hover {
  background: var(--cx-hover) !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mat-ai-bind,
:root.cx-on .mat-ai-studio-honest {
  border-bottom: 1px solid var(--cx-line) !important;
  border-left-color: var(--cx-line-strong) !important;
  color: var(--cx-text-3) !important;
  font-size: 11.5px !important;
}
:root.cx-on .mat-ai-honest-chip {
  background: var(--cx-hover) !important;
  color: var(--cx-text-3) !important;
  border-radius: 999px !important;
  font-size: 10.5px !important;
}

:root.cx-on .mat-ai-thread { gap: 14px !important; padding: 14px !important; }
:root.cx-on .mat-ai-msg {
  border-radius: var(--cx-r-md) !important;
  padding: 9px 12px !important;
  font-size: 13px !important;
  line-height: 1.62 !important;
}
:root.cx-on .mat-ai-msg.assistant {
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
  max-width: 100% !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mat-ai-msg.user {
  background: var(--cx-raised-2) !important;
  border: 1px solid var(--cx-line) !important;
  color: var(--cx-text) !important;
  border-radius: 14px 14px 4px 14px !important;
}

/* 输入区：同样收成一张卡片 */
:root.cx-on .mat-ai-composer {
  margin: 10px 12px 12px !important;
  padding: 7px 7px 7px 11px !important;
  gap: 6px !important;
  border: 1px solid var(--cx-line) !important;
  border-top: 1px solid var(--cx-line) !important;
  border-radius: var(--cx-r-lg) !important;
  background: var(--cx-raised) !important;
  box-shadow: 0 1px 0 #ffffff08 inset, var(--cx-shadow) !important;
  transition: border-color .16s ease, box-shadow .16s ease;
}
:root.cx-on .mat-ai-composer:focus-within {
  border-color: color-mix(in srgb, var(--cx-accent) 55%, transparent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cx-accent) 13%, transparent), var(--cx-shadow) !important;
}
:root.cx-on .mat-ai-composer.is-drag-over {
  border-color: var(--cx-accent) !important;
  background: color-mix(in srgb, var(--cx-accent) 8%, var(--cx-raised)) !important;
  outline: none !important;
}
:root.cx-on .mat-ai-composer textarea {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  padding: 4px 2px !important;
  min-height: 34px;
  font-size: 13px !important;
  line-height: 1.6 !important;
  color: var(--cx-text) !important;
  resize: none !important;
}
:root.cx-on .mat-ai-composer textarea::placeholder { color: var(--cx-text-3) !important; }
:root.cx-on .mat-ai-composer-actions .mat-action {
  height: 30px !important;
  padding: 0 12px !important;
  border-radius: 999px !important;
  font-size: 12.5px !important;
}
:root.cx-on .mat-ai-composer-actions .mat-action.is-primary {
  background: var(--cx-accent) !important;
  color: var(--cx-on-accent) !important;
  border-color: transparent !important;
}
:root.cx-on .mat-ai-composer-actions .mat-action:not(.is-primary):hover:not(:disabled) {
  background: var(--cx-hover) !important;
  border-color: var(--cx-line-strong) !important;
}

/* ---------- 1.13 素材详情页「阅读版」（.mm-* 体系） ----------
 * 这一页是站点自带的「报刊」排版，靠自己的一层令牌：
 *   --mm-paper/--mm-page/--mm-ink/--mm-ink-2/--mm-line/--mm-accent
 * 所以先整层重映射成 Codex 灰度 + 当前强调色，再收拾骨架：
 * 去掉纸张卡片与双线刊头、正文转无衬线、术语块由「左边框」改「卡片」、
 * 金句改左竖线引文、段析改中性卡。5 色高亮标记是语义标记，保留。
 */
:root.cx-on {
  --mm-paper: var(--cx-raised) !important;
  --mm-page: var(--cx-bg) !important;
  --mm-ink: var(--cx-text) !important;
  --mm-ink-2: var(--cx-text-2) !important;
  --mm-line: var(--cx-line) !important;
  --mm-accent: var(--cx-accent) !important;

  /* 派生令牌：强调色当「正文级小字」用时需要更高对比度。
     浅色下 #2a98ff 压在白底上只有 2.99:1，压深到 ~4.8:1；深色保持原值。 */
  --cx-accent-ink: var(--cx-accent);
}
:root.cx-on[data-theme="light"] {
  --cx-accent-ink: color-mix(in srgb, var(--cx-accent) 70%, #0b1a2a);
}
@media (prefers-color-scheme: light) {
  :root.cx-on:not([data-theme="dark"]) {
    --cx-accent-ink: color-mix(in srgb, var(--cx-accent) 70%, #0b1a2a);
  }
}

/* 站点的 --c-gold-deep/--c-amber-deep/--c-blue-deep 只有浅色值，
   深色下把它们压在自己的深色底片上只有 3.2~4.0:1。改成取各自的 bright 值，
   一处修好会同时覆盖 .mm-mark / .mm-analysis-tag / .mm-mark-legend-swatch。 */
:root.cx-on:not([data-theme="light"]) {
  --c-gold-deep: var(--c-gold-bright);
  --c-amber-deep: var(--c-amber-bright);
  /* 蓝色 bright 在深色底片上仍只有 3.4:1，再提亮一档 */
  --c-blue-deep: color-mix(in srgb, var(--c-blue-bright) 62%, #ffffff);
}
/* 浅色下 --c-blue-deep 压在自己的浅蓝底上只有 4.3~4.5:1，压深一档 */
:root.cx-on[data-theme="light"] .mm-mark.is-blue,
:root.cx-on[data-theme="light"] .mm-mark.is-fill-blue,
:root.cx-on[data-theme="light"] .mm-analysis-tag.is-blue,
:root.cx-on[data-theme="light"] .mm-analysis-tag.is-fill-blue,
:root.cx-on[data-theme="light"] .mm-mark-legend-swatch.is-blue,
:root.cx-on[data-theme="light"] .mm-mark-legend-swatch.is-fill-blue { color: #3d5aa8 !important; }
@media (prefers-color-scheme: light) {
  :root.cx-on:not([data-theme="dark"]) .mm-mark.is-blue,
  :root.cx-on:not([data-theme="dark"]) .mm-mark.is-fill-blue,
  :root.cx-on:not([data-theme="dark"]) .mm-analysis-tag.is-blue,
  :root.cx-on:not([data-theme="dark"]) .mm-analysis-tag.is-fill-blue,
  :root.cx-on:not([data-theme="dark"]) .mm-mark-legend-swatch.is-blue,
  :root.cx-on:not([data-theme="dark"]) .mm-mark-legend-swatch.is-fill-blue { color: #3d5aa8 !important; }
}
/* 站点的 --c-blue-soft 指向 --accent-soft，换成琥珀/酒红强调色后
   「分层论点 / 做法举措」会跟着变色，五种标记就撞色了。这里钉回蓝系。 */
:root.cx-on .mm-mark.is-blue,
:root.cx-on .mm-mark.is-fill-blue,
:root.cx-on .mm-analysis-tag.is-blue,
:root.cx-on .mm-analysis-tag.is-fill-blue,
:root.cx-on .mm-mark-legend-swatch.is-blue,
:root.cx-on .mm-mark-legend-swatch.is-fill-blue {
  background-color: color-mix(in srgb, var(--c-blue) 14%, transparent) !important;
}

/* 顶部工具栏：全部压成 ghost 按钮，只留「AI 解读」一个实心药丸 */
:root.cx-on .mat-read-top {
  min-height: 52px !important;
  padding: 0 16px 0 12px !important;
  border-bottom: 1px solid var(--cx-line) !important;
  background: transparent !important;
  gap: 8px !important;
}
:root.cx-on .mat-read-actions { gap: 2px !important; }
:root.cx-on .mat-read-top .ps-chrome-back,
:root.cx-on .mat-read-actions .mat-action {
  height: 30px !important;
  padding: 0 9px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: var(--cx-text-2) !important;
  font-size: 12.5px !important;
  font-weight: 400 !important;
}
:root.cx-on .mat-read-top .ps-chrome-back:hover,
:root.cx-on .mat-read-actions .mat-action:hover:not(:disabled) {
  background: var(--cx-hover) !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mat-read-actions .pa-iit-btn {
  height: 30px !important;
  padding: 0 12px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: var(--cx-accent) !important;
  color: var(--cx-on-accent) !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
}
:root.cx-on .mat-read-actions .pa-iit-btn:hover:not(:disabled) {
  filter: brightness(1.06) !important;
  background: var(--cx-accent) !important;
}

/* 阅读区：纸张卡片取消，改成居中的窄栏内容流 */
:root.cx-on .mat-read-scroll { padding: 26px 40px 72px !important; }
:root.cx-on .mm-paper {
  max-width: 780px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  font-family: var(--cx-font) !important;
}

/* 刊头：大字报头保留衬线（当 logo 用），其余全部收小压灰 */
:root.cx-on .mm-masthead-brand h1 {
  font-size: 22px !important;
  font-weight: 800 !important;
  letter-spacing: .04em !important;
  color: var(--cx-accent-ink) !important;
}
:root.cx-on .mm-masthead-url {
  font-size: 11px !important;
  color: var(--cx-text-3) !important;
  letter-spacing: .02em !important;
}
:root.cx-on .mm-qr img {
  width: 40px !important;
  height: 40px !important;
  border-radius: 6px !important;
  border-color: var(--cx-line) !important;
  opacity: .55;
  transition: opacity .15s;
}
:root.cx-on .mm-qr:hover img { opacity: 1; }
:root.cx-on .mm-issue {
  background: var(--cx-raised-2) !important;
  color: var(--cx-text-2) !important;
  padding: 2px 9px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
}
:root.cx-on .mm-mast-date { font-size: 11.5px !important; color: var(--cx-text-3) !important; }
:root.cx-on .mm-mast-warn, :root.cx-on .mm-mast-warn .mm-sel {
  font-size: 11px !important;
  color: var(--cx-text-3) !important;
}
:root.cx-on .mm-mast-rule .is-thick {
  height: 1px !important;
  background: var(--cx-line-strong) !important;
}
:root.cx-on .mm-mast-rule .is-thin { display: none !important; }

/* 分节：去掉虚线分隔，靠留白分段；标题不再用衬线粗体 + 红竖条 */
:root.cx-on .mm-section { padding: 24px 0 2px !important; }
:root.cx-on .mm-section + .mm-section { border-top: 0 !important; }
:root.cx-on .mm-section-title {
  font-family: var(--cx-font) !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  letter-spacing: .01em !important;
  color: var(--cx-text) !important;
  gap: 8px !important;
  margin: 0 0 12px !important;
}
:root.cx-on .mm-section-title i {
  width: 3px !important;
  height: 13px !important;
  border-radius: 2px !important;
  background: var(--cx-accent) !important;
}

/* 要闻简报：分类胶囊改中性 chip，正文转无衬线 */
:root.cx-on .mm-brief { margin-bottom: 8px !important; }
:root.cx-on .mm-brief-cat {
  background: var(--cx-raised-2) !important;
  color: var(--cx-text-2) !important;
  border-radius: 6px !important;
  padding: 1px 7px !important;
  margin-right: 10px !important;
  font-size: 11.5px !important;
  font-weight: 500 !important;
}
:root.cx-on .mm-brief p,
:root.cx-on .mm-term p {
  font-family: var(--cx-font) !important;
  font-size: 14px !important;
  line-height: 1.78 !important;
  color: var(--cx-text-2) !important;
}

/* 高频表达规范：左边框 → 卡片，术语名单独成行 */
:root.cx-on .mm-terms { gap: 10px 12px !important; }
:root.cx-on .mm-term {
  border: 1px solid var(--cx-line) !important;
  border-radius: 10px !important;
  background: var(--cx-raised) !important;
  padding: 11px 13px !important;
}
:root.cx-on .mm-term b {
  display: block !important;
  margin: 0 0 4px !important;
  color: var(--cx-accent-ink) !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
}

/* 金句：渐变底 + 粗红边 → 左竖线引文 */
:root.cx-on .mm-quote {
  background: transparent !important;
  border-left: 2px solid var(--cx-line-strong) !important;
  border-radius: 0 !important;
  text-align: left !important;
  padding: 4px 0 4px 16px !important;
  margin: 2px 0 14px !important;
  font-family: var(--cx-font) !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  line-height: 1.85 !important;
  color: var(--cx-text) !important;
}

/* 运用示例 / 段析：统一成中性小卡 */
:root.cx-on .mm-usage {
  border: 1px solid var(--cx-line) !important;
  border-radius: 10px !important;
  background: var(--cx-raised) !important;
  padding: 12px 14px !important;
}
:root.cx-on .mm-usage > b {
  color: var(--cx-text) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  margin-bottom: 6px !important;
}
:root.cx-on .mm-usage p {
  font-family: var(--cx-font) !important;
  font-size: 13px !important;
  line-height: 1.8 !important;
  color: var(--cx-text-2) !important;
}
:root.cx-on .mm-usage-themes { color: var(--cx-text-3) !important; font-size: 12px !important; }

/* 热点案例 / 人物典范 */
:root.cx-on .mm-block-title {
  font-family: var(--cx-font) !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mm-body-text {
  font-family: var(--cx-font) !important;
  font-size: 14px !important;
  line-height: 1.88 !important;
  color: var(--cx-text-2) !important;
}

/* 范文：标题居中 → 左对齐，用一条细线跟正文分层 */
:root.cx-on .mm-essay-head {
  text-align: left !important;
  margin-bottom: 14px !important;
  padding-bottom: 12px !important;
  border-bottom: 1px solid var(--cx-line) !important;
}
:root.cx-on .mm-essay-title {
  font-family: var(--cx-font) !important;
  font-size: 17px !important;
  font-weight: 600 !important;
  letter-spacing: .01em !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mm-essay-meta { font-size: 11.5px !important; color: var(--cx-text-3) !important; }
:root.cx-on .mm-essay-themes span {
  background: var(--cx-raised-2) !important;
  color: var(--cx-text-2) !important;
  font-size: 11.5px !important;
  font-weight: 500 !important;
}
:root.cx-on .mm-mark-legend {
  border: 1px solid var(--cx-line) !important;
  border-radius: 8px !important;
  background: var(--cx-raised) !important;
  padding: 6px 10px !important;
  margin-bottom: 14px !important;
  font-size: 11.5px !important;
  color: var(--cx-text-3) !important;
}
:root.cx-on .mm-para-analysis {
  border: 1px solid var(--cx-line) !important;
  border-left: 2px solid var(--cx-accent) !important;
  border-radius: 8px !important;
  background: var(--cx-raised) !important;
  padding: 10px 13px !important;
}
:root.cx-on .mm-para-analysis > b {
  color: var(--cx-text) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}
:root.cx-on .mm-para-analysis p {
  font-family: var(--cx-font) !important;
  font-size: 12.5px !important;
  line-height: 1.75 !important;
  color: var(--cx-text-2) !important;
}

/* 窄视口：收窄留白，避免正文被挤成细条 */
@media (max-width: 1180px) {
  :root.cx-on .mat-read-scroll { padding: 20px 22px 56px !important; }
}
@media (max-width: 860px) {
  :root.cx-on .mat-read-scroll { padding: 16px 14px 44px !important; }
  :root.cx-on .mat-read-actions .mat-action span { display: none; }
}

/* ---------- 1.14 素材详情：终端会话视图（TUI） ----------
 * 把「报刊排版」重绘成 Codex / Claude Code 的终端会话流。
 * 结构不动，装饰全部挂在 section 与标题的三个伪元素上：
 *   .mm-section::before            → 右上角 [01] · 12m
 *   .mm-section-title::before      → ● 消息头圆点
 *   .mm-section-title::after       → ✳ Contemplated for 31s + 斜体英文思考
 *   .mm-section-title + *::before  → ● Read(简报.md) / └ 6 items 工具行
 *   .mm-section::after             → [r] reply [l] like [c] link
 * 思考文案与工具参数由脚本写进 data-cx-* 属性，CSS 只负责排版；
 * 不新增任何 React 管理的节点，重渲染也不会打架。
 */
:root.cx-on {
  --cx-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo,
             Consolas, "Sarasa Mono SC", "Noto Sans Mono CJK SC", monospace;
  --cx-tui-dim: var(--cx-text-3);
  --cx-tui-rule: var(--cx-line);
}

/* 阅读区底色：终端要比应用外壳更深一档（用 .cx-reading 限定，只作用于素材详情） */
:root.cx-on.cx-reading .mat-read-body { background: var(--cx-bg) !important; }
:root.cx-on.cx-reading[data-theme="dark"] .mat-read-body { background: #0a0b0c !important; }
:root.cx-on.cx-reading[data-theme="light"] .mat-read-body { background: #fbfbf8 !important; }
@media (prefers-color-scheme: dark) {
  :root.cx-on.cx-reading:not([data-theme="light"]) .mat-read-body { background: #0a0b0c !important; }
}
@media (prefers-color-scheme: light) {
  :root.cx-on.cx-reading:not([data-theme="dark"]) .mat-read-body { background: #fbfbf8 !important; }
}

/* 顶部工具栏：等宽、方角、去掉装饰 */
:root.cx-on .mat-read-top {
  min-height: 48px !important;
  background: transparent !important;
  border-bottom: 1px solid var(--cx-tui-rule) !important;
}
:root.cx-on .mat-read-top,
:root.cx-on .mat-read-actions .mat-action,
:root.cx-on .mat-read-top .ps-chrome-back {
  font-family: var(--cx-mono) !important;
  letter-spacing: 0 !important;
}
:root.cx-on .mat-read-actions .mat-action,
:root.cx-on .mat-read-top .ps-chrome-back { border-radius: 4px !important; }
:root.cx-on .mat-read-actions .pa-iit-btn { border-radius: 4px !important; }

/* 阅读流 */
:root.cx-on .mat-read-scroll { padding: 20px 40px 116px !important; }
:root.cx-on .mm-paper {
  max-width: 820px !important;
  font-family: var(--cx-mono) !important;
  font-size: 13.5px !important;
  line-height: 1.95 !important;
}
:root.cx-on .mm-paper :is(p, li, b, strong, em, span) { font-family: var(--cx-mono) !important; }
:root.cx-on .mm-paper :is(p, li) { font-size: 13.5px !important; line-height: 1.95 !important; }

/* 刊头 → 一行终端面包屑：> 公考 / shenlunsucai.com      第 312 期 · 2026-10-28 */
:root.cx-on .mm-masthead {
  display: flex !important;
  align-items: baseline !important;
  flex-wrap: wrap !important;
  gap: 0 10px !important;
  padding: 0 0 9px !important;
  margin: 0 0 4px !important;
  border-bottom: 1px solid var(--cx-tui-rule) !important;
  font-family: var(--cx-mono) !important;
}
:root.cx-on .mm-masthead-top {
  display: flex !important;
  align-items: baseline !important;
  gap: 0 !important;
  min-width: 0 !important;
  order: 1;
}
:root.cx-on .mm-masthead-brand {
  display: flex !important;
  align-items: baseline !important;
  gap: 0 !important;
}
:root.cx-on .mm-masthead-brand::before {
  content: ">" !important;
  margin-right: 7px;
  color: var(--cx-accent) !important;
  font-weight: 700;
}
:root.cx-on .mm-masthead-brand h1 {
  margin: 0 !important;
  font-family: var(--cx-mono) !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mm-masthead-url {
  font-family: var(--cx-mono) !important;
  font-size: 12.5px !important;
  letter-spacing: 0 !important;
  color: var(--cx-tui-dim) !important;
}
:root.cx-on .mm-masthead-url::before { content: " / " !important; color: var(--cx-text-3) !important; }
:root.cx-on .mm-masthead-qrs { display: none !important; }
:root.cx-on .mm-masthead-meta {
  order: 2;
  margin-left: auto !important;
  display: flex !important;
  align-items: baseline !important;
  gap: 0 8px !important;
  font-family: var(--cx-mono) !important;
  font-size: 11px !important;
  letter-spacing: .01em !important;
  color: var(--cx-tui-dim) !important;
}
:root.cx-on .mm-masthead-meta > * { margin: 0 !important; padding: 0 !important; background: none !important; }
:root.cx-on .mm-issue {
  background: none !important;
  padding: 0 !important;
  border-radius: 0 !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: var(--cx-text-2) !important;
}
:root.cx-on .mm-issue::after { content: " ·"; color: var(--cx-line-strong); }
:root.cx-on .mm-mast-date { font-size: 11px !important; color: var(--cx-tui-dim) !important; }
:root.cx-on .mm-mast-warn,
:root.cx-on .mm-mast-warn .mm-sel { font-size: 10.5px !important; color: var(--cx-tui-dim) !important; opacity: .8; }
:root.cx-on .mm-mast-rule { display: none !important; }

/* 会话节点 */
:root.cx-on .mm-section {
  position: relative !important;
  padding: 24px 0 6px !important;
  border: 0 !important;
}
:root.cx-on .mm-section + .mm-section { border: 0 !important; padding-top: 26px !important; }

/* [01] · 12m */
:root.cx-on .mm-section::before {
  content: attr(data-cx-meta);
  position: absolute;
  top: 26px;
  right: 0;
  font-family: var(--cx-mono);
  font-size: 11px;
  letter-spacing: .02em;
  color: var(--cx-tui-dim);
  opacity: .8;
  pointer-events: none;
}
:root.cx-on .mm-section:not([data-cx-meta])::before { display: none !important; }

/* ● 消息头 */
:root.cx-on .mm-section-title {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: baseline !important;
  gap: 0 8px !important;
  margin: 0 !important;
  font-family: var(--cx-mono) !important;
  font-size: 13.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mm-section-title i { display: none !important; }
:root.cx-on .mm-section-title::before {
  content: "●" !important;
  color: var(--cx-accent) !important;
  font-size: 9px;
  line-height: 1;
  transform: translateY(-1px);
}

/* ✳ 思考行 + 斜体英文段落 */
:root.cx-on .mm-section-title::after {
  content: "✳ " attr(data-cx-verb) " for " attr(data-cx-secs) "s  (ctrl+o to expand) ~\A" attr(data-cx-think);
  flex: 0 0 100%;
  order: 9;
  margin: 13px 0 15px !important;
  font-family: var(--cx-mono) !important;
  font-size: 12.5px !important;
  font-style: italic !important;
  font-weight: 400 !important;
  line-height: 1.86 !important;
  letter-spacing: 0 !important;
  color: var(--cx-tui-dim) !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere;
  animation: cx-fade .3s ease both;
}
:root.cx-on .mm-section-title:not([data-cx-verb])::after { display: none !important; }

/* ● Read(...) / └ N items —— 挂在标题后的第一个内容块上 */
:root.cx-on .mm-section-title + *::before {
  content: "● " attr(data-cx-tool) "\A  └ " attr(data-cx-toolres);
  display: block !important;
  flex: 0 0 100% !important;
  width: 100% !important;
  box-sizing: border-box !important;
  margin: 0 0 16px !important;
  font-family: var(--cx-mono) !important;
  font-size: 12px !important;
  font-style: normal !important;
  font-weight: 400 !important;
  line-height: 1.8 !important;
  letter-spacing: 0 !important;
  color: var(--cx-text-2) !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere;
}
:root.cx-on .mm-section-title + :not([data-cx-tool])::before { display: none !important; }
/* 第一个内容块本身是 flex 行（.mm-brief / .mm-usage …）或 grid（.mm-terms）时
   要能整行让位，否则工具行会跟正文并排挤在一起 */
:root.cx-on .mm-section-title + [data-cx-tool] { flex-wrap: wrap !important; }
:root.cx-on .mm-section-title + [data-cx-tool]::before {
  grid-column: 1 / -1 !important;
  grid-row: 1 !important;
}

/* [r] reply [l] like [c] link */
:root.cx-on .mm-section::after {
  content: "[r] reply   [l] like   [c] link";
  display: block;
  margin: 18px 0 0;
  font-family: var(--cx-mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--cx-tui-dim);
  opacity: .7;
}

/* 正文块：去卡片化，只留等宽与留白 */
:root.cx-on .mm-brief { margin-bottom: 10px !important; }
:root.cx-on .mm-brief-cat {
  background: none !important;
  padding: 0 !important;
  margin-right: 8px !important;
  border-radius: 0 !important;
  font-family: var(--cx-mono) !important;
  font-size: 11.5px !important;
  font-weight: 500 !important;
  color: var(--cx-accent-ink) !important;
}
:root.cx-on .mm-brief-cat::after { content: ":"; color: var(--cx-tui-dim); }
:root.cx-on .mm-terms { gap: 8px 10px !important; }
:root.cx-on .mm-term {
  border: 0 !important;
  border-left: 1px solid var(--cx-tui-rule) !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 4px 0 4px 12px !important;
}
:root.cx-on .mm-term b {
  display: block !important;
  margin: 0 0 2px !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
  color: var(--cx-accent-ink) !important;
}
:root.cx-on .mm-quote {
  padding: 2px 0 2px 14px !important;
  border-left: 1px solid var(--cx-line-strong) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  line-height: 1.9 !important;
}
:root.cx-on .mm-usage,
:root.cx-on .mm-para-analysis {
  border: 0 !important;
  border-left: 1px solid var(--cx-tui-rule) !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 4px 0 4px 12px !important;
}
:root.cx-on .mm-usage > b,
:root.cx-on .mm-para-analysis > b {
  font-size: 12px !important;
  font-weight: 600 !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mm-section-title + .mm-usage::before,
:root.cx-on .mm-section-title + .mm-para-analysis::before { margin-bottom: 10px !important; }
:root.cx-on .mm-block-title {
  font-size: 13px !important;
  font-weight: 600 !important;
  color: var(--cx-text) !important;
}
:root.cx-on .mm-essay-head {
  margin-bottom: 12px !important;
  padding-bottom: 10px !important;
  border-bottom: 1px solid var(--cx-tui-rule) !important;
}
:root.cx-on .mm-essay-title {
  font-size: 15px !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
}
:root.cx-on .mm-essay-meta,
:root.cx-on .mm-usage-themes { font-size: 11px !important; color: var(--cx-tui-dim) !important; }
:root.cx-on .mm-essay-themes span {
  background: none !important;
  padding: 0 8px 0 0 !important;
  font-size: 11.5px !important;
  color: var(--cx-tui-dim) !important;
}
:root.cx-on .mm-essay-themes span::before { content: "#"; opacity: .6; }
:root.cx-on .mm-mark-legend {
  border: 1px solid var(--cx-tui-rule) !important;
  border-radius: 3px !important;
  background: transparent !important;
  padding: 5px 9px !important;
  margin-bottom: 14px !important;
  font-size: 11px !important;
}
:root.cx-on .mm-mark {
  border-radius: 2px !important;
  padding: 0 1px !important;
  box-shadow: inset 0 -1px 0 currentColor;
}
:root.cx-on .mm-essay-para { line-height: 1.95 !important; }

/* 会话尾部：假输入框 + 状态行 */
:root.cx-on .cx-tui-foot {
  width: 100%;
  max-width: 820px;
  margin: 34px auto 0;
  font-family: var(--cx-mono);
}
:root.cx-on .cx-tui-log { display: flex; flex-direction: column; gap: 14px; }
:root.cx-on .cx-tui-log:empty { display: none; }
:root.cx-on .cx-tui-msg { font-size: 13px; line-height: 1.85; color: var(--cx-text); }
:root.cx-on .cx-tui-user {
  font-size: 12.5px;
  color: var(--cx-text-2);
  margin-bottom: 4px;
}
:root.cx-on .cx-tui-user .cx-tui-dot { color: var(--cx-accent); font-size: 9px; margin-right: 6px; }
:root.cx-on .cx-tui-ago { color: var(--cx-tui-dim); margin-left: 6px; font-size: 11px; }
:root.cx-on .cx-tui-body { padding-left: 15px; white-space: pre-wrap; overflow-wrap: anywhere; }
:root.cx-on .cx-tui-think {
  padding-left: 0;
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.85;
  color: var(--cx-tui-dim);
  white-space: pre-wrap;
}
:root.cx-on .cx-tui-think-h { display: block; font-style: italic; }
:root.cx-on .cx-tui-think-p { display: block; }
:root.cx-on .cx-tui-think-r {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  opacity: .7;
}
:root.cx-on .cx-tui-composer {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding: 9px 12px;
  border: 1px solid var(--cx-tui-rule);
  border-radius: 4px;
  background: transparent;
  transition: border-color .15s ease, box-shadow .15s ease;
}
:root.cx-on .cx-tui-composer:focus-within {
  border-color: var(--cx-line-strong);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cx-accent) 12%, transparent);
}
:root.cx-on .cx-tui-prompt { color: var(--cx-accent-ink); font-size: 13px; line-height: 1.7; user-select: none; }
:root.cx-on .cx-tui-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0 !important;
  outline: none !important;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  resize: none !important;
  overflow: hidden;
  font-family: var(--cx-mono) !important;
  font-size: 13px !important;
  line-height: 1.7 !important;
  color: var(--cx-text) !important;
  caret-color: var(--cx-accent);
  height: 22px;
}
:root.cx-on .cx-tui-input::placeholder { color: var(--cx-tui-dim) !important; font-style: italic; }
:root.cx-on .cx-tui-hint {
  margin-top: 8px;
  font-size: 11px;
  letter-spacing: .02em;
  color: var(--cx-tui-dim);
  opacity: .7;
}

/* 底部状态栏（fixed）：CODEX ~/... ^r reply ... 17:18 */
:root.cx-on .cx-tui-status {
  position: fixed;
  left: 52px;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 26px;
  padding: 0 14px;
  border-top: 1px solid var(--cx-tui-rule);
  background: var(--cx-strip-bg);
  backdrop-filter: blur(8px);
  font-family: var(--cx-mono);
  font-size: 11px;
  letter-spacing: .02em;
  color: var(--cx-tui-dim);
  user-select: none;
}
:root.cx-on .cx-tui-status[hidden] { display: none !important; }
/* 浅色下毛玻璃底会把 11px 灰字压到 3.5:1，换实白底 */
:root.cx-on[data-theme="light"] .cx-tui-status { background: #ffffff !important; }
@media (prefers-color-scheme: light) {
  :root.cx-on:not([data-theme="dark"]) .cx-tui-status { background: #ffffff !important; }
}
:root.cx-nostrip .cx-tui-status { left: 0; }
:root.cx-on .cx-tui-mode {
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--cx-accent);
  color: var(--cx-on-accent);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .06em;
}
:root.cx-on .cx-tui-status .cx-tui-path { color: var(--cx-text-2); }
:root.cx-on .cx-tui-status .cx-tui-right { margin-left: auto; display: flex; align-items: center; gap: 6px; }
:root.cx-on .cx-tui-status .cx-tui-clock { color: var(--cx-text-2); font-weight: 500; }
:root.cx-on .cx-tui-live { color: var(--cx-accent); font-size: 8px; }
@media (max-width: 860px) {
  :root.cx-on .cx-tui-status .cx-tui-keys { display: none; }
  :root.cx-on .cx-tui-status { left: 0; }
}
/* 详情页里把外观浮动按钮抬高，别被状态栏压住 */
:root.cx-on.cx-reading .cx-fab { bottom: 44px !important; }
:root.cx-on.cx-reading .mat-read-scroll { padding-bottom: 120px !important; }

@keyframes cx-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes cx-rise { from { opacity: 0; transform: translateY(-6px) scale(.99) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .cx-pal-mask, .cx-pal, .cx-pop, .cx-strip-btn, .cx-brand { animation: none !important; transition: none !important; }
}
`;

  /* =========================================================
   * 2. 设置读写
   * ========================================================= */

  let S = Object.assign({}, DEFAULTS);
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) S = Object.assign(S, JSON.parse(raw));
  } catch (e) { /* 忽略损坏的配置 */ }

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { }
  }

  function applySettings() {
    const root = document.documentElement;
    root.classList.add(ROOT_CLASS);
    root.classList.toggle('cx-nostrip', !S.strip);
    root.classList.toggle('cx-glass', !!S.glass);
    root.dataset.cxAccent = ACCENTS[S.accent] ? S.accent : 'blue';
    root.style.setProperty('--cx-rail-w', (Number(S.rail) || 276) + 'px');
    applyTheme();
  }

  function applyTheme() {
    const root = document.documentElement;
    if (S.theme === 'auto') {
      root.removeAttribute('data-theme');
      root.style.colorScheme = '';
    } else {
      root.dataset.theme = S.theme;
      root.style.colorScheme = S.theme;
    }
  }

  function effectiveTheme() {
    const t = document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /**
   * 站点挂载时会按自己的「跟随系统」设置重写 data-theme，
   * 把用户在我们面板里选的主题冲掉。启动后 6 秒内以我们的选择为准；
   * 之后站点若再改（用户用了站点自己的开关），就跟它同步，避免互相打架。
   */
  const BOOT_AT = Date.now();

  function onThemeAttrChange() {
    syncThemeIcon();
    if (S.theme === 'auto') return;
    const cur = document.documentElement.dataset.theme;
    if (cur === S.theme) return;
    if (Date.now() - BOOT_AT < 6000) { applyTheme(); return; }
    S.theme = (cur === 'light' || cur === 'dark') ? cur : 'auto';
    persist();
  }

  /* =========================================================
   * 3. 图标
   * ========================================================= */

  const P = {
    plus: 'M12 5v14M5 12h14',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-3.6-3.6',
    bell: 'M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 0 1-3.4 0',
    sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 4v6M8 14v6',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5',
    close: 'M6 6l12 12M18 6L6 18',
    arrow: 'M5 12h14M13 6l6 6-6 6'
  };

  function svg(path, size) {
    const s = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
  }

  /* =========================================================
   * 4. 站点交互桥接
   * ========================================================= */

  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /** 通过点击原生导航项切换视图（最稳），失败则派发站点自己的自定义事件 */
  function gotoView(view) {
    const label = (VIEWS.find(v => v[0] === view) || [])[1];
    if (label) {
      const btn = qa('.nav-item').find(b => b.getAttribute('title') === label || (b.textContent || '').trim() === label);
      if (btn) { btn.click(); return true; }
    }
    if (view) {
      window.dispatchEvent(new CustomEvent('pc-navigate-main', { detail: { view } }));
      return true;
    }
    return false;
  }

  function clickFirst(sels) {
    for (const sel of sels) {
      const el = q(sel);
      if (el) { el.click(); return true; }
    }
    return false;
  }

  /* =========================================================
   * 5. 52px 图标条
   * ========================================================= */

  let strip = null;
  let pop = null;
  let fab = null;

  /** 收起图标条后的兜底入口，保证外观面板永远能打开 */
  function ensureFab() {
    if (fab && fab.isConnected) return fab;
    fab = document.createElement('button');
    fab.className = 'cx-fab';
    fab.title = '外观设置';
    fab.setAttribute('aria-label', '外观设置');
    fab.innerHTML = svg(P.sliders);
    fab.addEventListener('click', e => {
      e.stopPropagation();
      const stripBtn = strip && q('[data-act="look"]', strip);
      togglePop(stripBtn || fab);
    });
    document.body.appendChild(fab);
    return fab;
  }
  function buildStrip() {
    const el = document.createElement('div');
    el.className = 'cx-strip';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', '快捷工具条');
    el.innerHTML =
      '<div class="cx-brand" title="申材有道 · 回到首页" role="button" tabindex="0">申</div>' +
      '<button class="cx-strip-btn" data-act="new" title="新对话" aria-label="新对话">' + svg(P.plus) + '</button>' +
      '<button class="cx-strip-btn" data-act="search" title="快速跳转（Ctrl/⌘ K）" aria-label="快速跳转">' + svg(P.search) + '</button>' +
      '<button class="cx-strip-btn" data-act="bell" title="消息中心" aria-label="消息中心">' + svg(P.bell) +
        '<span class="cx-strip-badge" hidden></span></button>' +
      '<div class="cx-strip-sep"></div>' +
      '<div class="cx-strip-grow"></div>' +
      '<button class="cx-strip-btn" data-act="theme" title="切换明暗" aria-label="切换明暗">' + svg(P.moon) + '</button>' +
      '<button class="cx-strip-btn" data-act="look" title="外观设置" aria-label="外观设置">' + svg(P.sliders) + '</button>';

    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (btn) {
        const act = btn.dataset.act;
        if (act === 'new') clickFirst(['.nav-new-chat']);
        else if (act === 'search') openPalette();
        else if (act === 'bell') clickFirst(['.nav-msg-bell']);
        else if (act === 'theme') toggleTheme();
        else if (act === 'look') togglePop(btn);
        return;
      }
      if (e.target.closest('.cx-brand')) gotoView('home');
    });
    el.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cx-brand')) {
        e.preventDefault();
        gotoView('home');
      }
    });
    return el;
  }

  function syncBadge() {
    if (!strip) return;
    const badge = q('.cx-strip-badge', strip);
    const src = q('.nav-msg-bell-badge');
    if (!badge) return;
    const txt = src && !src.hidden ? (src.textContent || '').trim() : '';
    badge.hidden = !txt;
    badge.textContent = txt;
  }

  function syncThemeIcon() {
    if (!strip) return;
    const btn = q('[data-act="theme"]', strip);
    if (!btn) return;
    btn.innerHTML = svg(effectiveTheme() === 'dark' ? P.sun : P.moon);
  }

  function toggleTheme() {
    S.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
    persist();
    applyTheme();
    syncThemeIcon();
    if (pop) renderPop();
  }

  /* =========================================================
   * 6. ⌘K 命令面板
   * ========================================================= */

  let palMask = null, palInput = null, palItems = [], palCur = 0;

  function openPalette() {
    if (palMask) return;
    palMask = document.createElement('div');
    palMask.className = 'cx-pal-mask';
    palMask.innerHTML =
      '<div class="cx-pal" role="dialog" aria-modal="true" aria-label="快速跳转">' +
        '<div class="cx-pal-in">' + svg(P.search) +
          '<input type="text" placeholder="跳转到功能、历史会话…" spellcheck="false" autocomplete="off">' +
          '<span class="cx-pal-kbd">ESC</span>' +
        '</div>' +
        '<div class="cx-pal-list"></div>' +
        '<div class="cx-pal-foot"><span>↑↓ 选择 · ↵ 打开</span><span class="cx-pal-count"></span></div>' +
      '</div>';

    document.body.appendChild(palMask);
    palInput = q('input', palMask);
    palInput.addEventListener('input', () => { palCur = 0; renderPalette(); });
    palMask.addEventListener('mousedown', e => { if (e.target === palMask) closePalette(); });
    document.addEventListener('keydown', onPalKey, true);

    renderPalette();
    setTimeout(() => palInput && palInput.focus(), 10);
  }

  function closePalette() {
    if (!palMask) return;
    document.removeEventListener('keydown', onPalKey, true);
    palMask.remove();
    palMask = null; palInput = null; palItems = [];
  }

  function buildPaletteData() {
    const out = [];
    VIEWS.forEach(([view, label]) => {
      out.push({ group: '功能', label: label, hint: '导航', act: () => gotoView(view) });
    });

    // 历史会话：直接复用原生行，点击即打开
    qa('.session-row').slice(0, 12).forEach(row => {
      const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) out.push({ group: '历史会话', label: txt, hint: '', act: () => row.click() });
    });

    return out;
  }

  let palData = [];

  function renderPalette() {
    if (!palMask) return;
    const kw = (palInput.value || '').trim().toLowerCase();
    palData = buildPaletteData().filter(d => !kw || d.label.toLowerCase().includes(kw));

    if (palCur >= palData.length) palCur = Math.max(0, palData.length - 1);

    const list = q('.cx-pal-list', palMask);
    const count = q('.cx-pal-count', palMask);

    if (!palData.length) {
      list.innerHTML = '<div class="cx-pal-empty">没有匹配项</div>';
      if (count) count.textContent = '';
      palItems = [];
      return;
    }

    let html = '', lastGroup = '';
    palData.forEach((d, i) => {
      if (d.group !== lastGroup) {
        html += '<div class="cx-pal-group">' + d.group + '</div>';
        lastGroup = d.group;
      }
      html += '<button class="cx-pal-item' + (i === palCur ? ' is-cur' : '') + '" data-i="' + i + '">' +
        '<span class="cx-pal-ico">' + svg(d.group === '功能' ? P.arrow : P.bell, 16) + '</span>' +
        '<span class="cx-pal-t">' + esc(d.label) + '</span>' +
        (d.hint ? '<span class="cx-pal-hint">' + d.hint + '</span>' : '') +
        '</button>';
    });
    list.innerHTML = html;
    if (count) count.textContent = palData.length + ' 项';

    palItems = qa('.cx-pal-item', list);
    palItems.forEach(btn => {
      btn.addEventListener('mouseenter', () => setCur(Number(btn.dataset.i)));
      btn.addEventListener('click', () => fire(Number(btn.dataset.i)));
    });
    scrollCurIntoView();
  }

  function setCur(i) {
    if (!palItems.length || Number.isNaN(i)) return;
    palCur = Math.max(0, Math.min(palItems.length - 1, i));
    palItems.forEach((b, k) => b.classList.toggle('is-cur', k === palCur));
    scrollCurIntoView();
  }

  function scrollCurIntoView() {
    const el = palItems[palCur];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  function fire(i) {
    const d = palData[i];
    if (!d) return;
    closePalette();
    setTimeout(() => { try { d.act(); } catch (e) { } }, 0);
  }

  function onPalKey(e) {
    if (!palMask) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setCur(palCur + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setCur(palCur - 1); return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fire(palCur); }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* =========================================================
   * 6.5 素材详情：终端会话视图（TUI）
   * ---------------------------------------------------------
   * 站点把这一页渲染成一篇文章（.mm-paper > header + 若干 section），
   * 我们要的是一串「会话消息」。做法：
   *   1. 给每个 section 写 data-cx-*（序号/时间、思考动词、耗时、英文思考段、工具调用）
   *   2. CSS 用三个伪元素把它们渲染成终端行 —— 不往 React 树里插节点
   *   3. 只在阅读流尾部追加假输入框，另挂一条底部状态栏
   * 思考文案按小节类型（简报/规范词/金句/案例/人物/范文）分池随机抽，
   * 工具调用的文件名取自该小节的真实标题，所以看起来像真在读这份稿子。
   * ========================================================= */

  const TUI_VERBS = [
    'Contemplated', 'Pondered', 'Whirred', 'Mulled', 'Ruminated', 'Noodled',
    'Sifted', 'Digested', 'Cogitated', 'Puzzled over', 'Turned over', 'Chewed on'
  ];

  const TUI_THINK = {
    brief: [
      'Three items, all upstream of the usual talking points: industrial profit, installed wind and solar, urban transit. The numbers already carry the argument, so paraphrasing would only dilute them. What the candidate needs is the connective — why these three belong in one paragraph.',
      'Reading this as a set rather than three separate notes. Macro, energy, livelihood — that ordering is itself a structure worth stealing. The one weak item is transit; it reads like a local pilot dressed up as national policy.',
      'The phrasing is already compressed to headline length, which is good. Leave the figures untouched and mark the two verbs that carry the evaluative weight. Anything beyond that is decoration.'
    ],
    terms: [
      'These are substitutions, not definitions — each one swaps a flat phrase for a bureaucratic one. Useful only if the original phrase stays visible next to it, so keep the pairs intact instead of flattening them into a list.',
      'Twelve terms, and maybe half will never appear in a real answer. The ones that earn their place have a mechanism inside: coordination, portability, graded response. The rest is vocabulary posturing.',
      'Noting how many of these are verbs turned into nouns. That is the register shift examiners reward, but overuse produces prose that cannot move. Flag the two that still keep an actor in them.'
    ],
    quote: [
      'The quote does its work through parallel structure, not sentiment. Keep the two clauses intact and let the candidate supply the case; a paraphrase would lose the only thing worth quoting.',
      'Tested whether the line survives without its context. It does — general enough to be lifted, specific enough to sound authored. That combination is why it circulates.',
      'Slightly uneasy about how easily this can be pasted anywhere. A strong quotation holds one idea it cannot let go of; this one holds three, which makes it portable but weak. Use it once, at the turn, never twice.'
    ],
    case: [
      'Twenty-three years, zero casualties — the number is the whole argument, everything after it is method. Expand the mechanism and the number loses its force, so the mechanism gets one clause at most.',
      'The interesting part is sequencing, not outcome: survey first, model second, engineering third, people last. Most retellings reverse that order because the engineering is the photogenic part.',
      'There is a temptation to read this as a technology story. It is a coordination story with technology in it. Lead with the institution and let the hardware arrive late, the way it did in reality.'
    ],
    figure: [
      'Seventy-four years old, and the account spends its detail on the injury rather than the decision. That instinct is right — the decision is obvious once stated, the cost is what makes it credible. Keep the cost, cut the adjectives.',
      'Read against the usual hero template: no professional duty here, no uniform, nothing that obliged him to step in. That absence is the argument. A version that supplies a duty would be weaker.',
      'One action, one morning, one village. The scale is deliberately small, which is why it works as evidence about ordinary people rather than about institutions. Do not inflate it.'
    ],
    essay: [
      'Structural pass first. Three body paragraphs, each claim then instance then turn — regular enough to be teachable, irregular enough not to read as a template. Mark the seams, not the sentences.',
      'The thesis puts execution before intent. Most essays in this genre argue the reverse. That inversion is the only thing here worth imitating; the rest is competent filler.',
      'Counting markers before reading for sense, which is how an examiner actually behaves. Density is high in paragraph two and drops in four — that is where a real answer loses marks, and also where the model is thinnest.'
    ],
    fallback: [
      'Nothing to check against here — the sheet is a daily digest, so the useful move is to take one figure and build outward from it rather than summarise the whole page.',
      'The obvious answer is to restate the theme. It is also the answer everyone else will write, which makes it worthless. Look for the second-order consequence instead.',
      'Three candidate angles, none decisive. The one with a mechanism in it is probably worth writing, even if it is the least quotable of the three.'
    ]
  };

  const TUI_FILES = {
    brief: d => 'brief/' + d + '.md',
    terms: () => 'terms/规范词表.md',
    quote: () => 'corpus/quotes.md',
    case: s => 'cases/' + s + '.md',
    figure: s => 'profiles/' + s + '.md',
    essay: s => 'essays/' + s + '.md',
    fallback: d => 'notes/' + d + '.md'
  };

  const TUI_RES = {
    brief: '6 items · 1 file',
    terms: '12 matches · 2 files',
    quote: '5 matches · 3 files',
    case: '1 doc · 6 paragraphs',
    figure: '1 doc · 4 paragraphs',
    essay: '3 paragraphs · 812 tokens',
    fallback: '1 doc'
  };

  const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
  const pad2 = n => (n < 10 ? '0' : '') + n;

  /** 小节标题 → 文案池 key */
  function tuiKind(label) {
    if (/要闻|简报|时政|政经/.test(label)) return 'brief';
    if (/规范词|表达/.test(label)) return 'terms';
    if (/金句/.test(label)) return 'quote';
    if (/案例/.test(label)) return 'case';
    if (/人物|典范/.test(label)) return 'figure';
    if (/范文/.test(label)) return 'essay';
    return 'fallback';
  }

  /** 标题压成文件名：去标点空白，留 12 字 */
  function tuiSlug(s) {
    const t = String(s || '')
      .replace(/[《》〈〉“”‘’"'「」『』【】()（）[\]{}]/g, '')
      .replace(/[，。、；：！？,.;:!?—–~…\s]+/g, '');
    return (t || 'untitled').slice(0, 12);
  }

  function tuiTool(kind, label, day) {
    const f = TUI_FILES[kind] || TUI_FILES.fallback;
    const arg = (kind === 'brief' || kind === 'fallback') ? day : tuiSlug(label);
    let call;
    if (kind === 'terms') call = 'Grep(协同|规范词, terms/)';
    else if (kind === 'quote') call = 'Grep(金句|quote, corpus/)';
    else call = 'Read(' + f(arg) + ')';
    return {
      call: call,
      res: (TUI_RES[kind] || TUI_RES.fallback) + '  (ctrl+o to expand)'
    };
  }

  let tuiFootEl = null, tuiStatusEl = null, tuiClockEl = null, tuiClockTimer = 0;

  /**
   * 每 600ms 的低成本巡检：详情页出现就装饰，离开就收起状态栏。
   * 不用 MutationObserver 监听整棵子树，避免 AI 流式输出时每帧回调。
   */
  function ensureReading() {
    if (!document.body) return;
    const root = document.documentElement;
    const paper = q('.mat-root-read .mm-paper') || q('.mm-paper');

    if (!paper) {
      root.classList.remove('cx-reading');
      if (tuiStatusEl) tuiStatusEl.hidden = true;
      return;
    }

    root.classList.add('cx-reading');
    const bar = ensureTuiStatus();
    bar.hidden = false;

    const foot = ensureTuiFoot(q('.mat-read-scroll'));
    decorateReading(paper, foot);

    const issue = q('.mm-issue', paper);
    const num = issue && (issue.textContent || '').match(/\d+/);
    const pathEl = q('.cx-tui-path', bar);
    if (pathEl) pathEl.textContent = '~/shenlunsucai.com/material' + (num ? '/' + num[0] : '');
  }

  function decorateReading(paper, foot) {
    if (!paper || paper.dataset.cxTui === '1') return;
    paper.dataset.cxTui = '1';

    // 换了一篇素材：上一次的演示草稿不该跟过来
    if (foot) {
      const log = q('.cx-tui-log', foot);
      if (log) log.innerHTML = '';
    }

    const dateEl = q('.mm-mast-date', paper);
    const dm = dateEl && (dateEl.textContent || '').match(/\d{4}-\d{2}-\d{2}/);
    const day = dm ? dm[0] : new Date().toISOString().slice(0, 10);

    qa('.mm-section', paper).forEach((sec, i) => {
      const titleEl = q('.mm-section-title', sec);
      const label = titleEl ? (titleEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (!titleEl || !label) return;

      const kind = tuiKind(label);
      const pool = TUI_THINK[kind] || TUI_THINK.fallback;

      sec.dataset.cxMeta = '[' + pad2(i + 1) + '] · ' + (3 + Math.floor(Math.random() * 44)) + 'm';

      titleEl.dataset.cxVerb = pickOne(TUI_VERBS);
      titleEl.dataset.cxSecs = String(14 + Math.floor(Math.random() * 62));
      titleEl.dataset.cxThink = pickOne(pool);

      const first = titleEl.nextElementSibling;
      if (first) {
        const t = tuiTool(kind, label, day);
        first.dataset.cxTool = t.call;
        first.dataset.cxToolres = t.res;
      }
    });
  }

  function ensureTuiFoot(scroller) {
    if (!scroller) return null;
    if (tuiFootEl && tuiFootEl.isConnected) return tuiFootEl;

    tuiFootEl = document.createElement('div');
    tuiFootEl.className = 'cx-tui-foot';
    tuiFootEl.innerHTML =
      '<div class="cx-tui-log" aria-live="polite"></div>' +
      '<div class="cx-tui-composer">' +
        '<span class="cx-tui-prompt" aria-hidden="true">}</span>' +
        '<textarea class="cx-tui-input" rows="1" spellcheck="false" ' +
          'aria-label="回复（演示用，不会发送）" ' +
          'placeholder="reply to thread…   (Enter 发送, Shift+Enter 换行)"></textarea>' +
      '</div>' +
      '<div class="cx-tui-hint">Enter 发送 · Shift+Enter 换行 —— 皮肤装饰，草稿只留在本地，刷新即消失</div>';

    scroller.appendChild(tuiFootEl);
    bindTuiComposer(tuiFootEl);
    return tuiFootEl;
  }

  function bindTuiComposer(foot) {
    const ta = q('.cx-tui-input', foot);
    const log = q('.cx-tui-log', foot);
    if (!ta || !log) return;

    const grow = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(150, ta.scrollHeight || 22) + 'px';
    };

    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        postTuiLog(log, ta);
        grow();
      } else if (e.key === 'Escape') {
        ta.blur();
      }
    });
  }

  /** 回车后的「假回复」：一条自己的消息 + 一次随机长度的思考 */
  function postTuiLog(log, ta) {
    const text = (ta.value || '').trim();
    if (!text) return;
    ta.value = '';

    const msg = document.createElement('div');
    msg.className = 'cx-tui-msg';
    msg.innerHTML =
      '<div class="cx-tui-user"><span class="cx-tui-dot">●</span>you<span class="cx-tui-ago">· now</span></div>' +
      '<div class="cx-tui-body"></div>';
    q('.cx-tui-body', msg).textContent = text;
    log.appendChild(msg);

    const verb = pickOne(TUI_VERBS);
    const secs = 2 + Math.floor(Math.random() * 4);
    const think = document.createElement('div');
    think.className = 'cx-tui-think';
    think.textContent = '✳ ' + verb + '…';
    log.appendChild(think);
    if (msg.scrollIntoView) msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    setTimeout(() => {
      if (!think.isConnected) return;
      think.innerHTML =
        '<span class="cx-tui-think-h">✳ ' + verb + ' for ' + secs + 's  (ctrl+o to expand) ~</span>' +
        '<span class="cx-tui-think-p"></span>' +
        '<span class="cx-tui-think-r">└ draft only — nothing was sent</span>';
      const p = q('.cx-tui-think-p', think);
      if (p) p.textContent = pickOne(TUI_THINK.fallback);
    }, 900);
  }

  function ensureTuiStatus() {
    if (tuiStatusEl && tuiStatusEl.isConnected) return tuiStatusEl;

    tuiStatusEl = document.createElement('div');
    tuiStatusEl.className = 'cx-tui-status';
    tuiStatusEl.hidden = true;
    tuiStatusEl.innerHTML =
      '<span class="cx-tui-mode">CODEX</span>' +
      '<span class="cx-tui-path">~/shenlunsucai.com/material</span>' +
      '<span class="cx-tui-keys">^r reply · esc back · ? shortcuts</span>' +
      '<span class="cx-tui-right"><span class="cx-tui-live">●</span>local draft' +
        '<b class="cx-tui-clock">--:--</b></span>';
    document.body.appendChild(tuiStatusEl);

    tuiClockEl = q('.cx-tui-clock', tuiStatusEl);
    tickClock();
    clearInterval(tuiClockTimer);
    tuiClockTimer = setInterval(tickClock, 30000);
    return tuiStatusEl;
  }

  function tickClock() {
    if (!tuiClockEl) return;
    const d = new Date();
    tuiClockEl.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* =========================================================
   * 7. 外观面板
   * ========================================================= */

  function togglePop(anchor) {
    if (pop) { closePop(); return; }
    pop = document.createElement('div');
    pop.className = 'cx-pop';
    document.body.appendChild(pop);
    renderPop();

    pop.addEventListener('click', e => {
      const closeBtn = e.target.closest('.cx-pop-x');
      if (closeBtn) { closePop(); return; }

      const reset = e.target.closest('[data-reset]');
      if (reset) {
        S = Object.assign({}, DEFAULTS);
        persist(); applySettings(); renderPop(); syncThemeIcon();
        return;
      }

      const seg = e.target.closest('.cx-seg');
      if (!seg) return;
      const btn = e.target.closest('button[data-v]');
      if (!btn) return;

      // 「图标条 / 毛玻璃」是开关按钮，键挂在按钮上；其余分段控件挂在容器上
      const k = btn.dataset.k || seg.dataset.k;
      if (!k) return;
      let v = btn.dataset.v;
      if (k === 'rail') v = Number(v);
      if (k === 'strip' || k === 'glass') v = v === '1';
      S[k] = v;
      persist();
      applySettings();
      renderPop();
      if (k === 'theme') syncThemeIcon();
    });

    setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
  }

  function closePop() {
    document.removeEventListener('mousedown', onDocDown, true);
    if (pop) { pop.remove(); pop = null; }
  }

  function onDocDown(e) {
    if (!pop) return;
    if (pop.contains(e.target)) return;
    if (e.target.closest('[data-act="look"]')) return;
    if (e.target.closest('.cx-fab')) return;
    closePop();
  }

  function seg(k, opts, cur) {
    return '<div class="cx-seg" data-k="' + k + '">' + opts.map(o =>
      '<button data-v="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' class="is-on"' : '') + '>' + o[1] + '</button>'
    ).join('') + '</div>';
  }

  function renderPop() {
    if (!pop) return;
    const accents = Object.keys(ACCENTS).map(k =>
      '<button data-v="' + k + '"' + (S.accent === k ? ' class="is-on cx-sw"' : ' class="cx-sw"') + '>' +
        '<span class="cx-dot" style="background:' + (ACCENTS[k][effectiveTheme() === 'dark' ? 'dark' : 'light']) + '"></span>' +
        (k === 'blue' ? '蓝' : k === 'amber' ? '琥珀' : '酒红') +
      '</button>'
    ).join('');

    pop.innerHTML =
      '<div class="cx-pop-h"><span>外观</span><button class="cx-pop-x" aria-label="关闭">' + svg(P.close, 14) + '</button></div>' +
      '<div class="cx-row"><span>主题</span>' +
        seg('theme', [['auto', '跟随'], ['light', '浅色'], ['dark', '深色']], S.theme) + '</div>' +
      '<div class="cx-row"><span>强调色</span><div class="cx-seg" data-k="accent">' + accents + '</div></div>' +
      '<div class="cx-row"><span>侧栏宽度</span>' +
        seg('rail', RAIL_STEPS.map(s => [s[0], s[1]]), S.rail) + '</div>' +
      '<div class="cx-row"><span>其他</span>' +
        '<div class="cx-seg">' +
          '<button data-k="strip" data-v="' + (S.strip ? '0' : '1') + '" class="' + (S.strip ? 'is-on' : '') + '">图标条</button>' +
          '<button data-k="glass" data-v="' + (S.glass ? '0' : '1') + '" class="' + (S.glass ? 'is-on' : '') + '">毛玻璃</button>' +
        '</div></div>' +
      '<div class="cx-pop-foot"><span>shencaiyoudao · Codex Skin</span>' +
        '<button class="cx-link" data-reset="1">恢复默认</button></div>';
  }

  /* =========================================================
   * 8. 生命周期
   * ========================================================= */

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /**
   * 把标签页标题锁成 PAGE_TITLE。
   * 站点是 SPA，切视图时 React 会反复改写 <title>（有时甚至整个节点重建），
   * 所以盯的是 <head> 而不是 <title> 本身，节点被换掉也能兜住。
   */
  function lockTitle() {
    const apply = () => {
      if (!document.head) return;              // document-start 阶段 head 可能还没解析出来
      if (document.title === PAGE_TITLE) return;
      try { document.title = PAGE_TITLE; } catch (e) { /* 忽略极早期写入失败 */ }
    };

    apply();

    const watch = () => {
      if (!document.head) { setTimeout(watch, 20); return; }
      new MutationObserver(apply).observe(document.head, {
        childList: true, subtree: true, characterData: true
      });
      apply();
    };
    watch();
  }

  let ticking = false;

  function ensure() {
    ticking = false;

    const shell = q('.app-shell');
    if (!shell || !document.body) {
      if (document.documentElement) document.documentElement.classList.remove(ROOT_CLASS);
      return;
    }
    document.documentElement.classList.add(ROOT_CLASS);

    if (!document.getElementById(STYLE_ID)) injectStyle();

    // 图标条：只在登录后的应用外壳上出现
    if (!strip || !strip.isConnected) {
      strip = buildStrip();
      document.body.appendChild(strip);
      syncThemeIcon();
    }
    ensureFab();
    syncBadge();
    syncActiveStrip();
  }

  function syncActiveStrip() {
    if (!strip) return;
    const hasNav = !!q('.nav-item');
    strip.style.visibility = hasNav ? '' : 'hidden';
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(ensure);
  }

  // 只在 #root 的子节点变化时重算，避免整棵子树监听带来的开销
  function observeRoot() {
    const root = document.getElementById('root');
    if (!root) { setTimeout(observeRoot, 200); return; }
    new MutationObserver(schedule).observe(root, { childList: true });
    schedule();
  }

  /**
   * document-start 时 <html> 可能还没被创建（documentElement 为 null），
   * 直接摸它会抛错并让整个脚本静默退出，所以这里等它出现再初始化。
   */
  function boot() {
    const root = document.documentElement;
    if (!root) { setTimeout(boot, 0); return; }

    applySettings();   // 尽早打标记，避免首屏闪白
    injectStyle();
    lockTitle();

    // 主题被站点改写时：启动期压回用户选择，之后跟随站点
    new MutationObserver(onThemeAttrChange).observe(root, {
      attributes: true, attributeFilter: ['data-theme']
    });
    [80, 400, 1200, 2600, 4200].forEach(ms => setTimeout(() => {
      if (S.theme !== 'auto' && document.documentElement.dataset.theme !== S.theme) applyTheme();
    }, ms));

    document.addEventListener('keydown', e => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (palMask) closePalette(); else openPalette();
      } else if (e.key === 'Escape' && pop) {
        closePop();
      }
    }, true);

    // 站点自己的导航折叠（⌘B）后，rail 宽度由站点接管，无需处理；
    // 这里做轻量兜底：图标条被移除、角标变化、明暗图标
    setInterval(() => {
      if (document.querySelector('.app-shell')) {
        if (!strip || !strip.isConnected) schedule();
        else { syncBadge(); syncActiveStrip(); }
      }
    }, 2500);

    // 素材详情（.mm-paper）是 React 深层渲染，不经过 #root 的 childList，
    // 单独低频巡检；函数内部命中即早退，成本只有一次 querySelector
    setInterval(ensureReading, 600);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeRoot, { once: true });
    } else {
      observeRoot();
    }
  }

  boot();
})();
