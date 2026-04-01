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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.data.ChatEntry
import com.skippy.launcher.data.ConversationSummary
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.VoiceState
import java.util.Locale
import android.widget.Toast
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import com.skippy.launcher.R
import com.skippy.launcher.ui.components.MarkdownText
import androidx.compose.ui.text.input.KeyboardCapitalization

@Composable
fun ChatPage(viewModel: LauncherViewModel) {
    val context       = LocalContext.current
    val chatLog       by viewModel.chatLog.collectAsState()
    val voiceState    by viewModel.voiceState.collectAsState()
    val isLoading     by viewModel.isLoading.collectAsState()
    val streamingText by viewModel.streamingText.collectAsState()
    val conversations by viewModel.conversations.collectAsState()
    val conversationsLoading by viewModel.conversationsLoading.collectAsState()
    val keyboard      = LocalSoftwareKeyboardController.current
    val listState     = rememberLazyListState()
    var textInput     by remember { mutableStateOf("") }
    var showHistory   by remember { mutableStateOf(false) }
    var callModeEnabled by remember { mutableStateOf(false) }

    val speechRecognizer = remember { SpeechRecognizer.createSpeechRecognizer(context) }
    DisposableEffect(Unit) { onDispose { speechRecognizer.destroy() } }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startChatListening(speechRecognizer, viewModel)
    }

    LaunchedEffect(chatLog.size) {
        if (chatLog.isNotEmpty()) listState.animateScrollToItem(chatLog.size - 1)
    }

    // Scroll to bottom while streaming so user sees live text
    LaunchedEffect(streamingText.length) {
        if (streamingText.isNotEmpty() && chatLog.isNotEmpty()) {
            listState.animateScrollToItem(chatLog.size)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.loadConversations()
    }

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

    // Root Box allows history panel to overlay the chat
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .imePadding(), // pushes input bar above keyboard
        ) {
            // ── Header ─────────────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp)
                    .padding(top = 48.dp), // room for tab bar
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
                            .border(1.5.dp,
                                when (voiceState) {
                                    is VoiceState.Listening -> ListeningRed
                                    is VoiceState.Processing, is VoiceState.Speaking -> CyanPrimary
                                    else -> CyanGlow
                                }, CircleShape),
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
                        Text("Skippy", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = WhiteText)
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
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (chatLog.isNotEmpty()) {
                        IconButton(onClick = { viewModel.clearChat() }) {
                            Icon(Icons.Default.DeleteOutline, "Clear", tint = WhiteMuted.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                        }
                    }
                    // Voice / call-mode toggle — separates text chat from voice call
                    IconButton(onClick = {
                        callModeEnabled = !callModeEnabled
                        if (!callModeEnabled) viewModel.stopSpeaking()
                    }) {
                        Icon(
                            imageVector = if (callModeEnabled) Icons.Default.PhoneInTalk else Icons.Default.Phone,
                            contentDescription = "Voice mode",
                            tint = if (callModeEnabled) CyanPrimary else WhiteMuted.copy(alpha = 0.45f),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    // History button with badge if conversations exist
                    Box {
                        IconButton(onClick = {
                            if (!showHistory) viewModel.loadConversations()
                            showHistory = !showHistory
                        }) {
                            Icon(Icons.Default.History, "History", tint = if (showHistory) CyanPrimary else WhiteMuted.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                        }
                        if (conversations.isNotEmpty()) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .align(Alignment.TopEnd)
                                    .offset(x = (-4).dp, y = 4.dp)
                                    .clip(CircleShape)
                                    .background(CyanPrimary),
                            )
                        }
                    }
                }
            }

            // ── Content ────────────────────────────────────────────────────────
            if (chatLog.isEmpty()) {
                // Empty state
                Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Image(
                            painter = painterResource(R.drawable.skippy_robot),
                            contentDescription = "Skippy",
                            modifier = Modifier.size(90.dp),
                            contentScale = ContentScale.Fit,
                        )
                        Text("Ask Skippy anything", fontSize = 18.sp, fontWeight = FontWeight.Light, color = WhiteText)
                        Text("Voice · Text · Commands · Todos · Notes", fontSize = 13.sp, color = WhiteMuted)

                        Spacer(Modifier.height(8.dp))

                        // Suggestion chips
                        val suggestions = listOf(
                            "What do you remember about me?",
                            "What's my todo list?",
                            "Add todo: review my goals",
                            "Set reminder for tomorrow",
                            "Summarize my recent notes",
                            "Open camera",
                        )
                        suggestions.chunked(2).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                row.forEach { s ->
                                    SuggestionChip(
                                        onClick = { viewModel.askSkippy(s) },
                                        label = { Text(s, fontSize = 11.sp, color = CyanPrimary) },
                                        colors = SuggestionChipDefaults.suggestionChipColors(containerColor = CyanDim),
                                        border = SuggestionChipDefaults.suggestionChipBorder(
                                            enabled = true,
                                            borderColor = CyanGlow,
                                        ),
                                    )
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
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(chatLog, key = { it.id }) { entry ->
                        ChatBubble(entry = entry)
                    }
                    if (isLoading) {
                        item {
                            if (streamingText.isNotEmpty()) {
                                // Live streaming bubble — text appears word by word
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.Start,
                                ) {
                                    Box(
                                        modifier = Modifier.size(28.dp).clip(CircleShape)
                                            .background(Brush.radialGradient(colors = listOf(CyanPrimary.copy(alpha = 0.4f), NavyDeep)))
                                            .border(1.dp, CyanGlow, CircleShape)
                                            .align(Alignment.Bottom),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Image(
                                            painter = painterResource(R.drawable.skippy_robot),
                                            contentDescription = "Skippy",
                                            modifier = Modifier.size(18.dp),
                                            contentScale = ContentScale.Fit,
                                        )
                                    }
                                    Spacer(Modifier.width(6.dp))
                                    Surface(
                                        shape = RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp),
                                        color = NavyCard,
                                        border = BorderStroke(1.dp, CyanPrimary.copy(alpha = 0.3f)),
                                        modifier = Modifier.widthIn(max = 280.dp),
                                    ) {
                                        MarkdownText(
                                            text = streamingText + "▌",
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                            baseColor = WhiteText, fontSize = 14.sp, lineHeight = 20.sp,
                                        )
                                    }
                                }
                            } else {
                                // Thinking dots before first token
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(start = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
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

            // ── Input bar ──────────────────────────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color    = NavyDeep.copy(alpha = 0.97f),
                tonalElevation = 0.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Mic button — only visible in voice/call mode
                    AnimatedVisibility(
                        visible = callModeEnabled,
                        enter = fadeIn() + scaleIn(),
                        exit  = fadeOut() + scaleOut(),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .scale(if (voiceState is VoiceState.Listening) pulseScale else 1f)
                                .clip(CircleShape)
                                .background(
                                    when (voiceState) {
                                        is VoiceState.Listening -> ListeningRed.copy(alpha = 0.25f)
                                        is VoiceState.Speaking  -> CyanPrimary.copy(alpha = 0.2f)
                                        else                    -> NavyMid
                                    }
                                )
                                .border(1.5.dp,
                                    when (voiceState) {
                                        is VoiceState.Listening -> ListeningRed
                                        is VoiceState.Speaking  -> CyanPrimary
                                        else                    -> CyanGlow
                                    }, CircleShape)
                                .clickable {
                                    when (voiceState) {
                                        is VoiceState.Listening -> {
                                            speechRecognizer.stopListening()
                                            viewModel.setVoiceState(VoiceState.Idle)
                                        }
                                        is VoiceState.Speaking -> viewModel.stopSpeaking()
                                        else -> {
                                            if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                                startChatListening(speechRecognizer, viewModel)
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
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    }

                    // Text field — multiline, grows up to 5 lines
                    OutlinedTextField(
                        value = textInput,
                        onValueChange = { textInput = it },
                        placeholder = {
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
                        },
                        modifier = Modifier.weight(1f),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor      = CyanPrimary,
                            unfocusedBorderColor    = CyanGlow,
                            focusedTextColor        = WhiteText,
                            unfocusedTextColor      = WhiteText,
                            cursorColor             = CyanPrimary,
                            focusedContainerColor   = NavyDeep.copy(alpha = 0.3f),
                            unfocusedContainerColor = NavyDeep.copy(alpha = 0.3f),
                        ),
                        shape = RoundedCornerShape(14.dp),
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Default,
                            capitalization = KeyboardCapitalization.Sentences,
                        ),
                        minLines = 1,
                        maxLines = 5,
                        enabled = if (callModeEnabled) {
                            voiceState is VoiceState.Idle || voiceState is VoiceState.Speaking
                        } else !isLoading,
                    )

                    AnimatedVisibility(
                        visible = textInput.isNotBlank(),
                        enter = fadeIn() + scaleIn(),
                        exit  = fadeOut() + scaleOut(),
                    ) {
                        IconButton(onClick = {
                            if (textInput.isNotBlank()) {
                                viewModel.askSkippy(textInput.trim(), enableVoice = callModeEnabled)
                                textInput = ""
                                keyboard?.hide()
                            }
                        }) {
                            Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = CyanPrimary)
                        }
                    }
                }
            }
        } // end Column

        // ── History overlay — slides in over the chat ───────────────────────
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
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        if (!isUser) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(Brush.radialGradient(colors = listOf(CyanPrimary.copy(alpha = 0.4f), NavyDeep)))
                    .border(1.dp, CyanGlow, CircleShape)
                    .align(Alignment.Bottom),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.skippy_robot),
                    contentDescription = "Skippy",
                    modifier = Modifier.size(20.dp),
                    contentScale = ContentScale.Fit,
                )
            }
            Spacer(Modifier.width(6.dp))
        }
        Surface(
            shape = RoundedCornerShape(
                topStart    = if (isUser) 18.dp else 4.dp,
                topEnd      = if (isUser) 4.dp  else 18.dp,
                bottomStart = 18.dp,
                bottomEnd   = 18.dp,
            ),
            color  = if (isUser) CyanPrimary.copy(alpha = 0.18f) else NavyCard,
            border = BorderStroke(
                1.dp,
                if (isUser) CyanPrimary.copy(alpha = 0.3f) else SurfaceBorder,
            ),
            modifier = Modifier
                .widthIn(max = 280.dp)
                .combinedClickable(
                    onClick = {},
                    onLongClick = {
                        clipboardManager.setText(AnnotatedString(entry.text))
                        Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                    },
                ),
        ) {
            if (isUser) {
                Text(
                    text = entry.text,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    color    = WhiteText,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            } else {
                MarkdownText(
                    text = entry.text,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    baseColor = WhiteText, fontSize = 14.sp, lineHeight = 20.sp,
                )
            }
        }
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
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = NavyDeep.copy(alpha = 0.98f),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 16.dp),
        ) {
            // ── Header ────────────────────────────────────────────────────
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
                        fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WhiteText,
                    )
                    Text(
                        if (isLoading) "Loading…" else "${conversations.size} conversations",
                        fontSize = 12.sp, color = WhiteMuted,
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, "Close", tint = WhiteMuted, modifier = Modifier.size(22.dp))
                }
            }
            // New chat quick-action button
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
            ) {
                OutlinedButton(
                    onClick = onNewChat,
                    modifier = Modifier.fillMaxWidth(),
                    border = BorderStroke(1.dp, CyanPrimary.copy(alpha = 0.5f)),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = CyanPrimary),
                ) {
                    Icon(Icons.Default.Add, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("New Conversation", fontSize = 13.sp, fontWeight = FontWeight.Medium)
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
                            Text(
                                "No conversations yet",
                                fontSize = 18.sp, color = WhiteText, fontWeight = FontWeight.Medium,
                            )
                            Text(
                                "Start a chat with Skippy!",
                                fontSize = 14.sp, color = WhiteMuted,
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(
                                onClick = onDismiss,
                                colors = ButtonDefaults.buttonColors(containerColor = CyanPrimary, contentColor = NavyDeep),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Icon(Icons.AutoMirrored.Filled.Chat, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Start Chatting", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(bottom = 80.dp),
                    ) {
                        items(conversations, key = { it.id }) { conv ->
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onResume(conv.id, conv.title) },
                                shape  = RoundedCornerShape(14.dp),
                                color  = NavyCard,
                                border = BorderStroke(1.dp, SurfaceBorder),
                            ) {
                                Row(
                                    modifier = Modifier.padding(14.dp),
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
                                            color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.Medium,
                                            maxLines = 1,
                                        )
                                        if (!conv.lastMessage.isNullOrBlank()) {
                                            Text(
                                                text     = conv.lastMessage,
                                                color    = WhiteMuted, fontSize = 12.sp, maxLines = 1,
                                                modifier = Modifier.padding(top = 2.dp),
                                            )
                                        }
                                        Row(
                                            modifier = Modifier.padding(top = 4.dp),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            Text(
                                                "${conv.messageCount} messages",
                                                color = CyanPrimary.copy(alpha = 0.7f), fontSize = 11.sp,
                                            )
                                            if (conv.updatedAt.length >= 10) {
                                                Text(
                                                    conv.updatedAt.take(10),
                                                    color = WhiteMuted.copy(alpha = 0.4f), fontSize = 11.sp,
                                                )
                                            }
                                        }
                                    }
                                    Icon(
                                        Icons.Default.ChevronRight, "Open",
                                        tint = CyanPrimary.copy(alpha = 0.4f),
                                        modifier = Modifier.size(18.dp),
                                    )
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
                    viewModel.askSkippy(text)
                }
            } else {
                viewModel.setVoiceState(VoiceState.Idle)
            }
        }
    })
    recognizer.startListening(intent)
}

