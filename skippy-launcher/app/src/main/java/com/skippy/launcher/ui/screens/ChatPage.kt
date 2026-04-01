package com.skippy.launcher.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.widget.Toast
import com.skippy.launcher.R
import com.skippy.launcher.data.ChatEntry
import com.skippy.launcher.data.ConversationSummary
import com.skippy.launcher.ui.components.MarkdownText
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.VoiceState
import java.util.Locale

@Composable
fun ChatPage(viewModel: LauncherViewModel) {
    val context       = LocalContext.current
    val chatLog       by viewModel.chatLog.collectAsState()
    val voiceState    by viewModel.voiceState.collectAsState()
    val isLoading     by viewModel.isLoading.collectAsState()
    val streamingText by viewModel.streamingText.collectAsState()
    val isGrokStreaming by viewModel.isGrokStreaming.collectAsState()
    val conversations by viewModel.conversations.collectAsState()
    val conversationsLoading by viewModel.conversationsLoading.collectAsState()
    val forcedAiMode  by viewModel.forcedAiMode.collectAsState()
    val keyboard      = LocalSoftwareKeyboardController.current
    val listState     = rememberLazyListState()
    var textInput     by remember { mutableStateOf("") }
    var showHistory   by remember { mutableStateOf(false) }
    var callModeEnabled by remember { mutableStateOf(false) }
    var showClearConfirm by remember { mutableStateOf(false) }
    var showAiSwitcher by remember { mutableStateOf(false) }

    // ── Lockscreen pending message — auto-send when this page becomes visible ──
    val pendingLockscreenMessage by viewModel.pendingLockscreenMessage.collectAsState()
    LaunchedEffect(pendingLockscreenMessage) {
        if (pendingLockscreenMessage.isNotBlank()) {
            viewModel.askSkippy(pendingLockscreenMessage)
            viewModel.consumePendingLockscreenMessage()
        }
    }

    // Clear chat confirmation dialog
    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            containerColor = NavyCard,
            tonalElevation = 0.dp,
            title = { Text("Clear Chat?", color = WhiteText, fontWeight = FontWeight.Bold, fontSize = 17.sp) },
            text = { Text("This will permanently clear all messages in this conversation. This cannot be undone.", color = WhiteMuted, fontSize = 14.sp, lineHeight = 20.sp) },
            confirmButton = {
                TextButton(onClick = { viewModel.clearChat(); showClearConfirm = false }) {
                    Text("Clear", color = ErrorRed, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearConfirm = false }) {
                    Text("Cancel", color = WhiteMuted)
                }
            },
        )
    }

    // AI Mode Switcher dialog
    if (showAiSwitcher) {
        AlertDialog(
            onDismissRequest = { showAiSwitcher = false },
            containerColor = NavyCard,
            tonalElevation = 0.dp,
            title = {
                Column {
                    Text("Switch AI", color = WhiteText, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text("Choose who responds to your messages", color = WhiteMuted, fontSize = 12.sp)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    // AUTO
                    val modeAuto   = forcedAiMode.isNullOrBlank()
                    val modeClaude = forcedAiMode == "claude"
                    val modeGrok   = forcedAiMode == "grok"
                    listOf(
                        Triple("", "🔀  Auto", "Routes intelligently — feelings → Claude, news → Grok"),
                        Triple("claude", "🤖  Claude", "Deeper reasoning, empathy, personal tasks & reflection"),
                        Triple("grok", "⚡  Grok", "Live news, real-time data, world knowledge"),
                    ).forEach { (mode, label, description) ->
                        val sel = when {
                            mode == "" && modeAuto    -> true
                            mode == "claude" && modeClaude -> true
                            mode == "grok"   && modeGrok   -> true
                            else -> false
                        }
                        val accentColor = when (mode) {
                            "grok"   -> Color(0xFFEAB308)
                            "claude" -> PurpleAccent
                            else     -> CyanPrimary
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, if (sel) accentColor.copy(0.7f) else SurfaceBorder, RoundedCornerShape(12.dp))
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (sel) accentColor.copy(0.12f) else NavyDeep)
                                .clickable {
                                    viewModel.setForcedAiMode(mode)
                                    showAiSwitcher = false
                                }
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (sel) accentColor else WhiteText, modifier = Modifier.weight(1f))
                                    if (sel) Icon(Icons.Default.Check, null, tint = accentColor, modifier = Modifier.size(16.dp))
                                }
                                Text(description, fontSize = 11.sp, color = WhiteMuted.copy(0.6f), lineHeight = 15.sp)
                            }
                        }
                    }
                    Box(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                            .background(CyanPrimary.copy(0.06f))
                            .padding(10.dp)
                    ) {
                        Text(
                            "💡 Tip: Switching AI mid-chat continues your context — Skippy remembers what you've been discussing.",
                            color = WhiteMuted.copy(0.65f), fontSize = 11.sp, lineHeight = 16.sp,
                        )
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showAiSwitcher = false }) { Text("Done", color = CyanPrimary) }
            },
        )
    }

    val speechRecognizer = remember(context) {
        // Guard creation: isRecognitionAvailable prevents crashes on devices/emulators
        // that don't have a speech recognition service. runCatching prevents any
        // RuntimeException (e.g. called before Looper is ready on some OEM ROMs).
        if (SpeechRecognizer.isRecognitionAvailable(context)) {
            runCatching { SpeechRecognizer.createSpeechRecognizer(context) }.getOrNull()
        } else null
    }
    DisposableEffect(Unit) { onDispose { speechRecognizer?.destroy() } }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) speechRecognizer?.let { startChatListening(it, viewModel) }
    }

    LaunchedEffect(chatLog.size) {
        if (chatLog.isNotEmpty()) {
            // Scroll to last message — coerce so index is always valid
            listState.animateScrollToItem((chatLog.size - 1).coerceAtLeast(0))
        }
    }
    LaunchedEffect(streamingText.length) {
        if (streamingText.isNotEmpty() && chatLog.isNotEmpty()) {
            // The loading item is at chatLog.size only when isLoading=true; safe to clamp
            listState.animateScrollToItem(chatLog.size.coerceAtLeast(0))
        }
    }
    // Conversations are loaded on-demand when the history panel opens (see history button click).
    // Removed the LaunchedEffect(Unit) eager load — it fired on every swipe to this tab,
    // causing a network call + composition freeze mid-swipe.

    // Pulse for orb
    val pulseAnim = rememberInfiniteTransition(label = "chat_orb")
    val pulseScale by pulseAnim.animateFloat(
        initialValue = 1f,
        targetValue  = when (voiceState) {
            is VoiceState.Listening  -> 1.3f
            is VoiceState.Speaking   -> 1.2f
            is VoiceState.Processing -> 1.1f
            else                     -> 1.0f
        },
        animationSpec = infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "cs",
    )

    // Animated border for the input pill
    val inputBorderColor by animateColorAsState(
        targetValue = when {
            voiceState !is VoiceState.Idle -> CyanPrimary
            textInput.isNotBlank()         -> CyanPrimary.copy(alpha = 0.7f)
            else                           -> CyanGlow.copy(alpha = 0.45f)
        },
        animationSpec = tween(300),
        label = "inputBorder",
    )

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .imePadding(),
        ) {
            // ── Header ─────────────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            listOf(NavyDeep.copy(alpha = 0.98f), Color.Transparent)
                        )
                    ),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                        .padding(top = 48.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        // Skippy orb
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .scale(pulseScale)
                                .clip(CircleShape)
                                .background(
                                    Brush.radialGradient(
                                        colors = listOf(
                                            when (voiceState) {
                                                is VoiceState.Listening  -> ListeningRed
                                                is VoiceState.Processing -> CyanPrimary.copy(alpha = 0.6f)
                                                is VoiceState.Speaking   -> CyanPrimary
                                                else                     -> CyanGlow
                                            },
                                            NavyDeep,
                                        )
                                    )
                                )
                                .border(
                                    1.5.dp,
                                    when (voiceState) {
                                        is VoiceState.Listening -> ListeningRed
                                        is VoiceState.Processing, is VoiceState.Speaking -> CyanPrimary
                                        else -> CyanGlow
                                    },
                                    CircleShape
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (voiceState is VoiceState.Idle) {
                                Image(
                                    painter = painterResource(R.drawable.skippy_robot),
                                    contentDescription = "Skippy",
                                    modifier = Modifier.size(26.dp),
                                    contentScale = ContentScale.Fit,
                                )
                            } else {
                                Icon(
                                    Icons.Default.GraphicEq,
                                    "Voice active",
                                    tint = when (voiceState) {
                                        is VoiceState.Listening -> ListeningRed
                                        else -> CyanPrimary
                                    },
                                    modifier = Modifier.size(22.dp),
                                )
                            }
                        }
                        Column {
                            // Gradient header title
                            Text(
                                "Skippy",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                style = TextStyle(
                                    brush = Brush.horizontalGradient(
                                        listOf(CyanPrimary, Color(0xFF60E0FF))
                                    )
                                ),
                            )
                            // Status row: voice state + AI mode badge
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    text = when (voiceState) {
                                        is VoiceState.Listening  -> "● Listening"
                                        is VoiceState.Processing -> "◌ Thinking…"
                                        is VoiceState.Speaking   -> "◎ Speaking"
                                        else                     -> "Your personal AI"
                                    },
                                    fontSize = 11.sp,
                                    color = when (voiceState) {
                                        is VoiceState.Listening -> ListeningRed
                                        is VoiceState.Processing, is VoiceState.Speaking -> CyanPrimary
                                        else -> WhiteMuted
                                    },
                                )
                                // AI mode pill — tap to switch
                                if (!forcedAiMode.isNullOrBlank()) {
                                    val modeColor = if (forcedAiMode == "grok") Color(0xFFEAB308) else PurpleAccent
                                    val modeLabel = if (forcedAiMode == "grok") "⚡ Grok" else "🤖 Claude"
                                    Box(
                                        modifier = Modifier
                                            .border(1.dp, modeColor.copy(0.6f), RoundedCornerShape(10.dp))
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(modeColor.copy(0.12f))
                                            .clickable { showAiSwitcher = true }
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                    ) {
                                        Text(modeLabel, fontSize = 9.sp, color = modeColor, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (chatLog.isNotEmpty()) {
                            IconButton(onClick = { showClearConfirm = true }) {
                                Icon(Icons.Default.DeleteOutline, "Clear", tint = WhiteMuted.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                            }
                        }
                        // AI switch button
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(
                                    when (forcedAiMode) {
                                        "grok"   -> Color(0xFFEAB308).copy(alpha = 0.18f)
                                        "claude" -> PurpleAccent.copy(alpha = 0.18f)
                                        else     -> Color.Transparent
                                    }
                                )
                                .border(
                                    if (!forcedAiMode.isNullOrBlank()) 1.dp else 0.dp,
                                    when (forcedAiMode) {
                                        "grok"   -> Color(0xFFEAB308).copy(0.5f)
                                        "claude" -> PurpleAccent.copy(0.5f)
                                        else     -> Color.Transparent
                                    },
                                    CircleShape,
                                )
                                .clickable { showAiSwitcher = true },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = when (forcedAiMode) {
                                    "grok"   -> "⚡"
                                    "claude" -> "🤖"
                                    else     -> "🔀"
                                },
                                fontSize = 15.sp,
                            )
                        }
                        // Voice / call-mode toggle
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(
                                    if (callModeEnabled) CyanPrimary.copy(alpha = 0.18f) else Color.Transparent
                                )
                                .border(
                                    if (callModeEnabled) 1.dp else 0.dp,
                                    if (callModeEnabled) CyanPrimary.copy(0.5f) else Color.Transparent,
                                    CircleShape,
                                )
                                .clickable {
                                    callModeEnabled = !callModeEnabled
                                    if (!callModeEnabled) viewModel.stopSpeaking()
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = if (callModeEnabled) Icons.Default.PhoneInTalk else Icons.Default.Phone,
                                contentDescription = "Voice mode",
                                tint = if (callModeEnabled) CyanPrimary else WhiteMuted.copy(alpha = 0.45f),
                                modifier = Modifier.size(18.dp),
                            )
                        }
                        // History button
                        Box {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(if (showHistory) CyanPrimary.copy(0.15f) else Color.Transparent)
                                    .clickable {
                                        if (!showHistory) viewModel.loadConversations()
                                        showHistory = !showHistory
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Default.History, "History", tint = if (showHistory) CyanPrimary else WhiteMuted.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                            }
                            if (conversations.isNotEmpty()) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .align(Alignment.TopEnd)
                                        .offset(x = (-2).dp, y = 2.dp)
                                        .clip(CircleShape)
                                        .background(CyanPrimary),
                                )
                            }
                        }
                    } // end header Row
                }
            }

            // ── Content ────────────────────────────────────────────────────────
            if (chatLog.isEmpty()) {
                // Empty state with ambient glow orbs
                Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                ) {
                    // Ambient glow orbs
                    val glowAnim = rememberInfiniteTransition(label = "glow")
                    val glow1 by glowAnim.animateFloat(
                        initialValue = -25f, targetValue = 25f,
                        animationSpec = infiniteRepeatable(tween(5500, easing = FastOutSlowInEasing), RepeatMode.Reverse),
                        label = "g1",
                    )
                    val glow2 by glowAnim.animateFloat(
                        initialValue = 20f, targetValue = -20f,
                        animationSpec = infiniteRepeatable(tween(7000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
                        label = "g2",
                    )
                    Box(
                        modifier = Modifier
                            .size(260.dp)
                            .align(Alignment.TopCenter)
                            .offset(x = (-40).dp, y = (glow1 - 60).dp)
                            .blur(90.dp)
                            .background(CyanPrimary.copy(alpha = 0.10f), CircleShape)
                    )
                    Box(
                        modifier = Modifier
                            .size(200.dp)
                            .align(Alignment.BottomEnd)
                            .offset(x = 50.dp, y = ((-glow2) + 40).dp)
                            .blur(80.dp)
                            .background(PurpleAccent.copy(alpha = 0.09f), CircleShape)
                    )

                    // Main empty-state content
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .wrapContentSize(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Image(
                            painter = painterResource(R.drawable.skippy_robot),
                            contentDescription = "Skippy",
                            modifier = Modifier.size(90.dp),
                            contentScale = ContentScale.Fit,
                        )
                        Text(
                            "Ask Skippy anything",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.SemiBold,
                            style = TextStyle(
                                brush = Brush.horizontalGradient(listOf(WhiteText, WhiteMuted))
                            ),
                        )
                        Text("Voice · Text · Commands · Todos · Notes", fontSize = 13.sp, color = WhiteMuted.copy(alpha = 0.6f))

                        // Live Intelligence badge
                        Box(
                            modifier = Modifier
                                .border(1.dp, Color(0xFFEAB308).copy(alpha = 0.35f), RoundedCornerShape(20.dp))
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color(0xFFEAB308).copy(alpha = 0.08f))
                                .padding(horizontal = 12.dp, vertical = 5.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Text("⚡", fontSize = 11.sp)
                                Text(
                                    "Grok handles live news & real-time queries automatically",
                                    fontSize = 10.sp, color = Color(0xFFEAB308).copy(alpha = 0.85f),
                                )
                            }
                        }

                        Spacer(Modifier.height(4.dp))

                        // Custom pill suggestion chips (no Material SuggestionChip)
                        val suggestions = listOf(
                            "What's in the news today?",
                            "Latest tech headlines",
                            "What do you remember about me?",
                            "What's my todo list?",
                            "What happened in the world today?",
                            "Set reminder for tomorrow",
                        )
                        suggestions.chunked(2).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                row.forEach { s ->
                                    val isLive = com.skippy.launcher.api.GrokApi.isRealTimeQuery(s)
                                    Box(
                                        modifier = Modifier
                                            .border(
                                                1.dp,
                                                if (isLive) Color(0xFFEAB308).copy(0.35f) else CyanGlow,
                                                RoundedCornerShape(20.dp),
                                            )
                                            .clip(RoundedCornerShape(20.dp))
                                            .background(
                                                if (isLive) Color(0xFFEAB308).copy(0.08f) else CyanDim
                                            )
                                            .clickable { viewModel.askSkippy(s) }
                                            .padding(horizontal = 12.dp, vertical = 7.dp),
                                    ) {
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            if (isLive) Text("⚡", fontSize = 10.sp)
                                            Text(
                                                s, fontSize = 11.sp,
                                                color = if (isLive) Color(0xFFEAB308) else CyanPrimary,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
    // Message list
                LazyColumn(
                    state   = listState,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(chatLog, key = { it.id }) { entry ->
                        ChatBubble(entry = entry)
                    }
                    if (isLoading) {
                        item {
                            if (streamingText.isNotEmpty()) {
                                // Live streaming bubble
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.Start,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(28.dp)
                                            .clip(CircleShape)
                                            .background(
                                                Brush.radialGradient(
                                                    listOf(
                                                        if (isGrokStreaming) Color(0xFFEAB308).copy(0.5f) else CyanPrimary.copy(0.4f),
                                                        NavyDeep,
                                                    )
                                                )
                                            )
                                            .border(1.dp, if (isGrokStreaming) Color(0xFFEAB308).copy(0.8f) else CyanGlow, CircleShape)
                                            .align(Alignment.Bottom),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        if (isGrokStreaming) {
                                            Text("⚡", fontSize = 12.sp)
                                        } else {
                                            Image(
                                                painter = painterResource(R.drawable.skippy_robot),
                                                contentDescription = "Skippy",
                                                modifier = Modifier.size(18.dp),
                                                contentScale = ContentScale.Fit,
                                            )
                                        }
                                    }
                                    Spacer(Modifier.width(6.dp))
                                    Column {
                                        if (isGrokStreaming) {
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                modifier = Modifier.padding(bottom = 3.dp),
                                            ) {
                                                Box(Modifier.size(6.dp).clip(CircleShape).background(Color(0xFFEAB308)))
                                                Text("Grok · Live", color = Color(0xFFEAB308), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                        val streamShape = RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp)
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .border(
                                                    1.dp,
                                                    if (isGrokStreaming) Color(0xFFEAB308).copy(0.35f) else CyanPrimary.copy(0.3f),
                                                    streamShape,
                                                )
                                                .clip(streamShape)
                                                .background(
                                                    Brush.verticalGradient(
                                                        listOf(Color(0xFF0E2244).copy(0.95f), Color(0xFF081630).copy(0.90f))
                                                    )
                                                ),
                                        ) {
                                            MarkdownText(
                                                text = streamingText + "▌",
                                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                                baseColor = WhiteText, fontSize = 14.sp, lineHeight = 20.sp,
                                            )
                                        }
                                    }
                                }
                            } else {
                                // Thinking dots
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(start = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    if (isGrokStreaming) {
                                        Text("⚡", fontSize = 14.sp)
                                        Text("Grok searching…", color = Color(0xFFEAB308), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                    } else {
                                        val dotAnim = rememberInfiniteTransition(label = "dots")
                                        repeat(3) { i ->
                                            val a by dotAnim.animateFloat(
                                                initialValue = 0.2f, targetValue = 1f,
                                                animationSpec = infiniteRepeatable(tween(500, delayMillis = i * 150), RepeatMode.Reverse),
                                                label = "d$i",
                                            )
                                            Box(Modifier.size(8.dp).clip(CircleShape).background(CyanPrimary.copy(alpha = a)))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ── Glass pill input bar ───────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(listOf(Color.Transparent, NavyDeep.copy(alpha = 0.99f)))
                    )
                    .navigationBarsPadding()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.5.dp, inputBorderColor, RoundedCornerShape(28.dp))
                        .clip(RoundedCornerShape(28.dp))
                        .background(
                            Brush.verticalGradient(
                                listOf(Color(0xFF0F1E36), NavyDeep.copy(alpha = 0.97f))
                            )
                        )
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    // Mic button — only visible in voice/call mode
                    AnimatedVisibility(
                        visible = callModeEnabled,
                        enter = fadeIn() + scaleIn(),
                        exit  = fadeOut() + scaleOut(),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(42.dp)
                                .scale(if (voiceState is VoiceState.Listening) pulseScale else 1f)
                                .clip(CircleShape)
                                .background(
                                    when (voiceState) {
                                        is VoiceState.Listening -> ListeningRed.copy(alpha = 0.25f)
                                        is VoiceState.Speaking  -> CyanPrimary.copy(alpha = 0.2f)
                                        else                    -> CyanDim
                                    }
                                )
                                .border(
                                    1.5.dp,
                                    when (voiceState) {
                                        is VoiceState.Listening -> ListeningRed
                                        is VoiceState.Speaking  -> CyanPrimary
                                        else                    -> CyanGlow
                                    },
                                    CircleShape,
                                )
                                .clickable {
                                    when (voiceState) {
                                        is VoiceState.Listening -> {
                                            speechRecognizer?.stopListening()
                                            viewModel.setVoiceState(VoiceState.Idle)
                                        }
                                        is VoiceState.Speaking -> viewModel.stopSpeaking()
                                        else -> {
                                            if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                                speechRecognizer?.let { startChatListening(it, viewModel) }
                                            } else {
                                                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                            }
                                        }
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = when (voiceState) {
                                    is VoiceState.Listening, is VoiceState.Speaking -> Icons.Default.Stop
                                    else -> Icons.Default.Mic
                                },
                                contentDescription = "Voice",
                                tint = when (voiceState) {
                                    is VoiceState.Listening -> ListeningRed
                                    is VoiceState.Speaking  -> CyanPrimary
                                    else                    -> WhiteText
                                },
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }

                    // Glass text field
                    BasicTextField(
                        value = textInput,
                        onValueChange = { textInput = it },
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 6.dp, vertical = 8.dp),
                        textStyle = TextStyle(
                            color = WhiteText,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                        ),
                        cursorBrush = SolidColor(CyanPrimary),
                        maxLines = 5,
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Default,
                            capitalization = KeyboardCapitalization.Sentences,
                        ),
                        enabled = if (callModeEnabled) {
                            voiceState is VoiceState.Idle || voiceState is VoiceState.Speaking
                        } else !isLoading,
                        decorationBox = { innerTextField ->
                            Box {
                                if (textInput.isEmpty()) {
                                    Text(
                                        text = if (callModeEnabled) {
                                            when (voiceState) {
                                                is VoiceState.Listening  -> "Listening…"
                                                is VoiceState.Processing -> "Thinking…"
                                                is VoiceState.Speaking   -> "Speaking…"
                                                else                     -> "Say something or type…"
                                            }
                                        } else "Message Skippy…",
                                        color = WhiteDim, fontSize = 14.sp,
                                    )
                                }
                                innerTextField()
                            }
                        },
                    )

                    AnimatedVisibility(
                        visible = textInput.isNotBlank(),
                        enter = fadeIn() + scaleIn(),
                        exit  = fadeOut() + scaleOut(),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(
                                    Brush.radialGradient(
                                        listOf(CyanPrimary.copy(0.25f), CyanPrimary.copy(0.08f))
                                    )
                                )
                                .border(1.dp, CyanPrimary.copy(0.6f), CircleShape)
                                .clickable {
                                    if (textInput.isNotBlank()) {
                                        viewModel.askSkippy(textInput.trim(), enableVoice = callModeEnabled)
                                        textInput = ""
                                        keyboard?.hide()
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = CyanPrimary, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        } // end Column

        // ── History overlay ─────────────────────────────────────────────────
        AnimatedVisibility(
            visible  = showHistory,
            enter    = fadeIn(tween(200)) + slideInHorizontally(tween(300)) { it / 2 },
            exit     = fadeOut(tween(200)) + slideOutHorizontally(tween(300)) { it / 2 },
            modifier = Modifier.fillMaxSize(),
        ) {
            ConversationHistoryPanel(
                conversations = conversations,
                isLoading = conversationsLoading,
                onDismiss = { showHistory = false },
                onResume  = { id, title ->
                    viewModel.resumeConversation(id, title)
                    showHistory = false
                },
                onNewChat = {
                    viewModel.clearChat()
                    showHistory = false
                },
            )
        }
    } // end Box
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChatBubble(entry: ChatEntry) {
    val isUser = entry.role == "user"
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val isGrok = !isUser && entry.isGrok

    val userShape = RoundedCornerShape(topStart = 20.dp, topEnd = 5.dp, bottomStart = 20.dp, bottomEnd = 20.dp)
    val aiShape   = RoundedCornerShape(topStart = 5.dp, topEnd = 20.dp, bottomStart = 20.dp, bottomEnd = 20.dp)
    val shape     = if (isUser) userShape else aiShape

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        if (!isUser) {
            // Avatar orb
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.radialGradient(
                            listOf(
                                if (isGrok) Color(0xFFEAB308).copy(0.4f) else CyanPrimary.copy(0.4f),
                                NavyDeep,
                            )
                        )
                    )
                    .border(1.dp, if (isGrok) Color(0xFFEAB308).copy(0.7f) else CyanGlow, CircleShape)
                    .align(Alignment.Bottom),
                contentAlignment = Alignment.Center,
            ) {
                if (isGrok) {
                    Text("⚡", fontSize = 13.sp)
                } else {
                    Image(
                        painter = painterResource(R.drawable.skippy_robot),
                        contentDescription = "Skippy",
                        modifier = Modifier.size(20.dp),
                        contentScale = ContentScale.Fit,
                    )
                }
            }
            Spacer(Modifier.width(6.dp))
        }
        Column(
            // AI messages: weight(1f) fills remaining row space after avatar → full width bubble
            // User messages: no weight → wraps to content, Row Arrangement.End pushes it right
            modifier = if (!isUser) Modifier.weight(1f) else Modifier.fillMaxWidth(0.82f),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
        ) {
            // Grok label above bubble
            if (isGrok) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(bottom = 3.dp, start = 2.dp),
                ) {
                    Box(modifier = Modifier.size(5.dp).clip(CircleShape).background(Color(0xFFEAB308)))
                    Text("Grok · Live Intel", color = Color(0xFFEAB308).copy(alpha = 0.85f), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
            // Gradient bubble
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        1.dp,
                        Brush.linearGradient(
                            when {
                                isUser -> listOf(CyanPrimary.copy(alpha = 0.45f), CyanPrimary.copy(alpha = 0.20f))
                                isGrok -> listOf(Color(0xFFEAB308).copy(alpha = 0.40f), Color(0xFFEAB308).copy(alpha = 0.15f))
                                else   -> listOf(CyanPrimary.copy(0.30f), CyanGlow.copy(0.10f))
                            }
                        ),
                        shape,
                    )
                    .clip(shape)
                    .background(
                        when {
                            isUser -> Brush.linearGradient(
                                listOf(CyanPrimary.copy(0.28f), CyanPrimary.copy(0.10f))
                            )
                            isGrok -> Brush.verticalGradient(
                                listOf(Color(0xFFEAB308).copy(0.14f), Color(0xFFEAB308).copy(0.04f))
                            )
                            else   -> Brush.verticalGradient(
                                listOf(Color(0xFF0E2244).copy(0.97f), Color(0xFF081630).copy(0.93f))
                            )
                        }
                    )
                    .combinedClickable(
                        onClick = {},
                        onLongClick = {
                            clipboardManager.setText(AnnotatedString(entry.text))
                            Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                        },
                    )
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                if (isUser) {
                    Text(
                        text = entry.text,
                        color = WhiteText,
                        fontSize = 14.sp,
                        lineHeight = 21.sp,
                    )
                } else {
                    MarkdownText(
                        text = entry.text,
                        baseColor = WhiteText, fontSize = 14.sp, lineHeight = 21.sp,
                    )
                }
            }
        }
        if (isUser) Spacer(Modifier.width(4.dp))
    }
}

@Composable
private fun ConversationHistoryPanel(
    conversations: List<ConversationSummary>,
    isLoading: Boolean = false,
    onDismiss: () -> Unit,
    onResume: (String, String?) -> Unit = { _, _ -> },
    onNewChat: () -> Unit = {},
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(NavyDeep.copy(alpha = 0.99f), NavyDeep.copy(alpha = 0.97f)))
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 16.dp),
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 58.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(
                        "Chat History",
                        fontSize = 20.sp, fontWeight = FontWeight.Bold,
                        style = TextStyle(brush = Brush.horizontalGradient(listOf(WhiteText, WhiteMuted))),
                    )
                    Text(
                        if (isLoading) "Loading…" else "${conversations.size} conversations",
                        fontSize = 12.sp, color = WhiteMuted,
                    )
                }
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(SurfaceBorder)
                        .clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Close, "Close", tint = WhiteMuted, modifier = Modifier.size(18.dp))
                }
            }
            // New chat button
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp)
                    .border(1.dp, CyanPrimary.copy(0.45f), RoundedCornerShape(14.dp))
                    .clip(RoundedCornerShape(14.dp))
                    .background(CyanPrimary.copy(0.08f))
                    .clickable(onClick = onNewChat)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(Icons.Default.Add, null, tint = CyanPrimary, modifier = Modifier.size(16.dp))
                    Text("New Conversation", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = CyanPrimary)
                }
            }

            HorizontalDivider(color = SurfaceBorder)
            Spacer(Modifier.height(10.dp))

            when {
                isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            CircularProgressIndicator(color = CyanPrimary, modifier = Modifier.size(36.dp), strokeWidth = 2.dp)
                            Text("Loading conversations…", color = WhiteMuted, fontSize = 14.sp)
                        }
                    }
                }
                conversations.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text("💬", fontSize = 48.sp)
                            Text("No conversations yet", fontSize = 18.sp, color = WhiteText, fontWeight = FontWeight.Medium)
                            Text("Start a chat with Skippy!", fontSize = 14.sp, color = WhiteMuted)
                            Spacer(Modifier.height(8.dp))
                            Box(
                                modifier = Modifier
                                    .border(1.dp, CyanPrimary.copy(0.5f), RoundedCornerShape(12.dp))
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(CyanPrimary.copy(0.12f))
                                    .clickable(onClick = onDismiss)
                                    .padding(horizontal = 20.dp, vertical = 10.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.Chat, null, tint = CyanPrimary, modifier = Modifier.size(16.dp))
                                    Text("Start Chatting", color = CyanPrimary, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
                else -> {
                    androidx.compose.foundation.lazy.LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(bottom = 80.dp),
                    ) {
                        items(conversations, key = { it.id }) { conv ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .border(1.dp, SurfaceBorder, RoundedCornerShape(14.dp))
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(Color(0xFF0D1F3C), Color(0xFF080F1E))
                                        )
                                    )
                                    .clickable { onResume(conv.id, conv.title) }
                                    .padding(14.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(40.dp)
                                            .clip(CircleShape)
                                            .background(CyanDim)
                                            .border(1.dp, CyanGlow, CircleShape),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Image(
                                            painter = painterResource(R.drawable.skippy_robot),
                                            contentDescription = null,
                                            modifier = Modifier.size(24.dp),
                                            contentScale = ContentScale.Fit,
                                        )
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text  = conv.title ?: "Conversation",
                                            color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                                            maxLines = 1,
                                        )
                                        if (!conv.lastMessage.isNullOrBlank()) {
                                            Text(
                                                text  = conv.lastMessage,
                                                color = WhiteMuted, fontSize = 12.sp, maxLines = 1,
                                                modifier = Modifier.padding(top = 2.dp),
                                            )
                                        }
                                        Row(
                                            modifier = Modifier.padding(top = 4.dp),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            Text("${conv.messageCount} msgs", color = CyanPrimary.copy(0.7f), fontSize = 11.sp)
                                            if (conv.updatedAt.length >= 10) {
                                                Text(conv.updatedAt.take(10), color = WhiteMuted.copy(0.4f), fontSize = 11.sp)
                                            }
                                        }
                                    }
                                    Icon(Icons.Default.ChevronRight, "Open", tint = CyanPrimary.copy(0.4f), modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun startChatListening(recognizer: SpeechRecognizer, viewModel: LauncherViewModel) {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.US)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }
    recognizer.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(p: Bundle?) = viewModel.setVoiceState(VoiceState.Listening)
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(v: Float) {}
        override fun onBufferReceived(b: ByteArray?) {}
        override fun onEndOfSpeech() = viewModel.setVoiceState(VoiceState.Processing)
        override fun onError(e: Int) = viewModel.setVoiceState(VoiceState.Idle)
        override fun onPartialResults(r: Bundle?) {}
        override fun onEvent(t: Int, p: Bundle?) {}
        override fun onResults(results: Bundle?) {
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
            if (!text.isNullOrBlank()) {
                if (!viewModel.handleVoiceCommand(text)) {
                    // Voice-triggered in call mode → always speak back
                    viewModel.askSkippy(text, enableVoice = true)
                }
            } else {
                viewModel.setVoiceState(VoiceState.Idle)
            }
        }
    })
    recognizer.startListening(intent)
}

