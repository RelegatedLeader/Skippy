package com.skippy.launcher.ui.components

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.R
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.VoiceState
import java.util.Locale

@Composable
fun SkippyWidget(
    viewModel: LauncherViewModel,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val context        = LocalContext.current
    val voiceState     by viewModel.voiceState.collectAsState()
    val lastResponse   by viewModel.lastResponse.collectAsState()
    val searchHistory  by viewModel.searchHistory.collectAsState()
    val apps           by viewModel.apps.collectAsState()
    var textInput      by remember { mutableStateOf("") }
    val keyboard       = LocalSoftwareKeyboardController.current

    // Smart suggestions — history + matching app names
    val historySuggestions = remember(textInput, searchHistory) {
        if (textInput.length < 2) emptyList()
        else searchHistory.filter { it.contains(textInput, ignoreCase = true) && it != textInput.trim() }.take(4)
    }
    val appSuggestions = remember(textInput, apps) {
        if (textInput.length < 2) emptyList()
        else apps.filter { it.name.contains(textInput, ignoreCase = true) }.take(3)
    }
    val showSuggestions = historySuggestions.isNotEmpty() || appSuggestions.isNotEmpty()

    val speechRecognizer = remember { SpeechRecognizer.createSpeechRecognizer(context) }
    DisposableEffect(Unit) { onDispose { speechRecognizer.destroy() } }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startListening(speechRecognizer, viewModel)
    }

    // Pulse animation for mic orb
    val pulseTransition = rememberInfiniteTransition(label = "orb")
    val pulseScale by pulseTransition.animateFloat(
        initialValue = 1f,
        targetValue  = when (voiceState) {
            is VoiceState.Listening  -> 1.25f
            is VoiceState.Speaking   -> 1.18f
            is VoiceState.Processing -> 1.05f
            else                     -> 1.02f
        },
        animationSpec = infiniteRepeatable(
            animation  = tween(700, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "scale",
    )

    val orbColor = when (voiceState) {
        is VoiceState.Listening  -> ListeningRed
        is VoiceState.Processing -> CyanPrimary.copy(alpha = 0.5f)
        is VoiceState.Speaking   -> CyanPrimary
        else                     -> CyanGlow
    }

    // Animated border color when active
    val borderColor by animateColorAsState(
        targetValue = if (voiceState !is VoiceState.Idle) CyanPrimary else CyanGlow.copy(alpha = 0.5f),
        animationSpec = tween(300),
        label = "border",
    )

    fun handleSend() {
        val trimmed = textInput.trim()
        if (trimmed.isBlank()) return
        // Check if it's an "open <app>" command first
        val openMatch = Regex("""^(?:open|launch|start)\s+(.+)$""", RegexOption.IGNORE_CASE).find(trimmed)
        if (openMatch != null) {
            val appName = openMatch.groupValues[1]
            if (viewModel.launchAppByName(appName)) {
                textInput = ""
                keyboard?.hide()
                return
            }
        }
        // Check general voice commands
        if (viewModel.handleVoiceCommand(trimmed)) {
            textInput = ""
            keyboard?.hide()
            return
        }
        // Otherwise send to Skippy AI
        viewModel.askSkippy(trimmed)
        textInput = ""
        keyboard?.hide()
    }

    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Response bubble (only when there's a response and not compact or has response)
        AnimatedVisibility(
            visible = lastResponse.isNotEmpty() && !compact,
            enter = fadeIn() + expandVertically(),
            exit  = fadeOut() + shrinkVertically(),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, CyanGlow, RoundedCornerShape(16.dp))
                    .clip(RoundedCornerShape(16.dp))
                    .background(Brush.verticalGradient(listOf(CyanDim, NavyDeep.copy(alpha = 0.8f)))),
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Image(
                        painter = painterResource(R.drawable.skippy_robot),
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        contentScale = ContentScale.Fit,
                    )
                    Text(
                        text = lastResponse,
                        modifier = Modifier.weight(1f),
                        color = WhiteText,
                        fontSize = 14.sp,
                        maxLines = 5,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 20.sp,
                    )
                }
            }
        }

        // ── Main glass pill search/command bar ────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(62.dp)
                .border(1.5.dp, borderColor, RoundedCornerShape(31.dp))
                .clip(RoundedCornerShape(31.dp))
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF0F2045).copy(alpha = 0.97f), NavyDeep.copy(alpha = 0.95f))
                    )
                ),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                // ── Skippy orb ────────────────────────────────────────────────
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .scale(pulseScale)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(orbColor.copy(alpha = 0.75f), orbColor.copy(alpha = 0.10f))
                            )
                        )
                        .border(1.5.dp, orbColor, CircleShape)
                        .clickable {
                            when (voiceState) {
                                is VoiceState.Listening -> {
                                    speechRecognizer.stopListening()
                                    viewModel.setVoiceState(VoiceState.Idle)
                                }
                                is VoiceState.Speaking -> viewModel.onSpeakDone()
                                else -> {
                                    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                        == PackageManager.PERMISSION_GRANTED) {
                                        startListening(speechRecognizer, viewModel)
                                    } else {
                                        micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                    }
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (voiceState is VoiceState.Idle) {
                        Image(
                            painter = painterResource(R.drawable.skippy_robot),
                            contentDescription = "Skippy",
                            modifier = Modifier.size(28.dp),
                            contentScale = ContentScale.Fit,
                        )
                    } else {
                        Icon(
                            imageVector = when (voiceState) {
                                is VoiceState.Listening, is VoiceState.Speaking -> Icons.Default.Stop
                                else -> Icons.Default.Mic
                            },
                            contentDescription = "Voice",
                            tint = WhiteText,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }

                // ── Glass text input ──────────────────────────────────────────
                BasicTextField(
                    value = textInput,
                    onValueChange = { textInput = it },
                    modifier = Modifier
                        .weight(1f)
                        .padding(vertical = 4.dp),
                    textStyle = TextStyle(
                        color = WhiteText,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.Normal,
                    ),
                    cursorBrush = SolidColor(CyanPrimary),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { handleSend() }),
                    enabled = voiceState is VoiceState.Idle,
                    decorationBox = { innerTextField ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (textInput.isEmpty()) {
                                Text(
                                    text = when (voiceState) {
                                        is VoiceState.Listening  -> "Listening…"
                                        is VoiceState.Processing -> "Thinking…"
                                        is VoiceState.Speaking   -> "Speaking…"
                                        else -> "Ask Skippy or open an app…"
                                    },
                                    color = WhiteDim,
                                    fontSize = 14.sp,
                                )
                            }
                            innerTextField()
                        }
                    },
                )

                // ── Send button ───────────────────────────────────────────────
                AnimatedVisibility(
                    visible = textInput.isNotBlank(),
                    enter   = fadeIn() + scaleIn(),
                    exit    = fadeOut() + scaleOut(),
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(CyanPrimary.copy(alpha = 0.15f))
                            .clickable { handleSend() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = CyanPrimary, modifier = Modifier.size(18.dp))
                    }
                }
                Spacer(Modifier.width(4.dp))
            }
        }

        // Smart suggestions dropdown
        AnimatedVisibility(
            visible = showSuggestions,
            enter   = fadeIn() + expandVertically(),
            exit    = fadeOut() + shrinkVertically(),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, SurfaceBorder, RoundedCornerShape(14.dp))
                    .clip(RoundedCornerShape(14.dp))
                    .background(NavyCard),
            ) {
                Column(modifier = Modifier.padding(vertical = 4.dp)) {
                    // App suggestions
                    if (appSuggestions.isNotEmpty()) {
                        Text(
                            "APPS", color = WhiteDim.copy(alpha = 0.45f), fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
                        )
                        appSuggestions.forEach { app ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { viewModel.launchApp(app.packageName); textInput = "" }
                                    .padding(horizontal = 14.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                DrawableImage(app.icon, app.name, Modifier.size(26.dp).clip(RoundedCornerShape(7.dp)))
                                Text(app.name, color = WhiteText, fontSize = 13.sp, modifier = Modifier.weight(1f))
                                Text("Open →", color = CyanPrimary.copy(alpha = 0.7f), fontSize = 11.sp)
                            }
                        }
                    }
                    // History suggestions
                    if (historySuggestions.isNotEmpty()) {
                        if (appSuggestions.isNotEmpty()) HorizontalDivider(color = SurfaceBorder, modifier = Modifier.padding(horizontal = 14.dp))
                        Text(
                            "RECENT", color = WhiteDim.copy(alpha = 0.45f), fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
                        )
                        historySuggestions.forEach { suggestion ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { textInput = suggestion; handleSend() }
                                    .padding(horizontal = 14.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(Icons.Default.History, null, tint = CyanPrimary.copy(alpha = 0.55f), modifier = Modifier.size(16.dp))
                                Text(suggestion, color = WhiteMuted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }

        // Status label
        AnimatedVisibility(visible = voiceState !is VoiceState.Idle) {
            Text(
                text = when (voiceState) {
                    is VoiceState.Listening  -> "● Listening"
                    is VoiceState.Processing -> "◌ Thinking…"
                    is VoiceState.Speaking   -> "◎ Speaking"
                    else -> ""
                },
                fontSize = 12.sp, fontWeight = FontWeight.Medium,
                color = when (voiceState) {
                    is VoiceState.Listening -> ListeningRed
                    else                    -> CyanPrimary
                },
            )
        }
    }
}

private fun startListening(recognizer: SpeechRecognizer, viewModel: LauncherViewModel) {
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
                // Try local commands first
                if (viewModel.handleVoiceCommand(text)) {
                    viewModel.setVoiceState(VoiceState.Idle)
                    return
                }
                // Voice-triggered: speak back
                viewModel.askSkippy(text, enableVoice = true)
            } else {
                viewModel.setVoiceState(VoiceState.Idle)
            }
        }
    })
    recognizer.startListening(intent)
}
