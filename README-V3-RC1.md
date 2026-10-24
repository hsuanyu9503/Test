# Classroom Interactive v3.0.0 RC1 — Stage 2/3 前端整合測試版

**非正式上線版。** 以 v2.36.6 為主幹，選擇性整合 v1.0.1 的分類與證據導向模組。

- 保留原版視覺：教師／學生介面，深色統計與即時拉鋸樣式、v2.36.6 `live-stance-motion.js`、CSS。
- 保留 v2.36.6 教師 Session 取樣與跨 Node / 平行活動資料防覆蓋機制，不採用 v1.0.1 舊的 `teacherSnapshot`。
- 加入兩種教學模組的編輯器、獨立學生端、Course Node 連結、教師統計與 Stage3 專屬 RPC 封裝。
- **不含新 SQL。** 僅在已跑完 Stage2/3 Migration + SEC-001 的獨立 Supabase 測試專案使用。
- 新舊模組和全套實際 RPC／跨裝置尚須進行測試驗收；不可直接覆蓋正式 GitHub。
- 測試環境需要填入測試 Supabase Project URL 與 Publishable/anon key。不可使用 secret/service_role key，也不要複製正式學生資料。
