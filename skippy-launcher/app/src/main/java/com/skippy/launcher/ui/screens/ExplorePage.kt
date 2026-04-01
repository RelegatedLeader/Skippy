package com.skippy.launcher.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.data.Debate
import com.skippy.launcher.data.DebateDetail
import com.skippy.launcher.data.LearnWord
import com.skippy.launcher.data.LearnStatsResponse
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val PRACTICE_MODES = listOf(
    Triple("🧠", "Adaptive",   "SRS-driven mixed"),
    Triple("🃏", "Flashcards", "Pure card review"),
    Triple("👂", "Listening",  "Hear & identify"),
    Triple("✍️", "Typing",     "Type the meaning"),
    Triple("🎯", "Weak",       "Focus on weak words"),
)

@Composable
fun ExplorePage(viewModel: LauncherViewModel) {
    var activeTab by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        viewModel.loadDebates()
        viewModel.loadLearnStats()
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
            Text("Explore", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WhiteText)
            IconButton(onClick = {
                if (activeTab == 0) viewModel.loadDebates() else viewModel.loadLearnStats()
            }) {
                Icon(Icons.Default.Refresh, "Refresh", tint = GreenSuccess, modifier = Modifier.size(20.dp))
            }
        }

        // ── Tabs ────────────────────────────────────────────────────────────
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(listOf("⚔️" to "Debates", "🎓" to "Learn")) { (icon, label) ->
                val idx = if (label == "Debates") 0 else 1
                val sel = activeTab == idx
                Surface(
                    modifier = Modifier.clickable { activeTab = idx },
                    shape = RoundedCornerShape(12.dp),
                    color = if (sel) GreenSuccess.copy(alpha = 0.18f) else NavyCard,
                    border = BorderStroke(1.dp, if (sel) GreenSuccess.copy(alpha = 0.5f) else SurfaceBorder),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(icon, fontSize = 14.sp)
                        Text(label, color = if (sel) GreenSuccess else WhiteMuted, fontSize = 13.sp,
                            fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal)
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        when (activeTab) {
            0 -> DebatesTab(viewModel = viewModel)
            1 -> LearnTab(viewModel = viewModel)
        }
    }
}

// ── Debates Tab ───────────────────────────────────────────────────────────────

@Composable
private fun DebatesTab(viewModel: LauncherViewModel) {
    val debates         by viewModel.debates.collectAsState()
    val debatesLoading  by viewModel.debatesLoading.collectAsState()
    val activeDebate    by viewModel.activeDebate.collectAsState()

    if (activeDebate != null) {
        DebateArenaScreen(
            detail      = activeDebate!!,
            viewModel   = viewModel,
            onBack      = { viewModel.clearActiveDebate() },
        )
        return
    }

    var showCreate by remember { mutableStateOf(false) }
    var newTopic   by remember { mutableStateOf("") }
    var newStance  by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Debates", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = WhiteText)
            TextButton(onClick = { showCreate = !showCreate }) {
                Icon(Icons.Default.Add, null, tint = GreenSuccess, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("New", color = GreenSuccess, fontSize = 12.sp)
            }
        }

        AnimatedVisibility(visible = showCreate) {
            val keyboard = LocalSoftwareKeyboardController.current
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp)
                    .background(NavyCard, RoundedCornerShape(14.dp))
                    .border(1.dp, GreenSuccess.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("New Debate", fontWeight = FontWeight.SemiBold, color = GreenSuccess, fontSize = 13.sp)
                OutlinedTextField(
                    value = newTopic, onValueChange = { newTopic = it },
                    placeholder = { Text("Topic to debate…", color = WhiteDim, fontSize = 13.sp) },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    colors = debateFieldColors(), shape = RoundedCornerShape(10.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
                OutlinedTextField(
                    value = newStance, onValueChange = { newStance = it },
                    placeholder = { Text("Your stance (optional)…", color = WhiteDim, fontSize = 13.sp) },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    colors = debateFieldColors(), shape = RoundedCornerShape(10.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { keyboard?.hide() }),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { showCreate = false; newTopic = ""; newStance = "" },
                        modifier = Modifier.weight(1f), border = BorderStroke(1.dp, SurfaceBorder)) {
                        Text("Cancel", color = WhiteMuted, fontSize = 12.sp)
                    }
                    Button(onClick = {
                        if (newTopic.isNotBlank()) {
                            viewModel.createDebate(newTopic.trim(), newStance.takeIf { it.isNotBlank() })
                            newTopic = ""; newStance = ""; showCreate = false
                        }
                    }, modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess, contentColor = NavyDeep)) {
                        Text("Start Debate", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
                // Topic suggestions
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    items(listOf("AI ethics", "Climate change", "Universal Basic Income", "Remote work", "Space colonization")) { suggestion ->
                        Surface(
                            modifier = Modifier.clickable { newTopic = suggestion },
                            shape = RoundedCornerShape(20.dp),
                            color = GreenSuccess.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, GreenSuccess.copy(alpha = 0.3f)),
                        ) {
                            Text(suggestion, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                color = GreenSuccess.copy(alpha = 0.8f), fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        if (debatesLoading) { LoadingState("⚔️", "Loading debates…"); return@Column }
        if (debates.isEmpty()) {
            EmptyState("⚔️", "No debates yet", "Challenge Skippy to debate any topic. It's a great way to sharpen your thinking.")
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 12.dp, top = 0.dp, end = 12.dp, bottom = 80.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(debates, key = { it.id }) { debate ->
                DebateCard(debate = debate, onOpen = { viewModel.loadDebateDetail(debate.id) })
            }
        }
    }
}

@Composable
private fun DebateCard(debate: Debate, onOpen: () -> Unit) {
    val statusColor = when (debate.status) {
        "active"     -> GreenSuccess
        "concluded"  -> WhiteMuted
        else         -> AmberWarning
    }
    Surface(
        shape    = RoundedCornerShape(14.dp),
        color    = NavyCard,
        border   = BorderStroke(1.dp, statusColor.copy(alpha = 0.25f)),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(debate.topic, color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (!debate.userStance.isNullOrBlank()) {
                        Text("Your stance: ${debate.userStance}", color = CyanPrimary.copy(alpha = 0.7f), fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
                    }
                }
                Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(statusColor.copy(alpha = 0.15f)).padding(horizontal = 7.dp, vertical = 3.dp)) {
                    Text(debate.status.replaceFirstChar { it.uppercase() }, color = statusColor, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Round ${debate.currentRound}/${debate.maxRounds}", color = WhiteMuted.copy(alpha = 0.6f), fontSize = 12.sp)
                if (debate.winner != null) {
                    Text("Winner: ${debate.winner}", color = AccentGold, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Continue →", color = GreenSuccess, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun DebateArenaScreen(
    detail: DebateDetail,
    viewModel: LauncherViewModel,
    onBack: () -> Unit,
) {
    val submitting by viewModel.debateSubmitting.collectAsState()
    var myArgument by remember { mutableStateOf("") }
    val keyboard   = LocalSoftwareKeyboardController.current
    val debate     = detail.debate

    Column(modifier = Modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, "Back", tint = WhiteMuted, modifier = Modifier.size(22.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(debate.topic, color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("Round ${debate.currentRound}/${debate.maxRounds} · ${debate.status}", color = GreenSuccess.copy(alpha = 0.8f), fontSize = 11.sp)
            }
        }

        if (debate.winner != null) {
            Box(
                modifier = Modifier.fillMaxWidth().padding(12.dp).background(AccentGold.copy(alpha = 0.1f), RoundedCornerShape(12.dp)).border(1.dp, AccentGold.copy(alpha = 0.4f), RoundedCornerShape(12.dp)).padding(14.dp),
            ) {
                Text("🏆 Winner: ${debate.winner}", color = AccentGold, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
        if (!detail.conclusion.isNullOrBlank()) {
            Surface(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                shape = RoundedCornerShape(12.dp), color = NavyCard,
                border = BorderStroke(1.dp, PurpleAccent.copy(alpha = 0.3f)),
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Conclusion", color = PurpleAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(detail.conclusion, color = WhiteText, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }

        // Rounds
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(detail.rounds, key = { it.id }) { round ->
                Surface(shape = RoundedCornerShape(12.dp), color = NavyCard, border = BorderStroke(1.dp, SurfaceBorder), modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Round ${round.roundNumber}", color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Row(modifier = Modifier.fillMaxWidth().background(CyanDim, RoundedCornerShape(8.dp)).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("You:", color = CyanPrimary, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                            Text(round.userArgument, color = WhiteText, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.weight(1f))
                        }
                        Row(modifier = Modifier.fillMaxWidth().background(GreenSuccess.copy(alpha = 0.08f), RoundedCornerShape(8.dp)).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("AI:", color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                            Text(round.aiArgument, color = WhiteText, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        // Input (only if debate is active)
        if (debate.status == "active" && debate.winner == null) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = NavyDeep.copy(alpha = 0.95f), tonalElevation = 0.dp,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = myArgument, onValueChange = { myArgument = it },
                        placeholder = { Text("Your argument…", color = WhiteDim, fontSize = 13.sp) },
                        modifier = Modifier.weight(1f),
                        colors = debateFieldColors(), shape = RoundedCornerShape(14.dp),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = {
                            if (myArgument.isNotBlank() && !submitting) {
                                viewModel.submitDebateArgument(debate.id, myArgument.trim())
                                myArgument = ""; keyboard?.hide()
                            }
                        }),
                        enabled = !submitting,
                    )
                    if (submitting) {
                        CircularProgressIndicator(color = GreenSuccess, modifier = Modifier.size(36.dp), strokeWidth = 3.dp)
                    } else {
                        IconButton(onClick = {
                            if (myArgument.isNotBlank()) {
                                viewModel.submitDebateArgument(debate.id, myArgument.trim())
                                myArgument = ""; keyboard?.hide()
                            }
                        }, enabled = myArgument.isNotBlank()) {
                            Icon(Icons.Default.Send, "Submit", tint = if (myArgument.isNotBlank()) GreenSuccess else GreenSuccess.copy(alpha = 0.4f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun debateFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = GreenSuccess.copy(alpha = 0.8f), unfocusedBorderColor = GreenSuccess.copy(alpha = 0.3f),
    focusedTextColor = WhiteText, unfocusedTextColor = WhiteText, cursorColor = GreenSuccess,
    focusedContainerColor = NavyCard, unfocusedContainerColor = NavyCard,
)

// ── Learn Tab ─────────────────────────────────────────────────────────────────

@Composable
private fun LearnTab(viewModel: LauncherViewModel) {
    val stats    by viewModel.learnStats.collectAsState()
    val session  by viewModel.learnSession.collectAsState()
    val loading  by viewModel.learnLoading.collectAsState()

    if (session.isNotEmpty()) {
        FlashcardSession(
            words     = session,
            viewModel = viewModel,
            onDone    = {
                viewModel.startLearnSession("adaptive") // reload new session
                viewModel.loadLearnStats()
            },
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Stats card
        if (stats != null) {
            val p = stats!!.progress
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = NavyCard,
                border = BorderStroke(1.dp, GreenSuccess.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Your Progress", color = GreenSuccess, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        StatItem("${p?.totalXP ?: 0}", "XP", "⚡")
                        StatItem("${p?.currentStreak ?: 0}", "Streak", "🔥")
                        StatItem("${stats!!.learnedWords}", "Learned", "📚")
                        StatItem("${stats!!.masteredWords}", "Mastered", "🏆")
                    }
                    LinearProgressIndicator(
                        progress = { if (stats!!.totalWords > 0) stats!!.learnedWords.toFloat() / stats!!.totalWords else 0f },
                        modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = GreenSuccess, trackColor = GreenDim,
                    )
                    Text("${stats!!.learnedWords}/${stats!!.totalWords} words learned", color = WhiteMuted, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
            }
        }

        // Practice modes
        Text("Practice Modes", color = WhiteText, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        PRACTICE_MODES.forEach { (icon, label, desc) ->
            Surface(
                modifier = Modifier.fillMaxWidth().clickable {
                    if (!loading) viewModel.startLearnSession(label.lowercase())
                },
                shape = RoundedCornerShape(14.dp),
                color = NavyCard,
                border = BorderStroke(1.dp, GreenSuccess.copy(alpha = 0.2f)),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(icon, fontSize = 24.sp)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(label, color = WhiteText, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Text(desc, color = WhiteMuted, fontSize = 12.sp)
                    }
                    if (loading) CircularProgressIndicator(color = GreenSuccess, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Default.ChevronRight, null, tint = GreenSuccess.copy(alpha = 0.5f))
                }
            }
        }
        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun StatItem(value: String, label: String, icon: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(icon, fontSize = 20.sp)
        Text(value, color = GreenSuccess, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Text(label, color = WhiteMuted, fontSize = 10.sp)
    }
}

// ── Flashcard/Exercise session ────────────────────────────────────────────────

@Composable
private fun FlashcardSession(
    words: List<LearnWord>,
    viewModel: LauncherViewModel,
    onDone: () -> Unit,
) {
    var currentIdx by remember { mutableStateOf(0) }
    var score      by remember { mutableStateOf(0) }
    val scope      = rememberCoroutineScope()

    val current = words.getOrNull(currentIdx)

    if (current == null) {
        // Session complete screen
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.padding(24.dp),
            ) {
                Text("🎉", fontSize = 64.sp)
                Text("Session Complete!", color = WhiteText, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("$score / ${words.size} correct", color = GreenSuccess, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { score.toFloat() / words.size },
                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                    color = GreenSuccess, trackColor = GreenDim,
                )
                Text(
                    when {
                        score == words.size -> "Perfect score! 🏆"
                        score >= words.size * 0.8 -> "Great job! Keep it up!"
                        score >= words.size * 0.5 -> "Good effort! Practice makes perfect."
                        else -> "Keep practicing — you'll get there!"
                    },
                    color = WhiteMuted, fontSize = 14.sp, textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = onDone,
                    colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess, contentColor = NavyDeep),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) { Text("Practice Again", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
            }
        }
        return
    }

    // Progress bar
    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("${currentIdx + 1} / ${words.size}", color = WhiteMuted, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(GreenSuccess.copy(0.15f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                    Text("$score ✓", color = GreenSuccess, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { (currentIdx + 1).toFloat() / words.size },
            modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)),
            color = GreenSuccess, trackColor = GreenDim,
        )
        Spacer(Modifier.height(12.dp))

        // Exercise type label
        val exerciseLabel = when {
            current.exerciseType.contains("mc") || current.exerciseType.contains("multiple") -> "Multiple Choice"
            current.exerciseType.contains("typing") || current.exerciseType.contains("translation") || current.exerciseType.contains("input") -> "Type the Answer"
            current.exerciseType.contains("listening") -> "Listening"
            else -> "Flashcard"
        }
        Box(modifier = Modifier.clip(RoundedCornerShape(20.dp)).background(GreenSuccess.copy(0.12f)).padding(horizontal = 10.dp, vertical = 4.dp)) {
            Text(exerciseLabel, color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(12.dp))

        // Route to correct exercise type
        when {
            current.exerciseType.contains("mc") || current.exerciseType.contains("multiple") || (current.exerciseType.isBlank() && current.distractors.isNotEmpty()) -> {
                MultipleChoiceExercise(
                    word = current,
                    onAnswer = { correct ->
                        if (correct) score++
                        viewModel.submitLearnAnswer(current.id, correct, current.exerciseType, if (correct) 4 else 1)
                        scope.launch { delay(500); currentIdx++ }
                    },
                )
            }
            current.exerciseType.contains("typing") || current.exerciseType.contains("translation") || current.exerciseType.contains("input") -> {
                TypingExercise(
                    word = current,
                    onAnswer = { correct ->
                        if (correct) score++
                        viewModel.submitLearnAnswer(current.id, correct, current.exerciseType, if (correct) 4 else 1)
                        scope.launch { delay(800); currentIdx++ }
                    },
                )
            }
            else -> {
                FlipCardExercise(
                    word = current,
                    onCorrect = {
                        score++
                        viewModel.submitLearnAnswer(current.id, true, current.exerciseType, 4)
                        scope.launch { delay(400); currentIdx++ }
                    },
                    onHard = {
                        viewModel.submitLearnAnswer(current.id, false, current.exerciseType, 1)
                        scope.launch { delay(400); currentIdx++ }
                    },
                )
            }
        }
    }
}

// ── Multiple Choice Exercise ───────────────────────────────────────────────────

@Composable
private fun MultipleChoiceExercise(word: LearnWord, onAnswer: (Boolean) -> Unit) {
    var selectedAnswer by remember(word.id) { mutableStateOf<String?>(null) }
    val correctAnswer = word.meaning

    // Build options: correct answer + distractors shuffled
    val options = remember(word.id) {
        (listOf(correctAnswer) + word.distractors.take(3)).shuffled()
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Character card
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Brush.verticalGradient(listOf(NavyCard, NavyDeep)))
                .border(1.dp, GreenSuccess.copy(0.3f), RoundedCornerShape(20.dp))
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(GreenSuccess.copy(0.12f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                        Text("HSK ${word.hsk}", color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    if (word.pos.isNotBlank()) {
                        Text("[${word.pos}]", color = WhiteMuted.copy(0.5f), fontSize = 12.sp)
                    }
                }
                Text(word.simplified, fontSize = 72.sp, color = WhiteText, textAlign = TextAlign.Center)
                if (word.pinyin.isNotBlank()) {
                    Text(word.pinyin, color = CyanPrimary, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                }
                Text("What does this mean?", color = WhiteMuted.copy(0.6f), fontSize = 13.sp)
            }
        }

        // Answer options
        options.forEach { option ->
            val isSelected = selectedAnswer == option
            val isCorrect = option == correctAnswer
            val answered = selectedAnswer != null

            val bgColor = when {
                !answered -> NavyCard
                isSelected && isCorrect -> GreenSuccess.copy(0.18f)
                isSelected && !isCorrect -> ErrorRed.copy(0.18f)
                !isSelected && isCorrect && answered -> GreenSuccess.copy(0.10f)
                else -> NavyCard
            }
            val borderColor = when {
                !answered -> SurfaceBorder
                isSelected && isCorrect -> GreenSuccess.copy(0.7f)
                isSelected && !isCorrect -> ErrorRed.copy(0.7f)
                !isSelected && isCorrect && answered -> GreenSuccess.copy(0.5f)
                else -> SurfaceBorder
            }

            Surface(
                modifier = Modifier.fillMaxWidth().clickable(enabled = !answered) {
                    selectedAnswer = option
                    onAnswer(isCorrect)
                },
                shape = RoundedCornerShape(14.dp),
                color = bgColor,
                border = BorderStroke(1.5.dp, borderColor),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(option, color = WhiteText, fontSize = 14.sp, modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                    if (answered) {
                        when {
                            isCorrect -> Icon(Icons.Default.CheckCircle, null, tint = GreenSuccess, modifier = Modifier.size(20.dp))
                            isSelected -> Icon(Icons.Default.Cancel, null, tint = ErrorRed, modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

// ── Typing Exercise ────────────────────────────────────────────────────────────

@Composable
private fun TypingExercise(word: LearnWord, onAnswer: (Boolean) -> Unit) {
    var userInput by remember(word.id) { mutableStateOf("") }
    var revealed  by remember(word.id) { mutableStateOf(false) }
    var answered  by remember(word.id) { mutableStateOf<Boolean?>(null) }
    val keyboard  = LocalSoftwareKeyboardController.current

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Character card
        Box(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                .background(Brush.verticalGradient(listOf(NavyCard, NavyDeep)))
                .border(1.dp, GreenSuccess.copy(0.3f), RoundedCornerShape(20.dp)).padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(word.simplified, fontSize = 72.sp, color = WhiteText, textAlign = TextAlign.Center)
                if (word.pinyin.isNotBlank()) {
                    Text(word.pinyin, color = CyanPrimary, fontSize = 18.sp)
                }
                if (word.example.isNotBlank()) {
                    Text(word.example, color = WhiteMuted.copy(0.6f), fontSize = 12.sp, textAlign = TextAlign.Center)
                }
                Text("Type the meaning in English", color = WhiteMuted.copy(0.5f), fontSize = 13.sp)
            }
        }

        // Input field
        val isCorrectAnswer = answered == true
        val isWrong = answered == false
        OutlinedTextField(
            value = userInput, onValueChange = { if (answered == null) userInput = it },
            placeholder = { Text("Type the meaning…", color = WhiteDim, fontSize = 14.sp) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true, enabled = answered == null,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = if (isCorrectAnswer) GreenSuccess else if (isWrong) ErrorRed else GreenSuccess.copy(0.6f),
                unfocusedBorderColor = if (isCorrectAnswer) GreenSuccess else if (isWrong) ErrorRed else GreenSuccess.copy(0.3f),
                focusedTextColor = WhiteText, unfocusedTextColor = WhiteText, cursorColor = GreenSuccess,
                focusedContainerColor = NavyCard, unfocusedContainerColor = NavyCard,
            ),
            trailingIcon = {
                if (answered != null) Icon(
                    if (isCorrectAnswer) Icons.Default.CheckCircle else Icons.Default.Cancel,
                    null,
                    tint = if (isCorrectAnswer) GreenSuccess else ErrorRed,
                    modifier = Modifier.size(20.dp),
                )
            },
            shape = RoundedCornerShape(14.dp),
            textStyle = TextStyle(fontSize = 15.sp, color = WhiteText, fontWeight = FontWeight.Medium),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                keyboard?.hide()
                if (answered == null && userInput.isNotBlank()) {
                    val correct = userInput.trim().lowercase() in word.meaning.lowercase() ||
                            word.meaning.lowercase() in userInput.trim().lowercase()
                    answered = correct
                    onAnswer(correct)
                }
            }),
        )

        if (answered == false) {
            // Show correct answer on wrong
            Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .background(GreenSuccess.copy(0.10f)).border(1.dp, GreenSuccess.copy(0.3f), RoundedCornerShape(10.dp)).padding(12.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Correct answer:", color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(word.meaning, color = WhiteText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        if (answered == null) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = { revealed = true },
                    modifier = Modifier.weight(1f),
                    border = BorderStroke(1.dp, WhiteMuted.copy(0.3f)),
                    shape = RoundedCornerShape(12.dp),
                ) { Text("Show answer", color = WhiteMuted, fontSize = 13.sp) }
                Button(
                    onClick = {
                        keyboard?.hide()
                        if (userInput.isNotBlank()) {
                            val correct = userInput.trim().lowercase() in word.meaning.lowercase() ||
                                    word.meaning.lowercase() in userInput.trim().lowercase()
                            answered = correct
                            onAnswer(correct)
                        }
                    },
                    enabled = userInput.isNotBlank(),
                    modifier = Modifier.weight(1f).height(46.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess, contentColor = NavyDeep),
                    shape = RoundedCornerShape(12.dp),
                ) { Text("Check", fontWeight = FontWeight.Bold) }
            }
        }

        if (revealed && answered == null) {
            Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(AmberWarning.copy(0.10f))
                .border(1.dp, AmberWarning.copy(0.3f), RoundedCornerShape(10.dp)).padding(12.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Answer:", color = AmberWarning, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(word.meaning, color = WhiteText, fontSize = 15.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        OutlinedButton(onClick = { answered = false; onAnswer(false) }, modifier = Modifier.weight(1f),
                            border = BorderStroke(1.dp, ErrorRed.copy(0.4f)), shape = RoundedCornerShape(10.dp)) {
                            Text("✗  Didn't know", color = ErrorRed, fontSize = 12.sp)
                        }
                        Button(onClick = { answered = true; onAnswer(true) }, modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess.copy(0.2f), contentColor = GreenSuccess),
                            shape = RoundedCornerShape(10.dp), border = BorderStroke(1.dp, GreenSuccess.copy(0.4f))) {
                            Text("✓  Knew it", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

// ── Flip Card Exercise ─────────────────────────────────────────────────────────

@Composable
private fun FlipCardExercise(word: LearnWord, onCorrect: () -> Unit, onHard: () -> Unit) {
    var flipped  by remember(word.id) { mutableStateOf(false) }
    var answered by remember(word.id) { mutableStateOf<Boolean?>(null) }

    val flipAnim = remember { Animatable(0f) }
    LaunchedEffect(flipped) { flipAnim.animateTo(if (flipped) 180f else 0f, tween(300)) }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Box(
            modifier = Modifier.fillMaxWidth().weight(1f, false)
                .aspectRatio(1.5f)
                .clip(RoundedCornerShape(20.dp))
                .background(Brush.verticalGradient(listOf(NavyCard, NavyDeep)))
                .border(1.dp,
                    when (answered) {
                        true  -> GreenSuccess.copy(0.6f)
                        false -> ErrorRed.copy(0.6f)
                        null  -> GreenSuccess.copy(0.3f)
                    },
                    RoundedCornerShape(20.dp))
                .clickable(enabled = answered == null) { flipped = !flipped },
            contentAlignment = Alignment.Center,
        ) {
            if (flipAnim.value <= 90f) {
                // Front: Chinese character
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(GreenSuccess.copy(0.12f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                        Text("HSK ${word.hsk}", color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(word.simplified, fontSize = 72.sp, color = WhiteText)
                    if (!flipped) {
                        Text("Tap to reveal", color = CyanPrimary.copy(0.7f), fontSize = 15.sp)
                    }
                }
            } else {
                // Back: meaning
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(16.dp)) {
                    Text(word.simplified, fontSize = 36.sp, color = WhiteText.copy(0.4f))
                    Text(word.pinyin, color = CyanPrimary, fontSize = 18.sp)
                    Text(word.meaning, fontSize = 24.sp, color = WhiteText, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                    if (word.pos.isNotBlank()) {
                        Text("[${word.pos}]", color = WhiteMuted.copy(0.55f), fontSize = 12.sp)
                    }
                    if (word.exMeaning.isNotBlank()) {
                        Text(word.exMeaning, color = WhiteMuted, fontSize = 13.sp, textAlign = TextAlign.Center)
                    }
                }
            }
        }

        // Action buttons (shown after flipping)
        AnimatedVisibility(visible = flipped && answered == null) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = { answered = false; onHard() },
                    modifier = Modifier.weight(1f).height(54.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ErrorRed.copy(0.2f), contentColor = ErrorRed),
                    shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, ErrorRed.copy(0.4f)),
                ) { Text("✗  Hard", fontWeight = FontWeight.Bold, fontSize = 15.sp) }
                Button(
                    onClick = { answered = true; onCorrect() },
                    modifier = Modifier.weight(1f).height(54.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess.copy(0.2f), contentColor = GreenSuccess),
                    shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, GreenSuccess.copy(0.4f)),
                ) { Text("✓  Got it", fontWeight = FontWeight.Bold, fontSize = 15.sp) }
            }
        }
        if (!flipped) {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text("Tap the card to flip", color = WhiteMuted.copy(0.45f), fontSize = 13.sp)
            }
        }

        Spacer(Modifier.height(16.dp))
    }
}

