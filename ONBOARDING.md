# agentflow — Onboarding cho thành viên mới

Tài liệu cho **1 bạn mới hoàn toàn**. Cách dùng mới: **không cần ngồi terminal gõ lệnh** — bạn cài 1 lần rồi điều khiển mọi thứ **bằng slash command ngay trong cửa sổ chat của AI tool** (Claude Code / Cursor / Copilot):

```
/agentflow-start OSP-123     → lấy ticket Jira + tạo branch + tóm tắt
/agentflow-plan              → AI research + lập plan, rồi DỪNG chờ bạn duyệt
/agentflow-code              → AI code theo plan (TDD)
/agentflow-verify            → AI chạy test/lint, tự sửa lỗi
/agentflow-ship              → AI viết mô tả PR, hỏi xác nhận, tạo PR + comment Jira
/agentflow-retro             → sau khi merge: rút bài học cho team
```

> **Cổng duyệt nằm ngay ở ranh giới giữa các lệnh.** Sau `/agentflow-plan`, AI dừng lại và chờ. Bạn đọc `plan.md`, ưng thì gõ `/agentflow-code` — chính việc gõ lệnh đó *là* bạn đã duyệt. Đơn giản vậy thôi.

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

## Bước 3 — Làm 1 ticket (trong cửa sổ chat)

Giả sử ticket **`OSP-123`**. Mở project trong AI tool của bạn, rồi:

### 3.1 — Bắt đầu
Gõ trong khung chat:
```
/agentflow-start OSP-123
```
AI sẽ chạy `agentflow ticket OSP-123` (lấy ticket + tạo branch), đọc ticket và tóm tắt cho bạn 3-5 dòng. Nếu ticket mơ hồ, AI sẽ nói rõ chỗ nào chưa rõ.

### 3.2 — Lập kế hoạch
```
/agentflow-plan
```
AI sẽ: đọc codemap + lessons → research code thật → viết `.agentflow/plan.md` (Scope, file đụng tới, test plan, rủi ro...) → **tự kiểm tra lại** từng file đã nhắc có thật không → rồi **DỪNG** và bảo bạn xem plan.

→ Mở `.agentflow/plan.md` đọc. Nếu thiếu/sai:
- Nói thẳng trong chat: *"plan thiếu xử lý case timeout, bổ sung đi"* → AI sửa.
- Hoặc tự sửa tay file `plan.md`.

Nếu AI thiếu thông tin không suy ra được, nó sẽ **hỏi bạn ngay trong chat** thay vì đoán bừa.

### 3.3 — Duyệt + code
Ưng plan rồi thì chỉ cần gõ:
```
/agentflow-code
```
(Gõ lệnh này = bạn đã duyệt plan.) AI viết test trước, rồi code đến khi test xanh, bám sát đúng danh sách file trong plan.

### 3.4 — Kiểm tra
```
/agentflow-verify
```
AI chạy lint/test/build. Fail thì nó tự tìm nguyên nhân gốc và sửa (không skip test cho qua).

### 3.5 — Tạo PR
```
/agentflow-ship
```
AI viết mô tả PR vào `.agentflow/summary.md`, **cho bạn xem và hỏi xác nhận trước**. Bạn OK → AI chạy `agentflow pr` để commit + push + tạo PR + comment link lên Jira OSP-123. Xong nó báo link PR.

🎉 Hết 1 ticket — chỉ bằng 5 slash command, không rời cửa sổ chat.

---

## Khác biệt nhỏ theo từng tool

Quy trình **giống hệt nhau**, chỉ khác cách gọi slash command:

### Claude Code
- Gõ `/agentflow-plan` trong khung chat. Claude tự chạy terminal + sửa file. Mượt nhất, không cần bật gì thêm.

### Cursor
- Mở **Composer** (Cmd+I), bật **Agent mode** (để nó được chạy terminal + đọc/sửa file).
- Gõ `/agentflow-plan` — Cursor nhận command từ `.cursor/commands/`.
- ⚠️ Phải bật Agent mode, nếu không AI không chạy được `agentflow ticket`/`context` và không verify được file thật.

### GitHub Copilot
- Mở **Copilot Chat** trong VS Code, chọn chế độ **Agent** (Copilot Chat → dropdown "Agent").
- Gõ `/agentflow-plan` — Copilot nhận từ `.github/prompts/`.
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
/agentflow-start <ID>   /agentflow-plan   /agentflow-code
/agentflow-verify       /agentflow-ship   /agentflow-retro
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
