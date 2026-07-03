# Blob Quest — Pixel Idle RPG

原創厚白邊像素史萊姆風格的自動掛機 RPG。

## 直接遊玩

GitHub Pages：`https://pakho2433.github.io/anine-game-/`

如果首次開啟顯示 404，請到 Repository 的 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。之後每次更新 `main` 分支都會自動重新部署。

## 已完成

- 紅色史萊姆英雄與多款綠／藍／紅怪物
- 厚白邊、黑色內框、紫色像素場景
- 自動攻擊、怪物反擊、爆擊及三種技能
- 4 個地圖區域，每區 10 關，第 10 關為 Boss
- 擊殺獲得金幣、經驗值及隨機裝備
- 角色升級、技能升級、裝備穿戴及全身強化
- 普通至神話 6 種裝備稀有度
- 5 件同稀有度裝備合成下一級裝備
- 按玩家帳戶分開存檔、每 5 秒自動儲存
- 繼續上次帳戶及最多 8 小時離線獎勵
- 電腦及手機響應式介面
- GitHub Actions 自動部署 GitHub Pages

## 本機開啟

不要只在 GitHub 程式碼預覽頁面按 `index.html`。請下載整個 Repository，再用瀏覽器開啟 `index.html`；檔案 `style.css` 與 `game.js` 必須放在同一資料夾。

## 存檔說明

目前版本使用瀏覽器 `localStorage`，同一瀏覽器輸入相同帳戶即可讀取存檔。跨手機／跨電腦同步需在下一階段接駁 Firebase Authentication 與 Firestore。
