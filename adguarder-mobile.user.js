// ==UserScript==
// @name         网页净化：去广告 + 站点弹窗拦截
// @namespace    https://github.com/HypoDear/userscripts
// @version      2.0
// @description  全站屏蔽谷歌广告；小红书额外拦截登录遮罩、解锁滚动、阻止唤起 App
// @author       HypoDear
// @match        *://*/*
// @grant        none
// @inject-into  content
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const GLOBAL_SELECTORS = [
    'ins.adsbygoogle',
    '.adsbygoogle',
    '[id^="div-gpt-ad"]',
    '[id^="google_ads_"]',
    '[id^="aswift_"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="doubleclick"]'
  ];

  const SITE_RULES = [
    {
      name: '小红书',
      match: /(^|\.)xiaohongshu\.com$/i,
      selectors: [
        '.login-container',
        '.login-mask',
        '.login-modal',
        '.sign-mask',
        '.reds-mask',
        '.reds-modal',
        '.mask-layer',
        '.launch-app-container',
        '.download-guide',
        '.open-app-btn',
        '.bottom-bar-container',
        '[class*="login-mask"]',
        '[class*="loginMask"]',
        '[class*="login-modal"]',
        '[class*="login-guide"]',
        '[class*="open-app"]',
        '[class*="openApp"]',
        '[class*="download-app"]'
      ],
      unlockScroll: true,
      blockSchemes: /^(xhsdiscover|snssdk|weixin|openapp):/i,
      extraCSS: ''
    }
  ];

  const host = location.hostname;
  const hits = SITE_RULES.filter(function (r) { return r.match.test(host); });

  let selectors = GLOBAL_SELECTORS.slice();
  let needUnlock = false;
  let schemeList = [];
  let extraCSS = '';

  hits.forEach(function (r) {
    if (r.selectors && r.selectors.length) selectors = selectors.concat(r.selectors);
    if (r.unlockScroll) needUnlock = true;
    if (r.blockSchemes) schemeList.push(r.blockSchemes.source);
    if (r.extraCSS) extraCSS += r.extraCSS;
  });

  const sweepSelector = selectors.join(',');

  let css = sweepSelector + '{display:none!important;visibility:hidden!important}';
  if (needUnlock) {
    css += 'html,body{overflow:auto!important;position:static!important;' +
           'height:auto!important;max-height:none!important;touch-action:auto!important}';
  }
  css += extraCSS;

  const style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).append(style);

  if (schemeList.length) {
    const SCHEMES = new RegExp(schemeList.join('|'), 'i');

    const rawOpen = window.open;
    window.open = function (url) {
      if (typeof url === 'string' && SCHEMES.test(url)) return null;
      return rawOpen.apply(window, arguments);
    };

    document.addEventListener('click', function (e) {
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a && SCHEMES.test(a.getAttribute('href') || '')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  function unlock() {
    if (!needUnlock) return;
    [document.documentElement, document.body].forEach(function (el) {
      if (!el) return;
      el.style.setProperty('overflow', 'auto', 'important');
      el.style.setProperty('position', 'static', 'important');
      el.style.setProperty('height', 'auto', 'important');
    });
  }

  let pending = false;

  function sweep() {
    pending = false;
    unlock();
    document.querySelectorAll(sweepSelector).forEach(function (el) { el.remove(); });
  }

  const observer = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(sweep);
  });

  function start() {
    sweep();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
