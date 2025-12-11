<script setup>
import { ref, onMounted, watch } from 'vue'

const STORAGE_KEY = 'fitnessPlanV1'

// ① 使用者的自由描述：今天想練什麼、哪邊不舒服、之前做了什麼等
const userNote = ref('')

// ② 使用者貼 LLM 回傳的 JSON
const jsonInput = ref('')

// ③ 內部的健身計畫狀態
const plan = ref({
  date: '',
  title: '',
  items: [] // { name, description, done }
})

// 是否顯示上方的「編輯／產生 JSON」區塊
const editorVisible = ref(true)

// UI 狀態
const statusMessage = ref('')
const statusType = ref('info') // 'info' | 'error' | 'success'

function setStatus(msg, type = 'info') {
  statusMessage.value = msg
  statusType.value = type
}

async function copyPromptForLLM() {
  const note = userNote.value.trim()
  if (!note) {
    setStatus('請先在上方輸入你今天想訓練的內容、狀況或想法。', 'error')
    return
  }

  const fullPrompt = `SYSTEM INSTRUCTION (WORKOUT JSON GENERATOR)

You are a deterministic JSON generator for a workout todo list.

RULES:
1. Respond with EXACTLY ONE JSON object.
2. Your ENTIRE reply MUST be wrapped in a markdown code block with language hint "json", like:
\`\`\`json
{ ... }
\`\`\`
3. Do NOT add any comments, explanations, headings, or natural language outside the JSON.
4. The JSON MUST be valid and directly parsable with JSON.parse.

OUTPUT FORMAT (this is a schema description, NOT an example):
{
  "date": "YYYY-MM-DD or empty string if unknown",
  "title": "short workout title in original language",
  "items": [
    {
      "name": "exercise name in original language",
      "description": "how to perform it, sets/reps/RPE notes"
    }
  ]
}

INSTRUCTIONS:
- If you are not sure about the date, set "date" to "".
- If some information is missing, infer a reasonable "description" from the note.
- Keep all exercise names and descriptions in the original language (Chinese or Japanese) whenever possible.
- You may break lines inside "description" for readability, but keep it as a single JSON string value.

VERY IMPORTANT:
- Your ENTIRE reply must be a single markdown code block:
  - First line: \`\`\`json
  - Then the JSON object
  - Last line: \`\`\`
- Do NOT prepend or append any other text.

NOW CONVERT THE FOLLOWING WORKOUT NOTE INTO THE JSON OBJECT DESCRIBED ABOVE.

USER_NOTE:
${note}
`

  try {
    await navigator.clipboard.writeText(fullPrompt)
    setStatus('已產生並複製完整 Prompt，去 LLM 貼上即可 ✅', 'success')
  } catch (err) {
    console.error(err)
    setStatus('複製失敗，可能瀏覽器不支援，請手動選取複製。', 'error')
  }
}

// ⑤ 載入 JSON 範例（方便測試）
function loadExampleJson() {
  const example = {
    date: '2025-12-10',
    title: '上半身推訓練（示範）',
    items: [
      {
        name: '槓鈴臥推',
        description: '熱身 2 組，正式 3 組 x 8 下，RPE 7，組間休息 90 秒。'
      },
      {
        name: '啞鈴肩推',
        description: '3 組 x 10 下，保持核心穩定。'
      },
      {
        name: '伏地挺身',
        description: '3 組 x 12–15 下，以穩定完整動作為主。'
      }
    ]
  }
  jsonInput.value = JSON.stringify(example, null, 2)
  setStatus('已載入示範 JSON，可以按 Generate Todo。', 'info')
}

// ⑥ 由 JSON 生成 Todo 計畫
function generatePlanFromJson() {
  let raw = jsonInput.value.trim()
  if (!raw) {
    setStatus('請先把 LLM 產生的 JSON 貼到下方 textarea。', 'error')
    return
  }

  // 如果有 ```json code block，嘗試剝掉
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```[a-zA-Z0-9]*\s*/, '')
    raw = raw.replace(/```$/, '').trim()
  }
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(raw)

    const date = parsed.date || ''
    const title = parsed.title || '未命名健身計畫'
    const itemsArray = Array.isArray(parsed.items) ? parsed.items : []

    const normalizedItems = itemsArray.map((item, index) => ({
      name: item.name || `動作 ${index + 1}`,
      description: item.description || '',
      done: false
    }))

    plan.value = {
      date,
      title,
      items: normalizedItems
    }

    saveToStorage()
    setStatus('已成功解析 JSON 並產生 Todo 列表 ✅', 'success')

    // 成功產生後，隱藏上方編輯區，只留下 Todo
    editorVisible.value = false
  } catch (err) {
    console.error(err)
    setStatus('JSON 解析失敗，請確認沒有多餘文字／尾逗號，且格式正確。', 'error')
  }
}

// ⑦ 點擊整個 block 切換完成狀態
function toggleItemDone(index) {
  const item = plan.value.items[index]
  if (!item) return
  item.done = !item.done
  saveToStorage()
}

// ⑧ 存入 localStorage
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan.value))
  } catch (err) {
    console.error(err)
    setStatus('存到 localStorage 失敗，可能容量不足。', 'error')
  }
}

// ⑨ 從 localStorage 載入（這裡順便決定要不要直接進訓練模式）
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw)

    if (parsed && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map(item => ({
        ...item,
        done: !!item.done
      }))
      plan.value = parsed

      // ⭐ 只要有任何 items，就直接進「訓練模式」：隱藏上方 textarea
      if (parsed.items.length > 0) {
        editorVisible.value = false
      }

      setStatus('已從 localStorage 載入上次的健身計畫。', 'info')
    }
  } catch (err) {
    console.error(err)
    setStatus('localStorage 內容解析失敗，可能已損壞。', 'error')
  }
}

// ⑩ 清除 localStorage 與當前計畫
function clearPlan() {
  if (!confirm('確定要清除目前計畫與完成狀態嗎？')) return
  localStorage.removeItem(STORAGE_KEY)
  plan.value = { date: '', title: '', items: [] }
  setStatus('已清除計畫與 localStorage。', 'info')
  editorVisible.value = true
}

// 初始化：載入 localStorage
onMounted(() => {
  loadFromStorage()
})

// 自動存 plan（保險）
watch(
  plan,
  () => {
    saveToStorage()
  },
  { deep: true }
)
</script>

<template>
  <div class="app-root">
    <div class="app-card">
      <!-- 上方整個「編輯＋產生 JSON」區塊，可以被隱藏 -->
      <div v-if="editorVisible">
        <h1 class="app-title">Workout Planner</h1>
        <p class="app-subtitle">
          先寫今天的狀況 ➜ 複製 Prompt 給 LLM ➜ 貼回 JSON ➜ 生成 Todo。
        </p>

        <!-- 1️⃣ 使用者自由輸入區 -->
        <section class="section">
          <div class="section-header">
            <h2>1️⃣ 今天想練什麼？</h2>
            <button class="btn primary pill" @click="copyPromptForLLM">
              📋 複製 Prompt
            </button>
          </div>
          <textarea
            v-model="userNote"
            class="textarea note-textarea"
            placeholder="例如：
- 最近肩膀有點緊，想多熱身
- 想加強胸跟肩，但昨天已經練過背
- 今天只有 50 分鐘可以訓練
- 不想做太多下半身動作"
          />
        </section>

        <!-- 2️⃣ 貼上 LLM 回傳 JSON -->
        <section class="section">
          <div class="section-header">
            <h2>2️⃣ 貼上 LLM 產生的 JSON</h2>
            <button class="btn secondary pill" @click="loadExampleJson">
              🧪 示範 JSON
            </button>
          </div>
          <textarea
            v-model="jsonInput"
            class="textarea json-textarea"
            placeholder='請把 LLM 產生的 JSON 貼在這裡，例如：
```json
{
  "date": "2025-12-10",
  "title": "上半身推訓練",
  "items": [
    { "name": "槓鈴臥推", "description": "..." }
  ]
}
```'
          />
          <button class="btn primary full" @click="generatePlanFromJson">
            🚀 生成今日訓練 Todo
          </button>
        </section>

        <!-- 狀態訊息 -->
        <p
          v-if="statusMessage"
          class="status"
          :class="{
            'status-info': statusType === 'info',
            'status-error': statusType === 'error',
            'status-success': statusType === 'success'
          }"
        >
          {{ statusMessage }}
        </p>
      </div>

      <!-- 3️⃣ Todo 區：永遠顯示，當 editor 隱藏時就像「全版 Todo 模式」 -->
      <section
        class="section todo-section"
        :class="{ 'todo-full': !editorVisible }"
      >
        <div class="todo-header">
          <div>
            <h2 class="todo-title">
              {{ plan.title || '目前還沒有載入任何健身計畫' }}
            </h2>
            <p class="todo-meta">
              <span v-if="plan.date">日期：{{ plan.date }}</span>
              <span v-if="plan.items.length">
                {{ plan.date ? ' ｜ ' : '' }}
                完成：
                {{
                  plan.items.filter(i => i.done).length
                }}/{{ plan.items.length }}
              </span>
            </p>
          </div>

          <div class="todo-header-actions" v-if="plan.items.length">
            <button
              class="btn secondary small pill"
              v-if="!editorVisible"
              @click="editorVisible = true"
            >
              ✏️ 編輯
            </button>
            <button class="btn danger small pill" @click="clearPlan">
              🗑 清除
            </button>
          </div>
        </div>

        <div v-if="!plan.items.length" class="empty">
          產生 Todo 後，這裡會出現可以點擊反白的訓練項目。
        </div>

        <ul v-else class="todo-list">
          <li
            v-for="(item, index) in plan.items"
            :key="index"
            class="todo-item"
            :class="{ done: item.done }"
            @click="toggleItemDone(index)"
          >
            <div class="todo-content">
              <div class="todo-name">
                {{ item.name }}
                <span v-if="item.done" class="badge">已完成</span>
              </div>
              <div class="todo-desc">
                {{ item.description }}
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 手機優先設計 */
.app-root {
  min-height: 100vh;
  background: #0f172a;
  padding: 12px 8px;
  display: flex;
  justify-content: center;
}

.app-card {
  width: 100%;
  max-width: 480px;
  background: #0b1120;
  border-radius: 18px;
  padding: 16px 14px 20px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.6);
  color: #e5e7eb;
}

.app-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
}

.app-subtitle {
  margin: 0 0 12px;
  font-size: 12px;
  color: #9ca3af;
}

.section {
  margin-top: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.section-header h2 {
  font-size: 14px;
  margin: 0;
}

/* Textareas：手機上比較大、好打字 */
.textarea {
  width: 100%;
  min-height: 100px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #1f2937;
  resize: vertical;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    sans-serif;
  font-size: 13px;
  background: #020617;
  color: #e5e7eb;
}

.textarea::placeholder {
  color: #6b7280;
}

.note-textarea {
  min-height: 130px;
}

.json-textarea {
  min-height: 140px;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}

.btn.pill {
  border-radius: 999px;
}

.btn.primary {
  background: #22c55e;
  color: #022c22;
  font-weight: 600;
}

.btn.secondary {
  background: #1f2937;
  color: #e5e7eb;
}

.btn.danger {
  background: #450a0a;
  color: #fecaca;
}

.btn.small {
  padding: 6px 10px;
  font-size: 12px;
}

.btn.full {
  width: 100%;
  margin-top: 8px;
}

.status {
  margin-top: 8px;
  font-size: 12px;
}
.status-info {
  color: #9ca3af;
}
.status-error {
  color: #fecaca;
}
.status-success {
  color: #bbf7d0;
}

/* Todo 區塊（手機版） */
.todo-section {
  margin-top: 16px;
}

.todo-section.todo-full {
  margin-top: 4px;
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.todo-header-actions {
  display: flex;
  gap: 6px;
}

.todo-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.todo-meta {
  margin: 2px 0 0;
  font-size: 11px;
  color: #9ca3af;
}

.empty {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}

/* Todo List：整塊可點、方便手指操作 */
.todo-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
}

.todo-item {
  padding: 14px 14px;
  border-radius: 12px;
  border: 1px solid #1f2937;
  background: #020617;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.08s;
}

.todo-item:hover {
  background: #020617;
  border-color: #374151;
}

.todo-item:active {
  transform: scale(0.97);
}

.todo-item.done {
  background: #022c22;
  border-color: #22c55e;
}

.todo-content {
  flex: 1;
}

.todo-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.todo-desc {
  font-size: 13px;
  color: #e5e7eb;
  white-space: pre-line;
}

.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: #22c55e;
  color: #022c22;
}

/* 大一點螢幕時就當「窄版 App」放中間 */
@media (min-width: 768px) {
  .app-root {
    padding-top: 24px;
  }
}
</style>
