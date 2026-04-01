package com.skippy.launcher.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.skippy.launcher.R
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import java.text.SimpleDateFormat
import java.util.*

/**
 * Skippy Lockscreen Page
 *
 * A full-screen beautiful overlay that appears when the app wakes.
 * Shows: time · date · greeting · weather · last AI response · quick chat input
 * Dismiss: swipe UP or tap the "↑ Unlock" hint.
 */
@Composable
fun LockScreenPage(
    viewModel: LauncherViewModel,
    onDismiss: () -> Unit,
) {
    val lastResponse by viewModel.lastResponse.collectAsState()
    val weather      by viewModel.weather.collectAsState()
    val isLoading    by viewModel.isLoading.collectAsState()

    // Live clock state
    var timeStr  by remember { mutableStateOf("") }
    var dateStr  by remember { mutableStateOf("") }
    var greetStr by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        while (true) {
            val now = Calendar.getInstance()
            timeStr = SimpleDateFormat("hh:mm", Locale.US).format(now.time)
            dateStr = SimpleDateFormat("EEEE, MMMM d", Locale.US).format(now.time)
            val hour = now.get(Calendar.HOUR_OF_DAY)
            val name = viewModel.prefs.username.replaceFirstChar { it.uppercase() }
            greetStr = when {
                hour < 5  -> "Still up, ${name.ifBlank { "hey" }}?"
                hour < 12 -> "Good morning${if (name.isNotBlank()) ", $name" else ""}."
                hour < 17 -> "Good afternoon${if (name.isNotBlank()) ", $name" else ""}."
                hour < 21 -> "Good evening${if (name.isNotBlank()) ", $name" else ""}."
                else      -> "Good night${if (name.isNotBlank()) ", $name" else ""}."
            }
            kotlinx.coroutines.delay(15_000L)
        }
    }

    // Quick-chat state
    var quickInput by remember { mutableStateOf("") }
    val keyboard = LocalSoftwareKeyboardController.current
    var quickSent by remember { mutableStateOf(false) }

    // ── Biometric unlock ──────────────────────────────────────────────────────
    val activity = LocalContext.current as? AppCompatActivity
    var activePrompt by remember { mutableStateOf<BiometricPrompt?>(null) }

    fun triggerBiometric() {
        activity ?: return
        val mgr = BiometricManager.from(activity)
        if (mgr.canAuthenticate(BIOMETRIC_STRONG) != BiometricManager.BIOMETRIC_SUCCESS) return
        activePrompt?.cancelAuthentication()
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                activePrompt = null
                onDismiss()
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                activePrompt = null
                // Any error except lockout is fine — user can tap fingerprint button to retry
            }
            override fun onAuthenticationFailed() { /* wrong finger — prompt stays open */ }
        })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Skippy")
            .setSubtitle("Touch the fingerprint sensor")
            .setNegativeButtonText("Use PIN / Pattern")
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .build()
        activePrompt = prompt
        prompt.authenticate(info)
    }

    // Auto-trigger fingerprint as soon as the lockscreen appears
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(300L)
        triggerBiometric()
    }

    // Swipe-up dismiss — track cumulative drag, fire dismiss at -180dp
    var swipeDragY by remember { mutableStateOf(0f) }
    val dismissThresholdPx = 420f
    val dismissProgress = ((-swipeDragY) / dismissThresholdPx).coerceIn(0f, 1f)

    // Orb pulse
    val orbPulse = rememberInfiniteTransition(label = "ls_orb")
    val orbScale by orbPulse.animateFloat(
        initialValue = 1f, targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(2800, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "os",
    )

    // AM/PM
    val amPm = SimpleDateFormat("a", Locale.US).format(Date())

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { _, delta ->
                        swipeDragY += delta
                        if (swipeDragY < -dismissThresholdPx) {
                            onDismiss()
                        }
                    },
                    onDragEnd = {
                        if (swipeDragY > -dismissThresholdPx * 0.6f) {
                            swipeDragY = 0f // snap back
                        }
                    }
                )
            }
    ) {
        // ── Deep space background ─────────────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colorStops = arrayOf(
                            0.0f to Color(0xFF02040C),
                            0.4f to Color(0xFF060D1F),
                            0.75f to Color(0xFF070F25),
                            1.0f to Color(0xFF030810),
                        )
                    )
                )
        )

        // Ambient glow orbs (parallax with swipe)
        val parallaxOffset = swipeDragY * 0.2f
        Box(
            modifier = Modifier
                .size(320.dp)
                .align(Alignment.TopCenter)
                .offset(y = (parallaxOffset - 80).dp)
                .blur(100.dp)
                .background(CyanPrimary.copy(alpha = 0.12f), CircleShape)
        )
        Box(
            modifier = Modifier
                .size(220.dp)
                .align(Alignment.BottomStart)
                .offset(x = (-40).dp, y = ((-parallaxOffset) + 60).dp)
                .blur(90.dp)
                .background(PurpleAccent.copy(alpha = 0.10f), CircleShape)
        )
        Box(
            modifier = Modifier
                .size(180.dp)
                .align(Alignment.BottomEnd)
                .offset(x = 30.dp, y = ((-parallaxOffset) * 0.5f + 40).dp)
                .blur(80.dp)
                .background(Color(0xFFEAB308).copy(alpha = 0.06f), CircleShape)
        )

        // ── Content ────────────────────────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxSize()
                .offset(y = (swipeDragY * 0.35f).dp)
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(32.dp))

            // ── Skippy orb ─────────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .scale(orbScale)
                    .clip(CircleShape)
                    .background(Brush.radialGradient(listOf(CyanPrimary.copy(0.25f), Color(0xFF02040C))))
                    .border(1.5.dp, CyanGlow, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.skippy_robot),
                    contentDescription = "Skippy",
                    modifier = Modifier.size(34.dp),
                    contentScale = ContentScale.Fit,
                )
            }

            Spacer(Modifier.height(24.dp))

            // ── Big clock ──────────────────────────────────────────────────────
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    text = timeStr.ifBlank { SimpleDateFormat("hh:mm", Locale.US).format(Date()) },
                    fontSize = 76.sp,
                    fontWeight = FontWeight.Thin,
                    color = WhiteText,
                    letterSpacing = (-2).sp,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = amPm,
                    fontSize = 18.sp,
                    color = WhiteMuted,
                    modifier = Modifier.padding(top = 14.dp),
                    fontWeight = FontWeight.Light,
                )
            }

            Text(
                text = dateStr.ifBlank { SimpleDateFormat("EEEE, MMMM d", Locale.US).format(Date()) },
                color = WhiteMuted.copy(alpha = 0.75f),
                fontSize = 15.sp,
                fontWeight = FontWeight.Light,
                letterSpacing = 0.5.sp,
            )

            Spacer(Modifier.height(8.dp))

            // ── Weather + greeting row ─────────────────────────────────────────
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (weather != null) {
                    Box(
                        modifier = Modifier
                            .border(1.dp, CyanGlow.copy(0.35f), RoundedCornerShape(12.dp))
                            .clip(RoundedCornerShape(12.dp))
                            .background(CyanPrimary.copy(0.07f))
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Text(weather!!.emoji, fontSize = 13.sp)
                            Text(
                                "${weather!!.temperature.toInt()}°${weather!!.unit}  ${weather!!.condition}",
                                fontSize = 12.sp, color = CyanPrimary.copy(0.85f),
                            )
                            if (weather!!.city.isNotBlank()) {
                                Text(
                                    "· ${weather!!.city}",
                                    fontSize = 11.sp, color = WhiteMuted.copy(0.5f),
                                )
                            }
                        }
                    }
                } else {
                    Text(greetStr, color = WhiteMuted.copy(0.6f), fontSize = 14.sp, fontWeight = FontWeight.Light)
                }
            }

            if (weather != null) {
                Spacer(Modifier.height(4.dp))
                Text(greetStr, color = WhiteMuted.copy(0.55f), fontSize = 13.sp, fontWeight = FontWeight.Light)
            }

            Spacer(Modifier.height(28.dp))

            // ── Last AI response card ──────────────────────────────────────────
            if (lastResponse.isNotBlank() && !quickSent) {
                val snippet = lastResponse
                    .replace(Regex("""— (Grok|Claude)[^\n]*"""), "")
                    .replace(Regex("""\*\*([^*]+)\*\*"""), "\$1")  // strip bold md
                    .trim()
                    .take(200)

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(
                            1.dp,
                            Brush.linearGradient(listOf(CyanPrimary.copy(0.30f), PurpleAccent.copy(0.15f))),
                            RoundedCornerShape(18.dp),
                        )
                        .clip(RoundedCornerShape(18.dp))
                        .background(
                            Brush.verticalGradient(
                                listOf(Color(0xFF091525).copy(0.96f), Color(0xFF050C18).copy(0.93f))
                            )
                        )
                        .padding(16.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(CyanPrimary))
                            Text("Last from Skippy", color = CyanPrimary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(
                            text = snippet,
                            color = WhiteText.copy(alpha = 0.85f),
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                            maxLines = 5,
                        )
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            // ── Quick chat input ───────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        1.5.dp,
                        if (quickInput.isNotBlank()) CyanPrimary.copy(0.7f) else CyanGlow.copy(0.35f),
                        RoundedCornerShape(28.dp),
                    )
                    .clip(RoundedCornerShape(28.dp))
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0xFF0B1928).copy(0.97f), Color(0xFF050C18).copy(0.95f))
                        )
                    )
                    .padding(horizontal = 18.dp, vertical = 12.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    BasicTextField(
                        value = quickInput,
                        onValueChange = { quickInput = it },
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(color = WhiteText, fontSize = 14.sp),
                        cursorBrush = SolidColor(CyanPrimary),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Send,
                            capitalization = KeyboardCapitalization.Sentences,
                        ),
                        decorationBox = { inner ->
                            Box {
                                if (quickInput.isEmpty()) {
                                    Text(
                                        "Ask Skippy something…",
                                        color = WhiteDim, fontSize = 14.sp,
                                    )
                                }
                                inner()
                            }
                        },
                    )
                    AnimatedVisibility(
                        visible = quickInput.isNotBlank(),
                        enter = fadeIn() + scaleIn(),
                        exit  = fadeOut() + scaleOut(),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Brush.radialGradient(listOf(CyanPrimary.copy(0.3f), CyanPrimary.copy(0.1f))))
                                .border(1.dp, CyanPrimary.copy(0.6f), CircleShape)
                                .clickable {
                                    if (quickInput.isNotBlank()) {
                                        viewModel.askSkippy(quickInput.trim())
                                        quickInput = ""
                                        quickSent = true
                                        keyboard?.hide()
                                        // Auto-dismiss to Chat after sending
                                        onDismiss()
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = CyanPrimary, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            // ── Unlock section: fingerprint + swipe hint ───────────────────────
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 28.dp),
            ) {
                // Animated arrow chain
                val arrowAnim = rememberInfiniteTransition(label = "arrow")
                val arrowAlpha by arrowAnim.animateFloat(
                    initialValue = 0.3f, targetValue = 0.9f,
                    animationSpec = infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse),
                    label = "aa",
                )
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy((-8).dp),
                ) {
                    repeat(3) { i ->
                        Icon(
                            Icons.Default.KeyboardArrowUp,
                            contentDescription = null,
                            tint = CyanPrimary.copy(alpha = arrowAlpha * (1f - i * 0.25f)),
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }

                // Fingerprint button — tapping re-triggers the biometric prompt
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(listOf(CyanPrimary.copy(0.18f), Color(0xFF02040C)))
                        )
                        .border(1.5.dp, CyanPrimary.copy(0.5f + dismissProgress * 0.5f), CircleShape)
                        .clickable { triggerBiometric() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Default.Fingerprint,
                        contentDescription = "Fingerprint",
                        tint = CyanPrimary.copy(0.85f),
                        modifier = Modifier.size(34.dp),
                    )
                }

                Text(
                    "Touch to unlock",
                    color = WhiteMuted.copy(alpha = 0.5f + dismissProgress * 0.5f),
                    fontSize = 12.sp,
                    letterSpacing = 1.sp,
                )

                // Tap-to-unlock fallback for users without biometric set up
                Box(
                    modifier = Modifier
                        .border(1.dp, WhiteMuted.copy(0.25f), RoundedCornerShape(20.dp))
                        .clip(RoundedCornerShape(20.dp))
                        .clickable { onDismiss() }
                        .padding(horizontal = 20.dp, vertical = 7.dp),
                ) {
                    Text(
                        "Tap to open",
                        color = WhiteMuted.copy(0.45f),
                        fontSize = 11.sp,
                        letterSpacing = 0.5.sp,
                    )
                }
            }
        }

        // Dismiss progress indicator (thin line at top)
        if (dismissProgress > 0.05f) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(dismissProgress)
                    .height(2.dp)
                    .align(Alignment.TopCenter)
                    .background(
                        Brush.horizontalGradient(listOf(CyanPrimary.copy(0.8f), PurpleAccent.copy(0.6f)))
                    )
            )
        }
    }
}



