package com.skippy.launcher.lockscreen

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
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
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import com.skippy.launcher.R
import com.skippy.launcher.SkippyApplication
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import java.text.SimpleDateFormat
import java.util.*

/**
 * SkippyLockScreenActivity — reliable, single-step lockscreen replacement.
 *
 * ── WHY BIOMETRICPROMPT WAS REMOVED ─────────────────────────────────────────
 *   The previous implementation used BiometricPrompt (face/fingerprint) and
 *   then called requestDismissKeyguard() afterward to dismiss the system
 *   keyguard.  On many devices this caused TWO auth dialogs:
 *     1. BiometricPrompt — face ID or fingerprint
 *     2. requestDismissKeyguard — asked for PIN because the system keyguard
 *        didn't recognise the BiometricPrompt result as satisfying its policy.
 *
 * ── THE FIX ──────────────────────────────────────────────────────────────────
 *   Use requestDismissKeyguard() ONLY, triggered ONLY by the user tapping the
 *   fingerprint button.  The system's native dismiss dialog handles face ID,
 *   fingerprint, PIN, and pattern in a single, unified flow — no double prompt.
 *   No automatic trigger on focus or screen wake.
 *
 * ── UNLOCK FLOW ──────────────────────────────────────────────────────────────
 *   1. Device wakes → this activity is shown (pre-warmed from MainActivity)
 *   2. User sees clock, weather, last AI response, chat input
 *   3. User can type a quick message and send it (goes to AI history)
 *   4. When ready to unlock → user taps the fingerprint button
 *   5. requestDismissKeyguard → ONE native dialog → success → finish()
 */
class SkippyLockScreenActivity : FragmentActivity() {

    private val viewModel: LauncherViewModel by lazy {
        (application as SkippyApplication).sharedViewModel
    }

    private lateinit var keyguardManager: KeyguardManager
    private val showFullUi = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

        setShowWhenLocked(true)
        @Suppress("DEPRECATION")
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        // NOTE: FLAG_KEEP_SCREEN_ON is intentionally NOT set — it would prevent the phone
        // from sleeping and drain the battery. FLAG_TURN_SCREEN_ON is set only in enterShowMode()
        // so the screen wakes up when the lockscreen fires, but can sleep normally otherwise.

        // Block back — cannot escape the lockscreen without auth.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { /* intentionally blocked */ }
        })

        // Cancel the trigger notification — only used to bypass background-launch limits.
        getSystemService(NotificationManager::class.java)
            .cancel(SkippyLockService.TRIGGER_NOTIF_ID)

        val mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_SHOW

        setContent {
            SkippyTheme {
                if (showFullUi.value) {
                    LockScreenContent(
                        viewModel       = viewModel,
                        onUnlockRequest = ::triggerAuth,
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(Color.Black))
                }
            }
        }

        if (mode == MODE_PREPARE) {
            // Warm-up — stay in background, no UI shown.
        } else {
            enterShowMode()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        when (intent.getStringExtra(EXTRA_MODE)) {
            MODE_SHOW    -> enterShowMode()
            MODE_PREPARE -> {
                if (!showFullUi.value) {
                    @Suppress("DEPRECATION")
                    overridePendingTransition(0, 0)
                    moveTaskToBack(true)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (!showFullUi.value) {
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
            moveTaskToBack(true)
            return
        }
        // Already unlocked while we were in the background — just close.
        if (!keyguardManager.isKeyguardLocked) finish()
    }

    private fun enterShowMode() {
        setTurnScreenOn(true)
        @Suppress("DEPRECATION")
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        showFullUi.value = true
        // ✦ Do NOT auto-trigger auth here — wait for the user to tap the button.
    }

    /**
     * The ONE and ONLY unlock trigger — called when the user taps the fingerprint button.
     *
     * Two-step flow that avoids showing ANY part of the Pixel lockscreen UI:
     *
     *   Step 1 — BiometricPrompt(BIOMETRIC_STRONG):
     *     Shows ONLY the small under-display fingerprint circle on Pixel 9a.
     *     No full-screen Pixel lockscreen, no swipe-up, no PIN screen.
     *
     *   Step 2 — requestDismissKeyguard() after successful BIOMETRIC_STRONG:
     *     Android sees that a Class-3 biometric was just used and dismisses the
     *     system keyguard SILENTLY — no second auth dialog, no Pixel lockscreen.
     *
     *   PIN fallback: user taps "Use PIN" on the biometric prompt → goes straight to
     *     requestDismissKeyguard() which shows just the system PIN entry (not the
     *     full Pixel lockscreen).
     */
    fun triggerAuth() {
        if (isFinishing || isDestroyed) return
        if (!keyguardManager.isKeyguardLocked) { unlockAndGo(); return }

        val canBiometric = BiometricManager.from(this)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)

        if (canBiometric == BiometricManager.BIOMETRIC_SUCCESS) {
            val executor = ContextCompat.getMainExecutor(this)
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    // Class-3 biometric confirmed — keyguard is now satisfied.
                    // requestDismissKeyguard sees the recent BIOMETRIC_STRONG auth and
                    // dismisses the system keyguard WITHOUT showing a second prompt.
                    keyguardManager.requestDismissKeyguard(
                        this@SkippyLockScreenActivity,
                        object : KeyguardManager.KeyguardDismissCallback() {
                            override fun onDismissSucceeded() { unlockAndGo() }
                            override fun onDismissError()     { unlockAndGo() } // best-effort
                            override fun onDismissCancelled() { /* stay on lockscreen */ }
                        }
                    )
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    // "Use PIN" button tapped, or hardware temporarily unavailable.
                    // Fall through to PIN via system keyguard dismiss.
                    if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                        errorCode == BiometricPrompt.ERROR_USER_CANCELED) {
                        usePinFallback()
                    }
                    // For other error codes (lockout, etc.) stay on lockscreen so user can retry.
                }
                override fun onAuthenticationFailed() { /* bad read — sensor tries again automatically */ }
            }

            val prompt = BiometricPrompt(this, executor, callback)
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Skippy")
                .setSubtitle("Touch the sensor to unlock")
                // BIOMETRIC_STRONG = Class 3 — shows the under-display FPS circle on Pixel 9a.
                // Must NOT include DEVICE_CREDENTIAL here, otherwise Android shows the full
                // Pixel lockscreen instead of just the fingerprint indicator.
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButtonText("Use PIN instead")
                .build()
            prompt.authenticate(info)
        } else {
            // No biometric enrolled or not available — go straight to PIN.
            usePinFallback()
        }
    }

    /** Falls back to system PIN/pattern via requestDismissKeyguard when biometrics unavailable. */
    private fun usePinFallback() {
        if (isFinishing || isDestroyed) return
        keyguardManager.requestDismissKeyguard(
            this,
            object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() { unlockAndGo() }
                override fun onDismissError()     { /* e.g. admin policy blocks dismiss */ }
                override fun onDismissCancelled() { /* user cancelled — stay on lockscreen */ }
            }
        )
    }

    private fun unlockAndGo() {
        getSharedPreferences("skippy_launcher", MODE_PRIVATE)
            .edit().putLong("last_skippy_unlock", System.currentTimeMillis()).apply()
        finish()
    }

    companion object {
        const val EXTRA_MODE   = "skippy_lock_mode"
        const val MODE_PREPARE = "prepare"
        const val MODE_SHOW    = "show"
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compose UI
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun LockScreenContent(
    viewModel:       LauncherViewModel,
    onUnlockRequest: () -> Unit,
) {
    val lastResponse by viewModel.lastResponse.collectAsState()
    val weather      by viewModel.weather.collectAsState()

    var timeStr  by remember { mutableStateOf(SimpleDateFormat("hh:mm", Locale.US).format(Date())) }
    var dateStr  by remember { mutableStateOf(SimpleDateFormat("EEEE, MMMM d", Locale.US).format(Date())) }
    var greetStr by remember { mutableStateOf("") }

    LaunchedEffect("clock_tick") {
        while (true) {
            val now  = Calendar.getInstance()
            timeStr  = SimpleDateFormat("hh:mm", Locale.US).format(now.time)
            dateStr  = SimpleDateFormat("EEEE, MMMM d", Locale.US).format(now.time)
            val hour = now.get(Calendar.HOUR_OF_DAY)
            val name = viewModel.prefs.username.replaceFirstChar { it.uppercase() }
            greetStr = when {
                hour < 5  -> "Still up${if (name.isNotBlank()) ", $name" else ""}?"
                hour < 12 -> "Good morning${if (name.isNotBlank()) ", $name" else ""}."
                hour < 17 -> "Good afternoon${if (name.isNotBlank()) ", $name" else ""}."
                hour < 21 -> "Good evening${if (name.isNotBlank()) ", $name" else ""}."
                else      -> "Good night${if (name.isNotBlank()) ", $name" else ""}."
            }
            kotlinx.coroutines.delay(15_000L)
        }
    }

    var quickInput by remember { mutableStateOf("") }
    val keyboard   = LocalSoftwareKeyboardController.current
    var swipeDragY by remember { mutableStateOf(0f) }
    val dismissThreshold = 380f
    val dismissProgress  = ((-swipeDragY) / dismissThreshold).coerceIn(0f, 1f)

    val orbPulse = rememberInfiniteTransition(label = "orb")
    val orbScale by orbPulse.animateFloat(
        1f, 1.07f,
        infiniteRepeatable(tween(2600, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "os",
    )
    val amPm = SimpleDateFormat("a", Locale.US).format(Date())

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { _, delta ->
                        swipeDragY += delta
                        if (swipeDragY < -dismissThreshold) onUnlockRequest()
                    },
                    onDragEnd = { if (swipeDragY > -dismissThreshold * 0.55f) swipeDragY = 0f }
                )
            }
    ) {
        // Deep-space background
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Color(0xFF02040C), 0.4f to Color(0xFF060D1F),
                    0.75f to Color(0xFF070F25), 1f to Color(0xFF030810),
                )
            )
        )

        // Parallax glow orbs
        val pOff = swipeDragY * 0.18f
        Box(modifier = Modifier.size(300.dp).align(Alignment.TopCenter).offset(y = (pOff - 70).dp).blur(95.dp).background(CyanPrimary.copy(0.12f), CircleShape))
        Box(modifier = Modifier.size(200.dp).align(Alignment.BottomStart).offset(x = (-40).dp, y = (-pOff + 50).dp).blur(85.dp).background(PurpleAccent.copy(0.11f), CircleShape))
        Box(modifier = Modifier.size(160.dp).align(Alignment.BottomEnd).offset(x = 30.dp, y = (-pOff * 0.4f + 40).dp).blur(75.dp).background(Color(0xFFEAB308).copy(0.06f), CircleShape))

        Column(
            modifier = Modifier
                .fillMaxSize()
                .offset(y = (swipeDragY * 0.3f).dp)
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(28.dp))

            // Skippy orb
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .scale(orbScale)
                    .clip(CircleShape)
                    .background(Brush.radialGradient(listOf(CyanPrimary.copy(0.25f), Color(0xFF02040C))))
                    .border(1.5.dp, CyanGlow, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Image(painterResource(R.drawable.skippy_robot), "Skippy", modifier = Modifier.size(32.dp), contentScale = ContentScale.Fit)
            }

            Spacer(Modifier.height(20.dp))

            // Big clock
            Row(verticalAlignment = Alignment.Top) {
                Text(timeStr, fontSize = 74.sp, fontWeight = FontWeight.Thin, color = WhiteText, letterSpacing = (-2).sp)
                Spacer(Modifier.width(4.dp))
                Text(amPm, fontSize = 17.sp, color = WhiteMuted, modifier = Modifier.padding(top = 14.dp), fontWeight = FontWeight.Light)
            }
            Text(dateStr, color = WhiteMuted.copy(0.75f), fontSize = 14.sp, fontWeight = FontWeight.Light, letterSpacing = 0.5.sp)
            Spacer(Modifier.height(6.dp))

            // Weather + greeting
            if (weather != null) {
                Box(
                    modifier = Modifier
                        .border(1.dp, CyanGlow.copy(0.3f), RoundedCornerShape(12.dp))
                        .clip(RoundedCornerShape(12.dp))
                        .background(CyanPrimary.copy(0.07f))
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(weather!!.emoji, fontSize = 12.sp)
                        Text("${weather!!.temperature.toInt()}°${weather!!.unit}  ${weather!!.condition}", fontSize = 11.sp, color = CyanPrimary.copy(0.85f))
                        if (weather!!.city.isNotBlank()) Text("· ${weather!!.city}", fontSize = 10.sp, color = WhiteMuted.copy(0.45f))
                    }
                }
                Spacer(Modifier.height(4.dp))
            }
            Text(greetStr, color = WhiteMuted.copy(0.55f), fontSize = 13.sp, fontWeight = FontWeight.Light)
            Spacer(Modifier.height(22.dp))

            // Last AI response preview
            if (lastResponse.isNotBlank()) {
                val snippet = lastResponse.replace(Regex("""— (Grok|Claude)[^\n]*"""), "")
                    .replace(Regex("""\*\*([^*]+)\*\*"""), "\$1").trim().take(200)
                Box(
                    modifier = Modifier.fillMaxWidth()
                        .border(1.dp, Brush.linearGradient(listOf(CyanPrimary.copy(0.28f), PurpleAccent.copy(0.14f))), RoundedCornerShape(16.dp))
                        .clip(RoundedCornerShape(16.dp))
                        .background(Brush.verticalGradient(listOf(Color(0xFF091525).copy(0.96f), Color(0xFF050C18).copy(0.92f))))
                        .padding(14.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(5.dp).clip(CircleShape).background(CyanPrimary))
                            Text("Last from Skippy", color = CyanPrimary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(snippet, color = WhiteText.copy(0.85f), fontSize = 12.sp, lineHeight = 19.sp, maxLines = 4)
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            // Quick chat input — tap send to queue a message, then tap fingerprint to unlock
            Box(
                modifier = Modifier.fillMaxWidth()
                    .border(1.5.dp, if (quickInput.isNotBlank()) CyanPrimary.copy(0.7f) else CyanGlow.copy(0.32f), RoundedCornerShape(28.dp))
                    .clip(RoundedCornerShape(28.dp))
                    .background(Brush.verticalGradient(listOf(Color(0xFF0B1928).copy(0.97f), Color(0xFF050C18).copy(0.95f))))
                    .padding(horizontal = 18.dp, vertical = 11.dp),
            ) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BasicTextField(
                        value = quickInput, onValueChange = { quickInput = it },
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(color = WhiteText, fontSize = 14.sp),
                        cursorBrush = SolidColor(CyanPrimary), singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send, capitalization = KeyboardCapitalization.Sentences),
                        decorationBox = { inner -> Box { if (quickInput.isEmpty()) Text("Ask Skippy…", color = WhiteDim, fontSize = 14.sp); inner() } },
                    )
                    AnimatedVisibility(quickInput.isNotBlank(), enter = fadeIn() + scaleIn(), exit = fadeOut() + scaleOut()) {
                        Box(
                            modifier = Modifier.size(34.dp).clip(CircleShape)
                                .background(Brush.radialGradient(listOf(CyanPrimary.copy(0.3f), CyanPrimary.copy(0.1f))))
                                .border(1.dp, CyanPrimary.copy(0.6f), CircleShape)
                                .clickable {
                                    if (quickInput.isNotBlank()) {
                                        // Queue message and trigger auth — after unlock, ChatPage
                                        // will auto-send the message and the pager scrolls to Chat.
                                        viewModel.queueLockscreenMessage(quickInput.trim())
                                        quickInput = ""
                                        keyboard?.hide()
                                        onUnlockRequest()
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = CyanPrimary, modifier = Modifier.size(15.dp)) }
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            // Fingerprint button — the ONLY unlock trigger
            Column(modifier = Modifier.padding(bottom = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val arrowAnim = rememberInfiniteTransition(label = "arr")
                val arrowAlpha by arrowAnim.animateFloat(0.3f, 0.9f, infiniteRepeatable(tween(850, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "aa")
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy((-8).dp)) {
                    repeat(3) { i -> Icon(Icons.Default.KeyboardArrowUp, null, tint = CyanPrimary.copy(arrowAlpha * (1f - i * 0.25f)), modifier = Modifier.size(22.dp)) }
                }
                Box(
                    modifier = Modifier.size(62.dp).clip(CircleShape)
                        .background(Brush.radialGradient(listOf(CyanPrimary.copy(0.18f), Color(0xFF02040C))))
                        .border(1.5.dp, CyanPrimary.copy(0.5f + dismissProgress * 0.5f), CircleShape)
                        .clickable { onUnlockRequest() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Fingerprint, "Fingerprint", tint = CyanPrimary.copy(0.85f), modifier = Modifier.size(32.dp)) }
                Text("Touch sensor to unlock", color = WhiteMuted.copy(0.45f + dismissProgress * 0.4f), fontSize = 12.sp, letterSpacing = 1.sp)
            }
        }

        // Swipe progress bar at top
        if (dismissProgress > 0.04f) {
            Box(
                modifier = Modifier.fillMaxWidth(dismissProgress).height(2.dp).align(Alignment.TopCenter)
                    .background(Brush.horizontalGradient(listOf(CyanPrimary.copy(0.8f), PurpleAccent.copy(0.6f)))),
            )
        }
    }
}
