# Classroom Interactive v3.0.0 RC4.1 驗收說明

## 本次修補

- 教師端「自由分類」成果：**相同資料跳過重繪**；資料變動時仍更新，同時保存 RC4 的展開與橫向捲動狀態。
- 教師端「證據導向判斷／小組模式」：取得 RPC 資料並核對 Session/Node/版本後，才一次替換成果內容。等待雲端資料時保留舊畫面；相同資料不重建。切換 Node 時隱藏舊 Node 成果，避免短暫混用。
- 平行活動按鈕、學生名單、Session 歷史：相同輸入不重新建構 DOM；Course 分類教師成果重用已讀取的教師快照，減少額外請求。保留 Realtime 和 3/6 秒備援輪詢的原設定。
- 無新前端欄位，無學生作答格式變更，不需清除任何學生資料。

## Supabase 官方 2026-10-30 變更

當天後 **新增** `public` 表不再預設獲得 Data API 角色的存取 GRANT；已有表 ACL 和 RLS 不會被自動變更。

**已有資料的獨立測試 Supabase 專案：**
1. 建立備份，確認專案不是正式環境，停止正在進行中的測試 Session。
2. 在 SQL Editor 執行 `sql/EXISTING-TEST-PROJECT-2026-10-30-SAFE-DEFAULTS.sql`（可重複執行）。這是提早啟用安全預設，不會補建或改動既有表，也不會「幫八份 Stage 2/3 Migration 重寫 GRANT」。
3. 執行 `sql/QA-2026-10-30-PERMISSIONS-READONLY.sql`，檢查 default ACL、既有表的 RLS / 角色權限，以及 SECURITY DEFINER RPC 是否有預期的 EXECUTE 權限；**不可盲目對所有表批次 GRANT**。
4. 使用 GitHub 測試站、Publishable／anon key 進行真實 RPC、Session、Realtime、重連、分類／證據小組提交測試。

**全新空白測試專案：** 使用已更新的 `sql/NEW-PROJECT-ONLY-v2.36.1-schema-unified-fixed.sql` 建立舊基礎架構，仍須另行取得並依正確次序執行 Stage 2／3 的八份獨立 migration；本 RC4.1 DEV 包並未收錄那八份 SQL，不能宣稱一鍵完整建置 v3 系統。

**已有正式專案：** 不要執行基礎初始化。先在測試庫完成驗證，再規劃正式環境備份與維護窗口。10/30 不會自動撤銷既有表的 GRANT；若沒有建立新表，現有 Session 原則上不因這項調整而中斷。

## RC4.1 實機驗收建議

1. 教師端保持小組模式開啟、沒有學生操作至少兩分鐘，觀察原先每 2～5 秒閃爍是否消失。
2. 開啟小組證據、分類成果與跨成果比較表；每隔一段時間觸發輪詢，展開區域不應跳動、畫面不應被清空。
3. 學生提交或修改小組答案，教師應在 Realtime 或備援輪詢內更新；再驗證個人與小組資料隔離。
4. 切換 Course/Node/平行活動、斷線重連、舊 Session 結算；不得顯示其他 Node 的舊成果。
5. 測試 iPad Safari 與教室投影模式。此部分非本地測試所能代替。

## 已完成的本地檢查

- Node.js 語法／單元測試；Chromium R3 小組教師操作；RC4.1 專項「相同資料不重建 DOM、慢速 RPC 保持原內容、新提交可更新」測試。
- 正式 PostgreSQL 實際執行、Supabase 權限稽核、真實多機連線未執行，請勿把靜態檢查視為雲端驗收。

官方說明：https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
