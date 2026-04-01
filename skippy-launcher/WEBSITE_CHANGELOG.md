# Skippy Launcher ↔ Website Sync Changelog

This file tracks features and changes that need to be synced between the
Skippy website (web app) and the Skippy Android launcher.

---

## How to Use
When you make a change on the website (add a feature, change API shape, redesign a page),
add an entry below under "Pending Sync" so it can be reflected in the launcher.
When the launcher is updated to match, move it to "Synced".

---

## ✅ Synced (Launcher has parity with Website)

### Notes
- **Click to edit** – Notes are tappable; opens full-screen `NoteEditorSheet`
- **Rich note editor** – Transparent title (22sp bold) + content fields, auto-focus, imePadding, scrollable
- **HTML stripping** – Note/summary content strips `<p>`, `<br>` etc. via `HtmlCompat`
- **Delete confirmation** – Alert dialog with "Delete Note?" before deleting
- **Pinned notes section** – Pinned notes shown at top with 📌 badge
- **Tags display** – Tags shown as gold chips on note cards
- **Word count** – Word count shown in note footer and editor metadata
- **Summaries tab** – Period badge, note count, expand/collapse, "Read more"
- **Summary expand/collapse** – ExpandMore/ExpandLess toggle per card

### Memories
- **Category color bars** – Left accent bar color-coded per category
- **Importance stars** – 5-star importance display (filled vs outline)
- **Needs Review badge** – ⚠ badge for memories flagged for review
- **Search + category filter** – Search bar + horizontal category chips
- **Delete confirmation** – Alert dialog "Delete Memory?" before deleting

### Todos
- **Priority grouping** – Urgent/High/Normal/Low sections with colored indicators
- **Toggle done** – Tap checkbox to mark as done, strikethrough + fade
- **Due dates** – Shown with overdue highlighted in red
- **Completed section** – Collapsible "N completed" section at bottom

### Reminders
- **Overdue highlighting** – Overdue reminders have red border + text
- **Delete confirmation** – Alert dialog before deleting
- **Timeframe label** – Shows natural language timeframe (e.g., "This week")
- **Toggle done** – Bell → checkmark on completion

### Chat
- **Markdown rendering** – `**bold**`, `*italic*`, `` `code` ``, `# headings`, `- lists`
- **Call mode toggle** – Phone/PhoneInTalk icon separates voice-only from text chat
- **Multiline input** – TextField grows up to 5 lines; Enter adds newline
- **Streaming bubbles** – Live text appearance with blinking ▌ cursor
- **Conversation history** – History panel with loading spinner, "N conversations"
- **Resume conversation** – Tapping a conversation loads its actual messages
- **Copy long-press** – Long-press any message to copy to clipboard
- **Mic button** – Only visible in call mode; pulsing animation while listening

### Home Screen
- **Quick apps grid** – 4-column grid, up to 12 apps, edit/remove mode
- **Dock editing** – Edit dock button allows pin/unpin apps
- **Smart suggestions** – Search bar shows app + history suggestions while typing
- **Stats strip** – Memory count, pending todos, reminders at a glance
- **Widget cards** – Todo preview, Reminder preview, Last Skippy message
- **User stats** – Message count, memory count, notes count, todos count

---

## 🔄 Pending Sync (Website has, launcher needs)

> Add items here when the website gets a new feature that should appear in the launcher.

### Template:
```
- **Feature name** – Brief description of what it does / API endpoint used
  - Website: `GET/POST /api/endpoint`
  - Priority: High / Medium / Low
  - Notes: Any special considerations
```

---

## 📋 API Endpoints Used by Launcher

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Login with username/password/accessCode |
| `/api/auth/status` | GET | Check session validity |
| `/api/memories` | GET | Fetch all memories |
| `/api/memories/:id` | DELETE | Delete a memory |
| `/api/todos` | GET | Fetch all todos |
| `/api/todos/:id` | PATCH | Toggle todo done/undone |
| `/api/reminders` | GET | Fetch all reminders |
| `/api/reminders` | POST | Create a new reminder |
| `/api/reminders/:id` | PATCH | Toggle reminder done/undone |
| `/api/reminders/:id` | DELETE | Delete a reminder |
| `/api/notes` | GET | Fetch all notes |
| `/api/notes` | POST | Create a new note |
| `/api/notes/:id` | PATCH | Update a note |
| `/api/notes/:id` | DELETE | Delete a note |
| `/api/summaries` | GET | Fetch all summaries |
| `/api/conversations` | GET | Fetch conversation list |
| `/api/conversations/:id` | GET | Fetch messages for a conversation |
| `/api/chat` | POST/SSE | Send message, get streaming reply |
| `/api/user/stats` | GET | Fetch user stats |
| `/api/weather` | GET | Fetch current weather |

---

*Last updated: April 2026*

