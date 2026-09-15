// ==UserScript==
// @name         视频解析
// @namespace    https://github.com/HypoDear/userscripts
// @version      2.0
// @description  腾讯/爱奇艺视频播放页悬浮球，点击选择解析源，在新标签打开解析链接；内置多源可手动回退
// @author       HypoDear
// @match        *://*.qq.com/*
// @match        *://*.iqiyi.com/*
// @run-at       document-idle
// @grant        GM_openInTab
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const BALL_ID = '__vjump_ball__';

  const SOURCES = [
    { name: 'ckplayer（默认）', url: 'https://www.ckplayer.vip/jiexi/?url=' },
    { name: 'playm3u8', url: 'https://www.playm3u8.cn/jiexi.php?url=' },
    { name: 'xmflv', url: 'https://jx.xmflv.com/?url=' }
  ];

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

  function parseWith(base) {
    openTab(base + encodeURIComponent(location.href));
  }

  function mkMask() {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed!important;inset:0!important;background:rgba(0,0,0,.4)!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:16px!important;box-sizing:border-box!important';
    mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
    return mask;
  }

  function showMenu() {
    const mask = mkMask();
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff!important;width:300px!important;max-width:calc(100vw - 32px)!important;box-sizing:border-box!important;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px';

    const h = document.createElement('div');
    h.textContent = '选择解析源';
    h.style.cssText = 'font-size:16px;font-weight:600;color:#222;text-align:center';

    const tip = document.createElement('div');
    tip.textContent = '在新标签打开，若打不开可回来换一个源';
    tip.style.cssText = 'font-size:12px;color:#888;text-align:center;line-height:1.6;margin-bottom:2px';

    box.append(h, tip);

    SOURCES.forEach(function (s, i) {
      const b = document.createElement('button');
      b.textContent = s.name;
      const bg = i === 0 ? '#0b57d0' : '#f2f2f2';
      const color = i === 0 ? '#fff' : '#333';
      b.style.cssText = 'width:100%!important;box-sizing:border-box!important;padding:11px 14px;border:none;border-radius:8px;background:' + bg + ';color:' + color + ';font-size:14px;cursor:pointer';
      b.onclick = function () {
        mask.remove();
        parseWith(s.url);
      };
      box.append(b);
    });

    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.style.cssText = 'width:100%!important;box-sizing:border-box!important;padding:11px 14px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#666;font-size:14px;cursor:pointer;margin-top:2px';
    cancel.onclick = function () { mask.remove(); };
    box.append(cancel);

    mask.append(box);
    document.body.append(mask);
  }

  function injectBall() {
    if (document.getElementById(BALL_ID)) return;
    const ball = document.createElement('div');
    ball.id = BALL_ID;
    ball.textContent = '解析';
    ball.style.cssText = 'position:fixed!important;left:16px!important;bottom:120px!important;z-index:2147483646!important;width:52px!important;height:52px!important;border-radius:50%!important;background:#e8532b!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:15px!important;box-shadow:0 4px 12px rgba(0,0,0,.3)!important;cursor:pointer!important;user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important';

    ball.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      showMenu();
    });

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
