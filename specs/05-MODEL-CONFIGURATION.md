# Model Configuration System

**Version**: 1.0  
**Date**: 2026-10-18  
**Status**: Implementation Ready

---

## Overview

Configuration-based AI model management with proper gates, rate limits, and role-based access. Students see limited usage with clear indicators; teachers get unlimited playground access; administrators control all settings without code changes.

---

## Design Principles

1. **Configuration-First**: All model settings in JSON, no code changes needed
2. **Role-Based Gates**: Students get limits, teachers get infinity (playground)
3. **Transparent Limits**: UI always shows remaining usage
4. **Hot Reload**: Config changes apply without restart
5. **Safe Defaults**: Conservative limits protect resources
6. **Audit Trail**: All usage logged with model, role, timestamp

---

## Configuration Schema

### `config.json` (Primary)

```json
{
  "models": {
    "deepseek-chat": {
      "provider": "deepseek",
      "display_name": "DeepSeek Chat",
      "description": "Fast responses, no visible reasoning",
      "api_url": "https://api.deepseek.com/chat/completions",
      "enabled": true,
      "default": true,
      "params": {
        "thinking": {"type": "disabled"}
      },
      "max_tokens": 900,
      "temperature": 0.7,
      "timeout_seconds": 28,
      "student_limits": {
        "per_lesson_hour": 10,
        "per_lesson_day": 25,
        "per_student_day": 60,
        "max_question_chars": 200
      },
      "teacher_limits": null,
      "cost_per_1k_tokens": 0.14
    },
    
    "deepseek-reasoner": {
      "provider": "deepseek",
      "display_name": "DeepSeek R1 (推理模式)",
      "description": "Deep reasoning with visible thinking process",
      "api_url": "https://api.deepseek.com/chat/completions",
      "enabled": true,
      "default": false,
      "params": {},
      "max_tokens": 8000,
      "temperature": 0.7,
      "timeout_seconds": 60,
      "student_limits": {
        "per_lesson_hour": 3,
        "per_lesson_day": 10,
        "per_student_day": 20,
        "max_question_chars": 300
      },
      "teacher_limits": null,
      "cost_per_1k_tokens": 0.55
    },
    
    "deepseek-v4-pro": {
      "provider": "deepseek",
      "display_name": "DeepSeek V4 Pro",
      "description": "Highest capability, longer responses",
      "api_url": "https://api.deepseek.com/chat/completions",
      "enabled": false,
      "default": false,
      "params": {
        "thinking": {"type": "disabled"}
      },
      "max_tokens": 4096,
      "temperature": 0.7,
      "timeout_seconds": 40,
      "student_limits": {
        "per_lesson_hour": 5,
        "per_lesson_day": 15,
        "per_student_day": 30,
        "max_question_chars": 250
      },
      "teacher_limits": null,
      "cost_per_1k_tokens": 2.19
    }
  },
  
  "global_limits": {
    "student_daily_total": 3000,
    "teacher_daily_total": null,
    "rate_limit_per_second": 10
  },
  
  "open_hours": {
    "timezone": "Asia/Hong_Kong",
    "weekday": ["07:00", "21:00"],
    "weekend": ["08:00", "20:00"],
    "holidays": []
  },
  
  "ui": {
    "show_model_selector": true,
    "show_thinking_toggle": true,
    "show_usage_indicators": true,
    "student_can_switch": true,
    "teacher_shows_infinity": true
  },
  
  "audit": {
    "log_all_requests": true,
    "log_thinking_content": false,
    "retention_days": 30
  }
}
```

---

## Model Specification Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | Yes | `"deepseek"`, `"anthropic"`, `"openai"` |
| `display_name` | string | Yes | Shown in UI model selector |
| `description` | string | Yes | Help text for users |
| `api_url` | string | Yes | API endpoint |
| `enabled` | boolean | Yes | Can be selected by users |
| `default` | boolean | Yes | Selected by default (one per provider) |
| `params` | object | No | Extra API request fields (e.g., thinking config) |
| `max_tokens` | integer | Yes | Maximum output tokens |
| `temperature` | float | Yes | Randomness (0.0-2.0) |
| `timeout_seconds` | integer | Yes | Wall-clock timeout |
| `student_limits` | object\|null | Yes | Usage caps for students (`null` = no limits) |
| `teacher_limits` | object\|null | Yes | Usage caps for teachers (`null` = infinity) |
| `cost_per_1k_tokens` | float | No | For budget tracking |

### `student_limits` / `teacher_limits` Object

```json
{
  "per_lesson_hour": 10,       // Max requests per lesson per hour
  "per_lesson_day": 25,         // Max requests per lesson per day
  "per_student_day": 60,        // Max requests across all lessons per day
  "max_question_chars": 200     // Max input length
}
```

`null` means **no limits** (infinity symbol shown in UI).

---

## API Response Schema

### `/api/ai/status/<slug>` (Enhanced)

**Response**:
```json
{
  "ok": true,
  "open": true,
  "models": [
    {
      "id": "deepseek-chat",
      "display_name": "DeepSeek Chat",
      "description": "Fast responses, no visible reasoning",
      "enabled": true,
      "default": true,
      "limits": {
        "per_lesson_hour": {"left": 8, "max": 10},
        "per_lesson_day": {"left": 23, "max": 25},
        "per_student_day": {"left": 55, "max": 60},
        "max_question_chars": 200
      },
      "supports_thinking": false
    },
    {
      "id": "deepseek-reasoner",
      "display_name": "DeepSeek R1 (推理模式)",
      "description": "Deep reasoning with visible thinking process",
      "enabled": true,
      "default": false,
      "limits": {
        "per_lesson_hour": {"left": 3, "max": 3},
        "per_lesson_day": {"left": 10, "max": 10},
        "per_student_day": {"left": 20, "max": 20},
        "max_question_chars": 300
      },
      "supports_thinking": true
    }
  ],
  "role": "student",
  "class_in_session": false,
  "next_class": "2026-10-19 14:30",
  "timezone": "HKT"
}
```

For **teachers** (role="teacher"):
```json
{
  "models": [
    {
      "id": "deepseek-reasoner",
      "limits": null,  // null = infinity (UI shows ∞)
      ...
    }
  ]
}
```

### `/api/ai/chat/<slug>` (Enhanced Request)

```json
{
  "messages": [...],
  "model": "deepseek-reasoner",     // NEW: client-selected model
  "show_thinking": true              // NEW: include <think> blocks in response
}
```

### `/api/ai/chat/<slug>` (Enhanced Response)

```json
{
  "ok": true,
  "answer": "...",
  "thinking": "<think>...</think>",  // NEW: only if show_thinking=true and model supports it
  "model_used": "deepseek-reasoner",
  "tokens": {
    "input": 450,
    "output": 320,
    "reasoning": 1200,              // NEW: R1 reasoning tokens
    "total": 1970
  },
  "limits_after": {
    "per_lesson_hour": {"left": 2, "max": 3},
    "per_lesson_day": {"left": 9, "max": 10},
    "per_student_day": {"left": 19, "max": 20}
  }
}
```

---

## UI Components

### Model Selector (Student View)

```
┌─────────────────────────────────────────────────┐
│ 選擇 AI 模型                                     │
├─────────────────────────────────────────────────┤
│ ◉ DeepSeek Chat                     剩餘: 8/10  │
│   快速回應，不顯示推理過程                       │
│                                                 │
│ ○ DeepSeek R1 (推理模式)            剩餘: 3/3   │
│   深度推理，顯示思考過程                         │
│   ☐ 顯示推理過程                                │
│                                                 │
│ [確定]                                           │
└─────────────────────────────────────────────────┘
```

### Model Selector (Teacher View - Playground)

```
┌─────────────────────────────────────────────────┐
│ 選擇 AI 模型 (教師模式：無限制)                  │
├─────────────────────────────────────────────────┤
│ ◉ DeepSeek Chat                     剩餘: ∞     │
│   快速回應，不顯示推理過程                       │
│                                                 │
│ ○ DeepSeek R1 (推理模式)            剩餘: ∞     │
│   深度推理，顯示思考過程                         │
│   ☑ 顯示推理過程                                │
│                                                 │
│ ○ DeepSeek V4 Pro                   剩餘: ∞     │
│   最強能力，更長回應                             │
│                                                 │
│ [確定]                                           │
└─────────────────────────────────────────────────┘
```

### Usage Indicator (Always Visible)

**Student (limited)**:
```
AI 模型: DeepSeek R1  |  本課今日: 7/10  |  今日總共: 45/60
```

**Teacher (unlimited)**:
```
AI 模型: DeepSeek R1  |  無限制 (教師模式)
```

### Response with Thinking (R1 only, if enabled)

```
┌─────────────────────────────────────────────────┐
│ 🤖 AI 學伴 (DeepSeek R1)                         │
├─────────────────────────────────────────────────┤
│ [▼ 推理過程 (點擊展開)]                          │
│                                                 │
│ 你的問題很好！... (actual answer)                │
│                                                 │
│ 想一想：...                                      │
└─────────────────────────────────────────────────┘
```

Expanded:
```
┌─────────────────────────────────────────────────┐
│ 🤖 AI 學伴 (DeepSeek R1)                         │
├─────────────────────────────────────────────────┤
│ [▲ 推理過程]                                     │
│ ┌───────────────────────────────────────────┐   │
│ │ <think>                                   │   │
│ │ 學生問的是...首先要理解...                │   │
│ │ 這和本課的...有關係...                    │   │
│ │ 最好的連繫方式是...                       │   │
│ │ </think>                                  │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ 你的問題很好！... (actual answer)                │
└─────────────────────────────────────────────────┘
```

---

## Backend Implementation

### Python (lesson_ai.py)

```python
def get_model_config(model_id, role="student"):
    """Get model configuration with role-specific limits."""
    cfg = config()
    models = cfg.get("models", {})
    
    if model_id not in models:
        return None
    
    model = models[model_id]
    if not model.get("enabled", False):
        return None
    
    # Apply role-based limits
    limits_key = "teacher_limits" if role == "teacher" else "student_limits"
    limits = model.get(limits_key)
    
    return {
        "id": model_id,
        "display_name": model.get("display_name"),
        "description": model.get("description"),
        "api_url": model.get("api_url"),
        "params": model.get("params", {}),
        "max_tokens": model.get("max_tokens", 900),
        "temperature": model.get("temperature", 0.7),
        "timeout": model.get("timeout_seconds", 40),
        "limits": limits,  # null for teachers
        "supports_thinking": "thinking" not in model.get("params", {})
    }


def check_usage(user, lesson, model_id, role="student"):
    """Check if user has usage left for this model.
    
    Returns: {
        "allowed": bool,
        "reason": str | None,
        "limits_after": {
            "per_lesson_hour": {"left": int, "max": int},
            ...
        }
    }
    """
    model = get_model_config(model_id, role)
    if not model:
        return {"allowed": False, "reason": "模型不可用"}
    
    # Teachers have no limits
    if role == "teacher" or model["limits"] is None:
        return {
            "allowed": True,
            "limits_after": None
        }
    
    limits = model["limits"]
    con = db()
    now_ts = int(time.time())
    today = datetime.datetime.now(HKT).strftime("%Y-%m-%d")
    hour_ago = now_ts - 3600
    
    # Check per-lesson-hour limit
    count_lesson_hour = con.execute(
        "select count(*) from usage where u=? and lesson=? and ts>? and model=?",
        (user, lesson, hour_ago, model_id)
    ).fetchone()[0]
    
    if count_lesson_hour >= limits["per_lesson_hour"]:
        return {
            "allowed": False,
            "reason": f"已達本課每小時上限 ({limits['per_lesson_hour']} 次)"
        }
    
    # Check per-lesson-day limit
    count_lesson_day = con.execute(
        "select count(*) from usage where u=? and lesson=? and day=? and model=?",
        (user, lesson, today, model_id)
    ).fetchone()[0]
    
    if count_lesson_day >= limits["per_lesson_day"]:
        return {
            "allowed": False,
            "reason": f"已達本課今日上限 ({limits['per_lesson_day']} 次)"
        }
    
    # Check per-student-day limit
    count_student_day = con.execute(
        "select count(*) from usage where u=? and day=? and model=?",
        (user, today, model_id)
    ).fetchone()[0]
    
    if count_student_day >= limits["per_student_day"]:
        return {
            "allowed": False,
            "reason": f"已達今日總上限 ({limits['per_student_day']} 次)"
        }
    
    return {
        "allowed": True,
        "limits_after": {
            "per_lesson_hour": {
                "left": limits["per_lesson_hour"] - count_lesson_hour - 1,
                "max": limits["per_lesson_hour"]
            },
            "per_lesson_day": {
                "left": limits["per_lesson_day"] - count_lesson_day - 1,
                "max": limits["per_lesson_day"]
            },
            "per_student_day": {
                "left": limits["per_student_day"] - count_student_day - 1,
                "max": limits["per_student_day"]
            }
        }
    }


def call_model_with_config(messages, model_id, show_thinking=False, role="student"):
    """Call AI model with configuration-based settings."""
    model = get_model_config(model_id, role)
    if not model:
        raise ValueError(f"Model {model_id} not available")
    
    # Build request
    body = {
        "model": model_id,
        "messages": messages,
        "max_tokens": model["max_tokens"],
        "temperature": model["temperature"]
    }
    
    # Add model-specific params
    for k, v in model["params"].items():
        body[k] = v
    
    # R1 thinking control
    if model["supports_thinking"] and not show_thinking:
        # Disable thinking for R1 if not requested
        body["thinking"] = {"type": "disabled"}
    
    # Make API call with timeout
    response = requests.post(
        model["api_url"],
        json=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        },
        timeout=model["timeout"]
    )
    
    data = response.json()
    
    # Extract thinking if present
    content = data["choices"][0]["message"]["content"]
    thinking = None
    
    if show_thinking and "<think>" in content:
        import re
        match = re.search(r"<think>(.*?)</think>", content, re.DOTALL)
        if match:
            thinking = match.group(1).strip()
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    
    return {
        "content": content,
        "thinking": thinking,
        "tokens": {
            "input": data["usage"]["prompt_tokens"],
            "output": data["usage"]["completion_tokens"],
            "reasoning": data["usage"].get("reasoning_tokens", 0),
            "total": data["usage"]["total_tokens"]
        }
    }
```

### Database Schema Update

```sql
-- Add model column to usage table
ALTER TABLE usage ADD COLUMN model TEXT DEFAULT 'deepseek-chat';
CREATE INDEX usage_model ON usage(u, model, day);

-- Add thinking_shown column to chats table
ALTER TABLE chats ADD COLUMN thinking_shown INTEGER DEFAULT 0;
ALTER TABLE chats ADD COLUMN reasoning_tokens INTEGER DEFAULT 0;
```

---

## Frontend Implementation (TypeScript)

```typescript
// types.ts
export interface ModelConfig {
  id: string;
  display_name: string;
  description: string;
  enabled: boolean;
  default: boolean;
  limits: {
    per_lesson_hour: { left: number; max: number };
    per_lesson_day: { left: number; max: number };
    per_student_day: { left: number; max: number };
    max_question_chars: number;
  } | null;  // null = infinity (teacher mode)
  supports_thinking: boolean;
}

export interface StatusResponse {
  ok: boolean;
  open: boolean;
  models: ModelConfig[];
  role: 'student' | 'teacher';
  class_in_session: boolean;
  next_class?: string;
}

// model-selector.ts
export class ModelSelector {
  private models: ModelConfig[] = [];
  private selectedModel: string = '';
  private showThinking: boolean = false;
  private role: 'student' | 'teacher' = 'student';
  
  async loadModels(ep: string): Promise<void> {
    const res = await fetch(`/api/ai/status/${ep}`);
    const data: StatusResponse = await res.json();
    
    this.models = data.models;
    this.role = data.role;
    this.selectedModel = data.models.find(m => m.default)?.id || data.models[0]?.id;
  }
  
  render(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'model-selector';
    
    const title = document.createElement('h3');
    title.textContent = this.role === 'teacher' 
      ? '選擇 AI 模型 (教師模式：無限制)'
      : '選擇 AI 模型';
    container.appendChild(title);
    
    this.models.forEach(model => {
      const option = this.renderModelOption(model);
      container.appendChild(option);
    });
    
    return container;
  }
  
  private renderModelOption(model: ModelConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = 'model-option';
    
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'model';
    radio.value = model.id;
    radio.checked = model.id === this.selectedModel;
    radio.onchange = () => {
      this.selectedModel = model.id;
      this.onModelChange();
    };
    
    const label = document.createElement('label');
    
    const name = document.createElement('span');
    name.className = 'model-name';
    name.textContent = model.display_name;
    
    const usage = document.createElement('span');
    usage.className = 'model-usage';
    if (model.limits === null) {
      usage.textContent = '剩餘: ∞';
      usage.classList.add('infinity');
    } else {
      const left = model.limits.per_lesson_hour.left;
      const max = model.limits.per_lesson_hour.max;
      usage.textContent = `剩餘: ${left}/${max}`;
      
      if (left === 0) usage.classList.add('depleted');
      else if (left <= max * 0.3) usage.classList.add('low');
    }
    
    const desc = document.createElement('div');
    desc.className = 'model-description';
    desc.textContent = model.description;
    
    label.appendChild(radio);
    label.appendChild(name);
    label.appendChild(usage);
    div.appendChild(label);
    div.appendChild(desc);
    
    // Thinking toggle for R1
    if (model.supports_thinking) {
      const thinkToggle = document.createElement('label');
      thinkToggle.className = 'thinking-toggle';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.showThinking;
      checkbox.onchange = () => {
        this.showThinking = checkbox.checked;
      };
      
      thinkToggle.appendChild(checkbox);
      thinkToggle.appendChild(document.createTextNode(' 顯示推理過程'));
      div.appendChild(thinkToggle);
    }
    
    return div;
  }
  
  getSelectedModel(): string {
    return this.selectedModel;
  }
  
  shouldShowThinking(): boolean {
    const model = this.models.find(m => m.id === this.selectedModel);
    return this.showThinking && model?.supports_thinking || false;
  }
  
  private onModelChange(): void {
    // Update usage indicators, refresh UI
    this.render();
  }
}

// usage-indicator.ts
export class UsageIndicator {
  render(model: ModelConfig, role: 'student' | 'teacher'): HTMLElement {
    const div = document.createElement('div');
    div.className = 'usage-indicator';
    
    const modelName = document.createElement('span');
    modelName.textContent = `AI 模型: ${model.display_name}`;
    div.appendChild(modelName);
    
    if (role === 'teacher' || model.limits === null) {
      const unlimited = document.createElement('span');
      unlimited.className = 'unlimited';
      unlimited.textContent = '無限制 (教師模式)';
      div.appendChild(unlimited);
    } else {
      const lessonToday = document.createElement('span');
      lessonToday.textContent = `本課今日: ${model.limits.per_lesson_day.left}/${model.limits.per_lesson_day.max}`;
      div.appendChild(lessonToday);
      
      const studentToday = document.createElement('span');
      studentToday.textContent = `今日總共: ${model.limits.per_student_day.left}/${model.limits.per_student_day.max}`;
      div.appendChild(studentToday);
    }
    
    return div;
  }
}
```

---

## CSS Styling

```css
.model-selector {
  background: #0F172A;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

.model-selector h3 {
  margin: 0 0 12px 0;
  color: #F8FAFC;
  font-size: 16px;
  font-weight: 600;
}

.model-option {
  padding: 12px;
  border: 1px solid #334155;
  border-radius: 6px;
  margin-bottom: 8px;
  transition: all 0.2s;
}

.model-option:hover {
  border-color: #38BDF8;
  background: #1E293B;
}

.model-option label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.model-name {
  flex: 1;
  color: #F8FAFC;
  font-weight: 500;
}

.model-usage {
  font-size: 14px;
  color: #94A3B8;
  padding: 2px 8px;
  border-radius: 4px;
  background: #1E293B;
}

.model-usage.infinity {
  color: #4FD1C5;
  font-weight: 600;
}

.model-usage.low {
  color: #F59E0B;
}

.model-usage.depleted {
  color: #EF4444;
}

.model-description {
  margin: 8px 0 0 32px;
  font-size: 13px;
  color: #94A3B8;
}

.thinking-toggle {
  margin: 8px 0 0 32px;
  font-size: 13px;
  color: #94A3B8;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.usage-indicator {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: #1E293B;
  border-radius: 6px;
  font-size: 13px;
  color: #94A3B8;
}

.usage-indicator .unlimited {
  color: #4FD1C5;
  font-weight: 600;
}

.thinking-block {
  background: #111827;
  border-left: 3px solid #38BDF8;
  padding: 12px;
  margin: 12px 0;
  border-radius: 4px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: #94A3B8;
  max-height: 300px;
  overflow-y: auto;
}

.thinking-block.collapsed {
  max-height: 40px;
  overflow: hidden;
}

.thinking-toggle-btn {
  background: none;
  border: none;
  color: #38BDF8;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 0;
  text-decoration: underline;
}
```

---

## Migration Plan

### Phase 1: Backend Config Support (Week 2, Day 1)
1. Add `models` schema to config.json
2. Implement `get_model_config()` and `check_usage()`
3. Add `model` column to database
4. Update `/api/ai/status` to return model list
5. Test with existing `deepseek-chat`

### Phase 2: R1 Model Support (Week 2, Day 2)
1. Add `deepseek-reasoner` to config.json
2. Implement thinking extraction logic
3. Test R1 API calls with thinking enabled/disabled
4. Verify token counting

### Phase 3: Frontend UI (Week 2, Days 3-4)
1. Create `ModelSelector` component
2. Create `UsageIndicator` component
3. Add thinking block expansion
4. Wire to `/api/ai/chat` with model parameter

### Phase 4: Teacher Playground (Week 2, Day 5)
1. Detect teacher role from X-Auth-Realm header
2. Return `limits: null` for teachers
3. Show infinity symbols in UI
4. Test unlimited usage

### Phase 5: Testing & Rollout (Week 3, Day 1)
1. Integration tests for all models
2. Load testing with concurrent users
3. Gradual rollout: teachers first, then L4, then all levels

---

## Testing Checklist

### Unit Tests
- [ ] `get_model_config()` returns correct limits for student/teacher
- [ ] `check_usage()` enforces per-lesson-hour limit
- [ ] `check_usage()` enforces per-lesson-day limit
- [ ] `check_usage()` enforces per-student-day limit
- [ ] `check_usage()` returns null limits for teachers
- [ ] Thinking extraction works for R1 responses
- [ ] Thinking is hidden when `show_thinking=false`

### Integration Tests
- [ ] Student can switch between enabled models
- [ ] Student cannot select disabled models
- [ ] Usage counts increment correctly per model
- [ ] Depleted model shows "0/10" and disables selection
- [ ] Teacher sees infinity for all models
- [ ] Model selector updates after each request
- [ ] Thinking toggle appears only for R1
- [ ] Config reload works without restart

### UI Tests
- [ ] Model selector renders correctly
- [ ] Usage indicators update after each message
- [ ] Infinity symbol shows for teachers
- [ ] Thinking block expands/collapses
- [ ] Mobile layout works (stacked, scrollable)
- [ ] Error messages clear when limits hit

---

## Security Considerations

1. **Model Validation**: Always validate `model` parameter from client
2. **Role Verification**: Get role from trusted X-Auth-Realm header, never client
3. **Limit Bypass**: Teachers must be verified, not self-declared
4. **Thinking Content**: Never log thinking if `log_thinking_content=false`
5. **API Key**: Never expose in frontend, always server-side only
6. **Rate Limiting**: Global rate limit (10 req/s) before per-user limits

---

## Example Configurations

### Conservative (Production Start)
```json
{
  "models": {
    "deepseek-chat": {
      "enabled": true,
      "default": true,
      "student_limits": {
        "per_lesson_hour": 5,
        "per_lesson_day": 15,
        "per_student_day": 30
      }
    },
    "deepseek-reasoner": {
      "enabled": false
    }
  }
}
```

### Pilot (Testing R1)
```json
{
  "models": {
    "deepseek-chat": {
      "enabled": true,
      "default": true,
      "student_limits": {
        "per_lesson_hour": 10,
        "per_lesson_day": 25,
        "per_student_day": 60
      }
    },
    "deepseek-reasoner": {
      "enabled": true,
      "default": false,
      "student_limits": {
        "per_lesson_hour": 2,
        "per_lesson_day": 5,
        "per_student_day": 10
      }
    }
  }
}
```

### Full Rollout (All Models)
```json
{
  "models": {
    "deepseek-chat": {
      "enabled": true,
      "default": true,
      "student_limits": {
        "per_lesson_hour": 10,
        "per_lesson_day": 25,
        "per_student_day": 60
      }
    },
    "deepseek-reasoner": {
      "enabled": true,
      "default": false,
      "student_limits": {
        "per_lesson_hour": 3,
        "per_lesson_day": 10,
        "per_student_day": 20
      }
    },
    "deepseek-v4-pro": {
      "enabled": true,
      "default": false,
      "student_limits": {
        "per_lesson_hour": 5,
        "per_lesson_day": 15,
        "per_student_day": 30
      }
    }
  }
}
```

---

## Monitoring & Analytics

### Metrics to Track
- Model usage per user per day
- Reasoning tokens consumed (R1)
- Average response time per model
- Limit hits (how often users hit caps)
- Teacher vs student usage patterns
- Cost per model per day

### Dashboard Queries
```sql
-- Daily usage by model
SELECT day, model, COUNT(*) as requests, 
       AVG(reasoning_tokens) as avg_reasoning
FROM chats 
WHERE day >= date('now', '-7 days')
GROUP BY day, model
ORDER BY day DESC, requests DESC;

-- Students hitting limits
SELECT u, lesson, model, COUNT(*) as hits
FROM usage
WHERE day = date('now')
GROUP BY u, lesson, model
HAVING hits >= 10;

-- Cost estimation
SELECT day, model,
       SUM(total_tokens) / 1000.0 * cost_per_1k as estimated_cost
FROM chats
JOIN models ON chats.model = models.id
WHERE day >= date('now', '-30 days')
GROUP BY day, model;
```

---

## FAQ

**Q: Can students use R1 without limits?**  
A: No, R1 has stricter limits (3/hour vs 10/hour for Chat) to manage cost and prevent abuse.

**Q: Can teachers switch models mid-conversation?**  
A: Yes, model selection is per-request, not per-conversation.

**Q: What happens if a model is disabled mid-day?**  
A: Existing conversations gracefully fall back to default model with warning message.

**Q: Can we add custom models (e.g., local LLMs)?**  
A: Yes, add provider="custom" and implement custom API adapter.

**Q: How do we handle model deprecation?**  
A: Set `enabled: false` in config, show migration notice in UI for 30 days.

---

**Implementation Ready**: This spec can be implemented immediately by following the phase-by-phase plan.
