# agentflow — Onboarding cho thành viên mới

Tài liệu cho **1 bạn mới hoàn toàn**. Cách dùng: cài 1 lần, rồi chỉ cần **1 slash command duy nhất** trong cửa sổ chat của AI tool (Claude Code / Cursor / Copilot), AI tự chạy cả quy trình:

```
/agentflow-start MDF-112
```

AI sẽ tự động chạy liên tiếp:
```
lấy ticket → research → lập plan ─┐
                                  ⛔ GATE 1: dừng, chờ bạn "approved"
code (TDD) → verify (test/lint) → viết mô tả PR ─┐
                                                 ⛔ GATE 2: dừng, chờ bạn "approved"
tạo PR + commit + comment Jira → tự rút bài học
```

> **Chỉ dừng đúng 2 chỗ cần người duyệt.** Đến gate, AI đưa bạn xem rồi đứng im chờ. Bạn gõ **`approved`** (hoặc bảo nó sửa) → AI tự chạy tiếp. Không phải gõ từng lệnh.

Vẫn có lệnh lẻ nếu muốn điều khiển tay từng bước: `/agentflow-plan`, `/agentflow-code`, `/agentflow-verify`, `/agentflow-ship`. Và `/agentflow-continue` để chạy tiếp nếu lỡ đóng session giữa chừng.

---

## Bước 1 — Cài 1 lần trên máy

```bash
# 1.1 Cài CLI agentflow (đây chỉ là "bộ máy" chạy ngầm, bạn sẽ không gõ trực tiếp nhiều)
npm install -g git+ssh://git@github.com/pmnhat95/agentflow.git
agentflow --help          # kiểm tra cài được

# 1.2 GitHub CLI (để tạo PR)
brew install gh && gh auth login

# 1.3 Jira token → https://id.atlassian.com/manage-profile/security/api-tokens
echo 'export JIRA_EMAIL=ten.ban@opswat.com' >> ~/.zshrc
echo 'export JIRA_TOKEN=dán-token-vào-đây'   >> ~/.zshrc
source ~/.zshrc

# 1.4 AI tool: cài Claude Code / Cursor / hoặc VS Code + Copilot (chỉ cần 1 cái bạn dùng)
```

✅ Làm 1 lần duy nhất.

---

## Bước 2 — Bật slash command cho repo (1 lần / project)

```bash
cd ~/du-an-team           # vào folder code team

agentflow prime           # cho AI "đọc" repo 1 lần (cấu trúc, lint, test framework)
agentflow install         # 👈 tạo các file slash command cho AI tool
```

`agentflow install` tự phát hiện bạn dùng tool nào (có `.claude/`, `.cursor/`, hay `.github/`) và đặt file lệnh vào đúng chỗ:

| Tool | File được tạo |
|---|---|
| Claude Code | `.claude/commands/agentflow-*.md` |
| Cursor | `.cursor/commands/agentflow-*.md` |
| Copilot | `.github/prompts/agentflow-*.prompt.md` |

Muốn ép cài cho 1 tool cụ thể: `agentflow install claude` (hoặc `cursor` / `copilot` / `all`).

Mở `.agentflow/config.yaml`, sửa URL Jira:
```yaml
jira:
  base_url: https://opswat.atlassian.net
verify:
  commands: [ "npm run lint", "npm test" ]   # lệnh test/lint của repo
```

```bash
git add .claude .cursor .github .agentflow/config.yaml .agentflow/codemap.md
git commit -m "chore: enable agentflow slash commands"
git push
```
→ Commit để cả team `git pull` về là có sẵn slash command, khỏi cài lại.

✅ Xong. Giờ mở AI tool lên và làm việc bằng slash command.

---

## Bước 3 — Làm 1 ticket (chỉ 1 lệnh)

Mở project trong AI tool, gõ trong khung chat:
```
/agentflow-start MDF-112
```

AI tự chạy và **chỉ dừng đúng 2 lần**:

**① Lấy ticket + research + lập plan** → tới **GATE 1**, AI hiện:
```
⛔ Waiting for approval. Reply "approved" to continue, or tell me what to change.
```
→ Mở `.agentflow/plan.md` đọc. Rồi:
- Ưng → gõ **`approved`** → AI tự chạy tiếp code.
- Chưa ưng → nói thẳng trong chat: *"plan thiếu case timeout, bổ sung đi"* → AI sửa rồi hiện lại gate.

**② Code (TDD) → verify (test/lint) → viết mô tả PR** → tới **GATE 2**:
```
⛔ Waiting for approval. Reply "approved" to continue, or tell me what to change.
```
→ Xem `.agentflow/summary.md`. Gõ **`approved`** → AI tạo PR + commit + comment link lên Jira MDF-112.

**③ Tự rút bài học** (không cần duyệt): AI so plan với code thật, lưu lesson vào `.agentflow/lessons/`, rồi nhắc bạn chạy lại `/agentflow-retro <PR>` sau khi PR merge để lấy thêm bài học từ review.

🎉 Hết 1 ticket — bạn chỉ gõ **1 lệnh + 2 lần "approved"**.

> **Lỡ đóng session giữa chừng?** Gõ `/agentflow-continue` — AI đọc `agentflow status` rồi chạy tiếp từ đúng chỗ dở (không làm lại bước đã xong).

<details>
<summary><b>Muốn điều khiển tay từng bước?</b> (không bắt buộc)</summary>

Có lệnh lẻ cho từng phase nếu bạn thích kiểm soát chi tiết:

### `/agentflow-plan`
AI đọc codemap + lessons → research code thật → viết `.agentflow/plan.md` → tự kiểm tra từng file đã nhắc có thật không → dừng cho bạn xem.

→ Mở `.agentflow/plan.md` đọc. Nếu thiếu/sai:
- Nói thẳng trong chat: *"plan thiếu xử lý case timeout, bổ sung đi"* → AI sửa.
- Hoặc tự sửa tay file `plan.md`.

Nếu AI thiếu thông tin không suy ra được, nó sẽ **hỏi bạn ngay trong chat** thay vì đoán bừa.

### `/agentflow-code`
AI viết test trước, rồi code đến khi test xanh, bám sát đúng danh sách file trong plan.

### `/agentflow-verify`
AI chạy lint/test/build. Fail thì tự tìm nguyên nhân gốc và sửa (không skip test cho qua).

### `/agentflow-ship`
AI viết mô tả PR vào `.agentflow/summary.md`, cho bạn xem, rồi chạy `agentflow pr` để commit + push + tạo PR + comment link lên Jira.

</details>

---

## Khác biệt nhỏ theo từng tool

Quy trình **giống hệt nhau**, chỉ khác cách gọi slash command:

### Claude Code
- Gõ `/agentflow-start MDF-112` trong khung chat. Claude tự chạy terminal + sửa file. Mượt nhất, không cần bật gì thêm.

### Cursor
- Mở **Composer** (Cmd+I), bật **Agent mode** (để nó được chạy terminal + đọc/sửa file).
- Gõ `/agentflow-start MDF-112` — Cursor nhận command từ `.cursor/commands/`.
- ⚠️ Phải bật Agent mode, nếu không AI không chạy được `agentflow ticket`/`context` và không verify được file thật.

### GitHub Copilot
- Mở **Copilot Chat** trong VS Code, chọn chế độ **Agent** (Copilot Chat → dropdown "Agent").
- Gõ `/agentflow-start MDF-112` — Copilot nhận từ `.github/prompts/`.
- ⚠️ Cần bản Copilot có **Agent mode** (chạy được terminal + sửa file). Nếu chỉ có Chat thường, AI sẽ đề xuất code và bạn phải tự bấm "Apply" + tự chạy lệnh terminal mà nó gợi ý.

> Điểm chung: cả 3 đều cần **agent mode / chế độ chạy được terminal**, vì các slash command có bước gọi `agentflow ticket`, `agentflow context`, `agentflow pr` qua terminal.

---

## Bước 4 — Sau khi PR được merge

Trong chat:
```
/agentflow-retro
```
AI đọc diff đã merge + comment review → rút ra "bài học chung" (vd: *"luôn dùng helper retry có sẵn"*) → lưu vào `.agentflow/lessons/`. Lần ticket sau, `/agentflow-plan` và `/agentflow-code` sẽ **tự áp dụng** các bài học này.

```bash
git add .agentflow/lessons && git commit -m "chore: lessons from OSP-123" && git push
```

---

## Sổ tay nhanh

**Trong chat (dùng hằng ngày):**
```
/agentflow-start <ID>    ← lệnh chính: tự chạy cả pipeline, dừng ở 2 gate
   → đến gate, gõ:  approved   (hoặc bảo AI sửa)
/agentflow-continue      ← chạy tiếp nếu lỡ đóng session
/agentflow-retro <PR>    ← sau khi PR merge: rút bài học (gồm cả review)

# lệnh lẻ (tùy chọn, điều khiển tay):
/agentflow-plan   /agentflow-code   /agentflow-verify   /agentflow-ship
```

**Trong terminal (setup + tiện ích):**
```bash
agentflow prime          # 1 lần/repo: quét repo
agentflow install [tool] # 1 lần/repo: tạo slash command
agentflow status         # đang ở phase nào
agentflow cost [--all]   # ước tính chi phí token
```

## Khi bí

| Triệu chứng | Cách xử lý |
|---|---|
| Gõ `/agentflow-plan` không có gợi ý | Chưa chạy `agentflow install`, hoặc chưa reload AI tool. Cursor/Copilot: mở lại workspace. |
| `command not found: agentflow` | `npm bin -g` chưa trong PATH → thêm vào `~/.zshrc` |
| AI báo `JIRA_TOKEN not set` | `source ~/.zshrc` lại; kiểm tra đã export chưa |
| AI không chạy được terminal | Bật **Agent mode** (Cursor Composer / Copilot Chat Agent) |
| `gh: command not found` | `brew install gh && gh auth login` |
| Plan chưa ổn | Nói trong chat cho AI sửa, hoặc sửa tay `.agentflow/plan.md`, rồi mới `/agentflow-code` |
| Muốn xem AI đã làm gì | Đọc `.agentflow/plan.md`, `.agentflow/summary.md`, `.agentflow/audit/` |

Chi tiết kiến trúc: `README.md`. Tham khảo từng tool sâu hơn: `USAGE.md`.
