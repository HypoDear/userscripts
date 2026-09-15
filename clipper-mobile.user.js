// ==UserScript==
// @name         剪藏-记
// @namespace    https://github.com/HypoDear/userscripts
// @version      1.3
// @description  提取网页正文为纯文字，预览后一键发送到快捷指令记录
// @author       HypoDear
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @require      https://unpkg.com/@mozilla/readability@0.5.0/Readability.js
// ==/UserScript==

(function () {
  'use strict';

  const SHORTCUT_NAME = '剪藏-记';
  const URL_LIMIT = 6000;

  const JUNK_SELECTORS = [
    'header', 'footer', 'nav', 'aside',
    '.header', '.footer', '.nav', '.navbar', '.sidebar', '.aside',
    '.comment', '.comments', '.related', '.recommend', '.share',
    '.advertisement', '.ad', '.ads', '.promo', '.subscribe', '.newsletter',
    '.breadcrumb', '.pagination', '.social', '.author-card',
    '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
    '[aria-hidden="true"]'
  ];

  const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figcaption,dd,dt,td,section,article,div';

  function cleanDoc(doc) {
    JUNK_SELECTORS.forEach(function (sel) {
      doc.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    });
    return doc;
  }

  function tidyText(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(function (line) { return line.replace(/[ \t\u00a0]+/g, ' ').trim(); })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function htmlToParagraphs(html) {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    holder.querySelectorAll('br').forEach(function (br) {
      br.replaceWith(document.createTextNode('\n'));
    });
    const lines = [];
    holder.querySelectorAll(BLOCK_SELECTOR).forEach(function (el) {
      if (el.querySelector(BLOCK_SELECTOR)) return;
      const t = el.textContent.replace(/[ \t\u00a0]+/g, ' ').trim();
      if (t) lines.push(t);
    });
    if (!lines.length) return holder.textContent || '';
    return lines.join('\n\n');
  }

  function extractText() {
    try {
      const clone = document.cloneNode(true);
      cleanDoc(clone);
      const article = new Readability(clone, { charThreshold: 200, keepClasses: false }).parse();
      if (article) {
        const raw = article.content ? htmlToParagraphs(article.content) : (article.textContent || '');
        const body = tidyText(raw);
        if (body) return { title: article.title || document.title, body: body };
      }
    } catch (e) {}
    return { title: document.title, body: tidyText(document.body.innerText || '') };
  }

  function sendToShortcut(text) {
    if (text.length <= URL_LIMIT) {
      const url = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME) +
                  '&input=text&text=' + encodeURIComponent(text);
      window.location.href = url;
    } else {
      copyText(text).then(function () {
        alert('正文较长（' + text.length + ' 字），已复制到剪贴板。请手动运行快捷指令「' + SHORTCUT_NAME + '」。');
      });
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      resolve();
    });
  }

  function mkBtn(text, bg, color) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'padding:9px 14px;border:none;border-radius:8px;background:' + bg +
                      ';color:' + color + ';font-size:14px;cursor:pointer';
    return b;
  }

  function showPanel(title, body) {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;width:100%;max-width:560px;max-height:80vh;border-radius:12px;padding:16px;display:flex;flex-direction:column;box-sizing:border-box';

    const h = document.createElement('div');
    h.textContent = title || '(无标题)';
    h.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:6px;color:#222';

    const count = document.createElement('div');
    count.style.cssText = 'font-size:12px;color:#888;margin-bottom:10px';

    const ta = document.createElement('textarea');
    ta.value = body;
    ta.style.cssText = 'flex:1;min-height:200px;resize:none;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:14px;line-height:1.7;color:#333;-webkit-user-select:text;user-select:text;white-space:pre-wrap;box-sizing:border-box';

    function refreshCount() {
      count.textContent = '正文 ' + ta.value.trim().length + ' 字';
    }
    refreshCount();
    ta.addEventListener('input', refreshCount);

    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';

    const sendBtn = mkBtn('发送到快捷指令（剪藏-记）', '#0b57d0', '#fff');
    sendBtn.onclick = function () {
      const v = ta.value.trim();
      if (!v) { alert('正文为空'); return; }
      mask.remove();
      sendToShortcut(v);
    };

    const reBtn = mkBtn('重新提取', '#f2f2f2', '#333');
    reBtn.onclick = function () {
      const again = extractText();
      ta.value = again.body;
      h.textContent = again.title || '(无标题)';
      refreshCount();
    };

    const copyBtn = mkBtn('复制正文', '#f2f2f2', '#333');
    copyBtn.onclick = function () {
      copyText(ta.value.trim());
      copyBtn.textContent = '已复制';
    };

    const closeBtn = mkBtn('关闭', '#fff', '#666');
    closeBtn.style.border = '1px solid #ccc';
    closeBtn.onclick = function () { mask.remove(); };

    bar.append(sendBtn, reBtn, copyBtn, closeBtn);
    box.append(h, count, ta, bar);
    mask.append(box);
    mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
    document.body.append(mask);
  }

  function injectFloatBtn() {
    if (document.getElementById('__clip_btn__')) return;
    const btn = document.createElement('div');
    btn.id = '__clip_btn__';
    btn.textContent = '剪藏';
    btn.style.cssText = 'position:fixed;right:16px;bottom:100px;z-index:2147483646;width:52px;height:52px;border-radius:50%;background:#0b57d0;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.3);cursor:pointer;-webkit-user-select:none;user-select:none';
    btn.onclick = function () {
      const r = extractText();
      if (!r.body) { alert('未能提取到正文'); return; }
      showPanel(r.title, r.body);
    };
    document.body.append(btn);
  }

  function ready(fn) {
    if (document.body) { fn(); return; }
    const timer = setInterval(function () {
      if (document.body) { clearInterval(timer); fn(); }
    }, 300);
  }

  const observer = new MutationObserver(function () {
    if (!document.getElementById('__clip_btn__') && document.body) {
      injectFloatBtn();
    }
  });

  ready(function () {
    injectFloatBtn();
    observer.observe(document.body, { childList: true, subtree: false });
  });
})();
