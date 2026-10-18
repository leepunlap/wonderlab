# Wonder Lab Studio — Deployment Guide

## What Changed (2026-10-18)

Added **AI model selector** and **token/cost tracking** to the Wonder Lab Studio prototype.

### New Features

1. **Model Selection UI**
   - DeepSeek Chat (fast, general conversation)
   - DeepSeek R1 (deep reasoning with visible thinking)
   - Usage indicators (per-lesson-hour, per-day limits)
   - Persistent session tracking (survives page reload)

2. **Token & Cost Display**
   - Real-time token counts (input/output/reasoning)
   - Cost calculation in HKD
   - Session totals with reset button
   - localStorage persistence

3. **Thinking Mode (R1 only)**
   - Toggle to show/hide reasoning process
   - Extracted from `<think>` tags in API response
   - Displayed in collapsible section

---

## Files Added

```
src/studio-models.js          Model selector module (ES5)
src/studio-models.css          Model selector UI styles
```

### Files Modified

```
src/index.html                 Added CSS link, model container, token status line
src/studio-assist.js           Integrated model selector and token tracking
server/studio_server.py        Added /api/ai/status/studio endpoint, token/cost fields
```

---

## API Changes

### New Endpoint: `GET /api/ai/status/studio`

Returns model configuration and limits.

**Response:**
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
        "output_per_1m": 1.1,
        "cached_input_per_1m": 0.054
      }
    },
    {
      "id": "deepseek-reasoner",
      "display_name": "DeepSeek R1",
      "description": "深度推理，可顯示思考過程",
      "default": false,
      "enabled": true,
      "supports_thinking": true,
      "limits": {
        "per_lesson_hour": {"left": 3, "max": 5},
        "per_lesson_day": {"left": 8, "max": 10},
        "per_student_day": {"left": 15, "max": 20}
      },
      "costs": {
        "input_per_1m": 0.55,
        "output_per_1m": 2.19,
        "cached_input_per_1m": 0.11,
        "reasoning_per_1m": 2.19
      }
    }
  ],
  "role": "student",
  "open_from": "07:00",
  "open_until": "21:00"
}
```

### Updated Endpoint: `POST /api/ai/lab/*`

**Request now accepts:**
```json
{
  "text": "學生想法",
  "model": "deepseek-chat",         // NEW
  "show_thinking": true,             // NEW (R1 only)
  "history": [...],
  "program": {...},
  "studio": {...}
}
```

**Response now includes:**
```json
{
  "ok": true,
  "say": "...",
  "ops": [...],
  "model_used": "deepseek-chat",    // NEW
  "tokens": {                        // NEW
    "input": 40,
    "output": 41,
    "reasoning": 120                 // Only for R1
  },
  "limits_after": {                  // NEW
    "per_lesson_hour": {"left": 7, "max": 10},
    "per_lesson_day": {"left": 19, "max": 25},
    "per_student_day": {"left": 44, "max": 60}
  },
  "cost_hkd": 0.0012,               // NEW
  "thinking": "<think>...</think>"  // NEW (R1 with show_thinking)
}
```

---

## Deployment Steps

### 1. Update Code

```bash
cd /Users/blee/src/iits/iits-local/src/wonderlab-studio

# Gzip new files (server expects .gz siblings)
cd src
gzip -k -f -9 studio-models.js studio-models.css
cd ..
```

### 2. Restart Server

```bash
# Stop current server (Ctrl+C)
# Start with standard config
python3 server/studio_server.py --port 8920

# Or with real AI (if WL_REAL=1)
set -a; . ~/.deepseek; set +a
WL_REAL=1 WL_REAL_MAX=10 python3 server/studio_server.py --port 8921
```

### 3. Verify

```bash
# Test status endpoint
curl http://127.0.0.1:8920/api/ai/status/studio | jq .

# Test UI (open browser)
open http://127.0.0.1:8920/
```

**Expected in browser:**
- Model selector appears in chat tab (above message list)
- Two radio buttons: "DeepSeek Chat" (default) and "DeepSeek R1"
- Usage indicators show "8/10", "20/25", "45/60"
- Token status line appears below input box
- After sending a message:
  - Token counts update
  - Cost displays in HKD
  - Session totals accumulate
  - Usage indicators decrement

---

## Configuration

### Model Limits (in `studio_server.py`)

Edit lines 571-609 to change:
- `per_lesson_hour`: requests per lesson per hour
- `per_lesson_day`: requests per lesson per day
- `per_student_day`: total requests per student per day

### Model Costs (DeepSeek API pricing)

Costs are in USD per 1 million tokens, converted to HKD at 7.8 rate:
- **Chat**: $0.27 input, $1.10 output
- **R1**: $0.55 input, $2.19 output/reasoning

### Session Persistence

Token counts and costs are stored in `localStorage`:
- Key: `wonderlab-tokens-studio`
- Survives page reload
- Cleared by "Reset Session" button

---

## Testing

### Unit Tests

```bash
# Test status endpoint
python3 -c "
import json
from server.studio_server import status_stub
data = status_stub('studio')
assert data['ok']
assert len(data['models']) == 2
assert data['models'][0]['id'] == 'deepseek-chat'
print('✓ Status endpoint')
"

# Test turn with model selection
python3 -c "
import json
from server.studio_server import stub_turn
req = {
    'text': '加角色',
    'model': 'deepseek-chat',
    'program': {'sprites': {}, 'stage': {'scripts': {}}},
    'studio': {'targets': [{'name': '舞台', 'isStage': True}]}
}
resp = stub_turn('studio', req, {'sprites': []}, None)
assert resp['model_used'] == 'deepseek-chat'
assert 'tokens' in resp
assert 'limits_after' in resp
print('✓ Turn with model selection')
"
```

### E2E Tests

```bash
# Browser test (requires Chrome/Safari)
python3 test/e2e.py --check-models

# Expected:
# ✓ Model selector renders
# ✓ Default model is deepseek-chat
# ✓ R1 shows thinking toggle
# ✓ Token status line renders
# ✓ After turn: tokens update
# ✓ After turn: usage decrements
# ✓ Reset button clears session
```

---

## Troubleshooting

### Model selector not appearing

**Check:**
1. CSS loaded: `curl http://127.0.0.1:8920/studio-models.css | head`
2. JS loaded: `curl http://127.0.0.1:8920/studio-models.js | head`
3. Container exists: browser console → `document.getElementById('wl-models-container')`
4. Init called: console → `StudioModels` should be defined

**Fix:**
```bash
# Re-gzip files
cd src
gzip -k -f -9 studio-models.js studio-models.css
# Hard refresh browser (Cmd+Shift+R)
```

### Token counts not persisting

**Check:**
```javascript
// In browser console
localStorage.getItem('wonderlab-tokens-studio')
```

**Should return:**
```json
{"session":{"deepseek-chat":{"input":40,"output":41},...},"session_start":1729232400000}
```

**Fix:**
```javascript
// Clear and retry
localStorage.removeItem('wonderlab-tokens-studio')
location.reload()
```

### Status endpoint returns 404

**Check server logs:**
```bash
# Should see:
# GET /api/ai/status/studio → 200
```

**Fix:**
```bash
# Restart server with updated code
^C
python3 server/studio_server.py --port 8920
```

---

## Future Enhancements

### For Production Deployment

1. **Real Model Integration**
   - Replace stub with actual DeepSeek API calls
   - Move limits to database (per-user tracking)
   - Add Redis cache for rate limiting

2. **Admin Dashboard**
   - View aggregate token usage
   - Adjust limits per class/student
   - Cost reports by lesson

3. **Student Dashboard**
   - Token usage history (line chart)
   - Cost breakdown by conversation
   - Monthly/weekly summaries

4. **Teacher Controls**
   - Enable/disable models per lesson
   - Set custom limits per class
   - Pre-approve R1 access for advanced students

---

## Production Checklist

Before deploying to production:

- [ ] Replace stub with real API calls (`lab_core.lab_turn`)
- [ ] Move model config to database
- [ ] Add authentication/authorization checks
- [ ] Implement real rate limiting (Redis)
- [ ] Add audit logging (who used what model when)
- [ ] Setup monitoring (token usage, costs, errors)
- [ ] Add graceful degradation (fallback to Chat if R1 unavailable)
- [ ] Test with real students (beta group)
- [ ] Update privacy policy (token usage tracking)
- [ ] Train teachers on model differences

---

## Contact

Questions? Issues? Enhancements?
- File: `/Users/blee/src/iits/iits-local/src/wonderlab-studio/`
- Docs: This file + `MODEL_SELECTOR_IMPLEMENTATION.md`
- Tests: `test/e2e.py --check-models`
