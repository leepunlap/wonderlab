# Model Selector UI — Visual Reference

## Layout Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Wonder Lab Studio                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌───────────────────────────────────┐  │
│  │              │  │  AI Companion                     │  │
│  │              │  ├───────────────────────────────────┤  │
│  │              │  │  選擇 AI 模型                      │  │
│  │              │  │                                   │  │
│  │   Scratch    │  │  ○ DeepSeek Chat            8/10 │  │
│  │   Editor     │  │    快速回應，適合一般對話          │  │
│  │              │  │                                   │  │
│  │              │  │  ◉ DeepSeek R1              3/5  │  │
│  │   (iframe)   │  │    深度推理，可顯示思考過程        │  │
│  │              │  │                                   │  │
│  │              │  │    ☑ 顯示推理過程                 │  │
│  │              │  │                                   │  │
│  │              │  │  本課今日: 19/25  今日總共: 44/60 │  │
│  │              │  ├───────────────────────────────────┤  │
│  │              │  │  Last Turn: 1.2K in / 380 out   │  │
│  │              │  │  Session: 5.2K total (HK$0.0034)│  │
│  │              │  │                            [✕]   │  │
│  │              │  ├───────────────────────────────────┤  │
│  │              │  │  [Conversation history]          │  │
│  │              │  │                                   │  │
│  │              │  │  AI: 照你說的：用「當綠旗...      │  │
│  │              │  │                                   │  │
│  │              │  ├───────────────────────────────────┤  │
│  │              │  │  [Input box]                 [→] │  │
│  └──────────────┘  └───────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Model Selector Header
```
┌───────────────────────────────────────┐
│ 選擇 AI 模型                           │
└───────────────────────────────────────┘
```
- Font: 14px, medium weight
- Color: #F8FAFC (off-white)
- Background: transparent
- Bottom border: 1px solid rgba(255,255,255,0.1)
- Padding: 12px

### 2. Model Options (Radio Buttons)
```
┌───────────────────────────────────────┐
│ ○ DeepSeek Chat            8/10      │
│   快速回應，適合一般對話               │
└───────────────────────────────────────┘
```
- **Layout**: Horizontal flex
  - Radio button: 18px, left
  - Model info: flex-1, center
  - Usage badge: auto, right

- **Model Name**: 13px, semibold, #F8FAFC
- **Description**: 11px, regular, #94A3B8 (muted)
- **Usage Badge**:
  - OK (>50%): Background #10B981 (green)
  - Warn (20-50%): Background #F59E0B (amber)
  - Low (<20%): Background #EF4444 (red)
  - Font: 11px, bold, white
  - Padding: 4px 8px
  - Border radius: 4px

### 3. Thinking Toggle (R1 only)
```
┌───────────────────────────────────────┐
│   ☑ 顯示推理過程                       │
└───────────────────────────────────────┘
```
- Indent: 28px (aligned with model text)
- Font: 12px, regular, #CBD5E1
- Checkbox: 16px, accent color #22D3EE (cyan)

### 4. Usage Stats Footer
```
┌───────────────────────────────────────┐
│ 本課今日: 19/25  今日總共: 44/60      │
└───────────────────────────────────────┘
```
- Font: 11px, regular, #64748B
- Layout: Horizontal flex, gap 16px
- Padding: 8px 12px
- Top border: 1px solid rgba(255,255,255,0.05)

### 5. Token Status Line
```
┌───────────────────────────────────────┐
│ Last Turn: 1.2K in / 380 out         │
│ Session: 5.2K total (HK$0.0034)  [✕]│
└───────────────────────────────────────┘
```
- **Last Turn Line**:
  - Font: 11px, monospace (IBM Plex Mono)
  - Color: #94A3B8
  - Format: "X.XK in / X.XK out [/ X.XK reasoning]"

- **Session Line**:
  - Font: 11px, monospace
  - Color: #64748B
  - Cost (teachers only): Color #F59E0B (amber)
  - Reset button: 16px, color #64748B, hover #F8FAFC

- **Padding**: 8px 12px
- **Top border**: 1px solid rgba(255,255,255,0.05)

### 6. Thinking Content Display
```
┌───────────────────────────────────────┐
│ 🧠 推理過程                            │
├───────────────────────────────────────┤
│ The user wants to add a forever loop. │
│ I should create a control_forever     │
│ block with motion_movesteps inside... │
└───────────────────────────────────────┘
```
- **Header**:
  - Icon: Brain (Lucide), 16px, #22D3EE
  - Text: 12px, semibold, #F8FAFC
  - Background: rgba(34, 211, 238, 0.1)
  - Padding: 10px 12px

- **Body**:
  - Font: 11px, regular, monospace
  - Color: #CBD5E1
  - Background: rgba(0,0,0,0.3)
  - Padding: 12px
  - Max height: 200px, scroll if overflow
  - Border: 1px solid rgba(34, 211, 238, 0.2)
  - Border radius: 6px

## Color Palette

### Background Layers
- **Base**: #0B0E14 (deep navy)
- **Panel**: #111827 (slightly lighter)
- **Elevated**: #1E293B (cards/modals)

### Text
- **Primary**: #F8FAFC (off-white, main text)
- **Secondary**: #CBD5E1 (light gray, descriptions)
- **Muted**: #94A3B8 (medium gray, hints)
- **Subtle**: #64748B (dark gray, meta info)

### Accents
- **Primary (Cyan)**: #22D3EE (links, checkboxes, thinking)
- **Success (Green)**: #10B981 (OK status)
- **Warning (Amber)**: #F59E0B (cost, medium status)
- **Danger (Red)**: #EF4444 (low status)

### Borders
- **Strong**: rgba(255,255,255,0.1) (section dividers)
- **Subtle**: rgba(255,255,255,0.05) (inner borders)
- **Accent**: rgba(34, 211, 238, 0.2) (thinking box)

## Responsive Behavior

### Desktop (>1024px)
- Model selector: Always visible
- Width: Full sidebar width (320px)
- Position: Above conversation history

### Tablet (768px - 1024px)
- Model selector: Collapsible
- Default: Collapsed, show icon button
- Expands over conversation when clicked

### Mobile (<768px)
- Model selector: In drawer menu
- Access via hamburger icon
- Full-screen overlay when open

## Interaction States

### Radio Button
- **Default**: Border 2px #475569, background transparent
- **Hover**: Border #64748B
- **Checked**: Border #22D3EE, inner dot #22D3EE
- **Disabled**: Opacity 0.5, cursor not-allowed

### Checkbox (Thinking)
- **Unchecked**: Border 2px #475569, background transparent
- **Hover**: Border #64748B
- **Checked**: Background #22D3EE, checkmark white
- **Transition**: 150ms ease

### Reset Button
- **Default**: Color #64748B
- **Hover**: Color #F8FAFC, transform scale(1.1)
- **Active**: Transform scale(0.95)

### Model Item
- **Default**: Background transparent
- **Hover**: Background rgba(255,255,255,0.03)
- **Disabled**: Opacity 0.6, cursor not-allowed

## Animation

### Panel Entry
```css
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```
- Duration: 200ms
- Easing: ease-out

### Usage Badge Update
```css
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
```
- Duration: 300ms
- Trigger: On response received

### Thinking Expand
- Max-height transition: 300ms ease
- Opacity fade: 200ms ease (delayed 100ms)

## Accessibility

### ARIA Labels
```html
<div role="radiogroup" aria-labelledby="model-selector-label">
  <input type="radio" aria-label="DeepSeek Chat, 8 requests left">
</div>
<button aria-label="Reset session statistics">✕</button>
```

### Keyboard Navigation
- **Tab**: Move between radio buttons
- **Space/Enter**: Select model
- **Shift+R**: Reset session (with confirmation)
- **Shift+T**: Toggle thinking (when R1 selected)

### Screen Reader Announcements
- Model selection: "DeepSeek Chat selected, 8 of 10 requests remaining"
- Limit update: "Usage updated: 7 of 10 requests remaining"
- Cost update: "Session cost: HK$0.0034"
- Reset: "Session statistics cleared"

## Testing Checklist

### Visual
- [ ] Model selector renders correctly
- [ ] Default model is pre-selected
- [ ] Usage badges show correct colors
- [ ] Thinking toggle only shows for R1
- [ ] Token status line displays compactly
- [ ] Cost displays for teachers only
- [ ] Reset button positioned correctly

### Functional
- [ ] Clicking radio button switches model
- [ ] Usage limits update after turn
- [ ] Token counts update in status line
- [ ] Cost calculates correctly
- [ ] Session persists across reload
- [ ] Reset button clears stats
- [ ] Confirmation dialog shows on reset
- [ ] Thinking checkbox toggles correctly

### Responsive
- [ ] Desktop: Full width, always visible
- [ ] Tablet: Collapsible, icon button
- [ ] Mobile: Drawer menu
- [ ] All breakpoints tested

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader announces changes
- [ ] Focus indicators visible
- [ ] ARIA labels present
- [ ] Color contrast passes WCAG AA

## Known Issues / Future Enhancements

1. **No offline support**: Requires API connection
2. **No model comparison**: Can't see outputs side-by-side
3. **No export**: Can't download session data
4. **No alerts**: No warning before hitting limit
5. **English thinking**: Thinking content is in English, not Chinese
