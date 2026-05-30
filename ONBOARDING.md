# agentflow — Onboarding cho thành viên mới

Tài liệu này dành cho **1 bạn mới hoàn toàn**, chưa từng dùng agentflow. Đọc từ trên xuống, làm theo từng bước. Cuối tài liệu bạn sẽ chạy được trọn vẹn 1 ticket → ra 1 PR.

> Bạn dùng AI tool nào thì nhảy tới đúng phần của tool đó ở Bước 4:
> - **Claude Code** → [Phần 4A](#4a--chạy-với-claude-code)
> - **Cursor** → [Phần 4B](#4b--chạy-với-cursor)
> - **GitHub Copilot** → [Phần 4C](#4c--chạy-với-github-copilot)

---

## Bước 0 — agentflow là gì (đọc 1 phút)

Là 1 CLI điều phối **1 quy trình chuẩn** cho cả team khi làm 1 ticket Jira:

```
prime ─ init ─ ticket-audit ─ plan loop ─ ✋approve ─ code(TDD) ─ verify ─ summary ─ ✋approve ─ ship ─ retro
                              (AI nghĩ)    (bạn duyệt)  (AI code)  (test)   (AI viết)  (bạn duyệt) (PR)  (học)
```

- CLI lo phần "máy móc": gọi Jira, tạo branch, chạy test, tạo PR, comment ticket.
- **AI tool của bạn** (Claude/Cursor/Copilot) lo phần "suy nghĩ": research, lập plan, viết code.
- Có **2 cổng ✋ human approve** — bạn là người quyết định, AI không tự ý merge.

Bạn KHÔNG cần nhớ prompt. agentflow tự sinh prompt chuẩn cho từng bước.

---

## Bước 1 — Cài đặt 1 lần trên máy

```bash
# 1.1 — Cài tool (chọn 1 trong 2 cách)

# Cách A (gọn nhất): cài global thẳng từ GitHub
npm install -g git+ssh://git@github.com/pmnhat95/agentflow.git

# Cách B (nếu muốn xem/sửa code tool): clone rồi link
git clone git@github.com:pmnhat95/agentflow.git ~/Documents/tools/agentflow
cd ~/Documents/tools/agentflow
npm install
npm link

# 1.2 — Kiểm tra cài thành công
agentflow --help        # phải in ra danh sách lệnh
```

> Nếu báo `command not found: agentflow` → kiểm tra `npm bin -g` có nằm trong `$PATH` không. Thường là `~/.nvm/versions/node/<ver>/bin`. Thêm vào `~/.zshrc` nếu thiếu.

```bash
# 1.3 — Cài GitHub CLI (để tạo PR)
brew install gh
gh auth login           # chọn GitHub.com → SSH → làm theo hướng dẫn

# 1.4 — Cài AI tool bạn dùng (chỉ cần 1):
#   Claude Code: https://docs.anthropic.com/en/docs/claude-code  → rồi `claude --version`
#   Cursor:      https://cursor.com
#   Copilot:     VS Code + extension "GitHub Copilot" + "GitHub Copilot Chat"

# 1.5 — Lấy Jira API token
#   Mở: https://id.atlassian.com/manage-profile/security/api-tokens
#   → "Create API token" → copy
```

```bash
# 1.6 — Khai báo credential Jira (thêm vào ~/.zshrc để khỏi gõ lại)
echo 'export JIRA_EMAIL=ten.ban@opswat.com' >> ~/.zshrc
echo 'export JIRA_TOKEN=dán-token-vào-đây'   >> ~/.zshrc
source ~/.zshrc
```

✅ Xong Bước 1. Phần này chỉ làm **1 lần duy nhất** trên máy.

---

## Bước 2 — Chuẩn bị repo (1 lần cho mỗi project)

```bash
cd ~/path/to/du-an-team        # vào repo code thật của team

# 2.1 — Cho agentflow "đọc" repo 1 lần để hiểu cấu trúc/convention
agentflow prime
# → tạo .agentflow/codemap.md  (ngôn ngữ, test framework, linter, layout...)
```

Mở file `.agentflow/config.yaml` vừa sinh, sửa 3 chỗ:

```yaml
ai_tool: claude          # 👈 ĐỔI thành 'cursor' hoặc 'copilot' nếu bạn dùng tool khác
jira:
  base_url: https://opswat.atlassian.net   # 👈 URL Jira của team
verify:
  commands:              # 👈 lệnh build/test/lint của repo này
    - npm run lint
    - npm test
```

```bash
# 2.2 — Nếu repo team đã có ai chạy prime/retro trước rồi:
#       thì .agentflow/codemap.md + lessons/ đã có sẵn trong git, bạn chỉ cần `git pull`.
#       Chỉ cần sửa ai_tool trong config cho đúng tool của bạn.
```

✅ Xong Bước 2. Làm 1 lần cho mỗi repo.

---

## Bước 3 — Bắt đầu 1 ticket (giống nhau cho mọi tool)

Giả sử bạn được giao ticket **`OSP-123`**.

```bash
cd ~/path/to/du-an-team
git checkout main && git pull        # đảm bảo branch sạch, mới nhất

agentflow init OSP-123
```

Bạn sẽ thấy:
```
— Initializing agentflow for OSP-123 (ai_tool=claude)
— Fetching ticket from Jira...
✓ Ticket: OSP-123 — Add retry to webhook sender
— Auditing ticket quality...
✓ Ticket audit score: 0.82 (see .agentflow/ticket-audit.md)
✓ Created feature/osp-123-add-retry-to-webhook-sender

Next: agentflow plan
```

- Nếu **điểm < 0.75** (ticket mơ hồ), CLI sẽ hỏi: `[c]ontinue / [a]sk reporter / [q]uit`.
  - Chọn `a` → agentflow tự comment lên Jira xin reporter làm rõ.
  - Chọn `c` → làm tiếp luôn.

✅ Branch đã tạo. Giờ tới phần riêng theo tool của bạn 👇

---

## 4A — Chạy với **Claude Code**

> Claude Code chạy **tự động** (headless). Bạn chỉ gõ lệnh, AI tự làm. Đây là trải nghiệm mượt nhất.

### Phase plan
```bash
agentflow plan
```
Terminal sẽ stream quá trình. Bên trong, 3 vai chạy lần lượt nhiều vòng:
```
──── loop round 1/3 ────
— Running researcher-r1...      (Claude đọc code repo, viết research.md)
— Running planner-r1...         (Claude viết plan.md có cấu trúc)
— Running critic-r1...          (Claude verify plan với file thật)
Round 1 verdict: FAIL           (Critic thấy thiếu → loop tiếp)
──── loop round 2/3 ────
...
Round 2 verdict: PASS
✓ Plan accepted by Critic after 2 round(s).

Review .agentflow/plan.md, then run: agentflow approve
```

**Nếu AI thiếu thông tin** (không suy luận được từ code/ticket), loop sẽ DỪNG lại:
```
Q&A pause — Researcher (round 2)
Researcher needs human input. Questions written to .agentflow/qa.md.
Answer them in .agentflow/qa-answers.md (one block per question, in order).
Press Enter when answers are saved
```
→ Mở `.agentflow/qa.md` đọc câu hỏi → viết câu trả lời vào `.agentflow/qa-answers.md` → Save → quay lại terminal bấm **Enter**.

### Cổng duyệt #1
```bash
agentflow approve
```
```
──── approval: plan ────
Artifact: .agentflow/plan.md
Choose: [a]pprove  [e]dit  [r]eject with reason  [l]oop again
Action
```
- `a` = đồng ý, qua bước code.
- `e` = mở plan.md trong editor để bạn sửa tay, save xong hỏi lại.
- `r` = từ chối + ghi lý do (lý do không feed lại, chỉ ghi chú).
- `l` = chạy lại loop thêm vòng + nhập gợi ý cho AI.

→ Đọc kỹ `.agentflow/plan.md` (file này là "hợp đồng"), thấy ổn thì gõ `a`.

### Phase code + verify
```bash
agentflow code            # Claude viết test trước (TDD), rồi viết code đến khi pass
agentflow verify          # chạy lint/test; nếu fail → Claude tự sửa (tối đa 3 lần)
```

### Phase summary + duyệt #2 + ship
```bash
agentflow summary         # Claude viết mô tả PR
agentflow approve         # đọc .agentflow/summary.md → gõ a
agentflow ship            # push branch + tạo PR + comment link lên Jira OSP-123
```
```
✓ PR opened: https://github.com/.../pull/45
✓ Comment posted to OSP-123
Done. Phase → done.
```

🎉 Xong! PR đã lên, ticket đã có comment link.

### Mẹo Claude Code
- Lười gõ từng phase? Dùng `agentflow next` — nó tự chạy phase kế tiếp theo state.
- Xem chi phí: `agentflow cost`.

---

## 4B — Chạy với **Cursor**

> Cursor không chạy headless. agentflow sẽ **viết prompt ra file → mở Cursor → bạn paste vào Composer → lưu kết quả → tiếp tục**. Cùng quy trình, chỉ thêm thao tác copy/paste.

Đảm bảo `.agentflow/config.yaml` có `ai_tool: cursor`.

### Phase plan
```bash
agentflow plan
```
Terminal dừng và hiện (cho vai đầu tiên — Researcher):
```
──────── manual step: researcher-r1 ────────
Prompt:  .agentflow/prompt.researcher-r1.md
Output:  .agentflow/output.researcher-r1.md
Hint:    In Cursor: Cmd+I → paste prompt → run Composer → copy result into the output file.
Open your AI tool, feed it the prompt above, and save the response to the output file.
Press Enter when the output file is saved (or type "skip" to abort)
```

**Làm trong Cursor:**
1. Cursor tự mở file `prompt.researcher-r1.md` (agentflow gọi lệnh `cursor`). Nếu không mở → tự mở file đó.
2. Nhấn **Cmd+I** mở Composer, bật **agent mode** (để Composer được đọc file repo — quan trọng cho vai Critic).
3. **Copy toàn bộ nội dung** `prompt.researcher-r1.md` → **paste vào Composer** → chạy.
   - Đầu prompt có dòng `> Suggested model: haiku` → chọn model đó trong Composer cho tiết kiệm.
4. Composer chạy xong → **copy kết quả** → **paste vào** `.agentflow/output.researcher-r1.md` → **Cmd+S** lưu.
5. Quay lại terminal → bấm **Enter**.

→ agentflow đọc output, rồi lặp lại y hệt cho **Planner**, rồi **Critic**. Mỗi vai 1 lần copy/paste. Critic PASS thì xong loop.

### Cổng duyệt #1
```bash
agentflow approve         # giống Claude: a/e/r/l → đọc plan.md → gõ a
```

### Phase code (quan trọng với Cursor)
```bash
agentflow code
```
Terminal hiện manual step cho `coder`. Trong Cursor:
1. Mở `prompt.coder.md`, copy vào Composer (**agent mode** để Composer tự sửa file repo).
2. Composer viết test + code. **Yêu cầu Composer chạy `npm test`** ngay trong Composer để confirm xanh.
3. Viết tóm tắt những gì đã làm vào `.agentflow/output.coder.md` → Save → Enter.

### verify + summary + ship
```bash
agentflow verify          # CLI tự chạy lint/test (không cần Cursor).
                          # Nếu fail → hiện manual step "repair" → đưa prompt cho Composer sửa.
agentflow summary         # manual step: đưa prompt.summary cho Composer → lưu output → Enter
agentflow approve         # đọc summary.md → a
agentflow ship            # CLI push + tạo PR + comment Jira
```

🎉 Xong!

### Mẹo Cursor
- **Luôn bật agent mode** trong Composer — nếu không, Critic và Coder không đọc/sửa được file thật, chất lượng giảm mạnh.
- Add `.agentflow/**/*.md` vào context của Composer (Cmd+L) để nó thấy plan/research.
- `cursor` chưa mở file tự động? Trong Cursor: Cmd+Shift+P → "Install 'cursor' command in PATH".

---

## 4C — Chạy với **GitHub Copilot**

> Copilot cũng manual như Cursor, nhưng Copilot Chat **không tự sửa file** (chỉ trả lời text). Nên ở phase code bạn phải tự apply code. Đảm bảo `.agentflow/config.yaml` có `ai_tool: copilot`.

### Phase plan
```bash
agentflow plan
```
Terminal dừng tại manual step:
```
──────── manual step: researcher-r1 ────────
Prompt:  .agentflow/prompt.researcher-r1.md
Output:  .agentflow/output.researcher-r1.md
Hint:    In VS Code: open Copilot Chat → paste prompt → save Copilot reply into the output file.
Press Enter when the output file is saved
```

**Làm trong VS Code:**
1. VS Code mở file `prompt.researcher-r1.md` (agentflow gọi lệnh `code`).
2. **Trước khi hỏi**: mở sẵn các file repo liên quan trong editor để Copilot Chat có context (Copilot chỉ "thấy" file đang mở + `@workspace`).
3. Mở **Copilot Chat** (Cmd+Ctrl+I). Gõ `@workspace` rồi **paste nội dung** `prompt.researcher-r1.md`.
4. Copilot trả lời → **copy** → **paste vào** `.agentflow/output.researcher-r1.md` → Save.
5. Terminal → **Enter**.

→ Lặp lại cho Planner, Critic.
- **Critic** cần verify file thật → mở sẵn các file mà plan nhắc tới, và dùng `@workspace` để Copilot quét repo.

### Cổng duyệt #1
```bash
agentflow approve         # đọc plan.md → a
```

### Phase code (Copilot khác Cursor ở đây)
```bash
agentflow code
```
Trong VS Code:
1. Mở `prompt.coder.md`, paste vào Copilot Chat (kèm `@workspace`).
2. Copilot **đề xuất** code (không tự sửa file). Bạn:
   - Dùng nút **"Apply in Editor"** / "Insert" của Chat, hoặc copy/paste thủ công vào đúng file.
   - **Tự chạy** `npm test` trong terminal VS Code để confirm.
3. Ghi tóm tắt thay đổi + kết quả test vào `.agentflow/output.coder.md` → Save → Enter.

> 💡 Nếu team có **GitHub Copilot Workspace** (sản phẩm preview, gần "agent" hơn): dùng nó thay Chat cho phase code — nó sửa được nhiều file 1 lúc, mượt như Cursor Composer.

### verify + summary + ship
```bash
agentflow verify          # CLI tự chạy test. Fail → manual step repair → đưa prompt cho Copilot Chat
agentflow summary         # manual step: đưa prompt.summary cho Chat → lưu output → Enter
agentflow approve         # đọc summary.md → a
agentflow ship            # CLI push + PR + comment Jira
```

🎉 Xong!

### Mẹo Copilot
- Luôn `@workspace` + mở sẵn file liên quan, vì Copilot context hẹp hơn Cursor/Claude.
- Header `Suggested model` trong prompt → Copilot không cho chọn model per-message, bỏ qua được.
- Phase code tốn công nhất với Copilot Chat thuần → cân nhắc Copilot Workspace nếu có.

---

## Bước 5 — Sau khi PR được review & merge

```bash
agentflow retro           # đọc diff đã merge + review comment → rút "bài học" chung
```
```
✓ Saved lesson → .agentflow/lessons/use-retry-budget-helper.md
Lessons live in .agentflow/lessons/. Commit them so the team shares the knowledge.
```

```bash
# Commit codemap + lessons để cả team hưởng (lần ticket sau AI sẽ tự áp dụng):
git add .agentflow/codemap.md .agentflow/lessons/
git commit -m "chore(agentflow): add lessons from OSP-123"
git push

# Xem đã tốn bao nhiêu tiền token:
agentflow cost            # run hiện tại
agentflow cost --all      # tất cả các run
```

---

## Sổ tay lệnh nhanh

```bash
agentflow status          # đang ở phase nào, branch nào
agentflow next            # chạy phase kế tiếp tự động (theo state)
agentflow init OSP-123    # bắt đầu ticket mới
agentflow plan            # chạy/lặp lại loop plan
agentflow approve         # cổng duyệt (dùng cho cả plan lẫn summary)
agentflow code            # phase code (TDD)
agentflow verify          # build/test/lint + auto-repair
agentflow summary         # sinh mô tả PR
agentflow ship            # tạo PR + comment Jira
agentflow retro [<PR>]    # rút bài học sau merge
agentflow cost [--all]    # ước tính chi phí token
```

## Khi bí — xem nhanh

| Triệu chứng | Cách xử lý |
|---|---|
| `command not found: agentflow` | `npm bin -g` chưa trong PATH → thêm vào `~/.zshrc` |
| `gh: command not found` | `brew install gh && gh auth login` |
| `JIRA_TOKEN not set` | `source ~/.zshrc` lại, hoặc kiểm tra đã export chưa |
| Critic FAIL mãi ở round 3 | Đọc `.agentflow/critique/r3.md`, sửa tay `plan.md` rồi `approve` → `a` |
| Q&A hỏi lại hoài | Trả lời cụ thể hơn (đường dẫn file, tên hàm) trong `qa-answers.md` |
| Muốn xem prompt AI đã nhận | `.agentflow/audit/<run-id>/*-prompt.md` |
| Tốn tiền quá | `agentflow cost`, hạ tier trong `config.yaml` (`models.roles.planner: cheap`) |

Chi tiết kiến trúc & lý do design: xem `README.md`. Hướng dẫn theo tool đầy đủ: `USAGE.md`.
```
