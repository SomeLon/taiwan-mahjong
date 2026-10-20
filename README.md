# 台灣十六張麻將（單機對電腦）

純 HTML + JavaScript，不需要伺服器、不需要安裝任何套件。
放到 GitHub Pages（或 GitLab Pages）就能用瀏覽器打開來玩，手機也可以。

## 功能

- 台灣十六張規則：吃（只能吃上家）、碰、明槓、暗槓、加槓、補花、自摸、放槍、搶槓、截胡、留 16 張流局
- 三位電腦，難度可選：
  - **簡單**：隨興打牌、亂吃亂碰、不防守
  - **普通**：會算進張數、判斷吃碰有沒有幫助
  - **困難**：記牌（扣掉場上看得到的牌）、往後多算一步，對手亮出三組以上會棄胡防守
- 自動算台：莊家、連莊拉莊、門清、自摸、門清自摸、圈風、門風、三元牌、正花、花槓、獨聽、平胡、全求人、三暗刻～五暗刻、碰碰胡、混一色、清一色、小三元、大三元、小四喜、大四喜、字一色、槓上開花、海底撈月、河底撈魚、搶槓、天胡、地胡、八仙過海、七搶一
- 可選打幾圈（一圈／兩圈／四圈）、底台（30/10、50/20、100/20、300/100）、電腦速度
- 聽牌提示（綠點代表打這張就聽牌，並顯示聽哪些牌、還剩幾張）

## 檔案結構

```
taiwan-mahjong/
├─ index.html          遊戲頁面
├─ css/style.css       畫面樣式
├─ js/tiles.js         牌的定義、洗牌、畫牌
├─ js/shanten.js       向聽數、聽牌、胡牌拆解
├─ js/scoring.js       台數計算、台數表
├─ js/ai.js            電腦玩家（三種難度）
├─ js/engine.js        牌局流程（摸打、吃碰槓、胡牌、結算、輪莊）
├─ js/ui.js            畫面與操作
├─ .nojekyll           讓 GitHub Pages 原樣提供檔案
└─ .gitlab-ci.yml      若改用 GitLab Pages 才會用到
```

## 本機直接玩

解壓縮後，用瀏覽器打開 `index.html`（直接連點兩下）即可。

## 放上 GitHub Pages

### 1. 安裝 Git（只要做一次）

【瀏覽器】到 https://git-scm.com/download/win 下載 Git for Windows，安裝時一路按「Next」即可。

【Windows PowerShell】確認安裝成功，並設定你的名字與 Email（只要做一次）：

```powershell
git --version
git config --global user.name "你的名字"
git config --global user.email "你的Email"
```

### 2. 在 GitHub 建立倉庫

【瀏覽器】登入 https://github.com → 右上角「+」→「New repository」
- Repository name：`taiwan-mahjong`
- 選「Public」（免費帳號的 Pages 需要公開倉庫）
- **不要**勾「Add a README file」
- 按「Create repository」

### 3. 把檔案推上去

假設你把 zip 解壓縮到 `D:\taiwan-mahjong`（`index.html` 就在這個資料夾裡）。
把下面的 `你的帳號` 換成你的 GitHub 帳號。

【Windows PowerShell】

```powershell
cd D:\taiwan-mahjong
git init
git add .
git commit -m "台灣麻將第一版"
git branch -M main
git remote add origin https://github.com/你的帳號/taiwan-mahjong.git
git push -u origin main
```

第一次 `git push` 會跳出瀏覽器視窗要你登入 GitHub，登入授權後就會繼續上傳。

### 4. 開啟 GitHub Pages

【瀏覽器】進入倉庫頁面 → 上方「Settings」→ 左邊「Pages」
- Source：選「Deploy from a branch」
- Branch：選「main」，資料夾選「/ (root)」→ 按「Save」

等 1～2 分鐘，重新整理該頁，上方會出現網址：

```
https://你的帳號.github.io/taiwan-mahjong/
```

打開就能玩。

### 之後修改檔案要更新

【Windows PowerShell】

```powershell
cd D:\taiwan-mahjong
git add .
git commit -m "更新說明"
git push
```

推上去後等 1～2 分鐘，網頁重新整理（必要時按 Ctrl + F5）就是新版。

## 改用 GitLab Pages（選用）

倉庫裡已附 `.gitlab-ci.yml`。把專案推到 GitLab 後，
【瀏覽器】到專案 →「Deploy」→「Pages」就會看到網址（第一次需等 CI 跑完）。

## 規則備註

- 計分：每家付「底 + 台數 × 每台」。自摸三家都付；放槍只有放槍者付。
- 莊家 1 台、連莊每次再加 2 台（連一拉一、連二拉二…），只算在莊家與對方之間。
- 莊家胡牌或流局都連莊；閒家胡牌就換下一家坐莊，莊家輪完四家換下一圈。
- 同一張牌多人可胡時，照出牌順序最近的人先胡（截胡）。
- 牌牆剩 16 張時流局。
