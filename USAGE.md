# agentflow — Hướng dẫn sử dụng

> Tool nằm tại: **`/Users/nhatphan/agentflow`**
> Đây là file hướng dẫn nhanh dành cho dev. Tham khảo chi tiết kiến trúc + lý do design xem `README.md`.

agentflow là **1 workflow chuẩn cho cả team**, chạy được trên **Claude Code**, **Cursor**, hoặc **GitHub Copilot** — dev chọn AI tool nào cũng đi qua cùng các phase:

```
prime → init → ticket-audit → plan loop → approve → code (TDD) → verify → summary → approve → ship → retro
```

---

## 1. Cài đặt (làm 1 lần)

```bash
# 1. Link CLI global
cd /Users/nhatphan/agentflow
npm install
npm link                  # → lệnh `agentflow` chạy được ở bất kỳ đâu

# 2. Cài prerequisites
brew install gh           # GitHub CLI (chưa có trên máy anh)
gh auth login             # đăng nhập

# 3. Cài AI tool tuỳ chọn (ít nhất 1):
# - Claude Code: https://docs.anthropic.com/en/docs/claude-code
# - Cursor:      https://cursor.com
# - VS Code + GitHub Copilot extension

# 4. Lấy Jira API token
#    → https://id.atlassian.com/manage-profile/security/api-tokens
```

## 2. Cấu hình project (làm 1 lần / repo)

```bash
cd /path/to/team/repo

# Set credentials Jira (thêm vào ~/.zshrc hoặc 1 file env riêng)
export JIRA_EMAIL=you@yourorg.com
export JIRA_TOKEN=<your-api-token>

# Quét repo + tạo codemap (đọc layout, lint, test framework, conventions)
agentflow prime
# → tạo .agentflow/codemap.md  (commit file này vào git để team chia sẻ)
```

Mở `.agentflow/config.yaml` vừa được tạo và sửa:

```yaml
ai_tool: claude          # đổi thành 'cursor' hoặc 'copilot' nếu dev đó dùng tool khác
jira:
  base_url: https://yourorg.atlassian.net
verify:
  commands:              # team config commands chạy build/test/lint
    - npm run lint
    - npm test
    - npm run build
```

**Commit vào git:** `config.yaml`, `codemap.md`, `lessons/` (knowledge base chung của team).
**Add `.gitignore`:** mọi thứ khác trong `.agentflow/` (per-ticket noise + audit log).

```bash
# .gitignore
.agentflow/state.json
.agentflow/ticket*.md
.agentflow/research.md
.agentflow/plan.md
.agentflow/critique/
.agentflow/qa*.md
.agentflow/coder-*.md
.agentflow/diff.*
.agentflow/summary.md
.agentflow/prompt.*.md
.agentflow/audit/
.agentflow/output.*.md
.agentflow/codemap-*.{json,txt,md}
```

## 3. Workflow chuẩn (mọi tool đều giống nhau)

```bash
# Bắt đầu 1 ticket
agentflow init PROJ-123

# Chạy planner loop (Researcher ↔ Planner ↔ Critic)
agentflow plan

# Review plan.md → approve
agentflow approve

# Coder phase (TDD)
agentflow code

# Build / test / lint (auto repair nếu fail)
agentflow verify

# Sinh PR description
agentflow summary
agentflow approve

# Tạo PR + comment link lên Jira
agentflow ship

# Sau khi PR merge:
agentflow retro          # rút bài học → .agentflow/lessons/

# Xem chi phí token
agentflow cost
```

Lệnh tắt:
```bash
agentflow next           # tự chạy phase tiếp theo dựa trên state hiện tại
agentflow status         # xem đang ở phase nào, branch nào
```

---

## 4. Khi dùng **Claude Code** (chế độ headless — full auto)

Đây là cách dùng **mạnh nhất** vì Claude Code chạy headless: agentflow gọi `claude -p` qua stdin, mỗi role chạy trong session sạch, Critic dùng tool thật để grep/read file → grounded verification 100%.

### Setup
```yaml
# .agentflow/config.yaml
ai_tool: claude
```

### Cách chạy
Chỉ cần gọi `agentflow next` từng phase — không cần làm gì khác. Mọi role tự chạy.

```bash
agentflow init PROJ-123
agentflow next             # planner loop chạy tự động, có thể tốn vài phút
                           # nếu Researcher/Planner thiếu info → CLI sẽ pause,
                           # hiện câu hỏi, đợi anh điền .agentflow/qa-answers.md
agentflow next             # mở 4-option approval (a/e/r/l) cho plan
agentflow next             # Coder viết code + test (TDD)
agentflow next             # verify chạy build/test/lint, repair nếu fail
agentflow next             # Summarizer sinh PR description
agentflow next             # approval gate #2
agentflow next             # ship: PR + comment Jira
```

### Cost optimization
Claude Code adapter pass `--model <id>` đúng tier cho từng role:
- Researcher / Critic / Summarizer / TicketAudit → **Haiku** (cheap)
- Planner / Coder / Repair / Retro → **Sonnet** (strong)

→ Một ticket trung bình tốn **~$0.70-0.80** thay vì $1.50 nếu mọi role chạy Sonnet.

### Override model
```yaml
# .agentflow/config.yaml
models:
  roles:
    critic: strong                  # ép Critic dùng Sonnet
    coder:  claude-opus-4-7         # ép Coder dùng Opus (escape hatch)
```

### Q&A pause khi thiếu info
Nếu Researcher/Planner báo thiếu info, terminal sẽ hiện:
```
Q&A pause — Researcher (round 2)
Researcher needs human input. Questions written to .agentflow/qa.md.
Answer them in .agentflow/qa-answers.md (one block per question, in order).
Press Enter when answers are saved
```
→ Mở `.agentflow/qa.md` đọc câu hỏi, viết câu trả lời vào `.agentflow/qa-answers.md`, save, quay lại terminal Enter.

---

## 5. Khi dùng **Cursor** (manual handoff)

Cursor không có headless mode cho agent coding nên agentflow chạy ở chế độ "manual": **CLI viết prompt ra file → mở Cursor → dev paste vào Composer → save kết quả → tiếp tục**.

### Setup
```yaml
# .agentflow/config.yaml
ai_tool: cursor
```

### Cách chạy

Khi gọi `agentflow plan`, terminal sẽ hiện:
```
─────────── manual step: researcher-r1 ───────────
Prompt:  .agentflow/prompt.researcher-r1.md
Output:  .agentflow/output.researcher-r1.md
Hint:    In Cursor: Cmd+I → paste prompt → run Composer → copy result into the output file.
Open your AI tool, feed it the prompt above, and save the response to the output file.
Press Enter when the output file is saved (or type "skip" to abort)
```

Cursor sẽ tự động mở file prompt (vì CLI gọi lệnh `cursor`). Đầu file prompt có dòng:
```
> [agentflow] Suggested model for this step: **haiku**
```
→ Chọn model tương ứng trong Cursor cho cost alignment.

### Quy trình từng bước trong Cursor

1. **Cursor mở file `.agentflow/prompt.researcher-r1.md`** (CLI mở giúp).
2. **Cmd+I** mở Composer.
3. **Copy nội dung file prompt → paste vào Composer**.
4. Composer chạy (đọc code, sinh output).
5. **Copy output của Composer → paste vào `.agentflow/output.researcher-r1.md`** → Save (Cmd+S).
6. Về terminal **bấm Enter**. CLI đọc output, đi tiếp phase kế.

### Mẹo dùng Cursor hiệu quả với agentflow

- **Để Composer thấy file `.agentflow/*`**: thêm `.agentflow/**/*.md` vào "context" của Composer (Cmd+L → add files).
- **Critic phase**: Critic yêu cầu verify file thật → bật Composer's "agent mode" để nó có quyền Read file. Nếu không, Critic chỉ verify được những gì anh paste vào → giảm chất lượng grounded check.
- **TDD trong Coder phase**: yêu cầu Composer chạy `npm test` (hoặc lệnh test của repo) trước khi anh save output, để confirm tests đỏ → xanh đúng quy trình.
- **Tránh lệch model**: header `Suggested model: haiku` chỉ là gợi ý — nếu muốn Cursor pro tip, đặt Composer model dropdown đúng tier (Cursor có ô chọn model trong Composer settings).

---

## 6. Khi dùng **GitHub Copilot** (manual handoff)

Tương tự Cursor — không headless. CLI mở prompt file trong VS Code, dev dùng Copilot Chat làm việc.

### Setup
```yaml
# .agentflow/config.yaml
ai_tool: copilot
```

### Cách chạy

Khi CLI cần Copilot làm việc, terminal hiện:
```
─────────── manual step: planner-r1 ───────────
Prompt:  .agentflow/prompt.planner-r1.md
Output:  .agentflow/output.planner-r1.md
Hint:    In VS Code: open Copilot Chat → paste prompt → save Copilot reply into the output file.
Press Enter when the output file is saved
```

### Quy trình trong VS Code

1. **VS Code mở prompt file** (CLI tự `code` mở giúp).
2. **Ctrl+Alt+I (Mac: Cmd+Ctrl+I)** mở Copilot Chat hoặc click icon Chat.
3. **Paste nội dung prompt vào Chat**.
4. Copilot trả về output.
5. **Copy output → paste vào file `.agentflow/output.planner-r1.md`** → Save.
6. Về terminal **bấm Enter**.

### Lưu ý đặc thù Copilot

- **Copilot không có "agent mode" mặc định như Cursor's Composer** — Chat trả lời text, không tự edit file. Khi đến phase `code` (Coder), anh sẽ phải:
  - Đưa prompt cho Copilot Chat → Chat đề xuất code
  - **Tự apply code vào file** (Copy/Paste hoặc dùng "Apply" của Chat nếu có)
  - **Tự chạy test** trong terminal
  - Ghi lại "Coder log" vào `.agentflow/output.coder.md`

- **Copilot Workspace** (preview product của GitHub) gần "agent" hơn — nếu team có truy cập, dùng nó thay Chat sẽ smooth hơn nhiều cho phase Coder. Workflow tương tự Cursor: paste prompt → Workspace edit nhiều file → copy summary vào output.

- **Tốc độ Critic kém hơn**: Critic yêu cầu verify file thật. Copilot Chat chỉ thấy file hiện đang mở trong editor. Trước khi paste prompt Critic, mở các file plan đề cập trong VS Code để Chat có context.

- **Model tiering qua header**: file prompt có dòng `> Suggested model: haiku` nhưng Copilot không cho chọn model per-message. Bỏ qua header, cứ dùng model mặc định.

---

## 7. So sánh nhanh 3 tool

| Tiêu chí | Claude Code | Cursor | Copilot |
|---|---|---|---|
| Headless / auto chạy | ✅ Full | ❌ Manual | ❌ Manual |
| Grounded Critic (verify file thật) | ✅ | △ (agent mode) | ✗ (chỉ file đang mở) |
| Model tiering tự động | ✅ | △ (Composer model selector) | ✗ |
| TDD loop (test trước, code sau) | ✅ Tự động | ✅ trong Composer | △ phải tự chạy test |
| Verify + Repair auto | ✅ | ✅ | ✅ (CLI vẫn chạy được) |
| Cost ước tính | ✅ chính xác | △ token Cursor không expose | △ |
| Team onboarding | dễ nhất | dễ | trung bình (Workspace giúp) |

**Khuyến nghị:** dev có thể dùng tool yêu thích, nhưng team nên có ít nhất 1 dev đặt `ai_tool: claude` để chạy `agentflow prime` và `agentflow retro` (2 phase này hưởng lợi nhiều nhất từ headless + grounded read).

---

## 8. Workflow sau khi PR merge (mọi tool)

```bash
agentflow retro             # dùng state.prUrl tự động
agentflow retro 1234        # hoặc chỉ định PR cụ thể
```

Retro Extractor đọc:
- `plan.md` (kế hoạch đã approve)
- Diff thật của merge commit
- Review comments trên PR

→ Sinh **lessons generalizable** (không phải chi tiết của ticket này) vào `.agentflow/lessons/<slug>.md`. **Commit** file lesson vào git để team chia sẻ. Lần `plan`/`code` sau, agentflow keyword-match lesson với ticket mới → inject top 5 vào prompt.

```bash
# Xem chi phí 1 run cụ thể
agentflow cost

# Xem tổng tất cả run
agentflow cost --all
```

---

## 9. Troubleshooting

**`gh: command not found`**
```bash
brew install gh && gh auth login
```

**`Claude Code CLI not found`**
Cài tại https://docs.anthropic.com/en/docs/claude-code rồi `claude --version` confirm.

**Cursor không tự mở khi gọi `agentflow plan`**
CLI gọi lệnh `cursor`. Nếu chưa có trong PATH: trong Cursor mở Command Palette → "Install 'cursor' command in PATH".

**Copilot Chat không thấy file `.agentflow/*`**
Mở file thủ công trong VS Code (`File → Open File…`) trước khi paste prompt, hoặc dùng `@workspace` trong Chat để bring repo context.

**Critic luôn FAIL ở vòng cuối (FAIL ở round 3)**
Mở `.agentflow/critique/r3.md` xem gap cụ thể. 2 lựa chọn:
- Edit `.agentflow/plan.md` thủ công sửa gap → `agentflow approve` chọn `[a]pprove` (override Critic)
- `agentflow approve` chọn `[l]oop again` + nhập hint → loop thêm rounds (sẽ tăng `max_loop_rounds` trong config)

**Q&A pause loop vô tận**
Nếu Researcher cứ hỏi sau khi đã trả lời: trả lời rõ ràng hơn trong `qa-answers.md` (cụ thể file path, function name). Hoặc bỏ qua bằng `[a]pprove` ở gate sau.

**Hết tiền không kiểm soát**
```bash
agentflow cost              # check run hiện tại
# Hạ tier nếu cần:
# .agentflow/config.yaml
#   models:
#     roles:
#       planner: cheap      # dùng Haiku cho Planner luôn (đánh đổi chất lượng)
```

**Muốn debug 1 prompt cụ thể đã chạy**
```bash
ls .agentflow/audit/<run-id>/
# Mỗi role có 3 file: -prompt.md, -output.md, -meta.json (có timestamp, model dùng)
```

---

## 10. Cheat sheet

```bash
# Setup
cd /Users/nhatphan/agentflow && npm link
cd ~/your-repo
agentflow prime

# Mỗi ticket
agentflow init PROJ-123    # fetch + audit ticket
agentflow next              # plan loop (auto/manual tuỳ tool)
agentflow next              # approve plan
agentflow next              # code (TDD)
agentflow next              # verify + auto-repair
agentflow next              # summary
agentflow next              # approve summary
agentflow next              # ship (PR + Jira comment)

# Sau PR merge
agentflow retro             # rút lesson
agentflow cost              # check $ spent
```
