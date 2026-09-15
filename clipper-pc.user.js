// ==UserScript==
// @name         剪藏
// @namespace    https://github.com/HypoDear/userscripts
// @version      5.1
// @description  提取网页正文，编辑后写入在线表格空白行；支持多子表、按标题关键词查询正文
// @author       HypoDear
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      docs.qq.com
// @require      https://unpkg.com/@mozilla/readability@0.5.0/Readability.js
// ==/UserScript==

(function () {
  'use strict';

  const API_URL = 'https://docs.qq.com/openapi/mcp';
  const MAX_CHARS = 20000;

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

  function askOnce(storeKey, promptText) {
    let v = GM_getValue(storeKey, '');
    if (!v) {
      v = prompt(promptText);
      if (v) GM_setValue(storeKey, v.trim());
    }
    return v ? v.trim() : '';
  }

  function getBase() {
    const fileID = askOnce('file_id', '首次配置：请输入表格文件 ID（纯 ID，不带网址）');
    if (!fileID) return null;
    const token = askOnce('token', '首次配置：请输入 Authorization token');
    if (!token) return null;
    return { fileID: fileID, token: token };
  }

  function loadSheets() {
    try {
      const arr = JSON.parse(GM_getValue('sheets', '[]'));
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveSheets(list) {
    GM_setValue('sheets', JSON.stringify(list));
  }

  function confFor(sheet) {
    const base = getBase();
    if (!base) return null;
    return { fileID: base.fileID, token: base.token, sheetID: sheet.id, sheetName: sheet.name };
  }

  function mcpCall(conf, toolName, args) {
    return new Promise(function (resolve, reject) {
      const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      };
      GM_xmlhttpRequest({
        method: 'POST',
        url: API_URL,
        headers: {
          'Authorization': conf.token,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        data: JSON.stringify(payload),
        onload: function (res) {
          try {
            const outer = JSON.parse(res.responseText);
            if (outer.error) { reject(outer.error.message || '接口报错'); return; }
            const inner = JSON.parse(outer.result.content[0].text);
            resolve(inner);
          } catch (e) {
            reject('解析失败：' + res.responseText.slice(0, 200));
          }
        },
        onerror: function () { reject('网络请求失败'); }
      });
    });
  }

  function readColumn(conf, col) {
    return mcpCall(conf, 'sheet.get_cell_data', {
      file_id: conf.fileID, sheet_id: conf.sheetID,
      start_row: 0, start_col: col, end_row: 4999, end_col: col,
      return_csv: true
    }).then(function (r) {
      const csv = (r.csv_data || '').replace(/\n+$/, '');
      return csv === '' ? [] : csv.split('\n');
    });
  }

  function writeRow(conf, rowIndex, ts, title, body) {
    return mcpCall(conf, 'sheet.set_range_value', {
      file_id: conf.fileID, sheet_id: conf.sheetID,
      values: [
        { row: rowIndex, col: 0, value_type: 'STRING', string_value: ts },
        { row: rowIndex, col: 1, value_type: 'STRING', string_value: title },
        { row: rowIndex, col: 2, value_type: 'STRING', string_value: body }
      ]
    });
  }

  function nowStr() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function mkBtn(text, bg, color) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'padding:9px 14px;border:none;border-radius:8px;background:' + bg +
                      ';color:' + color + ';font-size:14px;cursor:pointer';
    return b;
  }

  function mkMask() {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px';
    mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
    return mask;
  }

  function doRecord(sheet) {
    const conf = confFor(sheet);
    if (!conf) return;
    const picked = extractText();
    showRecordPanel(conf, picked.title, picked.body);
  }

  function showRecordPanel(conf, title, body) {
    const mask = mkMask();

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;width:100%;max-width:600px;max-height:82vh;border-radius:12px;padding:16px;display:flex;flex-direction:column;box-sizing:border-box';

    const h = document.createElement('div');
    h.textContent = '记录到「' + conf.sheetName + '」';
    h.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:10px;color:#222';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = title || '';
    titleInput.placeholder = '请输入标题';
    titleInput.style.cssText = 'border:1px solid #ddd;border-radius:8px;padding:9px 10px;font-size:14px;color:#333;margin-bottom:8px;box-sizing:border-box';

    const count = document.createElement('div');
    count.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px';

    const ta = document.createElement('textarea');
    ta.value = body;
    ta.style.cssText = 'flex:1;min-height:220px;resize:none;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:14px;line-height:1.7;color:#333;user-select:text;white-space:pre-wrap;box-sizing:border-box';

    function refreshCount() {
      const len = ta.value.trim().length;
      count.textContent = '正文 ' + len + ' 字' + (len > MAX_CHARS ? '（超出上限 ' + MAX_CHARS + '）' : '');
      count.style.color = len > MAX_CHARS ? '#d93025' : '#888';
    }
    refreshCount();
    ta.addEventListener('input', refreshCount);

    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';

    const saveBtn = mkBtn('记录', '#0b57d0', '#fff');
    saveBtn.onclick = function () {
      const finalTitle = titleInput.value.trim();
      const finalBody = ta.value.trim();
      if (!finalBody) { alert('正文为空，无法记录'); return; }
      if (finalBody.length > MAX_CHARS) {
        alert('文本超长（' + finalBody.length + ' 字符，上限 ' + MAX_CHARS + '），已中断，未记录。');
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = '记录中...';
      readColumn(conf, 0).then(function (colA) {
        const rowIndex = colA.length;
        return writeRow(conf, rowIndex, nowStr(), finalTitle, finalBody).then(function () {
          mask.remove();
          showToast('已记录到「' + conf.sheetName + '」第 ' + (rowIndex + 1) + ' 行');
        });
      }).catch(function (e) {
        saveBtn.disabled = false;
        saveBtn.textContent = '记录';
        alert('记录失败：' + e);
      });
    };

    const reBtn = mkBtn('重新提取', '#f2f2f2', '#333');
    reBtn.onclick = function () {
      const again = extractText();
      ta.value = again.body;
      if (!titleInput.value.trim()) titleInput.value = again.title || '';
      refreshCount();
    };

    const closeBtn = mkBtn('取消', '#fff', '#666');
    closeBtn.style.border = '1px solid #ccc';
    closeBtn.onclick = function () { mask.remove(); };

    bar.append(saveBtn, reBtn, closeBtn);
    box.append(h, titleInput, count, ta, bar);
    mask.append(box);
    document.body.append(mask);
    titleInput.focus();
  }

  function doQuery(sheet) {
    const conf = confFor(sheet);
    if (!conf) return;
    const kw = prompt('在「' + conf.sheetName + '」中查询标题关键词：', '');
    if (!kw) return;
    readColumn(conf, 1).then(function (titles) {
      let matchRow = -1;
      for (let i = 0; i < titles.length; i++) {
        if (titles[i].includes(kw)) { matchRow = i; break; }
      }
      if (matchRow < 0) { alert('未找到包含「' + kw + '」的记录'); return; }
      return mcpCall(conf, 'sheet.get_cell_data', {
        file_id: conf.fileID, sheet_id: conf.sheetID,
        start_row: matchRow, start_col: 2, end_row: matchRow, end_col: 2,
        return_csv: true
      }).then(function (r) {
        const bodyText = (r.csv_data || '').replace(/\n+$/, '');
        showResult(titles[matchRow], bodyText);
      });
    }).catch(function (e) {
      alert('查询失败：' + e);
    });
  }

  function showResult(title, body) {
    const mask = mkMask();
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;width:100%;max-width:600px;max-height:82vh;border-radius:12px;padding:16px;display:flex;flex-direction:column;box-sizing:border-box';
    const h = document.createElement('div');
    h.textContent = title || '(无标题)';
    h.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:6px;color:#222';
    const count = document.createElement('div');
    count.textContent = '正文 ' + body.length + ' 字';
    count.style.cssText = 'font-size:12px;color:#888;margin-bottom:10px';
    const ta = document.createElement('textarea');
    ta.value = body;
    ta.readOnly = true;
    ta.style.cssText = 'flex:1;min-height:220px;resize:none;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:14px;line-height:1.7;color:#333;user-select:text;white-space:pre-wrap;box-sizing:border-box';
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:12px;display:flex;gap:8px;justify-content:flex-end';
    const copyBtn = mkBtn('复制', '#0b57d0', '#fff');
    copyBtn.onclick = function () {
      navigator.clipboard.writeText(body);
      copyBtn.textContent = '已复制';
    };
    const closeBtn = mkBtn('关闭', '#fff', '#666');
    closeBtn.style.border = '1px solid #ccc';
    closeBtn.onclick = function () { mask.remove(); };
    bar.append(copyBtn, closeBtn);
    box.append(h, count, ta, bar);
    mask.append(box);
    document.body.append(mask);
  }

  function manageSheets() {
    const mask = mkMask();
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;width:100%;max-width:420px;max-height:82vh;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;overflow:auto';

    const h = document.createElement('div');
    h.textContent = '管理子表';
    h.style.cssText = 'font-size:16px;font-weight:600;color:#222;text-align:center';

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px';

    function renderList() {
      list.innerHTML = '';
      const sheets = loadSheets();
      if (!sheets.length) {
        const empty = document.createElement('div');
        empty.textContent = '暂无子表，请在下方添加';
        empty.style.cssText = 'font-size:13px;color:#999;text-align:center;padding:8px 0';
        list.append(empty);
      }
      sheets.forEach(function (s, idx) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;border:1px solid #eee;border-radius:8px;padding:8px 10px';
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0';
        const nm = document.createElement('div');
        nm.textContent = s.name;
        nm.style.cssText = 'font-size:14px;color:#222;font-weight:500';
        const id = document.createElement('div');
        id.textContent = s.id;
        id.style.cssText = 'font-size:12px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        info.append(nm, id);
        const del = mkBtn('删除', '#fff', '#d93025');
        del.style.cssText += 'border:1px solid #f0c0bc;padding:6px 10px;font-size:13px';
        del.onclick = function () {
          const cur = loadSheets();
          cur.splice(idx, 1);
          saveSheets(cur);
          renderList();
        };
        row.append(info, del);
        list.append(row);
      });
    }
    renderList();

    const addWrap = document.createElement('div');
    addWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;border-top:1px solid #eee;padding-top:10px';
    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.placeholder = '显示名称，如：知识库';
    nameIn.style.cssText = 'border:1px solid #ddd;border-radius:8px;padding:9px 10px;font-size:14px;box-sizing:border-box';
    const idIn = document.createElement('input');
    idIn.type = 'text';
    idIn.placeholder = '子表 ID（网址里 tab= 后那段）';
    idIn.style.cssText = 'border:1px solid #ddd;border-radius:8px;padding:9px 10px;font-size:14px;box-sizing:border-box';
    const addBtn = mkBtn('添加子表', '#0b57d0', '#fff');
    addBtn.style.width = '100%';
    addBtn.onclick = function () {
      const nm = nameIn.value.trim();
      const id = idIn.value.trim();
      if (!nm || !id) { alert('名称和子表 ID 都要填'); return; }
      const cur = loadSheets();
      if (cur.some(function (s) { return s.id === id; })) { alert('该子表 ID 已存在'); return; }
      cur.push({ id: id, name: nm });
      saveSheets(cur);
      nameIn.value = '';
      idIn.value = '';
      renderList();
    };
    addWrap.append(nameIn, idIn, addBtn);

    const closeBtn = mkBtn('完成', '#f2f2f2', '#333');
    closeBtn.style.width = '100%';
    closeBtn.onclick = function () { mask.remove(); };

    box.append(h, list, addWrap, closeBtn);
    mask.append(box);
    document.body.append(mask);
  }

  function resetConf() {
    const mask = mkMask();
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;width:100%;max-width:340px;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box';
    const h = document.createElement('div');
    h.textContent = '确认清空全部配置？';
    h.style.cssText = 'font-size:16px;font-weight:600;color:#222';
    const tip = document.createElement('div');
    tip.textContent = '将清空表格 ID、token 和全部子表，下次操作需重新配置。此操作不可撤销。';
    tip.style.cssText = 'font-size:13px;color:#666;line-height:1.6';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const cancel = mkBtn('取消', '#fff', '#666');
    cancel.style.border = '1px solid #ccc';
    cancel.onclick = function () { mask.remove(); };
    const ok = mkBtn('确认清空', '#d93025', '#fff');
    ok.onclick = function () {
      GM_setValue('file_id', '');
      GM_setValue('token', '');
      GM_setValue('sheets', '[]');
      mask.remove();
      showToast('已清空全部配置');
    };
    bar.append(cancel, ok);
    box.append(h, tip, bar);
    mask.append(box);
    document.body.append(mask);
  }

  function showMenu() {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;width:100%;max-width:320px;max-height:82vh;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;overflow:auto';
    const h = document.createElement('div');
    h.textContent = '剪藏';
    h.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:4px;color:#222;text-align:center';
    box.append(h);

    const sheets = loadSheets();
    const items = [];
    sheets.forEach(function (s) {
      items.push({ t: '记录到' + s.name, fn: function () { doRecord(s); } });
    });
    sheets.forEach(function (s) {
      items.push({ t: '查询' + s.name, fn: function () { doQuery(s); } });
    });
    items.push({ t: '管理子表', fn: manageSheets });
    items.push({ t: '重置配置', fn: resetConf });

    if (!sheets.length) {
      const tip = document.createElement('div');
      tip.textContent = '还没有子表，先点「管理子表」添加';
      tip.style.cssText = 'font-size:13px;color:#999;text-align:center;padding:4px 0';
      box.append(tip);
    }

    items.forEach(function (it) {
      const b = mkBtn(it.t, '#f2f2f2', '#333');
      b.style.width = '100%';
      b.onclick = function () { mask.remove(); it.fn(); };
      box.append(b);
    });
    mask.append(box);
    mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
    document.body.append(mask);
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:6px;z-index:2147483647;font-size:14px';
    document.body.append(t);
    setTimeout(function () { t.remove(); }, 2000);
  }

  function injectFloatBtn() {
    if (document.getElementById('__note_btn__')) return;
    const btn = document.createElement('div');
    btn.id = '__note_btn__';
    btn.textContent = '剪藏';
    btn.style.cssText = 'position:fixed;right:16px;bottom:100px;z-index:2147483646;width:52px;height:52px;border-radius:50%;background:#0b57d0;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.3);cursor:pointer;user-select:none';
    btn.onclick = function () { showMenu(); };
    document.body.append(btn);
  }

  function ready(fn) {
    if (document.body) { fn(); return; }
    const timer = setInterval(function () {
      if (document.body) { clearInterval(timer); fn(); }
    }, 300);
  }

  const observer = new MutationObserver(function () {
    if (!document.getElementById('__note_btn__') && document.body) {
      injectFloatBtn();
    }
  });

  ready(function () {
    injectFloatBtn();
    observer.observe(document.body, { childList: true, subtree: false });
  });
})();
