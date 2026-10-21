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
