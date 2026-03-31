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
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
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

@Composable
fun ChatPage(viewModel: LauncherViewModel) {
    val context       = LocalContext.current
    val chatLog       by viewModel.chatLog.collectAsState()
    val voiceState    by viewModel.voiceState.collectAsState()
    val isLoading     by viewModel.isLoading.collectAsState()
    val conversations by viewModel.conversations.collectAsState()
    val keyboard      = LocalSoftwareKeyboardController.current
    val listState     = rememberLazyListState()
    var textInput     by remember { mutableStateOf("") }
    var showHistory   by remember { mutableStateOf(false) }

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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
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
                    Text("⚡", fontSize = 18.sp)
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
                IconButton(onClick = { showHistory = !showHistory }) {
                    Icon(Icons.Default.History, "History", tint = if (showHistory) CyanPrimary else WhiteMuted.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                }
            }
        }

        // ── Content ────────────────────────────────────────────────────────
        if (showHistory && conversations.isNotEmpty()) {
            ConversationHistoryPanel(conversations = conversations, onDismiss = { showHistory = false })
        } else if (chatLog.isEmpty()) {
            // Empty state
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("⚡", fontSize = 56.sp)
                    Text("Ask Skippy anything", fontSize = 18.sp, fontWeight = FontWeight.Light, color = WhiteText)
                    Text("Voice · Text · Commands", fontSize = 13.sp, color = WhiteMuted)

                    Spacer(Modifier.height(8.dp))

                    // Suggestion chips
                    val suggestions = listOf("What do you remember about me?", "What's my todo list?", "Summarize my recent notes", "Set a reminder for tomorrow")
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

        // ── Input bar ──────────────────────────────────────────────────────
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color    = NavyDeep.copy(alpha = 0.95f),
            tonalElevation = 0.dp,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Mic button
                Box(
                    modifier = Modifier
                        .size(46.dp)
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

                // Text field
                OutlinedTextField(
                    value = textInput,
                    onValueChange = { textInput = it },
                    placeholder = {
                        Text(
                            text = when (voiceState) {
                                is VoiceState.Listening  -> "Listening…"
                                is VoiceState.Processing -> "Thinking…"
                                is VoiceState.Speaking   -> "Speaking…"
                                else                     -> "Message Skippy…"
                            },
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
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = {
                        if (textInput.isNotBlank()) {
                            viewModel.askSkippy(textInput.trim())
                            textInput = ""
                            keyboard?.hide()
                        }
                    }),
                    singleLine = true,
                    enabled = voiceState is VoiceState.Idle || voiceState is VoiceState.Speaking,
                )

                AnimatedVisibility(visible = textInput.isNotBlank()) {
                    IconButton(onClick = {
                        if (textInput.isNotBlank()) {
                            viewModel.askSkippy(textInput.trim())
                            textInput = ""
                            keyboard?.hide()
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = CyanPrimary)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(entry: ChatEntry) {
    val isUser = entry.role == "user"
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
            ) { Text("⚡", fontSize = 13.sp) }
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
            modifier = Modifier.widthIn(max = 280.dp),
        ) {
            Text(
                text = entry.text,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                color    = WhiteText,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
        }
    }
}

@Composable
private fun ConversationHistoryPanel(
    conversations: List<ConversationSummary>,
    onDismiss: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxHeight()
            .padding(horizontal = 12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("History", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = WhiteText)
            IconButton(onClick = onDismiss) {
                Icon(Icons.Default.Close, "Close", tint = WhiteMuted, modifier = Modifier.size(20.dp))
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(conversations, key = { it.id }) { conv ->
                Surface(
                    shape  = RoundedCornerShape(12.dp),
                    color  = NavyCard,
                    border = BorderStroke(1.dp, SurfaceBorder),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text  = conv.title ?: "Conversation",
                            color = WhiteText, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                        )
                        if (!conv.lastMessage.isNullOrBlank()) {
                            Text(
                                text     = conv.lastMessage,
                                color    = WhiteMuted, fontSize = 12.sp, maxLines = 2,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                        Text(
                            text     = "${conv.messageCount} messages",
                            color    = CyanPrimary.copy(alpha = 0.7f), fontSize = 11.sp,
                            modifier = Modifier.padding(top = 4.dp),
                        )
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

