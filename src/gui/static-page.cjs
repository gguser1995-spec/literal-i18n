function renderStaticPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>literal-i18n</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --surface: #ffffff;
      --surface-2: #eef2f7;
      --border: #d8dee9;
      --text: #142033;
      --muted: #5f6b7a;
      --primary: #0f766e;
      --primary-strong: #0b5f59;
      --danger: #b42318;
      --danger-bg: #fff1f0;
      --focus: #2563eb;
      --shadow: 0 1px 2px rgba(20, 32, 51, 0.08);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
      line-height: 1.5;
    }
    button, input, select, textarea {
      font: inherit;
    }
    button {
      min-height: 36px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      padding: 7px 12px;
    }
    button:hover { border-color: #9aa6b8; }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 3px solid rgba(37, 99, 235, 0.25);
      outline-offset: 1px;
    }
    button.primary {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
    }
    button.primary:hover { background: var(--primary-strong); }
    button.danger {
      border-color: #f2b8b5;
      color: var(--danger);
      background: var(--danger-bg);
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }
    .app {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 18px clamp(16px, 4vw, 32px);
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: var(--shadow);
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    .meta {
      color: var(--muted);
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      padding: 2px 9px;
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    main {
      width: 100%;
      max-width: 1480px;
      margin: 0 auto;
      padding: 14px clamp(12px, 3vw, 28px) 28px;
      display: grid;
      gap: 12px;
    }
    section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      background: #fbfcfe;
      flex-wrap: wrap;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .section-title h2 {
      overflow-wrap: anywhere;
    }
    h2 {
      margin: 0;
      font-size: 15px;
      line-height: 1.3;
    }
    .filters {
      padding: 12px 14px 14px;
      display: grid;
      grid-template-columns: repeat(5, minmax(160px, 1fr));
      gap: 12px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    input, select, textarea {
      min-height: 40px;
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      padding: 8px 10px;
    }
    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      min-height: 0;
      padding: 0;
      margin: 0;
      accent-color: var(--primary);
      vertical-align: middle;
    }
    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    textarea {
      min-height: 68px;
      resize: vertical;
    }
    .compact-textarea {
      min-height: 34px;
      height: 34px;
      max-height: 88px;
      padding: 6px 8px;
      line-height: 1.35;
      resize: vertical;
    }
    .compact-textarea:focus {
      min-height: 68px;
      height: 68px;
    }
    .filter-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      min-width: 920px;
    }
    .compact-table {
      min-width: 980px;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    .compact-table th,
    .compact-table td {
      padding: 6px 8px;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      background: #fbfcfe;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tr:last-child td { border-bottom: 0; }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .status {
      display: inline-flex;
      min-height: 22px;
      align-items: center;
      border-radius: 999px;
      border: 1px solid var(--border);
      padding: 1px 7px;
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    .status.unused, .status.missing { color: var(--danger); border-color: #f2b8b5; background: var(--danger-bg); }
    .status.translated, .status.used { color: #0f766e; border-color: #99d7ce; background: #effaf7; }
    .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .actions button {
      min-height: 30px;
      padding: 4px 8px;
      font-size: 12px;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .collapse-button {
      min-height: 30px;
      padding: 4px 9px;
      font-size: 12px;
      color: var(--muted);
    }
    section[data-collapsed="true"] .collapsible-body {
      display: none;
    }
    section[data-collapsed="true"] .section-head {
      border-bottom: 0;
    }
    .empty {
      padding: 18px 16px;
      color: var(--muted);
    }
    .toast {
      position: fixed;
      right: 18px;
      bottom: 18px;
      max-width: min(460px, calc(100vw - 36px));
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: 0 12px 32px rgba(20, 32, 51, 0.16);
      color: var(--text);
      display: none;
      z-index: 50;
    }
    .toast.show { display: block; }
    .danger-zone {
      background: #fffafa;
    }
    @media (max-width: 980px) {
      header { position: static; }
      .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .filter-actions { grid-column: 1 / -1; }
    }
    @media (max-width: 620px) {
      .filters { grid-template-columns: 1fr; }
      .title-row { align-items: flex-start; }
      button { width: 100%; }
      .toolbar, .actions, .filter-actions { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="title-row">
        <h1>literal-i18n</h1>
        <div class="meta" id="projectMeta" aria-live="polite"></div>
      </div>
    </header>
    <main>
      <section aria-labelledby="filtersTitle">
        <div class="section-head">
          <h2 id="filtersTitle">筛选</h2>
          <div class="toolbar">
            <button id="extractBtn" type="button">重新扫描 AST</button>
          </div>
        </div>
        <form class="filters" id="filtersForm">
          <label>页面 URL
            <input id="urlInput" name="url" autocomplete="off" placeholder="/zh/library">
          </label>
          <label>源码
            <input id="sourceInput" name="source" autocomplete="off" placeholder='<T text="Hello World" />'>
          </label>
          <label>语言
            <select id="localeInput" name="locale"></select>
          </label>
          <label>key
            <input id="keyInput" name="key" autocomplete="off" placeholder="m_...">
          </label>
          <label>文案搜索
            <input id="copyInput" name="copy" autocomplete="off" placeholder="Choose plan">
          </label>
          <div class="filter-actions">
            <button class="primary" type="submit">查询</button>
            <button id="resetBtn" type="button">重置</button>
          </div>
        </form>
      </section>

      <section id="sourceMapSection" aria-labelledby="sourceMapTitle">
        <div class="section-head">
          <div class="section-title">
            <h2 id="sourceMapTitle">source-map.json</h2>
            <span class="pill" id="sourceMapCount">0</span>
          </div>
          <button class="collapse-button" type="button" data-collapse-target="sourceMapSection" aria-expanded="true">折叠</button>
        </div>
        <div class="table-wrap collapsible-body" id="sourceMapTable"></div>
      </section>

      <section id="localeSection" aria-labelledby="localeTitle">
        <div class="section-head">
          <div class="section-title">
            <h2 id="localeTitle">locale.json</h2>
            <span class="pill" id="localeCount">0</span>
          </div>
          <button class="collapse-button" type="button" data-collapse-target="localeSection" aria-expanded="true">折叠</button>
        </div>
        <div class="table-wrap collapsible-body" id="localeTable"></div>
      </section>

      <section id="unusedSection" class="danger-zone" aria-labelledby="unusedTitle">
        <div class="section-head">
          <div class="section-title">
            <h2 id="unusedTitle">AST 未使用项</h2>
          </div>
          <div class="toolbar">
            <button id="showUnusedBtn" type="button">显示 AST 未使用项</button>
            <button id="deleteSelectedBtn" class="danger" type="button" disabled>删除已勾选</button>
            <button class="collapse-button" type="button" data-collapse-target="unusedSection" aria-expanded="true">折叠</button>
          </div>
        </div>
        <div class="table-wrap collapsible-body" id="unusedTable"></div>
      </section>
    </main>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
    const state = {
      project: null,
      query: null,
      unused: null,
    };

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));

    function toast(message) {
      const node = $('toast');
      node.textContent = message;
      node.classList.add('show');
      window.clearTimeout(node._timer);
      node._timer = window.setTimeout(() => node.classList.remove('show'), 3600);
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          'content-type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || data.error || 'Request failed');
      }
      return data.data ?? data;
    }

    function formValues() {
      return {
        url: $('urlInput').value.trim(),
        source: $('sourceInput').value.trim(),
        copy: $('copyInput').value.trim(),
        locale: $('localeInput').value,
        key: $('keyInput').value.trim(),
      };
    }

    async function loadProject() {
      state.project = await api('/api/project');
      $('localeInput').innerHTML = state.project.locales.map((locale) => {
        return '<option value="' + escapeHtml(locale) + '">' + escapeHtml(locale) + '</option>';
      }).join('');
      renderMeta();
    }

    function renderMeta() {
      const p = state.project;
      $('projectMeta').innerHTML = [
        '<span class="pill">source ' + escapeHtml(p.sourceLocale) + '</span>',
        '<span class="pill">' + escapeHtml(p.keyMode) + '</span>',
        '<span class="pill">AST ' + (p.hasAstCache ? escapeHtml(p.validKeyCount) : 'missing') + '</span>',
      ].join('');
    }

    async function runQuery() {
      const params = new URLSearchParams(formValues());
      state.query = await api('/api/query?' + params.toString());
      renderSourceMap();
      renderLocale();
    }

    function renderSourceMap() {
      const rows = state.query?.sourceMapRows || [];
      $('sourceMapCount').textContent = rows.length + ' rows';
      if (!rows.length) {
        $('sourceMapTable').innerHTML = '<div class="empty">没有结果</div>';
        return;
      }
      $('sourceMapTable').innerHTML = '<table class="compact-table"><thead><tr><th>source-map key</th><th>message key</th><th style="width:110px">id</th><th>AST 状态</th></tr></thead><tbody>' +
        rows.map((row) => '<tr><td><code>' + escapeHtml(row.sourceMapKey) + '</code></td><td><code>' + escapeHtml(row.messageKey) + '</code></td><td><code>' + escapeHtml(row.id) + '</code></td><td><span class="status ' + escapeHtml(row.astStatus) + '">' + escapeHtml(row.astStatus) + '</span></td></tr>').join('') +
        '</tbody></table>';
    }

    function renderLocale() {
      const locale = state.query?.locale || $('localeInput').value;
      const rows = state.query?.localeRows || [];
      $('localeTitle').textContent = locale + '.json';
      $('localeCount').textContent = rows.length + ' rows';
      if (!rows.length) {
        $('localeTable').innerHTML = '<div class="empty">没有结果</div>';
        return;
      }
      $('localeTable').innerHTML = '<table class="compact-table"><thead><tr><th style="width:92px">状态</th><th style="width:176px">key</th><th style="width:110px">id</th><th>source text</th><th>target value</th><th style="width:228px">操作</th></tr></thead><tbody>' +
        rows.map((row) => {
          const inputId = 'target-' + row.key.replace(/[^a-zA-Z0-9_-]/g, '_');
          return '<tr data-key="' + escapeHtml(row.key) + '">' +
            '<td><span class="status ' + escapeHtml(row.status) + '">' + escapeHtml(row.status) + '</span></td>' +
            '<td><code>' + escapeHtml(row.key) + '</code></td>' +
            '<td><code>' + escapeHtml(row.id) + '</code></td>' +
            '<td>' + escapeHtml(row.source) + '</td>' +
            '<td><textarea class="compact-textarea" rows="1" id="' + inputId + '" data-target-key="' + escapeHtml(row.key) + '"' + (row.canSave ? '' : ' disabled') + '>' + escapeHtml(row.target) + '</textarea></td>' +
            '<td><div class="actions">' +
              '<button type="button" data-action="save" data-key="' + escapeHtml(row.key) + '"' + (row.canSave ? '' : ' disabled') + '>保存</button>' +
              '<button type="button" data-action="clear" data-key="' + escapeHtml(row.key) + '"' + (row.canClear ? '' : ' disabled') + '>清空</button>' +
              '<button type="button" data-action="retranslate" data-key="' + escapeHtml(row.key) + '"' + (row.canRetranslate ? '' : ' disabled') + '>重翻译</button>' +
              '<button type="button" class="danger" data-action="delete" data-file="' + escapeHtml(row.file) + '" data-key="' + escapeHtml(row.key) + '"' + (row.canDelete ? '' : ' disabled') + '>删除</button>' +
            '</div></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    async function loadUnused() {
      state.unused = await api('/api/unused');
      renderUnused();
    }

    function renderUnused() {
      const rows = state.unused?.items || [];
      $('deleteSelectedBtn').disabled = rows.length === 0;
      if (state.unused?.astCacheMissing) {
        $('unusedTable').innerHTML = '<div class="empty">AST cache missing</div>';
        return;
      }
      if (!rows.length) {
        $('unusedTable').innerHTML = '<div class="empty">没有结果</div>';
        return;
      }
      $('unusedTable').innerHTML = '<table class="compact-table"><thead><tr><th style="width:76px"><label class="checkbox-label"><input type="checkbox" id="unusedSelectAll" aria-label="全选 AST 未使用项"> 全选</label></th><th>文件</th><th style="width:116px">类型</th><th>key/source</th><th>value</th><th style="width:92px">操作</th></tr></thead><tbody>' +
        rows.map((row, index) => '<tr>' +
          '<td><input type="checkbox" data-unused-index="' + index + '" aria-label="select row"></td>' +
          '<td><code>' + escapeHtml(row.file) + '</code></td>' +
          '<td>' + escapeHtml(row.type) + '</td>' +
          '<td><code>' + escapeHtml(row.key) + '</code></td>' +
          '<td>' + escapeHtml(row.value) + '</td>' +
          '<td><button type="button" class="danger" data-action="delete-unused" data-index="' + index + '">删除</button></td>' +
        '</tr>').join('') +
        '</tbody></table>';
      syncUnusedSelectAll();
    }

    function syncUnusedSelectAll() {
      const selectAll = $('unusedSelectAll');
      if (!selectAll) return;
      const checkboxes = Array.from(document.querySelectorAll('[data-unused-index]'));
      const checkedCount = checkboxes.filter((input) => input.checked).length;
      selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }

    function toggleSection(button) {
      const section = $(button.dataset.collapseTarget);
      if (!section) return;
      const collapsed = section.dataset.collapsed !== 'true';
      section.dataset.collapsed = collapsed ? 'true' : 'false';
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      button.textContent = collapsed ? '展开' : '折叠';
    }

    async function saveKey(key) {
      const textarea = document.querySelector('[data-target-key="' + CSS.escape(key) + '"]');
      await api('/api/locale/save', {
        method: 'POST',
        body: JSON.stringify({ locale: $('localeInput').value, entries: { [key]: textarea.value } }),
      });
      toast('已保存');
      await runQuery();
    }

    async function clearKey(key) {
      if (!confirm('确认清空这个译文？')) return;
      await api('/api/locale/clear', {
        method: 'POST',
        body: JSON.stringify({ locale: $('localeInput').value, key }),
      });
      toast('已清空');
      await runQuery();
    }

    async function retranslate(key) {
      await api('/api/locale/retranslate', {
        method: 'POST',
        body: JSON.stringify({ locale: $('localeInput').value, key }),
      });
      toast('已重翻译');
      await runQuery();
    }

    async function deleteItem(file, key) {
      if (!confirm('确认删除这个 AST 未使用项？')) return;
      await api('/api/unused/delete', {
        method: 'POST',
        body: JSON.stringify({ file, key }),
      });
      toast('已删除');
      await runQuery();
      await loadUnused();
    }

    document.addEventListener('click', async (event) => {
      const collapseButton = event.target.closest('button[data-collapse-target]');
      if (collapseButton) {
        toggleSection(collapseButton);
        return;
      }

      const button = event.target.closest('button[data-action]');
      if (!button) return;
      try {
        const action = button.dataset.action;
        if (action === 'save') await saveKey(button.dataset.key);
        if (action === 'clear') await clearKey(button.dataset.key);
        if (action === 'retranslate') await retranslate(button.dataset.key);
        if (action === 'delete') await deleteItem(button.dataset.file, button.dataset.key);
        if (action === 'delete-unused') {
          const item = state.unused.items[Number(button.dataset.index)];
          await deleteItem(item.file, item.key);
        }
      } catch (error) {
        toast(error.message);
      }
    });

    document.addEventListener('change', (event) => {
      if (event.target.id === 'unusedSelectAll') {
        document.querySelectorAll('[data-unused-index]').forEach((input) => {
          input.checked = event.target.checked;
        });
        syncUnusedSelectAll();
        return;
      }

      if (event.target.matches('[data-unused-index]')) {
        syncUnusedSelectAll();
      }
    });

    $('filtersForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await runQuery();
      } catch (error) {
        toast(error.message);
      }
    });

    $('resetBtn').addEventListener('click', async () => {
      $('urlInput').value = '';
      $('sourceInput').value = '';
      $('copyInput').value = '';
      $('keyInput').value = '';
      await runQuery().catch((error) => toast(error.message));
    });

    $('showUnusedBtn').addEventListener('click', async () => {
      try {
        await loadUnused();
      } catch (error) {
        toast(error.message);
      }
    });

    $('deleteSelectedBtn').addEventListener('click', async () => {
      const indexes = Array.from(document.querySelectorAll('[data-unused-index]:checked')).map((input) => Number(input.dataset.unusedIndex));
      const items = indexes.map((index) => state.unused.items[index]).filter(Boolean);
      if (!items.length) {
        toast('未选择项目');
        return;
      }
      if (!confirm('确认删除已勾选的 AST 未使用项？')) return;
      try {
        await api('/api/unused/delete-selected', {
          method: 'POST',
          body: JSON.stringify({ items }),
        });
        toast('已删除勾选项');
        await runQuery();
        await loadUnused();
      } catch (error) {
        toast(error.message);
      }
    });

    $('extractBtn').addEventListener('click', async () => {
      try {
        await api('/api/extract', { method: 'POST', body: '{}' });
        await loadProject();
        await runQuery();
        toast('AST 已扫描');
      } catch (error) {
        toast(error.message);
      }
    });

    (async function boot() {
      try {
        await loadProject();
        await runQuery();
      } catch (error) {
        toast(error.message);
      }
    })();
  </script>
</body>
</html>`;
}

module.exports = {
  renderStaticPage,
};
