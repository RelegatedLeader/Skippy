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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.text.HtmlCompat
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
    var noteSearch   by remember { mutableStateOf("") }
    var editingNote  by remember { mutableStateOf<Note?>(null) }
    var showNewNote  by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<Note?>(null) }

    val filteredNotes = remember(notes, noteSearch) {
        if (noteSearch.isBlank()) notes
        else { val q = noteSearch.trim().lowercase()
            notes.filter { it.title.lowercase().contains(q) || it.content.lowercase().contains(q) || it.tags.any { t -> t.contains(q) } } }
    }

    LaunchedEffect(Unit) { viewModel.loadNotes(); viewModel.loadSummaries() }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding()) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp).padding(top = 48.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text("Notes & Summaries", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WhiteText)
                    Text("${notes.size} notes · ${summaries.size} summaries", fontSize = 12.sp, color = WhiteMuted)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(onClick = { viewModel.loadNotes(); viewModel.loadSummaries() }) {
                        Icon(Icons.Default.Refresh, "Refresh", tint = AccentGold, modifier = Modifier.size(20.dp))
                    }
                    if (activeTab == 0) {
                        IconButton(onClick = { showNewNote = true }) {
                            Icon(Icons.Default.Add, "New note", tint = AccentGold, modifier = Modifier.size(22.dp))
                        }
                    }
                }
            }
            // Tabs
            LazyRow(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("📝" to "Notes", "✨" to "Summaries")) { (icon, label) ->
                    val idx = if (label == "Notes") 0 else 1; val sel = activeTab == idx
                    Surface(modifier = Modifier.clickable { activeTab = idx }, shape = RoundedCornerShape(12.dp),
                        color = if (sel) AccentGold.copy(alpha = 0.18f) else NavyCard,
                        border = BorderStroke(1.dp, if (sel) AccentGold.copy(alpha = 0.5f) else SurfaceBorder)) {
                        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(icon, fontSize = 14.sp)
                            Text(label, color = if (sel) AccentGold else WhiteMuted, fontSize = 13.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            if (activeTab == 0 && (notes.isNotEmpty() || noteSearch.isNotBlank())) {
                OutlinedTextField(value = noteSearch, onValueChange = { noteSearch = it },
                    placeholder = { Text("Search notes…", color = WhiteDim, fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, null, tint = WhiteMuted, modifier = Modifier.size(18.dp)) },
                    trailingIcon = { if (noteSearch.isNotBlank()) IconButton(onClick = { noteSearch = "" }, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Close, "Clear", tint = WhiteMuted, modifier = Modifier.size(16.dp)) } },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = AccentGold.copy(alpha = 0.7f), unfocusedBorderColor = SurfaceBorder,
                        focusedTextColor = WhiteText, unfocusedTextColor = WhiteText, cursorColor = AccentGold, focusedContainerColor = NavyCard, unfocusedContainerColor = NavyCard),
                    shape = RoundedCornerShape(12.dp), singleLine = true)
                Spacer(Modifier.height(6.dp))
            }
            when (activeTab) {
                0 -> NotesTab(notes = filteredNotes, loading = notesLoading,
                    onNoteClick = { editingNote = it }, onDeleteRequest = { deleteTarget = it },
                    emptyHint = if (noteSearch.isNotBlank()) "No notes match \"$noteSearch\"" else null)
                1 -> SummariesTab(summaries = summaries)
            }
        }

        // Note editor full-screen overlay
        AnimatedVisibility(visible = editingNote != null || showNewNote,
            enter = fadeIn() + slideInVertically { it / 3 }, exit = fadeOut() + slideOutVertically { it / 3 },
            modifier = Modifier.fillMaxSize()) {
            NoteEditorSheet(note = editingNote,
                onSave = { t, c -> if (editingNote != null) viewModel.updateNote(editingNote!!.id, t, c) else viewModel.createNote(t.ifBlank { "Untitled" }, c); editingNote = null; showNewNote = false },
                onDismiss = { editingNote = null; showNewNote = false })
        }

        // Delete confirmation
        deleteTarget?.let { note ->
            AlertDialog(onDismissRequest = { deleteTarget = null }, containerColor = NavyCard, tonalElevation = 0.dp,
                title = { Text("Delete Note?", color = WhiteText, fontWeight = FontWeight.Bold, fontSize = 17.sp) },
                text = { Text("\"${note.title}\" will be permanently deleted. This cannot be undone.", color = WhiteMuted, fontSize = 14.sp, lineHeight = 20.sp) },
                confirmButton = { TextButton(onClick = { viewModel.deleteNote(note.id); deleteTarget = null }) { Text("Delete", color = ErrorRed, fontWeight = FontWeight.SemiBold) } },
                dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("Cancel", color = WhiteMuted) } })
        }
    }
}

@Composable
private fun NoteEditorSheet(note: Note?, onSave: (String, String) -> Unit, onDismiss: () -> Unit) {
    var title   by remember(note) { mutableStateOf(note?.title ?: "") }
    var content by remember(note) { mutableStateOf(note?.content?.toDisplayText() ?: "") }
    val fr = remember { FocusRequester() }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(120); runCatching { fr.requestFocus() } }

    Surface(modifier = Modifier.fillMaxSize(), color = NavyDeep.copy(alpha = 0.99f)) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
            // Toolbar
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp).padding(top = 48.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onDismiss) { Text("Cancel", color = WhiteMuted, fontSize = 15.sp) }
                Text(if (note != null) "Edit Note" else "New Note", color = WhiteText, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Button(onClick = { if (content.isNotBlank()) onSave(title.ifBlank { "Untitled" }, content.trim()) },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentGold, contentColor = NavyDeep),
                    shape = RoundedCornerShape(10.dp), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), enabled = content.isNotBlank()) {
                    Icon(Icons.Default.Check, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Save", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
            HorizontalDivider(color = SurfaceBorder)
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = title, onValueChange = { title = it },
                    placeholder = { Text("Title", color = WhiteDim, fontSize = 22.sp, fontWeight = FontWeight.Bold) },
                    modifier = Modifier.fillMaxWidth().focusRequester(fr),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Color.Transparent, unfocusedBorderColor = Color.Transparent,
                        focusedTextColor = WhiteText, unfocusedTextColor = WhiteText, cursorColor = AccentGold,
                        focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent),
                    textStyle = LocalTextStyle.current.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold, color = WhiteText), singleLine = true)
                HorizontalDivider(color = SurfaceBorder.copy(alpha = 0.4f))
                if (note != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (note.wordCount > 0) Text("${note.wordCount} words", color = WhiteDim.copy(alpha = 0.4f), fontSize = 11.sp)
                        if (note.updatedAt.isNotBlank()) Text("Last edited ${formatNoteDate(note.updatedAt)}", color = WhiteDim.copy(alpha = 0.4f), fontSize = 11.sp)
                        note.tags.take(3).forEach { tag -> Text("#$tag", color = AccentGold.copy(alpha = 0.6f), fontSize = 11.sp) }
                    }
                }
                OutlinedTextField(value = content, onValueChange = { content = it },
                    placeholder = { Text("Write your note here…", color = WhiteDim, fontSize = 15.sp) },
                    modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 280.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Color.Transparent, unfocusedBorderColor = Color.Transparent,
                        focusedTextColor = WhiteText, unfocusedTextColor = WhiteText, cursorColor = AccentGold,
                        focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent),
                    textStyle = LocalTextStyle.current.copy(fontSize = 15.sp, color = WhiteText, lineHeight = 24.sp), minLines = 10)
            }
        }
    }
}

@Composable
private fun NotesTab(notes: List<Note>, loading: Boolean, onNoteClick: (Note) -> Unit, onDeleteRequest: (Note) -> Unit, emptyHint: String? = null) {
    if (loading) { LoadingState("📝", "Loading notes…"); return }
    if (notes.isEmpty()) { EmptyState("📝", emptyHint ?: "No notes yet", if (emptyHint != null) "Try a different search." else "Tap + to create a note, or ask Skippy to take notes for you."); return }
    val pinned = notes.filter { it.isPinned }; val unpinned = notes.filter { !it.isPinned }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 12.dp, top = 4.dp, end = 12.dp, bottom = 100.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (pinned.isNotEmpty()) {
            item { Text("📌 Pinned", color = AccentGold, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 4.dp, horizontal = 2.dp)) }
            items(pinned, key = { it.id }) { note -> NoteCard(note = note, onClick = { onNoteClick(note) }, onDeleteRequest = { onDeleteRequest(note) }) }
            item { HorizontalDivider(color = SurfaceBorder, modifier = Modifier.padding(vertical = 4.dp)) }
        }
        if (unpinned.isNotEmpty() && pinned.isNotEmpty()) {
            item { Text("All Notes", color = WhiteMuted.copy(alpha = 0.4f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 4.dp, horizontal = 2.dp)) }
        }
        items(unpinned, key = { it.id }) { note -> NoteCard(note = note, onClick = { onNoteClick(note) }, onDeleteRequest = { onDeleteRequest(note) }) }
    }
}

@Composable
private fun NoteCard(note: Note, onClick: () -> Unit, onDeleteRequest: () -> Unit) {
    Surface(shape = RoundedCornerShape(14.dp), color = NavyCard,
        border = BorderStroke(1.dp, if (note.isPinned) AccentGold.copy(alpha = 0.35f) else SurfaceBorder),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (note.isPinned) Text("📌", fontSize = 12.sp)
                        Text(note.title, color = WhiteText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(formatNoteDate(note.updatedAt), color = WhiteMuted.copy(alpha = 0.45f), fontSize = 11.sp, modifier = Modifier.padding(top = 2.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Edit, null, tint = AccentGold.copy(alpha = 0.35f), modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(4.dp))
                    IconButton(onClick = onDeleteRequest, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Default.DeleteOutline, "Delete", tint = ErrorRed.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            if (note.content.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(text = note.content.toDisplayText(), color = WhiteMuted, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            if (note.tags.isNotEmpty() || note.wordCount > 0) {
                Spacer(Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        note.tags.take(3).forEach { tag ->
                            Surface(shape = RoundedCornerShape(6.dp), color = AccentGold.copy(alpha = 0.1f)) {
                                Text("#$tag", color = AccentGold.copy(alpha = 0.7f), fontSize = 10.sp, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                        }
                    }
                    if (note.wordCount > 0) Text("${note.wordCount}w", color = WhiteDim.copy(alpha = 0.3f), fontSize = 10.sp)
                }
            }
        }
    }
}

@Composable
private fun SummariesTab(summaries: List<Summary>) {
    if (summaries.isEmpty()) { EmptyState("✨", "No summaries yet", "Auto-generated from your notes and conversations by Skippy."); return }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 12.dp, top = 4.dp, end = 12.dp, bottom = 100.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(summaries, key = { it.id }) { summary -> SummaryCard(summary = summary) }
    }
}

@Composable
private fun SummaryCard(summary: Summary) {
    var expanded by remember { mutableStateOf(false) }
    Surface(shape = RoundedCornerShape(14.dp), color = NavyCard, border = BorderStroke(1.dp, AccentGold.copy(alpha = 0.2f)), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Surface(shape = RoundedCornerShape(8.dp), color = AccentGold.copy(alpha = 0.15f)) {
                            Text(summary.period.replaceFirstChar { it.uppercase() }, color = AccentGold, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                        }
                        if (summary.noteCount > 0) Text("${summary.noteCount} notes", color = WhiteMuted.copy(alpha = 0.5f), fontSize = 11.sp)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(summary.title, color = WhiteText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = if (expanded) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis)
                }
                IconButton(onClick = { expanded = !expanded }, modifier = Modifier.size(32.dp)) {
                    Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null, tint = AccentGold.copy(alpha = 0.6f), modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = AccentGold.copy(alpha = 0.12f))
            Spacer(Modifier.height(10.dp))
            Text(text = summary.content.toDisplayText(), color = WhiteMuted, fontSize = 13.sp, lineHeight = 20.sp, maxLines = if (expanded) Int.MAX_VALUE else 5, overflow = TextOverflow.Ellipsis)
            if (!expanded && summary.content.length > 200) {
                TextButton(onClick = { expanded = true }, contentPadding = PaddingValues(0.dp)) { Text("Read more", color = AccentGold, fontSize = 12.sp) }
            }
            Spacer(Modifier.height(4.dp))
            Text(formatNoteDate(summary.createdAt), color = WhiteDim.copy(alpha = 0.3f), fontSize = 10.sp)
        }
    }
}

private fun String.toDisplayText(): String {
    if (!this.contains('<')) return this
    return try { HtmlCompat.fromHtml(this, HtmlCompat.FROM_HTML_MODE_COMPACT).toString().replace(Regex("\n{3,}"), "\n\n").trim() }
    catch (e: Exception) { this.replace(Regex("<[^>]+>"), " ").replace(Regex("\\s{2,}"), " ").trim() }
}

private fun formatNoteDate(iso: String): String = runCatching {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)
    val date = sdf.parse(iso.take(16)) ?: return@runCatching iso
    val now = Calendar.getInstance(); val cal = Calendar.getInstance().apply { time = date }
    when {
        now.get(Calendar.DAY_OF_YEAR) == cal.get(Calendar.DAY_OF_YEAR) && now.get(Calendar.YEAR) == cal.get(Calendar.YEAR) -> "Today ${SimpleDateFormat("h:mm a", Locale.US).format(date)}"
        now.get(Calendar.DAY_OF_YEAR) - cal.get(Calendar.DAY_OF_YEAR) == 1 -> "Yesterday"
        else -> SimpleDateFormat("MMM d, yyyy", Locale.US).format(date)
    }
}.getOrDefault(iso.take(10))
