// ==UserScript==
// @name         视频解析
// @namespace    https://github.com/HypoDear/userscripts
// @version      1.0
// @description  腾讯/爱奇艺视频播放页悬浮球，一键在新标签打开 base url + 编码后的原始视频链接；支持移动端与桌面
// @author       HypoDear
// @match        *://*.qq.com/*
// @match        *://*.iqiyi.com/*
// @run-at       document-idle
// @grant        GM_openInTab
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const KEY = '__vjump_base__';
  const BALL_ID = '__vjump_ball__';

  function getBase() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }

  function setBase(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  function isVideoPage() {
    const h = location.hostname;
    const p = location.pathname;
    if (/qq\.com$/i.test(h) && /\/x\/cover\/[^/]+/i.test(p)) return true;
    if (/iqiyi\.com$/i.test(h) && /\/v_[0-9a-z]+/i.test(p)) return true;
    return false;
  }

  function openTab(url) {
    if (typeof GM_openInTab === 'function') {
      GM_openInTab(url, { active: true, insert: true });
    } else {
      window.open(url, '_blank');
    }
  }

  function jump() {
    const base = getBase();
    if (!base) { showConfig(); return; }
    openTab(base + encodeURIComponent(location.href));
  }

  function mkMask() {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed!important;inset:0!important;background:rgba(0,0,0,.5)!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:16px!important;box-sizing:border-box!important';
    mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
    return mask;
  }

  function showConfig() {
    const mask = mkMask();
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff!important;width:340px!important;max-width:calc(100vw - 32px)!important;box-sizing:border-box!important;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px';

    const h = document.createElement('div');
    h.textContent = '配置解析 Base URL';
    h.style.cssText = 'font-size:16px;font-weight:600;color:#222';

    const tip = document.createElement('div');
    tip.textContent = '跳转地址 = Base URL + 编码后的当前视频链接';
    tip.style.cssText = 'font-size:12px;color:#888;line-height:1.6';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = getBase();
    input.placeholder = '如：https://jx.xxx.com/?url=';
    input.style.cssText = 'width:100%!important;box-sizing:border-box!important;max-width:none!important;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:14px;color:#333';

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

    const save = document.createElement('button');
    save.textContent = '保存';
    save.style.cssText = 'padding:9px 16px;border:none;border-radius:8px;background:#0b57d0;color:#fff;font-size:14px;cursor:pointer';
    save.onclick = function () {
      setBase(input.value.trim());
      mask.remove();
    };

    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.style.cssText = 'padding:9px 16px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#666;font-size:14px;cursor:pointer';
    cancel.onclick = function () { mask.remove(); };

    bar.append(save, cancel);
    box.append(h, tip, input, bar);
    mask.append(box);
    document.body.append(mask);
    input.focus();
  }

  function injectBall() {
    if (document.getElementById(BALL_ID)) return;
    const ball = document.createElement('div');
    ball.id = BALL_ID;
    ball.textContent = '解析';
    ball.style.cssText = 'position:fixed!important;right:16px!important;bottom:120px!important;z-index:2147483646!important;width:52px!important;height:52px!important;border-radius:50%!important;background:#0b57d0!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:15px!important;box-shadow:0 4px 12px rgba(0,0,0,.3)!important;cursor:pointer!important;user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important';

    let timer = null;
    let longPressed = false;

    function start() {
      longPressed = false;
      timer = setTimeout(function () { longPressed = true; showConfig(); }, 600);
    }

    function end(e) {
      clearTimeout(timer);
      if (!longPressed) {
        if (e && e.cancelable) e.preventDefault();
        jump();
      }
    }

    ball.addEventListener('touchstart', start, { passive: true });
    ball.addEventListener('touchend', end);
    ball.addEventListener('mousedown', start);
    ball.addEventListener('mouseup', end);
    ball.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });

    document.body.append(ball);
  }

  function removeBall() {
    const b = document.getElementById(BALL_ID);
    if (b) b.remove();
  }

  function sync() {
    if (isVideoPage()) injectBall();
    else removeBall();
  }

  function ready(fn) {
    if (document.body) { fn(); return; }
    const t = setInterval(function () {
      if (document.body) { clearInterval(t); fn(); }
    }, 300);
  }

  const observer = new MutationObserver(function () {
    sync();
  });

  ready(function () {
    sync();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
