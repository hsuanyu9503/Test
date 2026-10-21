# Classroom Interactive v3.0.0 RC4 — 教師端跨成果比較表自動收合修復

## 此版本修正

RC3 教師端的自由分類成果中，「展開素材歸屬比較表（跨成果對照）」在開啟後，若 Realtime 事件或定時同步觸發教師成果重新渲染，會因 `<details>` 狀態未被保存而自動收合。RC4 將矩陣展開狀態與個別學生展開狀態分開儲存，按 Session／Course Node 範圍區隔。畫面重建前即時讀取目前 DOM 狀態，避免同步與瀏覽器非同步 `toggle` 事件的競態；同時記住橫向卷軸位置。

- **只有教師手動操作或切換到不同範圍，才會改變當前比較表的展開狀態**。
- 仍會接收新提交並刷新分類內容；不關閉 Realtime 或資料刷新。
- 維持獨立分類 Session / Course Node / 個別成果檢視功能。
- `classification-teacher-results.js` 為核心修正檔，其他變更僅限 RC4 版號與快取參數。
- 無 Supabase SQL 變更、不修改學生作答格式、不需要刪除測試資料。

## 部署

1. 在**測試用 GitHub Pages** 上以 RC4-GITHUB ZIP 解壓後的檔案覆蓋 RC3 網站檔案，請勿直接更新正式網站。
2. 使用原本已升級完成的 Supabase **測試專案**；不需要再執行 SQL。
3. 更新後重新載入教師頁（Safari 可關閉分頁再開，避免殘留舊版腳本），確認版號 `V3.0.0 RC4`。
4. 開啟分類 Session，展開「跨成果對照」，等待多輪同步／請其他測試學生提交，表格應保持展開並更新內容。
5. 手動收合後再等待同步，應保持收合；切換不同 Course Node 時，展開狀態應互不干擾。

## 檢查範圍

- 13 組既有 Node.js 回歸測試。
- Chromium 瀏覽器專項測試 `tests/test_classification_disclosure_rc4.py`：立即刷新、12 輪同步、資料變動、手動開合、Session/Node 隔離、空成果返回、理由安全呈現。
- 靜態引用與 ZIP 完整性。
- 真實 Supabase Realtime 仍須在測試網站進行跨裝置驗收。
