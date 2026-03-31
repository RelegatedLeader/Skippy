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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.VoiceState
import java.util.Locale

@Composable
fun SkippyWidget(
    viewModel: LauncherViewModel,
    modifier: Modifier = Modifier,
) {
    val context        = LocalContext.current
    val voiceState     by viewModel.voiceState.collectAsState()
    val lastResponse   by viewModel.lastResponse.collectAsState()
    val isLoading      by viewModel.isLoading.collectAsState()
    var textInput      by remember { mutableStateOf("") }
    val keyboard       = LocalSoftwareKeyboardController.current

    val speechRecognizer = remember { SpeechRecognizer.createSpeechRecognizer(context) }
    DisposableEffect(Unit) { onDispose { speechRecognizer.destroy() } }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startListening(speechRecognizer, viewModel)
    }

    // Orb pulse animation
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

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Response bubble
        AnimatedVisibility(
            visible = lastResponse.isNotEmpty(),
            enter = fadeIn() + expandVertically(),
            exit  = fadeOut() + shrinkVertically(),
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, CyanGlow, RoundedCornerShape(16.dp)),
                shape = RoundedCornerShape(16.dp),
                color = CyanDim,
            ) {
                Text(
                    text = lastResponse,
                    modifier = Modifier.padding(14.dp),
                    color = WhiteText,
                    fontSize = 14.sp,
                    maxLines = 5,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // Main input card
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, CyanGlow, RoundedCornerShape(20.dp)),
            shape = RoundedCornerShape(20.dp),
            color = NavyMid.copy(alpha = 0.9f),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Mic / stop orb button
                Box(
                    modifier = Modifier
                        .size(50.dp)
                        .scale(pulseScale)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(orbColor, orbColor.copy(alpha = 0.2f))
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
                                        == PackageManager.PERMISSION_GRANTED
                                    ) {
                                        startListening(speechRecognizer, viewModel)
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
                        tint = WhiteText,
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
                                is VoiceState.Listening  -> "Listening..."
                                is VoiceState.Processing -> "Thinking..."
                                is VoiceState.Speaking   -> "Speaking..."
                                else                     -> "Ask Skippy anything..."
                            },
                            color = WhiteDim,
                            fontSize = 14.sp,
                        )
                    },
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor     = CyanPrimary,
                        unfocusedBorderColor   = CyanGlow,
                        focusedTextColor       = WhiteText,
                        unfocusedTextColor     = WhiteText,
                        cursorColor            = CyanPrimary,
                        focusedContainerColor  = NavyDeep.copy(alpha = 0.3f),
                        unfocusedContainerColor = NavyDeep.copy(alpha = 0.3f),
                    ),
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = {
                        if (textInput.isNotBlank()) {
                            viewModel.askSkippy(textInput.trim())
                            textInput = ""
                            keyboard?.hide()
                        }
                    }),
                    singleLine = true,
                    enabled = voiceState is VoiceState.Idle,
                )

                // Send button (visible when typing)
                AnimatedVisibility(
                    visible = textInput.isNotBlank(),
                    enter   = fadeIn() + scaleIn(),
                    exit    = fadeOut() + scaleOut(),
                ) {
                    IconButton(onClick = {
                        if (textInput.isNotBlank()) {
                            viewModel.askSkippy(textInput.trim())
                            textInput = ""
                            keyboard?.hide()
                        }
                    }) {
                        Icon(Icons.Default.Send, "Send", tint = CyanPrimary)
                    }
                }
            }
        }

        // Status label
        AnimatedVisibility(visible = voiceState !is VoiceState.Idle) {
            Text(
                text = when (voiceState) {
                    is VoiceState.Listening  -> "● Listening"
                    is VoiceState.Processing -> "◌ Thinking..."
                    is VoiceState.Speaking   -> "◎ Speaking"
                    else                     -> ""
                },
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
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
                // "Open <app>" command — launch without calling AI
                val openMatch = Regex("""^open\s+(.+)$""", RegexOption.IGNORE_CASE).find(text.trim())
                if (openMatch != null) {
                    val appName = openMatch.groupValues[1]
                    if (viewModel.launchAppByName(appName)) {
                        viewModel.setVoiceState(VoiceState.Idle)
                        return
                    }
                }
                viewModel.askSkippy(text)
            } else {
                viewModel.setVoiceState(VoiceState.Idle)
            }
        }
    })
    recognizer.startListening(intent)
}
