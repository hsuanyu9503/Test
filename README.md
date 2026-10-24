# Classroom Interactive v3.0.0 RC4.1 — 同步畫面穩定性與 Supabase 10/30 相容修補

> **僅供獨立 GitHub Pages／Supabase 測試環境驗收。** 保留 RC4 的功能與資料格式。

這次修復：教師端相同成果的重複 DOM 重建；證據／小組資料未取得前清空畫面；重複抓取 Course 教師快照造成額外請求。同步方式仍為 Realtime + 輪詢備援，沒有擅自關閉即時更新。

SQL：`sql/EXISTING-TEST-PROJECT-2026-10-30-SAFE-DEFAULTS.sql` 用於已有資料的測試庫，僅調整 postgres 未來 public 新物件的預設權限；`sql/QA-2026-10-30-PERMISSIONS-READONLY.sql` 為唯讀稽核；`sql/NEW-PROJECT-ONLY-v2.36.1-schema-unified-fixed.sql` 已加入 10/30 安全預設，但**只適合全新空白測試庫，且不包含 Stage 2/3 後續八份 migration**。請勿重跑到現有測試／正式庫。

部署與驗收：`README-V3-RC4.1.md`。正式 Supabase 權限與多人實測尚未由本地工具驗證。

---

# Classroom Interactive v3.0.0 RC4

> 修正教師端「跨成果對照」在定時同步後自動收合的問題。詳見 `README-V3-RC4.md`。

> **RC3 修正重點**：教師首頁建立的「獨立自由分類 Session」新增完整成果區，個別學生檢視也能讀取多個類別的素材與理由；重新開啟雲端 Session 時會在教師權限下還原原始分類素材。詳見 `README-V3-RC3.md`。
> RC2 的 Course 分類成果與獨立分類頁面改進繼續保留。

# Classroom Interactive v3.0.0 RC3｜測試站專用

這是從 v2.36.6 合併 v1.0.1 的「自由分類與比較」與「證據導向判斷」模組而成的**前端整合候選版**，不代表正式穩定版。

- 全站維持 v2.36.6 的教師／學生風格、統計科技風及綠紅拉鋸動畫。
- 新增 14 份 Stage 2／3 專用資源；擴充教師活動編輯器、Course Node iframe、Session RPC 和教師統計。
- 保留 v2.36.6 的平行 Node 教師快照重試與同步防護，不用 v1.0.1 舊程式碼覆蓋。
- 不需再執行 SQL：你已在隔離的 Supabase 測試專案完成 03、04 檢查，直接測試前端即可。
- **請使用獨立 GitHub Pages 測試 Repo，不要覆蓋正式網站。**

## 測試部署
1. 建立獨立 Repo，GitHub Pages 選取測試分支並指向根目錄；將部署包檔案（`index.html` 在根目錄）上傳。
2. 教師端開啟設定頁，設定**測試 Supabase Project URL** 和 Publishable／anon key（絕不可貼 service_role 或 secret key）。
3. 僅使用虛構學生、測試課程與測試作答。
4. 按 `tests/QA-V3.0.0-RC1-FRONTEND-INTEGRATION.md` 完成跨裝置驗收。

## 安全說明
- 不需要在正式資料庫重新執行 v2.36.1 初始化或 Stage2/3 Migration；已完成 03/04 的測試庫也不要重複執行 SQL。
- 單純替換網站不會遷移正式資料；正式升級仍需安排可還原備份、再次 preflight 及維護時段。
- 若確認用戶端失敗，回報錯誤資訊時請先遮蔽 Session token、API key、學生個資。

完整 QA 見 `tests/QA-V3.0.0-RC1-FRONTEND-INTEGRATION.md`。

RC3 專項測試報告：`tests/QA-V3.0.0-RC3-CLASSIFICATION-INSPECTOR.md`。


## Supabase 2026-10-30 相容性修補（RC4.1）
參閱 `sql/README-2026-10-30-COMPATIBILITY.md`。SQL 路徑請擇一，前端程式維持 RC4.1 不變。
