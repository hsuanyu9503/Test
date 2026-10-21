/* v3.0.0 RC2 — shared, teacher-only display of submitted classification boards.
 * Presentation only: it never mutates, sends, or publishes student answers. */
(function (root) {
  'use strict';
  const make = (tag, className, label) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = String(label);
    return node;
  };
  const openStates = new Map(); // preserve teacher expansion while snapshots refresh
  const list = value => Array.isArray(value) ? value : [];
  const safeText = value => String(value ?? '').trim();

  function render(host, submissions, source, { showMatrix = true, scope = 'default' } = {}) {
    if (!host) return;
    const rows = list(submissions);
    const assets = list(source?.assets);
    const assetMap = new Map(assets.map((a, i) => [String(a.id), { ...a, position:i + 1 }]));
    host.replaceChildren();
    const overview = make('div', 'ci-class-results-summary');
    const text = make('div', 'ci-class-results-summary-text');
    text.append(make('strong', '', `已收到 ${rows.length} 份分類成果`));
    text.append(make('p', '', rows.length ? '選擇下方成果，可查看每個類別的素材、共同特徵與完整理由。' : '尚無已提交的分類成果，學生完成送出後可按「更新分類成果」。'));
    overview.append(text);
    host.append(overview);
    if (!rows.length) return;

    const controls = make('div', 'ci-class-results-view-controls');
    const expand = make('button', 'ci-class-results-toggle', '展開全部成果');
    const collapse = make('button', 'ci-class-results-toggle', '收合全部成果');
    expand.type = collapse.type = 'button';
    const cards = make('div', 'ci-class-results-list');
    const allDetails = [];
    const state = openStates.get(scope) || new Map();
    openStates.set(scope,state);
    expand.addEventListener('click', () => allDetails.forEach(d => { d.open = true; }));
    collapse.addEventListener('click', () => allDetails.forEach(d => { d.open = false; }));
    controls.append(expand,collapse);
    host.append(controls,cards);

    for (const [idx, record] of rows.entries()) {
      const board = record?.board || record || {};
      const groups = list(board.groups);
      const memberships = list(board.memberships);
      const detail = make('details', 'ci-class-result-item');
      const resultKey = String(record?.key ?? record?.label ?? idx);
      detail.dataset.resultKey = resultKey;
      detail.open = state.has(resultKey) ? state.get(resultKey) : idx === 0;
      detail.addEventListener('toggle', () => state.set(resultKey, detail.open));
      allDetails.push(detail);
      const heading = make('summary', 'ci-class-result-heading');
      heading.append(make('span', 'ci-class-result-index', String(idx + 1)));
      const info = make('span', 'ci-class-result-info');
      info.append(make('strong', '', safeText(record?.label) || `成果 ${idx+1}`));
      info.append(make('small', '', `${groups.length} 個分類類別 · ${memberships.length} 筆素材歸屬`));
      heading.append(info);
      heading.append(make('span','ci-class-result-chevron','查看分類明細'));
      detail.append(heading);
      const content = make('div', 'ci-class-result-detail');
      if (!groups.length) content.append(make('p','ci-class-result-empty','已提交的內容沒有分類群組。'));
      for (const [groupIdx, g] of groups.entries()) {
        const category = make('section', 'ci-class-category');
        const catHead = make('div', 'ci-class-category-header');
        catHead.append(make('span','ci-class-category-number',`分類 ${groupIdx + 1}`));
        catHead.append(make('h4','',safeText(g?.name) || '未命名分類'));
        category.append(catHead);
        const memberIds = memberships.filter(m => String(m?.groupId) === String(g?.id)).map(m => String(m.assetId));
        const ordered = [...new Set(memberIds)];
        const assetList = make('div','ci-class-category-assets');
        assetList.append(make('strong','ci-class-category-label',`歸入素材（${ordered.length}）`));
        const chips = make('div','ci-class-asset-list');
        if (!ordered.length) chips.append(make('span','ci-class-asset-empty','這個類別沒有素材'));
        for (const id of ordered) {
          const asset = assetMap.get(id);
          const label = safeText(asset?.label) || (asset ? `圖片素材 ${asset.position}` : '未知素材');
          const chip = make('span','ci-class-asset-chip');
          if (asset?.image && /^https:\/\//i.test(asset.image)) {
            const img = make('img','ci-class-asset-thumb');
            img.src = asset.image;
            img.alt = '';
            img.loading = 'lazy';
            chip.append(img);
          }
          chip.append(make('span','',label));
          chips.append(chip);
        }
        assetList.append(chips);
        category.append(assetList);
        const reasonBlock = make('div','ci-class-category-reason');
        reasonBlock.append(make('strong','ci-class-category-label','共同特徵／分類依據與理由'));
        const reason = safeText(g?.reason);
        reasonBlock.append(make('p',reason ? 'ci-class-reason-text' : 'ci-class-reason-empty',reason || '未填寫理由'));
        category.append(reasonBlock);
        content.append(category);
      }
      detail.append(content);
      cards.append(detail);
    }

    if (showMatrix && assets.length) {
      const matrix = make('details','ci-class-matrix-wrap');
      matrix.append(make('summary','ci-class-matrix-summary','展開素材歸屬比較表（跨成果對照）'));
      const scroller = make('div','ci-class-matrix-scroll');
      const table = make('table','r5-classification-matrix');
      const thead = make('thead');
      const header = make('tr');
      ['素材', ...rows.map((r,i) => safeText(r?.label) || `成果 ${i + 1}`)].forEach(t => header.append(make('th','',t)));
      thead.append(header);table.append(thead);
      const body = make('tbody');
      for (const [assetIndex, asset] of assets.entries()) {
        const tr = make('tr');
        tr.append(make('th','',safeText(asset.label) || `圖片素材 ${assetIndex+1}`));
        for (const r of rows) {
          const board = r?.board || r || {};
          const groupIds = list(board.memberships).filter(m => m.assetId===asset.id).map(m => m.groupId);
          const names = list(board.groups).filter(g=>groupIds.includes(g.id)).map(g=>safeText(g.name)||'未命名分類');
          tr.append(make('td','',names.join('、')||'未分類'));
        }
        body.append(tr);
      }
      table.append(body); scroller.append(table); matrix.append(scroller); host.append(matrix);
    }
  }
  root.ClassificationTeacherResults = Object.freeze({ render });
})(window);
