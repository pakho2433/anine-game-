# Blob Quest — Pixel Idle RPG

原創厚白邊像素史萊姆風格的自動掛機 RPG。

## 直接遊玩

GitHub Pages：`https://pakho2433.github.io/anine-game-/`

如果首次開啟顯示 404，請到 Repository 的 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。

## 帳戶系統

- 登入時需要帳戶名稱及密碼
- 可在登入頁建立新帳戶
- 密碼不會以純文字保存，瀏覽器只會保存加鹽後的雜湊值
- 目前仍是 GitHub Pages 單機版，帳戶及存檔只存在建立帳戶的瀏覽器
- 正式跨手機／跨電腦登入需要接駁 Firebase Authentication 與 Firestore

## 五人隊伍

| 解鎖等級 | 職業 | 主要技能 |
|---|---|---|
| Lv.1 | 劍士 | 烈焰斬 |
| Lv.5 | 法師 | 星爆術 |
| Lv.10 | 槍手 | 三連射 |
| Lv.15 | 坦克 | 守護壁壘及減傷 |
| Lv.20 | 醫生 | 群體治療 |

每個職業都有獨立攻擊速度、技能冷卻、角色外觀與技能動畫。技能可自動施放，也可在戰鬥畫面手動按下。

## 其他玩法

- 4 個地圖區域，每區 10 關，第 10 關為 Boss
- 擊殺獲得金幣、經驗值及隨機裝備
- 角色升級、職業技能升級、裝備穿戴及全身強化
- 普通至神話 6 種裝備稀有度
- 5 件同稀有度裝備合成下一級裝備
- 每 5 秒自動儲存及最多 8 小時離線獎勵
- 電腦及手機響應式介面
- GitHub Actions 自動驗證 JavaScript 語法及部署 Pages
