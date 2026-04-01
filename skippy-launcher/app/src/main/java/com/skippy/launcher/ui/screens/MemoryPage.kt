package com.skippy.launcher.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.data.Memory
import com.skippy.launcher.data.Reminder
import com.skippy.launcher.data.TodoItem
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import java.text.SimpleDateFormat
import java.util.*

private val CATEGORY_COLORS = mapOf(
    "identity"     to Color(0xFF6366F1),
    "relationship" to Color(0xFFEC4899),
    "goal"         to Color(0xFF10B981),
    "preference"   to Color(0xFFF59E0B),
    "fact"         to Color(0xFF3B82F6),
    "event"        to Color(0xFF8B5CF6),
    "routine"      to Color(0xFF14B8A6),
    "belief"       to Color(0xFFEF4444),
    "skill"        to Color(0xFF22C55E),
    "health"       to Color(0xFFF97316),
    "work"         to Color(0xFF0EA5E9),
    "finance"      to Color(0xFFE8B84B),
    "general"      to Color(0xFF94A3B8),
    "learning"     to Color(0xFF8B5CF6),
)

private fun categoryColor(cat: String) = CATEGORY_COLORS[cat.lowercase()] ?: Color(0xFF64748B)

private val PRIORITY_CONFIG = mapOf(
    "urgent" to Triple("🔴", Color(0xFFEF4444), "Urgent"),
    "high"   to Triple("🟠", Color(0xFFF97316), "High"),
    "normal" to Triple("🔵", Color(0xFF3B82F6), "Normal"),
    "low"    to Triple("⚪", Color(0xFF64748B), "Low"),
)

@Composable
fun MemoryPage(viewModel: LauncherViewModel) {
    val memories         by viewModel.memories.collectAsState()
    val memoriesLoading  by viewModel.memoriesLoading.collectAsState()
    val todos            by viewModel.todos.collectAsState()
    val todosLoading     by viewModel.todosLoading.collectAsState()
    val reminders        by viewModel.reminders.collectAsState()
    val remindersLoading by viewModel.remindersLoading.collectAsState()

    var activeTab by remember { mutableStateOf(0) }
    var memorySearch by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("all") }
    var showFab by remember { mutableStateOf(false) }
    var fabInput by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.loadMemories()
        viewModel.loadTodos()
        viewModel.loadReminders()
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding(),
        ) {
            // ── Header ──────────────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp)
                    .padding(top = 48.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text("Memory Vault", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WhiteText)
                    val pending = reminders.count { !it.isDone }
                    val urgent  = todos.count { !it.isDone && (it.priority == "urgent" || it.priority == "high") }
                    Text(
                        text  = buildString {
                            append("${memories.size} memories")
                            if (pending > 0) append(" · $pending reminders")
                            if (urgent > 0) append(" · $urgent urgent")
                        },
                        fontSize = 12.sp, color = WhiteMuted,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(onClick = { showFab = !showFab }) {
                        Icon(Icons.Default.Add, "Add", tint = when(activeTab) { 1 -> AccentGold; 2 -> OrangeAccent; else -> PurpleAccent }, modifier = Modifier.size(22.dp))
                    }
                    IconButton(onClick = {
                        viewModel.loadMemories(); viewModel.loadTodos(); viewModel.loadReminders()
                    }) {
                        Icon(Icons.Default.Refresh, "Refresh", tint = CyanPrimary, modifier = Modifier.size(20.dp))
                    }
                }
            }

        // Quick add bar
        AnimatedVisibility(visible = showFab) {
                val label = when(activeTab) { 1 -> "New todo…"; 2 -> "New reminder…"; else -> "Ask Skippy to remember…" }
                val accentColor = when(activeTab) { 1 -> AccentGold; 2 -> OrangeAccent; else -> PurpleAccent }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = fabInput, onValueChange = { fabInput = it },
                        placeholder = { Text(label, color = WhiteDim, fontSize = 13.sp) },
                        modifier = Modifier.weight(1f), singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = accentColor, unfocusedBorderColor = accentColor.copy(alpha = 0.4f),
                            focusedTextColor = WhiteText, unfocusedTextColor = WhiteText,
                            cursorColor = accentColor, focusedContainerColor = NavyCard, unfocusedContainerColor = NavyCard,
                        ),
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
                    )
                    IconButton(onClick = {
                        val content = fabInput.trim()
                        if (content.isNotBlank()) {
                            when (activeTab) {
                                1 -> viewModel.askSkippy("Add a todo: $content")
                                2 -> viewModel.createReminder(content, null)
                                else -> viewModel.askSkippy("Remember this: $content")
                            }
                            fabInput = ""; showFab = false
                        }
                    }) {
                        Icon(Icons.Default.Check, "Save", tint = accentColor)
                    }
                }
            }

        // ── Tabs ────────────────────────────────────────────────────────────
        val tabs = listOf(
            Triple("🧠", "Memories", memories.size),
            Triple("✅", "Todos", todos.count { !it.isDone }),
            Triple("🔔", "Reminders", reminders.count { !it.isDone }),
        )
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 4.dp),
        ) {
            items(tabs.size) { idx ->
                val (icon, label, count) = tabs[idx]
                val selected = activeTab == idx
                val tint = when (idx) {
                    0 -> PurpleAccent
                    1 -> AccentGold
                    else -> OrangeAccent
                }
                Surface(
                    modifier = Modifier.clickable { activeTab = idx },
                    shape    = RoundedCornerShape(12.dp),
                    color    = if (selected) tint.copy(alpha = 0.18f) else NavyCard,
                    border   = BorderStroke(1.dp, if (selected) tint.copy(alpha = 0.5f) else SurfaceBorder),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(icon, fontSize = 14.sp)
                        Text(label, color = if (selected) tint else WhiteMuted, fontSize = 13.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
                        if (count > 0) {
                            Box(
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(tint.copy(alpha = 0.25f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                            ) { Text("$count", color = tint, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // ── Content ─────────────────────────────────────────────────────────
        when (activeTab) {
            0 -> MemoriesTab(
                memories     = memories,
                loading      = memoriesLoading,
                search       = memorySearch,
                onSearch     = { memorySearch = it },
                selectedCat  = selectedCategory,
                onCatSelect  = { selectedCategory = it },
                onDelete     = { viewModel.deleteMemory(it) },
            )
            1 -> TodosTab(
                todos    = todos,
                loading  = todosLoading,
                onToggle = { id, done -> viewModel.toggleTodo(id, done) },
            )
            2 -> RemindersTab(
                reminders = reminders,
                loading   = remindersLoading,
                onToggle  = { id, done -> viewModel.toggleReminder(id, done) },
                onDelete  = { viewModel.deleteReminder(it) },
                onCreate  = { content, date -> viewModel.createReminder(content, date) },
            )
        }
        } // end Column
    } // end Box
} // end MemoryPage

// ── Memories Tab ──────────────────────────────────────────────────────────────

@Composable
private fun MemoriesTab(
    memories: List<Memory>,
    loading: Boolean,
    search: String,
    onSearch: (String) -> Unit,
    selectedCat: String,
    onCatSelect: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val filtered = remember(memories, search, selectedCat) {
        memories.filter { m ->
            val matchCat = selectedCat == "all" || m.category == selectedCat
            val q = search.lowercase()
            val matchQ = q.isEmpty() || m.content.lowercase().contains(q) || m.category.lowercase().contains(q)
            matchCat && matchQ
        }.sortedByDescending { it.importance }
    }
    val cats = remember(memories) {
        listOf("all") + memories.map { it.category }.distinct().sorted()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Search
        OutlinedTextField(
            value = search, onValueChange = onSearch,
            placeholder = { Text("Search memories…", color = WhiteDim, fontSize = 13.sp) },
            leadingIcon = { Icon(Icons.Default.Search, null, tint = WhiteMuted, modifier = Modifier.size(18.dp)) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = CyanPrimary, unfocusedBorderColor = CyanGlow,
                focusedTextColor = WhiteText, unfocusedTextColor = WhiteText,
                cursorColor = CyanPrimary, focusedContainerColor = NavyCard,
                unfocusedContainerColor = NavyCard,
            ),
            shape = RoundedCornerShape(12.dp), singleLine = true,
        )
        Spacer(Modifier.height(8.dp))
        // Category filter
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(cats) { cat ->
                val sel = selectedCat == cat
                val color = if (cat == "all") CyanPrimary else categoryColor(cat)
                Surface(
                    modifier = Modifier.clickable { onCatSelect(cat) },
                    shape = RoundedCornerShape(20.dp),
                    color = if (sel) color.copy(alpha = 0.2f) else Color.Transparent,
                    border = BorderStroke(1.dp, if (sel) color else SurfaceBorder),
                ) {
                    Text(
                        text = if (cat == "all") "All" else cat.replaceFirstChar { it.uppercase() },
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        color = if (sel) color else WhiteMuted, fontSize = 12.sp,
                        fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))

        if (loading) {
            LoadingState(icon = "🧠", text = "Loading memories…")
        } else if (filtered.isEmpty()) {
            EmptyState(icon = "🧠", title = if (memories.isEmpty()) "No memories yet" else "No match", body = "Start chatting with Skippy to build your memory vault.")
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 12.dp, top = 0.dp, end = 12.dp, bottom = 80.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(filtered, key = { it.id }) { mem ->
                    MemoryCard(memory = mem, onDelete = onDelete)
                }
            }
        }
    }
}

@Composable
private fun MemoryCard(memory: Memory, onDelete: (String) -> Unit) {
    val color = categoryColor(memory.category)
    var expanded by remember { mutableStateOf(false) }
    Surface(
        shape  = RoundedCornerShape(14.dp),
        color  = NavyCard,
        border = BorderStroke(1.dp, color.copy(alpha = 0.25f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box {
            // Left accent bar
            Box(modifier = Modifier.width(3.dp).matchParentSize().background(color.copy(alpha = 0.7f)).clip(RoundedCornerShape(topStart = 14.dp, bottomStart = 14.dp)))
            Column(modifier = Modifier.padding(start = 14.dp, end = 12.dp, top = 10.dp, bottom = 10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                        Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(color.copy(alpha = 0.15f)).padding(horizontal = 7.dp, vertical = 3.dp)) {
                            Text(memory.category.replaceFirstChar { it.uppercase() }, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        // Importance stars
                        Row(horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                            repeat(5) { i ->
                                Text(if (i < (memory.importance / 2)) "★" else "☆", fontSize = 9.sp,
                                    color = if (i < (memory.importance / 2)) AccentGold else WhiteDim.copy(alpha = 0.3f))
                            }
                        }
                        if (memory.needsReview) {
                            Box(modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(AmberWarning.copy(alpha = 0.15f)).padding(horizontal = 5.dp, vertical = 2.dp)) {
                                Text("⚠ review", color = AmberWarning, fontSize = 9.sp)
                            }
                        }
                    }
                    Row {
                        IconButton(onClick = { expanded = !expanded }, modifier = Modifier.size(28.dp)) {
                            Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null, tint = WhiteMuted.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
                        }
                        IconButton(onClick = { onDelete(memory.id) }, modifier = Modifier.size(28.dp)) {
                            Icon(Icons.Default.DeleteOutline, "Delete", tint = ErrorRed.copy(alpha = 0.5f), modifier = Modifier.size(15.dp))
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = memory.content,
                    color = WhiteText, fontSize = 13.sp, lineHeight = 18.sp,
                    maxLines = if (expanded) Int.MAX_VALUE else 3,
                    overflow = TextOverflow.Ellipsis,
                )
                if (memory.tags.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        memory.tags.take(3).forEach { tag ->
                            Text("#$tag", color = CyanPrimary.copy(alpha = 0.6f), fontSize = 10.sp)
                        }
                    }
                }
            }
        }
    }
}

// ── Todos Tab ─────────────────────────────────────────────────────────────────

@Composable
private fun TodosTab(
    todos: List<TodoItem>,
    loading: Boolean,
    onToggle: (String, Boolean) -> Unit,
) {
    val pending = todos.filter { !it.isDone }
    val done    = todos.filter { it.isDone }
    var showDone by remember { mutableStateOf(false) }

    if (loading) { LoadingState("✅", "Loading todos…"); return }
    if (todos.isEmpty()) { EmptyState("✅", "No todos", "Tell Skippy to add items to your todo list."); return }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, top = 0.dp, end = 12.dp, bottom = 80.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Priority order
        val priorityOrder = listOf("urgent", "high", "normal", "low")
        priorityOrder.forEach { priority ->
            val group = pending.filter { it.priority == priority }
            if (group.isNotEmpty()) {
                val cfg = PRIORITY_CONFIG[priority] ?: Triple("⚪", WhiteMuted, priority)
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(cfg.second))
                        Text(cfg.third.replaceFirstChar { it.uppercase() }, color = cfg.second, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text("(${group.size})", color = WhiteMuted.copy(alpha = 0.5f), fontSize = 11.sp)
                    }
                }
                items(group, key = { it.id }) { todo ->
                    TodoCard(todo = todo, onToggle = onToggle)
                }
            }
        }
        if (done.isNotEmpty()) {
            item {
                TextButton(onClick = { showDone = !showDone }) {
                    Text("${if (showDone) "▼" else "▶"} ${done.size} completed", color = WhiteMuted.copy(alpha = 0.5f), fontSize = 12.sp)
                }
            }
            if (showDone) {
                items(done.take(10), key = { "done_${it.id}" }) { todo ->
                    TodoCard(todo = todo, onToggle = onToggle)
                }
            }
        }
    }
}

@Composable
private fun TodoCard(todo: TodoItem, onToggle: (String, Boolean) -> Unit) {
    val cfg = PRIORITY_CONFIG[todo.priority] ?: Triple("⚪", WhiteMuted, "Normal")
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = NavyCard,
        border = BorderStroke(1.dp, if (todo.isDone) SurfaceBorder else cfg.second.copy(alpha = 0.2f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            IconButton(onClick = { onToggle(todo.id, !todo.isDone) }, modifier = Modifier.size(28.dp)) {
                Icon(
                    imageVector = if (todo.isDone) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                    contentDescription = "Toggle",
                    tint = if (todo.isDone) GreenSuccess else cfg.second,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(todo.content, color = if (todo.isDone) WhiteMuted.copy(alpha = 0.4f) else WhiteText, fontSize = 13.sp,
                    style = if (todo.isDone) LocalTextStyle.current.copy(textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough) else LocalTextStyle.current)
                if (todo.dueDate != null) {
                    Text("Due: ${formatDate(todo.dueDate)}", color = if (isOverdue(todo.dueDate)) ErrorRed else WhiteMuted.copy(alpha = 0.5f), fontSize = 11.sp)
                }
            }
            Text(cfg.first, fontSize = 14.sp)
        }
    }
}

// ── Reminders Tab ─────────────────────────────────────────────────────────────

@Composable
private fun RemindersTab(
    reminders: List<Reminder>,
    loading: Boolean,
    onToggle: (String, Boolean) -> Unit,
    onDelete: (String) -> Unit,
    onCreate: (String, String?) -> Unit,
) {
    var showAdd by remember { mutableStateOf(false) }
    var newContent by remember { mutableStateOf("") }
    val pending = reminders.filter { !it.isDone }
    val done    = reminders.filter { it.isDone }
    var showDone by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Reminders", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = WhiteText)
            TextButton(onClick = { showAdd = !showAdd }) {
                Icon(Icons.Default.Add, null, tint = OrangeAccent, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Add", color = OrangeAccent, fontSize = 12.sp)
            }
        }
        if (showAdd) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = newContent, onValueChange = { newContent = it },
                    placeholder = { Text("Reminder content…", color = WhiteDim, fontSize = 13.sp) },
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = OrangeAccent, unfocusedBorderColor = OrangeAccent.copy(alpha = 0.4f),
                        focusedTextColor = WhiteText, unfocusedTextColor = WhiteText,
                        cursorColor = OrangeAccent, focusedContainerColor = NavyCard, unfocusedContainerColor = NavyCard,
                    ),
                    shape = RoundedCornerShape(10.dp), singleLine = true,
                )
                IconButton(onClick = {
                    if (newContent.isNotBlank()) {
                        onCreate(newContent.trim(), null)
                        newContent = ""; showAdd = false
                    }
                }) {
                    Icon(Icons.Default.Check, "Save", tint = OrangeAccent)
                }
            }
        }

        if (loading) { LoadingState("🔔", "Loading reminders…"); return@Column }
        if (pending.isEmpty() && done.isEmpty()) {
            EmptyState("🔔", "No reminders", "Tell Skippy to remind you about something.")
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 12.dp, top = 0.dp, end = 12.dp, bottom = 80.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(pending, key = { it.id }) { rem ->
                ReminderCard(reminder = rem, onToggle = onToggle, onDelete = onDelete)
            }
            if (done.isNotEmpty()) {
                item {
                    TextButton(onClick = { showDone = !showDone }) {
                        Text("${if (showDone) "▼" else "▶"} ${done.size} done", color = WhiteMuted.copy(alpha = 0.4f), fontSize = 12.sp)
                    }
                }
                if (showDone) {
                    items(done.take(10), key = { "rdone_${it.id}" }) { rem ->
                        ReminderCard(reminder = rem, onToggle = onToggle, onDelete = onDelete)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReminderCard(
    reminder: Reminder,
    onToggle: (String, Boolean) -> Unit,
    onDelete: (String) -> Unit,
) {
    val overdue = reminder.dueDate != null && isOverdue(reminder.dueDate)
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = NavyCard,
        border = BorderStroke(1.dp, if (overdue) ErrorRed.copy(alpha = 0.4f) else SurfaceBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            IconButton(onClick = { onToggle(reminder.id, !reminder.isDone) }, modifier = Modifier.size(28.dp)) {
                Icon(
                    imageVector = if (reminder.isDone) Icons.Default.CheckCircle else Icons.Default.Notifications,
                    contentDescription = null,
                    tint = if (reminder.isDone) GreenSuccess else if (overdue) ErrorRed else OrangeAccent,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(reminder.content, color = if (reminder.isDone) WhiteMuted.copy(alpha = 0.4f) else WhiteText, fontSize = 13.sp)
                if (reminder.dueDate != null) {
                    Text(
                        text = if (overdue) "⚠ Overdue: ${formatDate(reminder.dueDate)}" else "Due: ${formatDate(reminder.dueDate)}",
                        color = if (overdue) ErrorRed else WhiteMuted.copy(alpha = 0.5f), fontSize = 11.sp,
                    )
                } else if (reminder.timeframeLabel != null) {
                    Text(reminder.timeframeLabel, color = WhiteMuted.copy(alpha = 0.5f), fontSize = 11.sp)
                }
            }
            IconButton(onClick = { onDelete(reminder.id) }, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.DeleteOutline, "Delete", tint = ErrorRed.copy(alpha = 0.4f), modifier = Modifier.size(15.dp))
            }
        }
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

private fun formatDate(iso: String): String = runCatching {
    val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val date = sdf.parse(iso.take(10)) ?: return iso
    SimpleDateFormat("MMM d", Locale.US).format(date)
}.getOrDefault(iso)

private fun isOverdue(iso: String): Boolean = runCatching {
    val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val date = sdf.parse(iso.take(10)) ?: return false
    date.before(Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0) }.time)
}.getOrDefault(false)

@Composable
internal fun LoadingState(icon: String, text: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(icon, fontSize = 36.sp)
            Text(text, color = WhiteMuted, fontSize = 14.sp)
        }
    }
}

@Composable
internal fun EmptyState(icon: String, title: String, body: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.padding(32.dp),
        ) {
            Text(icon, fontSize = 48.sp)
            Text(title, color = WhiteText, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(body, color = WhiteMuted, fontSize = 13.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

