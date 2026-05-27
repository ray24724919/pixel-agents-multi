# Rest/Work Zone + Token/Cost + Hide/Archive/Kill + Team Meeting Mode 規劃草稿

本文面向 Pixel Agents 專案 owner，整理四個相互關聯的 roadmap 主題：空間區域系統、Token/Cost 設定與顯示、安全操作語意，以及 Team Meeting Mode。目標不是一次做完所有細節，而是定義可以分階段落地的產品語意與驗收邊界。

## 目標

- 讓 agent 的「工作中、休息中、待命中」不只靠文字狀態，而能由房間位置、家具與 provider 狀態共同表達。
- 讓 owner 可以理解並控制每個 agent、project、provider 的 token 與成本風險。
- 讓 Hide、Archive、Kill 的操作語意清楚、安全，避免誤以為只是 UI 隱藏卻實際中斷工作，或以為已中斷但 provider 仍在消耗資源。
- 讓多 agent 討論從「一串 logs」升級成有 supervisor、child agents、team 感的會議體驗。

## 區域系統設計

### 第一版：右半邊預設 Rest Zone

第一版採低成本、可預期的規則：房間右半邊預設為 rest zone，左半邊保留為 work zone。這讓現有房間不用增加編輯器就能先產生清楚語意。

- `x < room.width / 2`：預設 work zone。
- `x >= room.width / 2`：預設 rest zone。
- rest zone 內 agent 可以呈現坐下、放鬆、待命、低亮度或低活動量動畫。
- work zone 內 agent 維持面向電腦、白板、桌面或任務物件的工作表現。
- 第一版不要求 owner 手動配置 zone，重點是先讓 agent 行為和畫面有「休息區」概念。

這一版也應該提供最小的 debug overlay：顯示 agent 當前所在 zone、判斷來源為 `default-split`，方便之後排查家具與動線問題。

### 第二版：Zone Paint

第二版加入 zone paint，讓 owner 可以直接在地板上塗出區域。這適合房間布局開始變複雜，或右半邊不一定都是休息區的情境。

- 支援至少兩種 paint：`work`、`rest`。
- 可預留 `meeting`、`focus`、`blocked`、`transit` 類型，但第一個可用版本不必全部開放。
- paint 資料應該存在 room layout，而不是存在單一 agent 狀態。
- zone paint 優先權高於第一版 default split。
- UI 上可用半透明地板色塊、hover tooltip、或編輯模式才顯示的網格呈現，避免日常畫面太吵。

判斷順序建議為：

1. 若 tile 或 polygon 有明確 zone paint，使用 paint zone。
2. 若家具 semantic tag 定義了可互動位置，使用 furniture-derived zone。
3. 否則 fallback 到第一版 default split。

### 第三版：Furniture Semantic Tags

第三版把家具本身變成語意來源，而不只是障礙物或裝飾。新增家具時，系統可以由 tag 推導 agent 行為、站位與 zone。

家具建議支援這些 semantic tags：

- `work_surface`：桌子、工作台、電腦桌。
- `computer`：可觸發 coding、monitoring、review 等工作狀態。
- `rest_seat`：沙發、休閒椅、懶骨頭。
- `meeting_anchor`：會議桌、白板、圓桌、站會區。
- `blocked_surface`：不可站立的桌面、沙發座面、櫃子上方。
- `approach_points`：家具周圍可站、可坐、可互動的位置。
- `facing_direction`：agent 使用家具時預設朝向。
- `capacity`：家具可同時容納幾個 agent。

核心原則是：agent 不應直接用家具 bounding box 當目的地，而應使用家具提供的 approach points 或 seat points。也就是「站在沙發旁或坐在沙發座位點」，不是「站在沙發圖片中心」。

## 新增家具後的工作/休息區判斷

新增家具時，zone 判斷不應只看家具名稱，而應建立一個小型分類流程：

1. 讀取家具 semantic tags。
2. 產生可通行區、不可站立區、互動點。
3. 根據 tag 對周邊 tile 加權，而不是直接覆蓋整個區域。
4. 合併 owner 的 zone paint。
5. 對 agent 目的地做合法性檢查。

例如新增一張沙發：

- 沙發本體標記為 `blocked_surface`，避免 agent 站在沙發上。
- 沙發的 seat points 標記為 `rest_seat`，允許坐下或休息動畫。
- 沙發前方一到兩格標記為 rest approach area，允許 agent 走近、聊天、等待。

例如新增一台電腦：

- 電腦本體和桌面標記為 `work_surface` / `computer`。
- 螢幕正前方或椅子位置標記為 work interaction point。
- 電腦附近不應自動吸引 idle agent，除非 agent 正在執行工作、等待 user input、或被明確 pin 到該 workstation。

### 避免電腦附近 Idle

如果 agent 沒有 active task，不能只因為電腦附近是 work zone 就停在螢幕旁。建議規則：

- idle agent 優先移往 rest zone、team common area 或自己的 desk-away point。
- active coding/review/debug task 才能占用 computer interaction point。
- waiting-for-user 狀態可停在 work zone，但要有 timeout；超過一段時間後移到附近的 standby point 或 rest zone。
- 若 project 正在高成本 provider 上執行，UI 可顯示「仍在 provider session 中」而不是讓 agent 的 idle 動畫暗示已停止消耗。

### 避免站在沙發上

移動系統需要把「可走」、「可站」、「可坐」、「可互動」分開：

- `walkable`：路徑可以經過。
- `standable`：agent 可以停留。
- `sittable`：agent 可以播放坐下姿勢。
- `interactable`：agent 可以面向並使用。

沙發座面可以是 `sittable`，但不一定是 `standable`。桌面與櫃子通常既不是 `walkable` 也不是 `standable`。這樣比單純碰撞框更符合 pixel room 的視覺直覺。

## Token/Cost 設定與顯示

成本資訊需要同時服務「當下知道有沒有燒錢」與「事後知道哪個 project 花了多少」。建議分三層：per agent、per project、per provider。

### Per Agent

- 顯示該 agent 當前 session 的 input/output token、估算成本、provider。
- 支援 agent-level soft budget，例如今天上限、單次任務上限。
- agent 卡片可顯示小型 cost badge：`$0.12 today`、`12k tokens`、`near budget`。
- 對 owner 而言，agent cost 用來回答「哪個 agent 正在花錢」。

### Per Project

- project dashboard 彙總所有 agent 在該 project 的成本。
- 支援 project budget、daily cap、monthly cap、或 demo-mode cap。
- 任務結束時可生成 cost summary，連到 transcript、artifacts、commits 或 PR。
- 對 owner 而言，project cost 用來回答「這個產品方向或客戶 demo 花了多少」。

### Per Provider

- provider 層要顯示 Claude、Codex、其他模型供應商各自的累積用量。
- 支援 provider-level rate card 或估算策略，並標記是否為精確值或估算值。
- 若 provider API 可回傳 usage，優先用 provider 回傳值；否則用本地 tokenizer / approximation。
- provider 設定應包含是否允許自動續跑、最大併發 session、預設模型與成本警戒。

### Claude 與 Codex 差異

Claude 與 Codex 在產品語意上不要硬塞成完全相同：

- Claude 類型 session 通常較接近 conversational agent，可把 token usage 綁在對話回合、tool use、artifact 生成上。
- Codex 類型 session 通常更接近 workspace-bound coding agent，成本應和 repo、branch、task、tool execution、diff 連在一起。
- Claude 的停止語意多半是停止或結束對話/stream；Codex 的停止語意還牽涉工作區狀態、執行中的 shell、dev server、git changes 與未完成任務。
- UI 可以共用 cost badge，但 detail drawer 應顯示 provider-specific metadata。

建議用統一資料模型承載：

- `provider`
- `model`
- `session_id`
- `agent_id`
- `project_id`
- `usage_source`
- `input_tokens`
- `output_tokens`
- `tool_tokens`
- `estimated_cost`
- `currency`
- `is_estimated`
- `started_at`
- `ended_at`

## Hide / Archive / Kill

這三個操作必須有非常清楚的安全語意，尤其當 provider session 可能仍在消耗成本時。

### Hide

Hide 是視覺層操作，不應改變 agent 的 provider session 或任務狀態。

- 從房間或列表中暫時隱藏。
- 不停止工作、不釋放 provider session、不清除 transcript。
- UI 必須標記 hidden agent 仍可能 active。
- 適合 owner 暫時降低畫面噪音。

Provider-specific 行為：

- Claude：不中斷 conversation 或 stream，除非使用者另外按 Stop/Kill。
- Codex：不中斷 shell、dev server、workspace task 或 pending diff。

### Archive

Archive 是產品層收納操作，表示這個 agent、任務或 project 暫時退出日常視圖，但歷史保留。

- 只能 archive 已完成、已停止、或明確可休眠的 session。
- 若仍有 active provider session，需先提示 owner 選擇 stop/kill、detach、或 keep running。
- 保留 transcript、cost summary、artifacts、provider metadata。
- 從預設房間與 active roster 移除，但可從 archive view 復原或查詢。

Provider-specific 行為：

- Claude：可封存 conversation 與 artifacts；若仍 streaming，需先停止。
- Codex：需檢查是否有執行中 command、未保存 artifact、未提交 diff、dev server；archive 前提供清單。

### Kill

Kill 是強制終止操作，語意是「立刻停止 provider 與本地工作」。這是高風險按鈕，必須比 Hide / Archive 更明顯。

- 停止 provider stream/session。
- 嘗試終止相關工具執行、shell process、背景 job。
- 標記 session 為 killed，保留已產生 transcript 與 partial artifacts。
- 需要二次確認，並顯示可能遺失的工作。
- Kill 後 agent 可留在房間中呈現 stopped/error 狀態，或移往 rest/idle 狀態，但不能看起來還在工作。

Provider-specific 行為：

- Claude：停止目前 generation / tool loop，標記回合為 interrupted。
- Codex：停止 coding loop、取消或終止 shell commands；若有未提交 diff，要保留 workspace changes 並提示 owner 後續處理。

建議 UI 文案：

- Hide：`隱藏顯示，工作照常進行`
- Archive：`收納到歷史，保留紀錄`
- Kill：`立即終止，可能留下未完成狀態`

## Team Meeting Mode

Team Meeting Mode 的重點是讓 owner 感覺自己在看一個團隊對談，而不是多個 agent log 並排。

### 角色語意

- `supervisor`：主持討論、分配問題、彙整決策、確認下一步。
- `child agents`：各自代表不同專長、任務或 repo context，回報觀察與建議。
- `team`：會議中的集合視角，用來呈現共識、分歧、待決事項。

### 視覺呈現

- agent 移動到 meeting zone 或 meeting_anchor 周圍。
- supervisor 站在白板、主桌、或畫面較中央的位置。
- child agents 依角色圍繞會議桌、白板或 team area。
- 發言時 agent 可有小型 speech bubble、speaker ring、或頭像 highlight。
- team consensus 可顯示在白板、meeting notes panel 或 decision strip。

### 對談感

Team Meeting Mode 不只是聊天 UI，而是有節奏的協作流程：

1. supervisor 開場：說明議題與目標。
2. child agents 依序提供觀察。
3. supervisor 追問衝突點或缺口。
4. team 形成 options、risks、decision、next actions。
5. owner 可插話、指定某個 agent 深挖、或結束會議。

對 owner 的體驗重點：

- 看得出誰在主持。
- 看得出誰正在說話。
- 看得出大家是否達成共識。
- 看得出會議後每個 agent 要做什麼。

### 成本與安全連動

Team Meeting Mode 可能同時啟動多個 provider session，因此要和 Token/Cost 深度連動。

- 進入前預估參與 agent、provider、budget。
- 會議中顯示 team-level cost meter。
- 接近 budget 時 supervisor 應提出「壓縮討論、只保留 summary、或停止部分 agent」。
- 結束時產出 meeting summary、決策、action items、成本摘要。

## 實作步驟

### Phase 1：Zone 與安全操作語意

- 建立 zone 判斷資料模型：`work`、`rest`、來源與 debug metadata。
- 實作右半邊預設 rest zone。
- 為 agent idle destination 加入 rest preference，避免無任務時停在電腦旁。
- 將 Hide / Archive / Kill 的狀態語意寫入前後端 contract。
- 在 UI 文案上明確區分三個操作。

### Phase 2：Token/Cost 基礎

- 建立 usage event schema，先支援 per agent、per project、per provider 彙總。
- 接上 Claude / Codex 的 usage metadata；無法精確取得時標記 estimated。
- 在 agent card、project view、provider settings 顯示成本摘要。
- 加入 budget warning，但先不做硬性自動 kill。

### Phase 3：Zone Paint 與 Furniture Tags

- 增加 zone paint 編輯與儲存。
- 為主要家具加入 semantic tags、blocked surface、approach points。
- 移動系統改用可站點 / 可坐點 / 互動點。
- 加入 overlay 檢查 zone、path、destination legality。

### Phase 4：Team Meeting Mode

- 建立 meeting session model，包含 supervisor、participants、agenda、state。
- 實作 meeting zone 集合與發言 highlight。
- 產出 meeting summary、decisions、action items、cost summary。
- 加入 owner 插話與指定 agent 回答的互動。

## 驗收標準

- 房間未設定 zone paint 時，右半邊 agent idle 會被判斷為 rest zone。
- agent 沒有 active task 時，不會長時間停在 computer interaction point。
- 新增沙發後，agent 可坐在 seat point 或站在 approach point，但不會站在沙發本體中心。
- Hide 不會停止 provider session；Archive 會阻擋或提示 active session；Kill 會終止 provider / local task 並保留紀錄。
- owner 可以在 agent、project、provider 三個層級看到 token / cost，且 Claude / Codex 差異有清楚標示。
- Team Meeting Mode 中能辨識 supervisor、目前發言者、child agents、team consensus 與 next actions。
- meeting 結束後可看到 summary、action items 與本次成本摘要。

## 風險

- Zone 規則過早複雜化會拖慢房間編輯與移動系統；第一版應刻意簡單。
- Token/cost 若混用精確值與估算值但沒有標示，會降低 owner 信任。
- Hide / Archive / Kill 若語意含糊，可能造成實際成本外流或誤殺工作。
- Codex 類 session 牽涉本地 process 與 workspace changes，Kill / Archive 的實作風險高於純 conversational provider。
- Team Meeting Mode 若只做視覺排隊，沒有真正的議程、共識與下一步，會像裝飾性動畫而不是團隊協作。
- Furniture semantic tags 需要工具與資料維護；若沒有 debug overlay，後續房間變多時會很難排查。
