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
import androidx.fragment.app.FragmentActivity
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
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
import androidx.core.content.ContextCompat
import com.skippy.launcher.R
import com.skippy.launcher.SkippyApplication
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import java.text.SimpleDateFormat
import java.util.*

/**
 * SkippyLockScreenActivity — reliable lockscreen replacement
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THE OLD APPROACH FAILED:
 *   LaunchedEffect("auth_trigger") fired BiometricPrompt REGARDLESS of whether
 *   Skippy actually had window focus. When the Google keyguard was on top,
 *   BiometricPrompt appeared ON TOP OF Google's lockscreen — giving two
 *   simultaneous fingerprint UIs. The sensor responded to Google's (which has
 *   priority), so Skippy's prompt got ERROR_CANCELED forever.
 *
 * THE FIX — three pillars:
 *
 *  1. PRE-WARM from MainActivity.onResume()
 *     The launcher calls startActivity(PREPARE) every time the user is on the
 *     home screen. Since this activity is singleInstance, it's always in the
 *     window stack BEFORE the user presses the power button.
 *     → Eliminates the cold-launch race against the system keyguard entirely.
 *
 *  2. moveTaskToBack(true) in PREPARE mode
 *     On first creation, immediately pushes to background so the user never
 *     sees the black warmup screen. Zero visual flash.
 *
 *  3. BiometricPrompt ONLY from onWindowFocusChanged(hasFocus=true)
 *     onWindowFocusChanged fires ONLY when THIS activity actually has window
 *     focus — meaning WE are on top and Google's keyguard is behind us.
 *     If Google is on top, we never get focus → BiometricPrompt never shows
 *     → requestDismissKeyguard() handles auth via the system's own sensor.
 * ──────────────────────────────────────────────────────────────────────────
 */
class SkippyLockScreenActivity : FragmentActivity() {

    // Shared Application-level ViewModel — avoids a second copy of all app icons in
    // memory (would otherwise cause OOM — confirmed by the java_pid*.hprof in the project).
    private val viewModel: LauncherViewModel by lazy {
        (application as SkippyApplication).sharedViewModel
    }

    private lateinit var keyguardManager: KeyguardManager

    private val showFullUi = mutableStateOf(false)
    private var activePrompt: BiometricPrompt? = null

    // Retry counter for requestDismissKeyguard's onDismissCancelled — prevents the
    // unlimited retry loop that could spam authentication requests indefinitely.
    private var dismissRetryCount = 0
    private val maxDismissRetries = 3

    // Debounce for onWindowFocusChanged — prevents rapid re-triggering of BiometricPrompt
    // when notifications or other windows briefly steal and return focus.
    private var lastFocusAuthMs = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

        setShowWhenLocked(true)
        @Suppress("DEPRECATION")
        window.addFlags(
            android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        // Block back — cannot escape the lockscreen.
        // Using the current OnBackPressedDispatcher API instead of the deprecated
        // onBackPressed() override.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { /* intentionally blocked */ }
        })

        // Cancel the trigger notification instantly — it was only used to bypass
        // Android 12+ background-launch restrictions. We don't want it in the shade.
        getSystemService(NotificationManager::class.java)
            .cancel(SkippyLockService.TRIGGER_NOTIF_ID)

        val mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_SHOW

        setContent {
            SkippyTheme {
                if (showFullUi.value) {
                    LockScreenContent(
                        viewModel       = viewModel,
                        onUnlockRequest = ::triggerAuth,
                        onDismiss       = ::finish,
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(Color.Black))
                }
            }
        }

        if (mode == MODE_PREPARE) {
            // Stay in background — onResume() will call moveTaskToBack() once safe to do so.
            // No visual content is shown because showFullUi stays false (black box).
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
                // Called from MainActivity.onResume() when the activity already exists.
                // The singleInstance task was brought to front — push it back quietly.
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
            // PREPARE mode: we're only here to warm up. Push the task to background
            // immediately. onResume is the earliest safe place to call moveTaskToBack().
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
            moveTaskToBack(true)
            return
        }
        // SHOW mode: auto-dismiss if device is already unlocked
        if (!keyguardManager.isKeyguardLocked) finish()
    }

    /**
     * PRIMARY fingerprint trigger.
     * ONLY called when THIS window actually has focus — meaning we are the top visible
     * window and the system keyguard is behind us. Safe to show BiometricPrompt here.
     * If Google's keyguard is on top, we never receive focus → this never fires →
     * requestDismissKeyguard() (called in enterShowMode) handles auth instead.
     *
     * Debounced to 1.5 s so rapid focus-change events (notifications, etc.) don't
     * spam-cancel and restart the BiometricPrompt in quick succession.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && showFullUi.value && keyguardManager.isKeyguardLocked) {
            val now = System.currentTimeMillis()
            if (now - lastFocusAuthMs > 1_500L) {
                lastFocusAuthMs = now
                triggerAuth()
            }
        }
    }

    override fun onDestroy() {
        runCatching { activePrompt?.cancelAuthentication() }
        activePrompt = null
        super.onDestroy()
    }

    private fun enterShowMode() {
        dismissRetryCount = 0       // reset retry counter every time we enter show mode
        lastFocusAuthMs   = 0L      // allow immediate focus-triggered auth on next focus event
        setTurnScreenOn(true)
        @Suppress("DEPRECATION")
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        showFullUi.value = true

        // Arm the system-dismiss callback immediately.
        // Scenario A (we won the race): onWindowFocusChanged fires → BiometricPrompt handles it.
        //   requestDismissKeyguard silently completes after BiometricPrompt succeeds.
        // Scenario B (keyguard is on top): we never get focus → BiometricPrompt never shows.
        //   System keyguard handles the fingerprint → dismisses → onDismissSucceeded → finish().
        requestSystemDismiss()
    }

    /**
     * Called when focus is confirmed (onWindowFocusChanged) or from the fingerprint button.
     * Always cancels any stale prompt before starting fresh.
     */
    fun triggerAuth() {
        if (isFinishing || isDestroyed) return
        if (!keyguardManager.isKeyguardLocked) { unlockAndGo(); return }

        activePrompt?.cancelAuthentication()
        activePrompt = null

        val canBiometric = BiometricManager.from(this)
            .canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

        if (canBiometric) showBiometricPrompt() else requestSystemDismiss()
    }

    private fun showBiometricPrompt() {
        if (isFinishing || isDestroyed) return

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                activePrompt = null
                requestSystemDismiss()   // tells system keyguard to step aside → finish via callback
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                activePrompt = null
                when (errorCode) {
                    // "Use PIN" tapped, user swiped away, or too many failures
                    BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                    BiometricPrompt.ERROR_USER_CANCELED,
                    BiometricPrompt.ERROR_LOCKOUT,
                    BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> requestSystemDismiss()

                    // System cancelled (e.g. keyguard briefly reclaiming the sensor).
                    // Fall back to system dismiss — it still has the sensor.
                    BiometricPrompt.ERROR_CANCELED -> requestSystemDismiss()

                    // HW unavailable / timeout: stay on screen; button triggers manual retry.
                }
            }

            override fun onAuthenticationFailed() { /* wrong finger — prompt stays open */ }
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Skippy")
            .setSubtitle("Use your fingerprint to unlock")
            .setNegativeButtonText("Use PIN / Pattern")
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .build()

        activePrompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), callback)
        activePrompt!!.authenticate(promptInfo)
    }

    private fun requestSystemDismiss() {
        if (isFinishing || isDestroyed) return
        if (!keyguardManager.isKeyguardLocked) { unlockAndGo(); return }

        keyguardManager.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
            override fun onDismissSucceeded() = unlockAndGo()
            override fun onDismissError()     = unlockAndGo()
            override fun onDismissCancelled() {
                // Guard against infinite retry loop — only retry up to maxDismissRetries times.
                if (!isFinishing && !isDestroyed && dismissRetryCount < maxDismissRetries) {
                    dismissRetryCount++
                    window.decorView.postDelayed(::triggerAuth, 400L)
                }
            }
        })
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
// Compose UI  (NO LaunchedEffect auth trigger here — only onWindowFocusChanged)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun LockScreenContent(
    viewModel:       LauncherViewModel,
    onUnlockRequest: () -> Unit,
    onDismiss:       () -> Unit,
) {
    val lastResponse by viewModel.lastResponse.collectAsState()
    val weather      by viewModel.weather.collectAsState()

    var timeStr  by remember { mutableStateOf(SimpleDateFormat("hh:mm", Locale.US).format(Date())) }
    var dateStr  by remember { mutableStateOf(SimpleDateFormat("EEEE, MMMM d", Locale.US).format(Date())) }
    var greetStr by remember { mutableStateOf("") }

    // Clock tick — this is the ONLY LaunchedEffect here.
    // BiometricPrompt is triggered by onWindowFocusChanged in the Activity, NOT here.
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

            // Quick chat input
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
                                .clickable { if (quickInput.isNotBlank()) { viewModel.askSkippy(quickInput.trim()); quickInput = ""; keyboard?.hide(); onDismiss() } },
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = CyanPrimary, modifier = Modifier.size(15.dp)) }
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            // Fingerprint / swipe-up hint
            Column(modifier = Modifier.padding(bottom = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val arrowAnim = rememberInfiniteTransition(label = "arr")
                val arrowAlpha by arrowAnim.animateFloat(0.3f, 0.9f, infiniteRepeatable(tween(850, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "aa")
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy((-8).dp)) {
                    repeat(3) { i -> Icon(Icons.Default.KeyboardArrowUp, null, tint = CyanPrimary.copy(arrowAlpha * (1f - i * 0.25f)), modifier = Modifier.size(22.dp)) }
                }
                // Fingerprint button — tapping re-arms the system dismiss callback
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
