# 狀態引擎、狀態泡泡、Timeline/Event Log 與 Session Replay 規劃草稿

## 目標與使用者價值

Pixel Agents 未來需要一個穩定、可解釋、可回放的 agent 執行狀態層。這份規劃的核心目標，是把 Claude、Codex 或其他 agent runtime 吐出的原始事件，整理成一致的 lifecycle status、可視化的頭上狀態泡泡、可追蹤的 Timeline/Event Log，以及後續 Session Replay 的資料基礎。

對專案 owner 的價值：

- 讓使用者一眼看懂每個 agent 現在在做什麼，而不是只看到「有東西在跑」。
- 降低多 agent 場景的混亂感，讓 thinking、tool running、等待使用者、等待權限等狀態有一致語言。
- 把 runtime 的瞬時事件沉澱成可查、可 debug、可回放的 event history。
- 為未來 Session Replay、問題診斷、使用者支援、benchmark replay 打底。
- 讓 UI 不直接綁死 Claude/Codex 的事件格式，未來可以接更多 provider。

## 標準 Lifecycle Status 設計

建議先定義一組 provider-agnostic 的 `AgentLifecycleStatus`，由狀態引擎維護，不讓 webview 或 canvas UI 直接判斷原始事件。

```ts
type AgentLifecycleStatus =
  | 'idle'
  | 'thinking'
  | 'tool_running'
  | 'waiting_user'
  | 'waiting_permission'
  | 'completed'
  | 'error';
```

### 狀態語意

| Status               | 語意                                                   | UI 主訊號                 |
| -------------------- | ------------------------------------------------------ | ------------------------- |
| `idle`               | agent 已就緒，沒有正在執行的 run                       | 安靜、低對比              |
| `thinking`           | model 正在推理、生成下一步、整理回覆                   | 動態 pulse 或 typing dots |
| `tool_running`       | agent 正在呼叫工具、執行 shell、讀寫檔案或等待工具結果 | 工具 icon、進度感         |
| `waiting_user`       | agent 需要使用者輸入、選擇或補充資訊                   | 問號/輸入提示             |
| `waiting_permission` | agent 等待使用者批准權限、命令、外部操作               | 鎖頭/盾牌提示             |
| `completed`          | 本次 run 正常完成                                      | 短暫成功狀態後回 idle     |
| `error`              | 本次 run 發生錯誤或被中斷且需要注意                    | 錯誤提示與可展開原因      |

### 延伸欄位

狀態本身只回答「現在屬於哪一類」。具體顯示文案與細節建議放在 metadata：

```ts
type AgentStatusSnapshot = {
  agentId: string;
  sessionId: string;
  runId?: string;
  status: AgentLifecycleStatus;
  label?: string;
  detail?: string;
  since: number;
  updatedAt: number;
  severity?: 'info' | 'success' | 'warning' | 'error';
  source?: 'claude' | 'codex' | 'system' | 'user';
  activeTool?: {
    name: string;
    callId?: string;
    command?: string;
  };
  pendingPermission?: {
    requestId: string;
    title: string;
    risk?: 'low' | 'medium' | 'high';
  };
};
```

## Claude/Codex 原始事件到標準狀態的映射

實作上建議新增一層 adapter：`RawRuntimeEvent -> NormalizedAgentEvent -> AgentStatusSnapshot`。Claude/Codex 的事件格式可能不同，但 UI 只吃 normalized 後的事件。

### Claude 類事件映射

| 原始事件類型                               | Normalized event                               | Status                                       |
| ------------------------------------------ | ---------------------------------------------- | -------------------------------------------- |
| user message submitted                     | `run.started`                                  | `thinking`                                   |
| assistant text delta / content block start | `assistant.thinking` 或 `assistant.responding` | `thinking`                                   |
| tool_use block start                       | `tool.started`                                 | `tool_running`                               |
| tool_result received                       | `tool.completed`                               | 若還有後續生成則 `thinking`，否則依 run 狀態 |
| permission prompt / approval required      | `permission.requested`                         | `waiting_permission`                         |
| user input required                        | `user_input.requested`                         | `waiting_user`                               |
| message stop / run completed               | `run.completed`                                | `completed`，短暫顯示後 `idle`               |
| error / overloaded / cancelled             | `run.failed` 或 `run.cancelled`                | `error`                                      |

### Codex 類事件映射

| 原始事件類型                              | Normalized event                  | Status                             |
| ----------------------------------------- | --------------------------------- | ---------------------------------- |
| turn started / task accepted              | `run.started`                     | `thinking`                         |
| assistant reasoning / plan update         | `assistant.thinking`              | `thinking`                         |
| exec command started                      | `tool.started`                    | `tool_running`                     |
| command stdout/stderr chunk               | `tool.output`                     | `tool_running`                     |
| command finished                          | `tool.completed`                  | `thinking` 或依下一個事件決定      |
| apply patch started/completed             | `tool.started` / `tool.completed` | `tool_running`                     |
| sandbox escalation requested              | `permission.requested`            | `waiting_permission`               |
| request_user_input                        | `user_input.requested`            | `waiting_user`                     |
| final response emitted                    | `run.completed`                   | `completed`，再轉 `idle`           |
| tool error / command failed / interrupted | `run.failed` 或 `tool.failed`     | 視可恢復性為 `thinking` 或 `error` |

### 狀態轉移原則

- `waiting_permission` 與 `waiting_user` 優先級最高，因為它們需要使用者介入。
- `tool_running` 優先於 `thinking`，因為工具執行通常代表明確可觀察的行動。
- `completed` 是短暫狀態，建議保留 1.5 至 3 秒後自動回到 `idle`。
- `error` 不自動消失，除非使用者重新開始 run、dismiss，或下一個 run 成功覆蓋。
- 同一 agent 同時間只應有一個主要 lifecycle status，但 timeline 可以保留多個並行子事件。

## Webview Message / State Shape 建議

主程序或 extension host 負責管理狀態引擎，webview 只接收狀態快照和 timeline patch。這樣可以讓 UI 重載後重建狀態，也方便未來 Session Replay。

### Webview message

```ts
type PixelAgentsWebviewMessage =
  | {
      type: 'agent.status.snapshot';
      payload: AgentStatusSnapshot;
    }
  | {
      type: 'agent.timeline.append';
      payload: TimelineEvent;
    }
  | {
      type: 'agent.timeline.replace';
      payload: {
        sessionId: string;
        events: TimelineEvent[];
      };
    }
  | {
      type: 'agent.run.started';
      payload: {
        agentId: string;
        sessionId: string;
        runId: string;
        startedAt: number;
      };
    }
  | {
      type: 'agent.run.ended';
      payload: {
        agentId: string;
        sessionId: string;
        runId: string;
        endedAt: number;
        outcome: 'completed' | 'error' | 'cancelled';
      };
    };
```

### Webview state

```ts
type PixelAgentsState = {
  sessionId: string;
  agents: Record<
    string,
    {
      id: string;
      name: string;
      status: AgentStatusSnapshot;
      currentRunId?: string;
    }
  >;
  timeline: {
    byId: Record<string, TimelineEvent>;
    orderedIds: string[];
    cursor?: string;
    hasMoreBefore: boolean;
  };
  replay?: {
    mode: 'off' | 'playing' | 'paused';
    currentTime?: number;
    speed: 0.5 | 1 | 2 | 4;
  };
};
```

## Agent 頭上狀態泡泡 UI 行為

頭上狀態泡泡應該是「低干擾但可理解」的即時訊號，不應取代完整 timeline。

### 顯示規則

- `idle`：預設不顯示泡泡，或只在 hover/selection 時顯示簡短狀態。
- `thinking`：顯示「思考中」與三點動畫，可搭配 subtle pulse。
- `tool_running`：顯示工具名稱，例如「執行 shell」、「讀取檔案」、「套用 patch」。
- `waiting_user`：顯示「需要你的回覆」，並讓 agent 或泡泡有較高視覺優先級。
- `waiting_permission`：顯示「等待授權」，顏色應偏 warning，但不要像錯誤。
- `completed`：短暫顯示「完成」或 check icon，接著淡出。
- `error`：顯示「發生問題」，保留直到下一次互動或使用者 dismiss。

### 互動規則

- 點擊泡泡打開該 agent 的 timeline filter 或 event detail。
- hover 顯示更完整 detail，例如 active tool command、等待原因、錯誤摘要。
- 多 agent 同時活動時，泡泡尺寸與動畫要節制，避免 canvas 變成警示燈面板。
- 泡泡應由 `AgentStatusSnapshot` 驅動，不直接訂閱 raw runtime event。

## Timeline/Event Log 資料模型與 UI

Timeline 是事實來源。狀態泡泡是 timeline 的即時摘要；Session Replay 則是 timeline 的時間軸播放。

### TimelineEvent 資料模型

```ts
type TimelineEventKind =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'assistant.message'
  | 'assistant.thinking'
  | 'tool.started'
  | 'tool.output'
  | 'tool.completed'
  | 'tool.failed'
  | 'permission.requested'
  | 'permission.resolved'
  | 'user_input.requested'
  | 'user_input.received'
  | 'state.changed';

type TimelineEvent = {
  id: string;
  sessionId: string;
  agentId: string;
  runId?: string;
  parentId?: string;
  timestamp: number;
  kind: TimelineEventKind;
  title: string;
  summary?: string;
  statusAfter?: AgentLifecycleStatus;
  severity?: 'info' | 'success' | 'warning' | 'error';
  source: 'user' | 'agent' | 'tool' | 'system';
  payload?: unknown;
  visibility: 'default' | 'verbose' | 'debug';
};
```

### UI 建議

- 預設顯示 compact timeline：使用者訊息、agent 回覆、工具開始/完成、等待授權、錯誤。
- 提供 filter：全部、目前 agent、目前 run、工具事件、錯誤與等待。
- tool output 預設折疊，避免 stdout/stderr 長內容淹沒主要流程。
- 同一 tool call 可合併成一個 expandable group，內含 started、output chunks、completed。
- 每個 event detail 應顯示 timestamp、agent、runId、來源、payload 摘要。
- Timeline 應支援從最新事件自動跟隨，但使用者往上捲後暫停 auto-follow。

## Session Replay 與 Timeline 的關係

Session Replay 不應該從 UI DOM 錄影開始。更可控的做法，是先建立可重播的 timeline event stream，再讓 replay player 依時間重新套用事件，重建 agent 狀態、泡泡、timeline selection 與主要畫面變化。

### 為何依賴 Timeline

- Timeline 是跨 provider 的標準事件格式，可避免 replay 綁死 Claude/Codex raw event。
- Replay 需要 deterministic 的狀態轉移；timeline event 比 UI 錄影更容易 debug。
- 同一份 timeline 可以同時服務產品 UI、debug log、支援回報與 replay。
- 未來可以做局部 replay，例如只回放某個 agent 或某次 run。

### MVP 分界

MVP 先做「事件級 replay」，不追求完整像素級錄影：

- 可載入一段 session timeline。
- 可播放、暫停、調整速度。
- 播放時重建 agent lifecycle status 與頭上泡泡。
- Timeline 游標跟著播放時間移動。
- 可跳到任一事件，UI 套用該事件前後的狀態快照。

進階版再做：

- replay canvas 上 agent 位置、選取狀態、視角縮放與使用者操作。
- replay tool output streaming 的節奏，而不是只顯示完成結果。
- 支援分支 replay：從某個事件 fork 出新的 run。
- 支援紅線比較：兩次 run 的 timeline diff。
- 支援匯出 replay bundle，用於 bug report 或 demo。

## 實作步驟

1. 定義 shared types
   - 建立 `AgentLifecycleStatus`、`AgentStatusSnapshot`、`TimelineEvent`。
   - 明確區分 raw event、normalized event、status snapshot。

2. 建立 status engine
   - 實作 `applyEvent(previousState, normalizedEvent)`。
   - 處理狀態優先級、completed 自動回 idle、error 保留策略。

3. 建立 Claude/Codex adapter
   - 把 provider 原始事件轉成 normalized events。
   - 保留 raw payload reference，但 UI 不直接依賴 raw schema。

4. 串接 webview messages
   - runtime 收到事件後 append timeline。
   - status engine 更新 snapshot。
   - webview 收到 append 與 snapshot 後更新 store。

5. 實作頭上狀態泡泡
   - 由 `AgentStatusSnapshot` 驅動。
   - 先支援文字、icon、顏色、hover detail、click 開 timeline filter。

6. 實作 Timeline/Event Log MVP
   - 先做 append-only list、基本 filter、event detail。
   - 對 tool output 做折疊與 group。

7. 實作 Session Replay MVP
   - 以 timeline 為輸入。
   - 播放時從空狀態或 checkpoint 重建狀態。
   - 支援 play/pause/speed/jump-to-event。

## 驗收標準

- 任一 agent run 開始後，UI 能在 200ms 內顯示 `thinking` 或下一個準確狀態。
- tool call 期間狀態泡泡顯示 `tool_running`，並能看到工具名稱。
- 權限請求期間顯示 `waiting_permission`，且不會被後續 stdout/tool event 覆蓋。
- 使用者輸入請求期間顯示 `waiting_user`，直到收到輸入或 run 結束。
- run 正常完成後短暫顯示 `completed`，接著回 `idle`。
- error 狀態會留在畫面上，並可從 timeline 找到對應錯誤 event。
- Timeline 能依 agent、run、event kind filter。
- tool output 預設不淹沒 timeline，需可展開查看。
- webview reload 後可由最近 snapshot 與 timeline 重建 UI。
- Replay MVP 可以用同一份 timeline 重播狀態泡泡與 event 游標。

## 風險與注意事項

- Provider event schema 可能變動：adapter 要集中管理，避免散落在 UI。
- 狀態過度閃爍：需要 debounce、最短顯示時間與 completed idle delay。
- tool output 過大：timeline payload 應做摘要、截斷或外部引用。
- 多 agent 並行：要避免全域狀態覆蓋 per-agent 狀態。
- Replay deterministic 難度：MVP 應先回放 normalized event，不承諾完整 UI 操作重現。
- 隱私與安全：timeline 可能包含 command、檔名、prompt、tool output，未來匯出 replay bundle 前要有 redaction 機制。
- 錯誤分類：tool failed 不一定等於 run failed，狀態引擎要允許可恢復錯誤。
