# Classroom Interactive v3.0.0 RC3 — 教師工作台自由分類成果修正

## 問題原因
RC2 強化了 Course 與獨立分類頁面，但首頁建立的獨立分類 Session 仍使用傳統個別學生檢視。
傳統檢視只讀取單一 selected_type / payload.reason，無法顯示 payload.board.groups 和 groups[].reason。

## 改進
- 首頁 Session 頂端新增「查看分類成果與理由」按鈕（僅獨立分類 Session 顯示）。
- 在加入狀態之前新增完整教師成果面板，直接讀取原有 teacherSnapshot 與 teacherGroups 資料。
- 個別學生檢視的分類作答改用共用成果 renderer，逐組顯示分類名稱、素材歸屬與多行理由。
- 小組模式引導老師查看小組成果，不再將「沒有個人作答」誤認為沒有理由。
- 保留 Course 成果頁、資料隔離、公開權限控制、v2.36.6 霓虹拉鋸動畫及所有既有 SQL。

**僅適用隔離的 GitHub Pages + Supabase 測試環境。** 不執行 SQL、不清除作答。
