package com.skippy.launcher.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.data.Note
import com.skippy.launcher.data.Summary
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun NotesPage(viewModel: LauncherViewModel) {
    val notes        by viewModel.notes.collectAsState()
    val notesLoading by viewModel.notesLoading.collectAsState()
    val summaries    by viewModel.summaries.collectAsState()

    var activeTab    by remember { mutableStateOf(0) }
    var showNewNote  by remember { mutableStateOf(false) }
    var newTitle     by remember { mutableStateOf("") }
    var newContent   by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.loadNotes()
        viewModel.loadSummaries()
    }

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
                Text("Notes", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WhiteText)
                Text("${notes.size} notes · ${summaries.size} summaries", fontSize = 12.sp, color = WhiteMuted)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(onClick = { viewModel.loadNotes(); viewModel.loadSummaries() }) {
                    Icon(Icons.Default.Refresh, "Refresh", tint = AccentGold, modifier = Modifier.size(20.dp))
                }
                if (activeTab == 0) {
                    IconButton(onClick = { showNewNote = !showNewNote }) {
                        Icon(Icons.Default.Add, "New note", tint = AccentGold, modifier = Modifier.size(22.dp))
                    }
                }
            }
        }

        // ── Tabs ────────────────────────────────────────────────────────────
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(listOf("📝" to "Notes", "✨" to "Summaries")) { (icon, label) ->
                val idx = if (label == "Notes") 0 else 1
                val sel = activeTab == idx
                Surface(
                    modifier = Modifier.clickable { activeTab = idx },
                    shape = RoundedCornerShape(12.dp),
                    color = if (sel) AccentGold.copy(alpha = 0.18f) else NavyCard,
                    border = BorderStroke(1.dp, if (sel) AccentGold.copy(alpha = 0.5f) else SurfaceBorder),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(icon, fontSize = 14.sp)
                        Text(label, color = if (sel) AccentGold else WhiteMuted, fontSize = 13.sp,
                            fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal)
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // ── New note form ───────────────────────────────────────────────────
        AnimatedVisibility(visible = showNewNote && activeTab == 0) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp)
                    .background(NavyCard, RoundedCornerShape(14.dp))
                    .border(1.dp, AccentGold.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("New Note", fontWeight = FontWeight.SemiBold, color = AccentGold, fontSize = 13.sp)
                OutlinedTextField(
                    value = newTitle, onValueChange = { newTitle = it },
                    placeholder = { Text("Title…", color = WhiteDim, fontSize = 13.sp) },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    colors = noteFieldColors(),
                    shape = RoundedCornerShape(10.dp),
                )
                OutlinedTextField(
                    value = newContent, onValueChange = { newContent = it },
                    placeholder = { Text("Content…", color = WhiteDim, fontSize = 13.sp) },
                    modifier = Modifier.fillMaxWidth().height(100.dp),
                    colors = noteFieldColors(),
                    shape = RoundedCornerShape(10.dp),
                    maxLines = 5,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { showNewNote = false; newTitle = ""; newContent = "" },
                        modifier = Modifier.weight(1f), border = BorderStroke(1.dp, SurfaceBorder)) {
                        Text("Cancel", color = WhiteMuted, fontSize = 12.sp)
                    }
                    Button(onClick = {
                        if (newContent.isNotBlank()) {
                            viewModel.createNote(newTitle.ifBlank { "Untitled" }, newContent.trim())
                            newTitle = ""; newContent = ""; showNewNote = false
                        }
                    }, modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = AccentGold, contentColor = NavyDeep)) {
                        Text("Save", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }

        // ── Content ─────────────────────────────────────────────────────────
        when (activeTab) {
            0 -> NotesTab(notes = notes, loading = notesLoading, onDelete = { viewModel.deleteNote(it) })
            1 -> SummariesTab(summaries = summaries)
        }
    }
}

@Composable
private fun noteFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = AccentGold.copy(alpha = 0.7f), unfocusedBorderColor = AccentGold.copy(alpha = 0.3f),
    focusedTextColor = WhiteText, unfocusedTextColor = WhiteText, cursorColor = AccentGold,
    focusedContainerColor = NavyDeep.copy(alpha = 0.5f), unfocusedContainerColor = NavyDeep.copy(alpha = 0.5f),
)

@Composable
private fun NotesTab(notes: List<Note>, loading: Boolean, onDelete: (String) -> Unit) {
    if (loading) { LoadingState("📝", "Loading notes…"); return }
    if (notes.isEmpty()) { EmptyState("📝", "No notes yet", "Create a note or ask Skippy to take notes for you."); return }

    val pinned   = notes.filter { it.isPinned }
    val unpinned = notes.filter { !it.isPinned }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, top = 0.dp, end = 12.dp, bottom = 80.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (pinned.isNotEmpty()) {
            item {
                Text("📌 Pinned", color = AccentGold, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(vertical = 4.dp))
            }
            items(pinned, key = { it.id }) { note ->
                NoteCard(note = note, onDelete = onDelete)
            }
            item { Divider(color = SurfaceBorder, modifier = Modifier.padding(vertical = 4.dp)) }
        }
        items(unpinned, key = { it.id }) { note ->
            NoteCard(note = note, onDelete = onDelete)
        }
    }
}

@Composable
private fun NoteCard(note: Note, onDelete: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = NavyCard,
        border = BorderStroke(1.dp, if (note.isPinned) AccentGold.copy(alpha = 0.3f) else SurfaceBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(note.title, color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        formatNoteDate(note.updatedAt),
                        color = WhiteMuted.copy(alpha = 0.5f), fontSize = 11.sp,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Row {
                    if (note.isPinned) Text("📌", fontSize = 14.sp, modifier = Modifier.padding(end = 4.dp))
                    IconButton(onClick = { expanded = !expanded }, modifier = Modifier.size(28.dp)) {
                        Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null,
                            tint = WhiteMuted.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = { onDelete(note.id) }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.DeleteOutline, "Delete", tint = ErrorRed.copy(alpha = 0.4f), modifier = Modifier.size(15.dp))
                    }
                }
            }
            if (note.content.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text     = note.content,
                    color    = WhiteMuted, fontSize = 13.sp, lineHeight = 18.sp,
                    maxLines = if (expanded) Int.MAX_VALUE else 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (note.tags.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    note.tags.take(4).forEach { tag ->
                        Text("#$tag", color = AccentGold.copy(alpha = 0.6f), fontSize = 10.sp)
                    }
                }
            }
            if (note.wordCount > 0) {
                Text("${note.wordCount} words", color = WhiteDim.copy(alpha = 0.3f), fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun SummariesTab(summaries: List<Summary>) {
    if (summaries.isEmpty()) {
        EmptyState("✨", "No summaries yet", "Summaries are generated automatically from your notes and conversations.")
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, top = 0.dp, end = 12.dp, bottom = 80.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(summaries, key = { it.id }) { summary ->
            SummaryCard(summary = summary)
        }
    }
}

@Composable
private fun SummaryCard(summary: Summary) {
    var expanded by remember { mutableStateOf(false) }
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = NavyCard,
        border = BorderStroke(1.dp, AccentGold.copy(alpha = 0.2f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(
                            modifier = Modifier
                                .background(AccentGold.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 7.dp, vertical = 3.dp),
                        ) { Text(summary.period, color = AccentGold, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
                        Text("${summary.noteCount} notes", color = WhiteMuted.copy(alpha = 0.5f), fontSize = 11.sp)
                    }
                    Text(summary.title, color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                }
                IconButton(onClick = { expanded = !expanded }, modifier = Modifier.size(28.dp)) {
                    Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null,
                        tint = AccentGold.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = summary.content,
                color = WhiteMuted, fontSize = 13.sp, lineHeight = 18.sp,
                maxLines = if (expanded) Int.MAX_VALUE else 4,
                overflow = TextOverflow.Ellipsis,
            )
            Text(formatNoteDate(summary.createdAt), color = WhiteDim.copy(alpha = 0.3f), fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

private fun formatNoteDate(iso: String): String = runCatching {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)
    val date = sdf.parse(iso.take(16)) ?: return@runCatching iso
    val now = Calendar.getInstance()
    val cal = Calendar.getInstance().apply { time = date }
    when {
        now.get(Calendar.DAY_OF_YEAR) == cal.get(Calendar.DAY_OF_YEAR) -> "Today ${SimpleDateFormat("h:mm a", Locale.US).format(date)}"
        now.get(Calendar.DAY_OF_YEAR) - cal.get(Calendar.DAY_OF_YEAR) == 1 -> "Yesterday"
        else -> SimpleDateFormat("MMM d", Locale.US).format(date)
    }
}.getOrDefault(iso.take(10))

