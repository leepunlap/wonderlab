# Wonder Lab Studio — Model Selector Implementation

## Overview

Added AI model selection UI with token usage tracking, cost display, and persistent sessions to Wonder Lab Studio (http://127.0.0.1:8920/).

## Features Implemented

### 1. Model Selection
- **DeepSeek Chat**: Fast responses, suitable for general conversation
- **DeepSeek R1**: Deep reasoning with optional thinking process display
- Radio button UI for switching between models
- Real-time usage limits display (requests remaining per hour/day)
- Visual indicators: green (>50% left), yellow (20-50%), red (<20%)

### 2. Token Usage Tracking
- **Per-turn tracking**: Input, output, and reasoning tokens (for R1)
- **Session totals**: Accumulated tokens across all turns
- **Persistent**: Survives page reloads via localStorage
- **Display format**: Compact (e.g., "5.2K tokens" for 5200)

### 3. Cost Tracking (Teachers Only)
- Displays HK$ cost based on actual token rates:
  - DeepSeek Chat: HK$0.27/1M input, HK$1.10/1M output
  - DeepSeek R1: HK$0.55/1M input, HK$2.19/1M output + reasoning
- Real-time cost updates after each turn
- Session total cost display

### 4. Thinking Mode (R1 Only)
- Checkbox to show/hide reasoning process
- Thinking content displayed in expandable panel
- Persisted with session state

### 5. Session Management
- **Auto-save**: Token counts, costs, and settings saved to localStorage
- **Reset button**: Clear session stats with confirmation dialog
- **Key**: `wl-session:{lesson-slug}` per lesson

## Files Added

### Frontend
- **`src/studio-models.js`** (372 lines)
  - Main model selector module
  - Token tracking and cost calculation
  - Session persistence (localStorage)
  - UI rendering and event handling

- **`src/studio-models.css`** (220 lines)
  - Model selector styling
  - Token usage status line
  - Thinking content display
  - Responsive design

### Backend
- **Modified `server/studio_server.py`**:
  - Enhanced `/api/ai/status/<slug>` to return model configs
  - Added `tokens` and `limits_after` to turn responses
  - Mock token counting for stub mode

## Integration Points

### HTML (`src/index.html`)
1. Linked `studio-models.css` in `<head>`
2. Added `<div id="wl-model-selector"></div>` in chat sidebar
3. Included `studio-models.js` script
4. Initialized model selector after page load

### Studio App (`src/studio-app.js`)
- Model selector passed to assist module
- Requests augmented with `{model, show_thinking}`
- Responses parsed to update usage stats

### Studio Assist (`src/studio-assist.js`)
- `augmentRequest()` adds model selection
- `updateFromResponse()` updates token counts and limits
- Thinking content displayed if present

## API Contract

### GET `/api/ai/status/<slug>`
```json
{
  "ok": true,
  "open": true,
  "models": [
    {
      "id": "deepseek-chat",
      "display_name": "DeepSeek Chat",
      "description": "快速回應，適合一般對話",
      "default": true,
      "enabled": true,
      "supports_thinking": false,
      "limits": {
        "per_lesson_hour": {"left": 8, "max": 10},
        "per_lesson_day": {"left": 20, "max": 25},
        "per_student_day": {"left": 45, "max": 60}
      },
      "costs": {
        "input_per_1m": 0.27,
        "output_per_1m": 1.10,
        "cached_input_per_1m": 0.054
      }
    }
  ],
  "role": "student",
  "open_from": "07:00",
  "open_until": "21:00"
}
```

### POST `/api/ai/lab/<slug>` (Request)
```json
{
  "text": "...",
  "program": {...},
  "model": "deepseek-reasoner",
  "show_thinking": true
}
```

### POST `/api/ai/lab/<slug>` (Response)
```json
{
  "ok": true,
  "say": "...",
  "ops": [...],
  "model_used": "deepseek-reasoner",
  "tokens": {
    "input": 1250,
    "output": 380,
    "reasoning": 1140
  },
  "limits_after": {
    "per_lesson_hour": {"left": 2, "max": 5},
    "per_lesson_day": {"left": 7, "max": 10},
    "per_student_day": {"left": 14, "max": 20}
  }
}
```

## Session Storage Schema

**Key**: `wl-session:<lesson-slug>`

```json
{
  "model": "deepseek-chat",
  "showThinking": false,
  "tokens": {
    "input": 5230,
    "output": 1840,
    "reasoning": 0,
    "total": 7070
  },
  "costs": {
    "input": 0.00141,
    "output": 0.00202,
    "reasoning": 0,
    "total": 0.00343
  },
  "timestamp": 1729234567890
}
```

## Usage Limits

### Students
- **DeepSeek Chat**: 10/hour, 25/day (per lesson), 60/day (total)
- **DeepSeek R1**: 5/hour, 10/day (per lesson), 20/day (total)

### Teachers
- Unlimited requests (limits shown as ∞)
- Cost tracking enabled

## UI Components

### Model Selector Panel
- Compact, integrated into chat sidebar
- Position: Above chat input
- Collapsible on mobile (auto-hide when chat open)

### Status Line (below model selector)
- **This Turn**: Last request's token breakdown
- **Session Total**: Accumulated tokens + cost (teachers)
- **Reset Button**: ✕ button to clear session stats

### Thinking Display
- Expandable panel with brain icon
- Rendered after AI response
- Syntax-highlighted reasoning process

## Testing

### Manual Test Checklist
1. ✅ Model selector loads on page load
2. ✅ Default model (DeepSeek Chat) is pre-selected
3. ✅ Switch to R1 shows thinking checkbox
4. ✅ Usage limits update after each turn
5. ✅ Token counts display correctly
6. ✅ Cost calculation accurate (teachers)
7. ✅ Session persists across page reload
8. ✅ Reset button clears stats with confirmation
9. ✅ Thinking content displays when enabled
10. ✅ Mobile responsive (sidebar layout)

### Test Commands
```bash
# Start server
cd /Users/blee/src/iits/iits-local/src/wonderlab-studio
python3 server/studio_server.py

# Open in browser
open http://127.0.0.1:8920/

# Check console for errors
# (Open DevTools > Console)

# Test API endpoint
curl http://127.0.0.1:8920/api/ai/status/studio | jq
```

## Known Limitations

1. **Mock Data**: Server returns simulated token counts and limits
2. **No Real DeepSeek Integration**: Requires `WL_REAL=1` and API key
3. **Single Lesson**: No cross-lesson usage tracking yet
4. **No Cost Alerts**: No warnings when approaching limits

## Next Steps

### Production Readiness
1. **Real Token Counting**: Parse from DeepSeek API response
2. **Database Storage**: Replace localStorage with server-side session store
3. **Usage Enforcement**: Block requests when limits exceeded
4. **Cost Alerts**: Notify teachers when sessions exceed budget thresholds
5. **Admin Dashboard**: View usage across all students/lessons
6. **Rate Limiting**: Server-side validation of model selection

### Feature Enhancements
1. **Model Comparison**: Side-by-side thinking vs non-thinking output
2. **Export Session**: Download token usage CSV for analysis
3. **Batch Limits**: Set weekly/monthly caps per student
4. **Model Recommendations**: AI suggests best model for task type

## Code Quality

- **ES5 Compliance**: Works in old browsers (IE11+)
- **No Dependencies**: Pure JavaScript, no frameworks
- **Error Handling**: Graceful fallbacks for API failures
- **Accessibility**: ARIA labels, keyboard navigation
- **Performance**: Minimal DOM updates, debounced renders

## License

Copyright (C) 2026 IITS (工信學堂（香港）)
Licensed under GNU Affero General Public License v3.0 only
