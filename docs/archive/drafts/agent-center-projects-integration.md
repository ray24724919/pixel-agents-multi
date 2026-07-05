# Agent Center 任務中心 + Project Dashboard + VS Code/Terminal Integration 規劃草稿

## 目標與定位

本草稿規劃將 Pixel Agents 目前偏「agent 清單」的 Agent Center，升級成 owner 可以直接掌握、切換、干預與回顧工作的任務中心。核心方向是把 agent、thread、project、terminal session、timeline event 與 token/kill 等控制能力整合成同一個操作面，而不是只顯示「有哪些 agent 正在跑」。

預期成果：

- owner 可以從 Agent Center 看見所有進行中、等待中、已完成、失敗或被中止的任務。
- owner 可以依 project 聚合 agent/thread 狀態，快速知道每個專案目前卡在哪裡。
- owner 可以從 task/agent detail 直接 Focus、Open Project、Open transcript、Kill、查看 timeline 與 token 使用量。
- VS Code/Terminal integration 先以可行、低風險、跨平台的方式落地，再逐步演進成更深的 IDE 工作流。

## Agent Center：從清單升級為任務中心

### UI 架構

Agent Center 建議改為三層式資訊架構：

1. 全域任務總覽
   - 顯示所有 active、queued、blocked、done、failed、killed 任務。
   - 頂部提供狀態篩選、project 篩選、provider 篩選、搜尋。
   - 提供「只看需要我介入」視角，例如 approval pending、terminal idle、error waiting、high token spend。

2. 任務列表
   - 每列以 task/thread 為主體，而不是只以 agent process 為主體。
   - 欄位建議包含：任務標題、project、agent/provider、目前狀態、最後事件、執行時間、token 使用、是否有可用控制動作。
   - 狀態顏色應由狀態引擎輸出，不在前端自行推測。

3. Agent detail panel
   - 點選任務後在右側或 drawer 顯示詳細資訊與 controls。
   - 詳情包含 task summary、project context、agent/provider、thread/transcript、timeline、token、terminal/session metadata。

### 資料設計

建議前端資料模型以 `TaskRun` 或 `AgentTask` 為中心，而不是直接綁死在 process/session 上：

```ts
type AgentTask = {
  id: string;
  title: string;
  projectId: string;
  threadId: string;
  agentId: string;
  provider: 'codex' | 'claude' | 'cursor' | 'custom';
  status: TaskStatus;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  cwd?: string;
  branch?: string;
  transcriptRef?: string;
  terminalRef?: string;
  tokenUsage?: TokenUsageSummary;
  controls: AgentControl[];
};
```

狀態應由後端或共享狀態引擎統一產生：

```ts
type TaskStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_user'
  | 'waiting_for_tool'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'killing'
  | 'killed';
```

timeline event 建議採 append-only event stream，讓 UI 能重建歷史、支援 transcript 跳轉，也避免前端依賴易碎的 terminal output parsing：

```ts
type TimelineEvent = {
  id: string;
  taskId: string;
  type:
    | 'status_changed'
    | 'message'
    | 'tool_call'
    | 'tool_result'
    | 'approval_requested'
    | 'file_changed'
    | 'terminal_output'
    | 'token_usage'
    | 'kill_requested'
    | 'process_exited';
  timestamp: string;
  summary: string;
  payload?: unknown;
};
```

## Project Dashboard 建議呈現方式

Project Dashboard 的角色是 project-level command center，回答 owner 最常問的四件事：

- 這個 project 現在有哪些 agent/thread 在動？
- 哪些任務已完成、卡住、失敗、等待我？
- 使用了哪些 provider，成本與 token 分布如何？
- 我可以從哪裡打開 repo、terminal、transcript 或相關任務？

### Tabs

建議 tabs：

- Overview：project summary、目前任務狀態、近期 timeline 摘要。
- Threads：thread list、狀態、owner action、最後活動時間。
- Agents：依 agent/provider 顯示 active sessions 與能力來源。
- Timeline：project-scoped timeline，可依 event type 篩選。
- Tokens：token/cost 趨勢、provider 分布、異常高用量提醒。
- Settings：project path、default provider、terminal profile、VS Code workspace 設定。

MVP 可以先做 Overview、Threads、Timeline；Tokens 與 Settings 可在進階版補齊。

### Project Summary

Overview 頂部建議用密集但清楚的 summary layout：

- Project name / repo path / current branch。
- Active tasks、waiting tasks、failed tasks、completed today。
- Last activity 與目前最需要 owner 注意的 action。
- 快捷 controls：Open Project、Open Terminal、New Agent Task。

避免做成行銷式大卡片；這是工作台，資訊密度要足夠高。

### Provider 分布

Provider distribution 建議以小型 bar/stacked chart 呈現：

- running task count by provider。
- token usage by provider。
- failed/killed rate by provider。
- average duration by provider。

MVP 可以只提供 count 與 token summary；進階版再加入成本估算、成功率、平均耗時。

### Thread List

Thread list 應是 Dashboard 的核心工作區：

- Thread title / task summary。
- Status badge。
- Agent/provider。
- Last timeline event。
- Token usage。
- Branch/cwd。
- Actions：Focus、Open transcript、Open terminal、Kill。

列表應支援：

- 狀態篩選。
- 文字搜尋。
- 依 last activity 排序。
- 顯示「需要 owner action」的固定區塊。

## Agent Detail Panel 與 Controls

Agent detail panel 是 owner 對單一任務做判斷與控制的地方。建議包含：

### Detail Sections

- Header：task title、status、provider、elapsed time、project。
- Context：project path、branch、thread id、agent id。
- Current state：最後一個狀態事件、等待原因、下一個可用動作。
- Timeline：狀態變更、tool calls、approval、terminal output 摘要。
- Token：input/output/cache/total，必要時顯示 provider cost estimate。
- Transcript：最近幾則 assistant/user/tool 訊息摘要，提供完整 transcript 入口。

### Controls

建議 controls 由後端根據狀態輸出可用性，前端只負責顯示：

- Focus：把 UI 焦點切到該 task/thread，若有 terminal/session 可同步聚焦。
- Open Project：開啟 project dashboard 或 repo workspace。
- Open transcript：開啟完整對話紀錄。
- Open terminal：開啟或聚焦相關 terminal session。
- Kill：請求中止 agent/process，進入 `killing` 狀態並等待 process exit event。
- Retry / Resume：進階版，需依狀態引擎定義可恢復條件。

`Kill` 不應只是前端按鈕直接殺 process。建議流程為：

1. UI 發出 kill request。
2. 狀態引擎記錄 `kill_requested` timeline event。
3. backend/process manager 執行中止。
4. 收到 exit 後轉為 `killed` 或 `failed`。
5. UI 顯示結果與 transcript/timeline 保留入口。

## VS Code Terminal / Project Integration

### 可行方法

MVP 建議採「外部開啟 + metadata 關聯」方式，不先做 VS Code extension：

- 使用 repo path / workspace path 產生 Open Project action。
- 若本機環境可用 `code` CLI，可執行 `code <projectPath>` 或 `code <workspaceFile>`。
- Terminal integration 先以 Pixel Agents 自己管理的 terminal/session 為主，記錄 `terminalRef`、cwd、shell、pid、status。
- 若 task 來自 VS Code 內建 terminal，先透過明確 metadata 或啟動 wrapper 建立關聯，而不是解析 terminal 標題。

進階版可以考慮 VS Code extension：

- extension 將 active workspace、terminal id、selected file、git branch 回報給 Pixel Agents。
- Pixel Agents 可以從 Dashboard 發送 focus/open transcript/open terminal 的 deep link 或 command。
- extension 提供 sidebar webview，嵌入 Agent Center 或 Project Dashboard 的 project-scoped view。

### Deep Link 與 Command URI

可設計 Pixel Agents 自有 deep link：

- `pixel-agents://project/:projectId`
- `pixel-agents://thread/:threadId`
- `pixel-agents://task/:taskId`

VS Code 方向可搭配：

- `vscode://file/<absolutePath>`
- `vscode://vscode.git/checkout?...` 這類內建 command 需非常謹慎，避免過度依賴 undocumented 行為。
- 若有 extension，使用 extension 自己註冊的 command URI 會比較穩。

### 限制

- `code` CLI 不一定存在，且不同 OS 安裝方式不同。
- browser/app sandbox 可能無法直接啟動本機 IDE，需要使用者授權或系統層 bridge。
- VS Code terminal 沒有穩定的外部 API 可任意 focus 某個既有 terminal，除非透過 extension 協作。
- 只靠 cwd/process pid 無法可靠判斷 terminal 屬於哪個 project/thread。
- terminal output parsing 容易脆弱；應優先依靠 agent runtime event、process manager event 與 transcript/timeline。
- 多 provider、多 agent runtime 的 kill/resume 語意不一致，需要狀態引擎抽象化。

## 和狀態引擎 / Timeline / Token / Kill 動作的相依關係

這個 roadmap 依賴四個底層能力成熟：

### 狀態引擎

Agent Center 與 Dashboard 不應自行推測狀態。狀態引擎需要提供：

- task/thread/project 的 canonical status。
- 狀態轉移規則。
- 可用 controls。
- waiting/blocked 的 reason。
- process exit、tool error、approval pending、kill pending 的一致語意。

### Timeline

Timeline 是 UI 可觀測性的基礎：

- Project Dashboard 用 project-scoped timeline 顯示近期活動。
- Agent detail 用 task-scoped timeline 顯示完整脈絡。
- Transcript 與 terminal output 需要能互相跳轉或至少同時被同一 task/thread 關聯。
- Kill、token update、approval、tool call 都應寫入 timeline。

### Token

Token 資料支援 owner 進行成本與效率判斷：

- task-level token usage。
- thread-level accumulated token usage。
- project-level provider distribution。
- high usage alert 或 budget warning。

MVP 可先顯示 token total 與 provider 分布；進階版再做成本估算與趨勢圖。

### Kill

Kill 是控制面最敏感的動作，需要明確設計：

- UI 顯示 kill eligibility。
- kill request 必須被 timeline 記錄。
- backend 需回報 killing/killed/failed。
- transcript、timeline 與 partial output 必須保留。
- 若 provider/runtime 不支援可靠 kill，要顯示限制而不是假裝成功。

## 實作步驟

### Phase 1：資料與狀態基礎

- 定義 `AgentTask`、`TaskStatus`、`TimelineEvent`、`TokenUsageSummary`。
- 建立狀態引擎輸出的 canonical status 與 controls。
- 將現有 agent/thread/process/session 映射到 task-centric model。
- 補齊 task-level timeline event 寫入。
- 補齊 token usage summary 的讀取 API。

### Phase 2：Agent Center MVP

- 將現有 agent list 改為 task list。
- 加入 status/project/provider 篩選。
- 加入「需要 owner action」視角。
- 實作 detail panel：summary、timeline、token、transcript link。
- 實作 Focus、Open transcript、Kill 的第一版 controls。

### Phase 3：Project Dashboard MVP

- 建立 project overview route。
- 加入 Overview、Threads、Timeline tabs。
- Overview 顯示 project summary 與 active/waiting/failed counts。
- Threads 顯示 project-scoped thread/task list。
- Timeline 顯示 project-scoped event stream。
- Open Project action 先連到 project route 或本機 path action。

### Phase 4：Terminal / VS Code Integration

- 建立 project path、cwd、terminalRef、pid/session metadata 關聯。
- 實作 Open Terminal / Focus terminal 的可用能力偵測。
- 若存在 `code` CLI 或 host bridge，提供 Open in VS Code。
- 定義 fallback：無法開 IDE 時顯示 path 與 terminal/session 資訊。
- 評估 VS Code extension 的必要性與 API surface。

### Phase 5：進階版

- Token/cost dashboard。
- Provider performance distribution。
- Retry/Resume controls。
- VS Code extension/sidebar。
- Deep links 與 command routing。
- Budget alerts、long-running task alerts、stuck detection。

## MVP 範圍

MVP 應優先完成：

- Agent Center task list。
- canonical status badge。
- project/provider/status filters。
- Agent detail panel。
- task timeline。
- transcript link。
- token total。
- Focus / Open transcript / Kill。
- Project Dashboard 的 Overview、Threads、Timeline。

MVP 暫不強求：

- VS Code extension。
- 完整成本估算。
- Retry/Resume。
- terminal focus 的跨平台完美支援。
- provider performance analytics。

## 進階版範圍

進階版可以加上：

- VS Code extension 與 sidebar。
- Open terminal / focus terminal 的穩定 IDE 協作。
- provider 成本、速度、成功率比較。
- thread/task dependency map。
- stuck detection 與 owner action inbox。
- task templates 與 project playbooks。
- multi-agent orchestration view。

## 驗收標準

### Agent Center

- owner 能在 10 秒內看出目前有哪些任務正在跑、哪些等待介入、哪些失敗。
- 每個 task 都有一致 status、project、provider、last activity。
- 點選 task 可看到 detail panel、timeline、token 與 transcript link。
- Kill 動作會進入 `killing`，並在後端回報後顯示 `killed` 或失敗原因。
- 前端不需要解析 terminal output 才能判斷 task status。

### Project Dashboard

- owner 能進入任一 project，看到 summary、thread list、timeline。
- Threads tab 能依 status/provider/last activity 找到目標任務。
- Provider 分布至少能顯示 task count 與 token usage。
- Open Project 至少有可用 fallback；若無法啟動 IDE，仍清楚顯示 project path。

### VS Code / Terminal

- 系統能辨識 task 關聯的 cwd/project path。
- 系統能顯示 terminal/session metadata。
- 可用時能開啟 VS Code project；不可用時不報假成功。
- terminal integration 的限制有明確 UI 狀態與錯誤訊息。

## 主要風險

- 狀態來源分散，導致 Agent Center、Dashboard、terminal 各自顯示不同狀態。
- kill 語意在不同 provider/runtime 下不一致，可能造成 UI 顯示已中止但 process 仍存在。
- terminal/session 關聯若只靠 cwd 或 process title，容易誤判。
- token usage 資料若延遲或缺漏，provider 分布與成本提示會不可靠。
- VS Code integration 若過早綁定 extension，會拉高 MVP 複雜度。
- timeline event schema 若太鬆散，後續很難做搜尋、篩選與分析。

## 建議決策

建議先把 Agent Center 與 Project Dashboard 建在 task-centric model、canonical status engine 與 append-only timeline 上。VS Code/Terminal integration 第一版採 metadata + open action + fallback，不先承諾完整 terminal focus。這樣可以讓 owner 先獲得任務中心與 project command center 的價值，同時保留未來透過 VS Code extension 做深度整合的空間。
