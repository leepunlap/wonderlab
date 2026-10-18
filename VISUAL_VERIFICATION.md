# Model Selector — Visual Verification

## Expected UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ AI 學伴                              [原型·模擬回覆] [✕] │
├─────────────────────────────────────────────────────────┤
│ [對話] [版本 0] [說明]                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 選擇 AI 模型                                        │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ◉ DeepSeek Chat              8/10                  │ │
│ │   快速回應，適合一般對話                            │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ○ DeepSeek R1                3/5                   │ │
│ │   深度推理，可顯示思考過程                          │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ 本課今日: 20/25    今日總共: 45/60                  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ 你 ──────────────────────────────────────────────┐  │
│ │ 加一個角色                                         │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ AI ──────────────────────────────────────────────┐  │
│ │ 好！我幫你加一個角色「小貓」                       │  │
│ │ [已修改: 小貓 s1]                                  │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 💬 本次: 40 in, 41 out · $0.0012 HKD                  │
│ 📊 本節: 80 in, 82 out · $0.0024 HKD     [重設本節]   │
├─────────────────────────────────────────────────────────┤
│ [輸入訊息...                                      ] [↑] │
└─────────────────────────────────────────────────────────┘
```

## With R1 Selected + Thinking Enabled

```
┌─────────────────────────────────────────────────────────┐
│ AI 學伴                              [原型·模擬回覆] [✕] │
├─────────────────────────────────────────────────────────┤
│ [對話] [版本 0] [說明]                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 選擇 AI 模型                                        │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ○ DeepSeek Chat              7/10                  │ │
│ │   快速回應，適合一般對話                            │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ◉ DeepSeek R1                2/5                   │ │
│ │   深度推理，可顯示思考過程                          │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ☑ 顯示推理過程                                      │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ 本課今日: 19/25    今日總共: 44/60                  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ 你 ──────────────────────────────────────────────┐  │
│ │ 點咗執行冇反應點算？                               │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ AI ──────────────────────────────────────────────┐  │
│ │ ┌─ 🤔 推理過程 ─────────────────────────────────┐ │  │
│ │ │ 學生說「點咗執行冇反應」，我要分析：           │ │  │
│ │ │ 1. 檢查是否有 when flag clicked 事件           │ │  │
│ │ │ 2. 檢查 scripts 是否為空                       │ │  │
│ │ │ 3. 檢查是否有 wait hat 導致程式等待輸入       │ │  │
│ │ │ 程式目前冇任何積木，所以點執行冇反應係正常     │ │  │
│ │ └───────────────────────────────────────────────┘ │  │
│ │                                                    │  │
│ │ 你未加任何積木，所以點執行冇反應。試下加一個    │  │
│ │ 「當綠旗被點擊」同「移動 10 步」積木？          │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 💬 本次: 45 in, 38 out, 120 reasoning · $0.0089 HKD   │
│ 📊 本節: 125 in, 120 out, 120 rsn · $0.0113 HKD  [重設]│
├─────────────────────────────────────────────────────────┤
│ [輸入訊息...                                      ] [↑] │
└─────────────────────────────────────────────────────────┘
```

## Color Coding

### Usage Indicators
- **Green (>50%)**: `8/10` — plenty left
- **Yellow (20-50%)**: `3/5` — moderate usage
- **Red (<20%)**: `1/5` — running low

### Cost Display
- **Normal (<$0.01 HKD)**: Black text
- **Moderate ($0.01-0.10)**: Yellow text
- **High (>$0.10)**: Red text

### Model Badges
- **Selected**: Blue border, filled radio button
- **Disabled**: Grayed out, no pointer events
- **Supports Thinking**: Shows checkbox when selected

## Responsive Behavior

### Desktop (>768px)
```
┌─────────────────┬────────────────────────────────┐
│                 │ AI 學伴                        │
│                 ├────────────────────────────────┤
│   Scratch       │ [對話] [版本] [說明]          │
│   Editor        ├────────────────────────────────┤
│   (75%)         │ [Model Selector]               │
│                 │ [Chat History]                 │
│                 │ [Token Status]                 │
│                 │ [Input Box]                    │
└─────────────────┴────────────────────────────────┘
```

### Mobile (<768px)
```
┌───────────────────────────┐
│   Scratch Editor (100%)   │
│                           │
│                           │
│                           │
│                           │
└───────────────────────────┘
[🤖] ← Floating button

(Tap button → drawer slides up)

┌───────────────────────────┐
│ AI 學伴                   │
├───────────────────────────┤
│ [Model Selector]          │
│ [Chat]                    │
│ [Token Status]            │
│ [Input]                   │
└───────────────────────────┘
```

## Interaction States

### Model Selection
1. **Initial Load**
   - Fetch `/api/ai/status/studio`
   - Render models with usage indicators
   - Select default model (deepseek-chat)
   - Show usage stats at bottom

2. **Switch Model**
   - Click radio button
   - Gray out previous, highlight new
   - Show/hide thinking checkbox (R1 only)
   - Update usage stats
   - Fire `onModelChange` callback

3. **Toggle Thinking**
   - Only visible when R1 selected
   - Checkbox state persists until model switch
   - No API call until message sent

### Message Flow
1. **Before Send**
   - User types message
   - Click send button
   - Disable input + button
   - Show "AI 正在回應..." placeholder

2. **During Request**
   - `augmentRequest()` adds `{model, show_thinking}`
   - POST to `/api/ai/lab/studio`
   - Wait for response

3. **After Response**
   - Extract `tokens`, `limits_after`, `cost_hkd`, `thinking`
   - Update token status line (turn counts)
   - Accumulate session totals
   - Decrement usage indicators
   - Save to localStorage
   - Show thinking box (if R1 + thinking enabled)
   - Render AI message
   - Re-enable input

### Session Reset
1. **Click "重設本節"**
   - Confirm dialog: "清除本節記錄？"
   - If yes:
     - Clear `localStorage` (`wonderlab-tokens-studio`)
     - Reset all counters to 0
     - Reset cost to $0.0000
     - Keep model selection unchanged
     - Keep usage indicators unchanged (server-side state)

## CSS Classes Reference

### Model Selector
```css
.wl-models              /* Container */
.wl-models-head         /* "選擇 AI 模型" header */
.wl-models-badge        /* "教師模式" badge */
.wl-model-item          /* Each model row */
.wl-model-item.disabled /* Disabled model (gray) */
.wl-model-info          /* Model name + description */
.wl-model-name          /* Display name */
.wl-model-desc          /* Description */
.wl-model-usage         /* Usage indicator (8/10) */
.wl-usage-ok            /* Green (>50%) */
.wl-usage-warn          /* Yellow (20-50%) */
.wl-usage-low           /* Red (<20%) */
.wl-thinking-toggle     /* Checkbox container */
.wl-models-stats        /* Bottom stats row */
```

### Token Status
```css
.wl-token-status        /* Status line container */
.wl-token-status-item   /* Turn stats */
.wl-token-status-session/* Session stats */
.wl-token-reset         /* Reset button */
.wl-cost-normal         /* <$0.01 */
.wl-cost-moderate       /* $0.01-0.10 */
.wl-cost-high           /* >$0.10 */
```

### Thinking Box
```css
.wl-thinking            /* Thinking container */
.wl-thinking-head       /* "推理過程" header with icon */
.wl-thinking-body       /* Thinking content */
```

## Verification Checklist

Open http://127.0.0.1:8920/ and verify:

### Initial Load
- [ ] Model selector renders above chat history
- [ ] Two models visible: DeepSeek Chat, DeepSeek R1
- [ ] DeepSeek Chat is selected by default
- [ ] Usage indicators show numbers (e.g., "8/10")
- [ ] Bottom stats show "本課今日" and "今日總共"
- [ ] Token status line shows "0 in, 0 out · $0.0000"
- [ ] No thinking checkbox visible (Chat selected)

### Send Message (Chat)
- [ ] Type "加一個角色" and send
- [ ] Token status updates: "40 in, 41 out · $0.0012 HKD"
- [ ] Session totals accumulate
- [ ] Usage indicators decrement: "7/10" → "6/10"
- [ ] AI response appears
- [ ] No thinking box shown

### Switch to R1
- [ ] Click "DeepSeek R1" radio button
- [ ] Thinking checkbox appears
- [ ] Check "顯示推理過程"
- [ ] Send another message
- [ ] Token status shows reasoning tokens: "45 in, 38 out, 120 reasoning"
- [ ] Thinking box appears above AI message
- [ ] Thinking content is readable (Chinese text)
- [ ] Cost is higher (~$0.0089 vs $0.0012)

### Session Reset
- [ ] Click "重設本節" button
- [ ] Confirm dialog appears
- [ ] After confirm: all counters reset to 0
- [ ] Model selection unchanged
- [ ] Usage indicators unchanged (server-side)

### Persistence
- [ ] Reload page (Cmd+R)
- [ ] Token totals restored from localStorage
- [ ] Model selection preserved
- [ ] Thinking checkbox state preserved

### Responsive
- [ ] Resize window to <768px
- [ ] AI panel collapses to drawer
- [ ] Model selector visible in drawer
- [ ] Token status visible in drawer
- [ ] Everything still functional

---

## Screenshot Locations

After manual testing, capture screenshots:
1. `screenshots/model-selector-initial.png` — Default state
2. `screenshots/model-selector-r1-thinking.png` — R1 with thinking box
3. `screenshots/token-status.png` — Token status line closeup
4. `screenshots/usage-indicators.png` — Usage color coding (ok/warn/low)
5. `screenshots/mobile-drawer.png` — Mobile drawer view

Save to: `/Users/blee/src/iits/iits-local/src/wonderlab-studio/docs/screenshots/`
