<h1 align="center">
    <a href="https://github.com/ray24724919/pixel-agents-multi/discussions">
        <img src="webview-ui/public/banner.png" alt="Pixel Agents Multi">
    </a>
</h1>

<h2 align="center" style="padding-bottom: 20px;">
  給 Claude 與 Codex agent 使用的本地優先 pixel 控制室
</h2>

<div align="center" style="margin-top: 25px;">

[![stars](https://img.shields.io/github/stars/ray24724919/pixel-agents-multi?logo=github&color=0183ff&style=flat)](https://github.com/ray24724919/pixel-agents-multi/stargazers)
[![license](https://img.shields.io/github/license/ray24724919/pixel-agents-multi?color=0183ff&style=flat)](https://github.com/ray24724919/pixel-agents-multi/blob/main/LICENSE)
[![good first issues](https://img.shields.io/github/issues/ray24724919/pixel-agents-multi/good%20first%20issue?color=7057ff&label=good%20first%20issues)](https://github.com/ray24724919/pixel-agents-multi/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22)

</div>

<div align="center">
<a href="README.md">English</a> |
<a href="README.zh-TW.md">繁體中文</a>
</div>

<div align="center">
<a href="https://github.com/ray24724919/pixel-agents-multi/releases">Releases</a> |
<a href="https://github.com/ray24724919/pixel-agents-multi/discussions">Discussions</a> |
<a href="https://github.com/ray24724919/pixel-agents-multi/issues">Issues</a> |
<a href="CONTRIBUTING.md">Contributing</a> |
<a href="CHANGELOG.md">Changelog</a>
</div>

<br/>

Pixel Agents Multi 會把本地 AI coding session 變成一個可以看、可以管、也有一點遊戲感的 VS Code 控制室。Claude 和 Codex session 會變成 pixel office 裡的角色；正在工作的 agent 會走到電腦桌前，閒置的 agent 會離開工作位、走動或休息，每個角色也會同步顯示真實工具狀態、等待狀態、project、provider、thread 名稱與已追蹤的 usage。

這個 fork 把原本以 Claude Code 為主的專案，延伸成多 provider 的 agent dashboard、timeline、usage intelligence，以及 handoff/executor 工作流。現在的重點是讓一個人能在本機穩定監督多個 agent；更長期則會往 team/lab 協作介面前進。

本專案衍生自 [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents)。這個 fork 以 `raychen.pixel-agents-multi` 發行，並使用獨立的 VS Code command、setting、view、hook discovery 與 user data，因此可以跟公開版 extension 並存，不會混淆身份。

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## 它能做什麼

- **視覺化本地 agent**：Claude Code、Claude Desktop/Cowork local-agent-mode session，以及 Codex CLI thread 都會顯示成角色。
- **讓工作狀態看得見**：工作的 agent 會使用電腦桌，閒置 agent 會離開工作位，refresh 後也會重新分配位置以減少重疊。
- **顯示即時狀態**：角色會依照 writing、reading、shell command、task delegation、permission prompt、waiting for input 等狀態改變動畫。
- **追蹤 provider 與 project**：overlay 與 Agent Center 會顯示 project、provider、thread/session name 與狀態。
- **Usage intelligence**：在 canvas 外顯示 token total、exact/estimated 標籤、provider/project/session 群組與 proxy cost 脈絡。
- **Timeline history**：本地 timeline 會記錄 agent turn、tool event、handoff action、executor launch、report open 與 completion refresh。
- **把歷史轉成 handoff**：從 timeline/replay 建立 reviewed handoff artifact，再派生成 executor 可執行的 work package。
- **Handoff queue**：追蹤 draft、reviewed、stale、dispatched、active、blocked、report-ready、completed 等工作包狀態。
- **本地 VSIX 發行**：用自己的 extension id、名稱、command、setting 與驗證腳本打包安裝，不會跟公開版搞混。
- **設計自己的辦公室**：可編輯地板、牆壁、家具、桌椅、顏色、素材與 layout JSON。

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Pixel Agents characters" width="320" height="72" style="image-rendering: pixelated;">
</p>

## 核心功能

### Pixel Office

- 每個被採用的本地 session/thread 對應一個可見角色。
- 工作中的 agent 會 pathfind 到可用的電腦相鄰座位。
- 閒置 agent 會離開工作位並走動或休息，避免卡住真正工作的 agent。
- Task delegation 產生的 sub-agent 會以 linked child character 顯示在 parent 附近。
- Waiting 與 permission 狀態會顯示 speech bubble，也可以開啟完成提示音。
- 角色會自動分配多樣化 palette 與 hue shift，讓多 agent 場景比較容易辨識。
- 座位分配、refresh 行為與角色站位都特別針對視覺 bug 修正，例如工作 agent 不到桌前、站在椅子上、對空氣打字、refresh 後重疊等問題。

### Agent Center

Agent Center 是較大的檢查與管理頁面，刻意與 canvas 分離，避免 pixel office 變得太擠。

- 依 All、Codex、Claude 篩選。
- 查看 agent 名稱、provider、project、status 與 usage。
- focus 角色或連結的 terminal/session。
- refresh session discovery 與 stale visual state。
- 透過受保護的 action close、archive、hide 或 kill tracked agent。
- 在不擠壓主畫面的情況下打開 Usage、Timeline、Handoff 與 Handoff Queue。

### Usage Intelligence

Usage 是作為營運與監督用 telemetry，不是帳單真相。

- 當本地 metadata 有提供時，會顯示 Codex 與 Claude token total。
- exact 與 estimated 數值會分開標示。
- provider、project、session 與時間維度摘要可幫助辨識高用量或 stale work。
- 在資料足夠時，可估計 cache、reasoning 與 artifact usage。
- cost 顯示只是 proxy estimate，不是 OpenAI、Anthropic 或訂閱帳單。

### Timeline And Replay

Pixel Agents Multi 會保存一份本地、隱私友善的關鍵事件 timeline。

- 記錄 tool start/done、turn completion、waiting state、handoff action、executor launch、completion refresh 與 report open。
- Replay-oriented view 可幫助你在建立 handoff 前理解前面發生了什麼。
- 可依 agent、provider、project、event type 或時間搜尋與篩選。
- 安全持久化：不保存 raw prompt、raw transcript body、credential 或 transcript 的絕對路徑。

### Handoff And Executor Workflow

Handoff workflow 是為了讓 supervisor 派發下游 executor 時不遺失上下文。

1. 從 agent 或 project 的 timeline/replay 檢查上下文。
2. 在 `docs/agent-handoffs/` 建立 handoff artifact。
3. 用 sidecar `.handoff.json` 保存結構化 metadata。
4. 將 handoff 標記為 draft、reviewed、stale、dispatched、active、blocked 或 completed。
5. 在 `docs/roadmap/supervision/work-packages/handoffs/` 產生 executor-ready work package。
6. 複製 dispatch prompt，或從有 work package 的 handoff 直接啟動 Codex executor。
7. 將啟動後的 executor metadata 回寫到 handoff sidecar。
8. 從預期 report file 與本地 branch 狀態讀取 completion signal。
9. 透過 Handoff Queue 檢查 work package 狀態、開啟 report、refresh completion，並繼續監督。

目前 Codex 是支援直接 package launch 的 provider。Claude session 可以被追蹤，也可以納入 handoff context；但 Claude work-package prompt injection 仍是後續工作，等 Claude launcher path 能安全處理後再開放。

### Layout Editor And Assets

- 使用 pixel-art 工具繪製地板與牆壁。
- 放置、移動、旋轉、重新上色、刪除家具。
- 透過 desk/chair metadata 建立有效工作座位。
- 支援最多 50 步 undo/redo。
- 可從 Settings modal export/import layout JSON。
- 透過 `~/.pixel-agents/layout.json` 在不同 VS Code window 共享 user-level layout。
- 透過 `~/.pixel-agents/config.json` 載入 external asset directory。
- 可編輯 `webview-ui/public/assets/` 底下的 modular furniture manifest。

## 系統需求

- VS Code 1.105.0 或更新版本
- Node.js/npm，用於 source development 與 packaging
- Git，用於 branch/report completion detection
- 選用：[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)，需安裝並設定完成
- 選用：OpenAI Codex CLI，需安裝並登入
- 支援平台：Windows、Linux、macOS

## 從原始碼安裝

```bash
git clone git@github.com:ray24724919/pixel-agents-multi.git
cd pixel-agents-multi
npm install
cd webview-ui && npm install && cd ..
cd server && npm install && cd ..
npm run build
```

接著在 VS Code 按 **F5** 啟動 Extension Development Host。

## 安裝成本地 VSIX

如果要在一般 VS Code window 使用已打包的 extension：

```bash
npm run release:local
```

或手動執行每一步：

```bash
npm run build
npm run verify:identity
npm run verify:vsix
npm run package:vsix
npm run install:local
npm run verify:installed
```

確認 VS Code 安裝的是這個 fork，不是上游公開版：

```bash
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

預期輸出會包含 `raychen.pixel-agents-multi@1.3.0`。

安裝後請 reload VS Code。如果 panel 沒有出現，請從 Command Palette 執行 **Developer: Reload Window**。

## 快速開始

1. 在 VS Code panel area 打開 **Pixel Agents Multi**。
2. 點 **Refresh** 採用既有 Claude/Codex session。
3. 點 **+ Agent** 在指定 project 啟動新的 Codex agent。
4. 打開 **Agents** 檢查 active agent、usage、timeline 與 handoff。
5. 點角色可以 focus，接著點有效座位可以重新指定座位。
6. 使用 **Layout** 自訂辦公室。
7. 當某個 agent 的工作需要交給下游 executor，就從 Timeline 或 Handoff view 產生 reviewed work package。

## Provider 行為

### Codex

- 探測本地 Codex thread 與 project metadata。
- 讀取 transcript/rollout event 推測 active、waiting、complete、abort、error 等狀態。
- 支援從 package-backed handoff 直接 launch executor。
- 將 launch 後的 executor metadata 連回 handoff sidecar。
- 以 read-only 方式讀取本地 branch/report 狀態，不會修改 git state。

### Claude

- 探測 Claude Code JSONL project transcript。
- hook event 可用時會用 hook 取得更快、更可靠的狀態更新。
- 可探測 active 的 Claude Desktop/Cowork local-agent-mode metadata。
- 可出現在 Agent Center、Usage、Timeline、Replay 與 Handoff context。
- 直接從 package 啟動 Claude executor 目前暫緩，等 Claude launcher 能安全注入 prompt 後再做。

## 資料與隱私

Pixel Agents Multi 是 local-first。它不會呼叫 Claude 或 OpenAI API 來觀測 session，而是讀取本地 CLI/session metadata，並在 VS Code 內視覺化。

主要本地資料位置：

- `~/.pixel-agents/layout.json`：共享的 user-level office layout
- `~/.pixel-agents/config.json`：extension config，例如 external asset directory
- `~/.pixel-agents/server.json`：本地 hook server discovery
- `docs/agent-handoffs/`：Markdown handoff 與 `.handoff.json` sidecar
- `docs/roadmap/supervision/work-packages/`：executor work-package spec
- `docs/roadmap/supervision/reports/`：executor completion report

extension 在檢查 handoff completion 時不會 stage、commit、push、merge、reset、stash、clean、delete branch 或 rebase。Completion detection 是 read-only。

## 開發

```bash
npm run build
npm run test:webview
npm run test:server
npm test
```

其他常用指令：

```bash
npm run check-types
npm run lint
npm run package:vsix
npm run verify:release
```

extension backend 位於 `src/`，standalone hook/server code 位於 `server/`，React/canvas webview 位於 `webview-ui/`。

## Windows 發行檢查

從這個 repository 分享 VSIX 前，請在乾淨 worktree 執行：

```powershell
git status --short --branch
npm run check-types
npm run test:webview
npm run test:server
npm run build
npm run verify:identity
npm run verify:vsix
npm run package:vsix
npm run install:local
npm run verify:installed
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

接著 reload VS Code 並 smoke-test：

1. 打開 Pixel Agents Multi panel，點 **Refresh**。
2. provider filter 設為 **All**。
3. 確認 active Codex 與 Claude agent 都能顯示正確 project label。
4. 打開 **Agents**，確認 Usage tab 會顯示 totals 或 empty state，而不是空白。
5. 確認 VSIX 檔名是 `pixel-agents-multi-1.3.0.vsix`，installed id 是 `raychen.pixel-agents-multi`。

## 已知限制

- Session sync 仍然是 adapter-based，因為 Claude 與 Codex 沒有提供共用的 live-agent API。
- Claude Desktop/Cowork status 可能不如 Claude Code hook event 精準。
- Usage/cost 顯示是監督用估算，不是 provider billing record。
- 目前 Codex 是支援直接 handoff executor launch 的路徑；Claude launch 是後續工作。
- 如果同時工作的 agent 比有效工作位更多，部分 agent 可能需要等待桌位。
- UI-heavy change 後仍建議做 manual desktop QA，因為 VS Code webview、terminal 與本地 CLI 會受平台差異影響。

## Troubleshooting

如果 agent 沒出現或看起來狀態過舊：

1. 在 toolbar 或 Agent Center 點 **Refresh**。
2. 確認 provider filter 設為 **All**。
3. 打開 Settings 並啟用 **Debug View**，檢查 JSONL/session path、timestamp、runtime state、seat state 與近期 webview event。
4. 如果在 Extension Development Host 中執行，打開 **View > Debug Console** 並搜尋 `[Pixel Agents]`。
5. Windows 上安裝本地 VSIX 後，請確認 VS Code 已經 reload。
6. Codex 請確認 CLI 已登入，而且預期 project 底下有 local thread。
7. Claude 請確認 Claude Code CLI path setting 正確，尤其是要從 extension 啟動 Claude 時。

## Roadmap

近期方向是把本地個人監督體驗做到穩：

- 更可靠的 Claude launch 與 package dispatch。
- 更好的 usage intelligence、context health 與 stale-work detection。
- 更強的 timeline replay 與 report-ready workflow。
- 讓 pixel office visualization 與大型 inspection page 分工更清楚。
- 更安全的 multi-agent queue operation 與 completion status review。

長期產品方向是 team/lab 模式：讓 3 到 5 人可以在同一個平台上，看見彼此的 agent 工作狀態、repo handoff、溝通、資料交換、usage 與 project 協作。但這會等本地單人控制室穩定後再往上發展。

## Community & Contributing

使用 [Issues](https://github.com/ray24724919/pixel-agents-multi/issues) 回報 bug 或提出 feature request。到 [Discussions](https://github.com/ray24724919/pixel-agents-multi/discussions) 交流想法與問題。

請參考 [CONTRIBUTING.md](CONTRIBUTING.md) 了解貢獻方式，並在參與前閱讀 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ray24724919/pixel-agents-multi&type=Date)](https://www.star-history.com/?repos=ray24724919%2Fpixel-agents-multi&type=date&legend=bottom-right)

## License

本專案採用 [MIT License](LICENSE)。
