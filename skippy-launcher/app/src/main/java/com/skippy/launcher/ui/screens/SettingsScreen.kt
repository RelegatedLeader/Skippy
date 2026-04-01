package com.skippy.launcher.ui.screens

import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.R
import com.skippy.launcher.lockscreen.SkippyDeviceAdminReceiver
import com.skippy.launcher.lockscreen.SkippyLockService
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel

// ── Settings screen ────────────────────────────────────────────────────────────
// Modern grouped accordion — tap a section header to expand / collapse it.
// Sections: Profile & Account · AI & Intelligence · Voice & Speech ·
//           Home Screen · About · Privacy & Security

private const val SEC_PROFILE  = "profile"
private const val SEC_AI       = "ai"
private const val SEC_VOICE    = "voice"
private const val SEC_HOME     = "home"
private const val SEC_ABOUT    = "about"
private const val SEC_PRIVACY  = "privacy"

@Composable
fun SettingsScreen(
    viewModel: LauncherViewModel,
    onResetSetup: () -> Unit,
) {
    val prefs   = viewModel.prefs
    val context = LocalContext.current

    // ── Device Admin state ────────────────────────────────────────────────────
    val dpm        = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val adminComp  = SkippyDeviceAdminReceiver.getComponentName(context)
    var isAdmin    by remember { mutableStateOf(dpm.isAdminActive(adminComp)) }

    // Per-section state (mirrored from prefs so changes reflect immediately)
    var autoSpeak   by remember { mutableStateOf(prefs.autoSpeak) }
    var tempUnit    by remember { mutableStateOf(prefs.temperatureUnit) }
    var aiModel     by remember { mutableStateOf(prefs.aiModel) }
    var speechRate  by remember { mutableFloatStateOf(prefs.speechRate) }
    var speechPitch by remember { mutableFloatStateOf(prefs.speechPitch) }
    var debateRead  by remember { mutableStateOf(prefs.debateAutoRead) }
    var showStats   by remember { mutableStateOf(prefs.showQuickStats) }
    var showClock   by remember { mutableStateOf(prefs.showClockWidget) }
    var showWeather by remember { mutableStateOf(prefs.showWeatherWidget) }
    var showTodos   by remember { mutableStateOf(prefs.showTodosWidget) }
    var showRemind  by remember { mutableStateOf(prefs.showRemindersWidget) }
    var showMem     by remember { mutableStateOf(prefs.showMemoriesWidget) }
    var showChat    by remember { mutableStateOf(prefs.showRecentChatWidget) }
    var grokApiKey     by remember { mutableStateOf(prefs.grokApiKey) }
    var grokAutoRoute  by remember { mutableStateOf(prefs.grokAutoRoute) }
    var grokKeyVisible by remember { mutableStateOf(false) }
    var autoLearn      by remember { mutableStateOf(prefs.autoLearnMemories) }
    var widgetEnabled  by remember { mutableStateOf(prefs.lockscreenWidgetEnabled) }
    var lockScreenEnabled by remember { mutableStateOf(prefs.lockscreenPageEnabled) }

    // Launcher for device admin enrollment screen — must come AFTER lockScreenEnabled is declared
    val adminLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Re-check after user returns from device admin screen
        isAdmin = dpm.isAdminActive(adminComp)
        if (isAdmin) {
            // Automatically enable the lockscreen toggle and start the service
            lockScreenEnabled = true
            prefs.lockscreenPageEnabled = true
            runCatching {
                context.startForegroundService(Intent(context, SkippyLockService::class.java))
            }
        }
    }

    var expandedSection by remember { mutableStateOf<String?>(null) }
    var showClearChatConfirm by remember { mutableStateOf(false) }
    var showSignOutConfirm   by remember { mutableStateOf(false) }

    // ── Dialogs ─────────────────────────────────────────────────────────────────
    if (showClearChatConfirm) {
        AlertDialog(
            onDismissRequest = { showClearChatConfirm = false },
            containerColor = NavyCard, tonalElevation = 0.dp,
            title = { Text("Clear Chat History?", color = WhiteText, fontWeight = FontWeight.Bold, fontSize = 17.sp) },
            text  = { Text("This will permanently clear all your chat messages. This action cannot be undone.", color = WhiteMuted, fontSize = 14.sp, lineHeight = 20.sp) },
            confirmButton = { TextButton(onClick = { viewModel.clearChat(); showClearChatConfirm = false }) { Text("Clear", color = ErrorRed, fontWeight = FontWeight.SemiBold) } },
            dismissButton = { TextButton(onClick = { showClearChatConfirm = false }) { Text("Cancel", color = WhiteMuted) } },
        )
    }
    if (showSignOutConfirm) {
        AlertDialog(
            onDismissRequest = { showSignOutConfirm = false },
            containerColor = NavyCard, tonalElevation = 0.dp,
            title = { Text("Sign Out?", color = WhiteText, fontWeight = FontWeight.Bold, fontSize = 17.sp) },
            text  = { Text("You will be signed out and will need to sign in again to access your Skippy data.", color = WhiteMuted, fontSize = 14.sp, lineHeight = 20.sp) },
            confirmButton = { TextButton(onClick = { showSignOutConfirm = false; onResetSetup() }) { Text("Sign Out", color = ErrorRed, fontWeight = FontWeight.SemiBold) } },
            dismissButton = { TextButton(onClick = { showSignOutConfirm = false }) { Text("Cancel", color = WhiteMuted) } },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        // ── Header ──────────────────────────────────────────────────────────────
        Box(
            modifier = Modifier.fillMaxWidth().padding(top = 56.dp, bottom = 24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier.size(76.dp).clip(CircleShape)
                        .background(Brush.radialGradient(listOf(CyanPrimary.copy(0.28f), NavyDeep)))
                        .border(1.5.dp, CyanGlow, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(painterResource(R.drawable.skippy_robot), "Skippy", modifier = Modifier.size(52.dp), contentScale = ContentScale.Fit)
                }
                Text(
                    "Settings",
                    fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    style = TextStyle(brush = Brush.horizontalGradient(listOf(CyanPrimary, Color(0xFF60E0FF)))),
                )
                Text("Skippy Launcher v3.1", color = WhiteMuted.copy(alpha = 0.45f), fontSize = 12.sp)
            }
        }

        Column(modifier = Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {

            // ── 1. Profile & Account ──────────────────────────────────────────
            val profileSummary = if (prefs.username.isNotBlank()) "@${prefs.username} · Connected" else "Not signed in"
            AccordionSection(
                id = SEC_PROFILE, expanded = expandedSection, icon = Icons.Default.AccountCircle,
                title = "Profile & Account", summary = profileSummary, iconTint = CyanPrimary,
                onToggle = { expandedSection = if (expandedSection == SEC_PROFILE) null else SEC_PROFILE },
            ) {
                if (prefs.username.isNotBlank()) {
                    SettingsInfoRow("Username", prefs.username, Icons.Default.Person)
                    SettingsInfoRow("Server", prefs.skippyUrl.removePrefix("https://").take(32), Icons.Default.Storage)
                    Row { StatusBadge("✓ Connected", GreenSuccess) }
                }
                Spacer(Modifier.height(2.dp))
                PremiumButton("Refresh Session", Icons.Default.Refresh, CyanPrimary) { viewModel.reAuthenticate() }
            }

            // ── 2. AI & Intelligence (routing + Grok API merged) ─────────────
            val grokConnected = grokApiKey.isNotBlank()
            val aiSummary = buildString {
                append("Routing: $aiModel")
                append(" · Grok: ${if (grokConnected) "✓ Connected" else "⚠ Not set"}")
            }
            AccordionSection(
                id = SEC_AI, expanded = expandedSection, icon = Icons.Default.Psychology,
                title = "AI & Intelligence", summary = aiSummary, iconTint = PurpleAccent,
                onToggle = { expandedSection = if (expandedSection == SEC_AI) null else SEC_AI },
            ) {
                // Model routing picker
                SettingsLabel("Preferred routing model")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    listOf("auto" to "🔀 Auto", "grok" to "⚡ Grok", "claude" to "🤖 Claude").forEach { (m, label) ->
                        val sel = aiModel == m
                        Surface(
                            modifier = Modifier.weight(1f).clickable { aiModel = m; prefs.aiModel = m },
                            shape = RoundedCornerShape(12.dp),
                            color = if (sel) PurpleAccent.copy(alpha = 0.18f) else NavyDeep,
                            border = BorderStroke(1.dp, if (sel) PurpleAccent.copy(alpha = 0.6f) else SurfaceBorder),
                        ) {
                            Text(
                                label,
                                modifier = Modifier.padding(vertical = 11.dp).fillMaxWidth().wrapContentWidth(),
                                color = if (sel) PurpleAccent else WhiteMuted,
                                fontSize = 12.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
                Box(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                        .background(PurpleAccent.copy(0.07f))
                        .border(1.dp, PurpleAccent.copy(0.2f), RoundedCornerShape(10.dp))
                        .padding(10.dp),
                ) {
                    Text("Auto routes to Grok for live world-knowledge, Claude for tasks & reasoning", color = WhiteMuted.copy(0.65f), fontSize = 11.sp, lineHeight = 15.sp)
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = SurfaceBorder.copy(0.3f))

                // Grok status + API key
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (grokConnected) GreenSuccess.copy(0.10f) else AmberWarning.copy(0.10f),
                    border = BorderStroke(1.dp, if (grokConnected) GreenSuccess.copy(0.35f) else AmberWarning.copy(0.35f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(if (grokConnected) GreenSuccess else AmberWarning))
                        Column {
                            Text(
                                if (grokConnected) "⚡ Grok · Live Intelligence connected" else "⚡ Grok API key not set",
                                color = if (grokConnected) GreenSuccess else AmberWarning,
                                fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            )
                            Text("News · Markets · Events · Sports · World Knowledge", color = WhiteMuted.copy(0.55f), fontSize = 10.sp)
                        }
                    }
                }
                SettingsSwitchRow(
                    "Auto-route to Grok", "Send world-knowledge questions to Grok automatically",
                    grokAutoRoute, Color(0xFFEAB308),
                ) { grokAutoRoute = it; prefs.grokAutoRoute = it }
                SettingsSwitchRow(
                    "Auto-learn from chats",
                    "Extracts your interests & preferences from conversations and saves them as memories",
                    autoLearn, PurpleAccent,
                ) { autoLearn = it; prefs.autoLearnMemories = it }
                SettingsLabel("Grok API Key  (xai-…)")
                OutlinedTextField(
                    value = grokApiKey,
                    onValueChange = { grokApiKey = it; prefs.grokApiKey = it },
                    placeholder = { Text("xai-…", color = WhiteDim, fontSize = 12.sp) },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    visualTransformation = if (grokKeyVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { grokKeyVisible = !grokKeyVisible }, modifier = Modifier.size(36.dp)) {
                            Icon(if (grokKeyVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility, null, tint = WhiteMuted.copy(0.5f), modifier = Modifier.size(18.dp))
                        }
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFFEAB308).copy(0.8f), unfocusedBorderColor = SurfaceBorder,
                        focusedTextColor = WhiteText, unfocusedTextColor = WhiteText, cursorColor = Color(0xFFEAB308),
                        focusedContainerColor = NavyCard, unfocusedContainerColor = NavyCard,
                    ),
                    shape = RoundedCornerShape(10.dp), textStyle = TextStyle(fontSize = 12.sp),
                )
                Text("Get your key at console.x.ai", color = Color(0xFFEAB308).copy(0.5f), fontSize = 10.sp)
            }

            // ── 3. Voice & Speech ─────────────────────────────────────────────
            val voiceSummary = "Rate ${String.format("%.1f", speechRate)}× · Pitch ${String.format("%.1f", speechPitch)}×"
            AccordionSection(
                id = SEC_VOICE, expanded = expandedSection, icon = Icons.Default.RecordVoiceOver,
                title = "Voice & Speech", summary = voiceSummary, iconTint = ListeningRed,
                onToggle = { expandedSection = if (expandedSection == SEC_VOICE) null else SEC_VOICE },
            ) {
                SettingsSwitchRow("Auto-speak responses", "Reads answers aloud (Voice/call mode only)", autoSpeak, ListeningRed)
                    { autoSpeak = it; prefs.autoSpeak = it }
                SettingsSwitchRow("Debate auto-read", "Read AI debate arguments aloud", debateRead, GreenSuccess)
                    { debateRead = it; prefs.debateAutoRead = it }
                Spacer(Modifier.height(4.dp))
                SettingsSliderRow("Speech rate", speechRate, "${String.format("%.1f", speechRate)}×", 0.4f..2.0f)
                    { speechRate = it; prefs.speechRate = it }
                SettingsSliderRow("Voice pitch", speechPitch, "${String.format("%.1f", speechPitch)}×", 0.5f..1.5f)
                    { speechPitch = it; prefs.speechPitch = it }
            }

            // ── 4. Home Screen — widgets + display ───────────────────────────
            val activeWidgets = listOf(showClock, showWeather, showTodos, showRemind, showMem, showChat).count { it }
            val homeSummary = "$activeWidgets widgets active · Temp: ${if (tempUnit == "celsius") "°C" else "°F"}"
            AccordionSection(
                id = SEC_HOME, expanded = expandedSection, icon = Icons.Default.Dashboard,
                title = "Home Screen", summary = homeSummary, iconTint = AccentGold,
                onToggle = { expandedSection = if (expandedSection == SEC_HOME) null else SEC_HOME },
            ) {
                Text("Widgets", color = AccentGold, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                WidgetToggleGrid(listOf(
                    Triple("🕐 Clock",       showClock)   { v: Boolean -> showClock   = v; prefs.showClockWidget       = v },
                    Triple("🌤 Weather",     showWeather) { v: Boolean -> showWeather = v; prefs.showWeatherWidget     = v },
                    Triple("✅ Todos",       showTodos)   { v: Boolean -> showTodos   = v; prefs.showTodosWidget       = v },
                    Triple("🔔 Reminders",  showRemind)  { v: Boolean -> showRemind  = v; prefs.showRemindersWidget   = v },
                    Triple("🧠 Memories",   showMem)     { v: Boolean -> showMem     = v; prefs.showMemoriesWidget    = v },
                    Triple("💬 Last Reply", showChat)    { v: Boolean -> showChat    = v; prefs.showRecentChatWidget  = v },
                ))
                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = SurfaceBorder.copy(0.3f))
                Text("Display", color = Color(0xFF8B5CF6), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                SettingsSwitchRow("Quick stats bar", "Todos, reminders, memory count on home", showStats, Color(0xFF8B5CF6))
                    { showStats = it; prefs.showQuickStats = it }
                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = SurfaceBorder.copy(0.3f))
                // ── Skippy Lockscreen Page ─────────────────────────────────────
                Text("Skippy Lockscreen", color = PurpleAccent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                LockscreenSetupCard(
                    isAdmin        = isAdmin,
                    lockEnabled    = lockScreenEnabled,
                    adminLauncher  = { intent -> adminLauncher.launch(intent) },
                    adminComp      = adminComp,
                    onLockToggle   = { enabled ->
                        lockScreenEnabled = enabled
                        prefs.lockscreenPageEnabled = enabled
                        if (enabled && isAdmin) {
                            runCatching {
                                context.startForegroundService(Intent(context, SkippyLockService::class.java))
                            }
                        } else if (!enabled) {
                            context.stopService(Intent(context, SkippyLockService::class.java))
                        }
                    },
                    onDeactivate   = {
                        dpm.removeActiveAdmin(adminComp)
                        isAdmin = false
                        lockScreenEnabled = false
                        prefs.lockscreenPageEnabled = false
                        context.stopService(Intent(context, SkippyLockService::class.java))
                    },
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = SurfaceBorder.copy(0.3f))
                // Skippy Home Screen Widget
                Text("Skippy Widget", color = GreenSuccess, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Box(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(GreenSuccess.copy(0.07f))
                        .border(1.dp, GreenSuccess.copy(0.25f), RoundedCornerShape(12.dp))
                        .padding(12.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                modifier = Modifier.size(36.dp).clip(RoundedCornerShape(8.dp))
                                    .background(CyanPrimary.copy(0.15f))
                                    .border(1.dp, CyanGlow, RoundedCornerShape(8.dp)),
                                contentAlignment = Alignment.Center,
                            ) { Text("🤖", fontSize = 18.sp) }
                            Column {
                                Text("Skippy Home Widget", color = WhiteText, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text("Shows latest response + quick chat button", color = WhiteMuted.copy(0.65f), fontSize = 11.sp)
                            }
                        }
                        SettingsSwitchRow(
                            "Enable Skippy Widget",
                            "Add the Skippy widget to your home screen for quick chat access",
                            widgetEnabled, GreenSuccess,
                        ) { widgetEnabled = it; prefs.lockscreenWidgetEnabled = it }
                        if (widgetEnabled) {
                            Box(
                                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                                    .background(CyanPrimary.copy(0.07f)).padding(10.dp)
                            ) {
                                Text(
                                    "📌  Long-press your home screen → Widgets → scroll to find Skippy Widget → drag to place",
                                    color = WhiteMuted.copy(0.75f), fontSize = 11.sp, lineHeight = 16.sp,
                                )
                            }
                        }
                    }
                }
                SettingsLabel("Temperature unit")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    listOf("fahrenheit" to "°F  Fahrenheit", "celsius" to "°C  Celsius").forEach { (key, label) ->
                        val sel = tempUnit == key
                        Surface(
                            modifier = Modifier.weight(1f).clickable { tempUnit = key; prefs.temperatureUnit = key },
                            shape = RoundedCornerShape(12.dp),
                            color = if (sel) CyanPrimary.copy(0.18f) else NavyDeep,
                            border = BorderStroke(1.dp, if (sel) CyanPrimary.copy(0.6f) else SurfaceBorder),
                        ) {
                            Text(
                                label,
                                modifier = Modifier.padding(vertical = 12.dp).fillMaxWidth().wrapContentWidth(),
                                color = if (sel) CyanPrimary else WhiteMuted,
                                fontSize = 13.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }

            // ── 5. About ──────────────────────────────────────────────────────
            AccordionSection(
                id = SEC_ABOUT, expanded = expandedSection, icon = Icons.Default.Info,
                title = "About", summary = "Skippy Launcher v3.1.0 · Claude + Grok", iconTint = WhiteMuted,
                onToggle = { expandedSection = if (expandedSection == SEC_ABOUT) null else SEC_ABOUT },
            ) {
                listOf(
                    "App"         to "Skippy Launcher",
                    "Version"     to "3.1.0",
                    "Primary AI"  to "Claude (Anthropic)",
                    "Live Intel"  to "Grok-3 (xAI)",
                    "Sync"        to "Live via Skippy backend",
                    "Features"    to "Chat · Memory · Notes · Learn",
                ).forEach { (l, v) -> SettingsInfoRow(l, v) }
            }

            // ── 6. Privacy & Security (Danger Zone) ───────────────────────────
            AccordionSection(
                id = SEC_PRIVACY, expanded = expandedSection, icon = Icons.Default.Shield,
                title = "Privacy & Security", summary = "Clear data · Sign out", iconTint = ErrorRed,
                onToggle = { expandedSection = if (expandedSection == SEC_PRIVACY) null else SEC_PRIVACY },
            ) {
                Text("These actions are permanent and cannot be undone.", color = WhiteMuted.copy(0.5f), fontSize = 11.sp)
                Spacer(Modifier.height(4.dp))
                DangerButton("Clear Chat History",   Icons.Default.DeleteOutline,       AmberWarning) { showClearChatConfirm = true }
                Spacer(Modifier.height(8.dp))
                DangerButton("Sign Out of Skippy",   Icons.AutoMirrored.Filled.Logout,  ErrorRed)     { showSignOutConfirm = true }
            }

            Spacer(Modifier.height(100.dp))
        }
    }
}

// ── Lockscreen Setup Card ──────────────────────────────────────────────────────

@Composable
private fun LockscreenSetupCard(
    isAdmin:       Boolean,
    lockEnabled:   Boolean,
    adminComp:     android.content.ComponentName,
    adminLauncher: (Intent) -> Unit,
    onLockToggle:  (Boolean) -> Unit,
    onDeactivate:  () -> Unit,
) {
    var showDeactivateConfirm by remember { mutableStateOf(false) }
    val context = LocalContext.current

    if (showDeactivateConfirm) {
        AlertDialog(
            onDismissRequest = { showDeactivateConfirm = false },
            containerColor   = NavyCard, tonalElevation = 0.dp,
            title  = { Text("Remove Skippy Lockscreen?", color = WhiteText, fontWeight = FontWeight.Bold, fontSize = 17.sp) },
            text   = { Text("This will restore the stock Android lockscreen. You can re-activate it any time from settings.", color = WhiteMuted, fontSize = 14.sp, lineHeight = 20.sp) },
            confirmButton = {
                TextButton(onClick = { showDeactivateConfirm = false; onDeactivate() }) {
                    Text("Remove", color = ErrorRed, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeactivateConfirm = false }) {
                    Text("Cancel", color = WhiteMuted)
                }
            },
        )
    }

    Surface(
        shape  = RoundedCornerShape(14.dp),
        color  = if (isAdmin && lockEnabled) PurpleAccent.copy(0.10f) else NavyCard,
        border = BorderStroke(1.dp, if (isAdmin && lockEnabled) PurpleAccent.copy(0.45f) else SurfaceBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Header row
            Row(
                verticalAlignment     = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier.size(42.dp).clip(RoundedCornerShape(10.dp))
                        .background(PurpleAccent.copy(0.18f))
                        .border(1.dp, PurpleAccent.copy(0.4f), RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center,
                ) { Text(if (isAdmin && lockEnabled) "🔒" else "🔓", fontSize = 20.sp) }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Skippy Lockscreen", color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(
                        when {
                            isAdmin && lockEnabled -> "Active — replaces Google lockscreen"
                            isAdmin               -> "Admin granted — toggle on to activate"
                            else                  -> "Clock · Weather · AI snippet · Fingerprint"
                        },
                        color    = if (isAdmin && lockEnabled) PurpleAccent else WhiteMuted.copy(0.65f),
                        fontSize = 11.sp, lineHeight = 15.sp,
                    )
                }
                if (isAdmin && lockEnabled) {
                    Box(
                        modifier = Modifier.clip(RoundedCornerShape(20.dp))
                            .background(PurpleAccent.copy(0.18f))
                            .border(1.dp, PurpleAccent.copy(0.4f), RoundedCornerShape(20.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) { Text("LIVE", color = PurpleAccent, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold) }
                }
            }

            // Step 1 — Device Admin
            if (!isAdmin) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(
                            modifier = Modifier.size(22.dp).clip(CircleShape)
                                .background(AmberWarning.copy(0.2f))
                                .border(1.dp, AmberWarning.copy(0.5f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Text("1", color = AmberWarning, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        Text("Grant Device Admin permission", color = WhiteText, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Text(
                        "Required once so Skippy can disable the stock lockscreen and show its own. " +
                        "You can revoke this at any time.",
                        color = WhiteMuted.copy(0.6f), fontSize = 11.sp, lineHeight = 15.sp,
                    )
                    // Activate button
                    Box(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .background(Brush.linearGradient(listOf(PurpleAccent.copy(0.28f), PurpleAccent.copy(0.14f))))
                            .border(1.dp, PurpleAccent.copy(0.6f), RoundedCornerShape(12.dp))
                            .clickable {
                                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComp)
                                    putExtra(
                                        DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                                        "Skippy needs Device Admin rights to disable the stock Android lockscreen and replace it with a personalized AI-powered experience."
                                    )
                                }
                                adminLauncher(intent)
                            }
                            .padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.AdminPanelSettings, null, tint = PurpleAccent, modifier = Modifier.size(18.dp))
                            Text("Activate as System Lockscreen", color = PurpleAccent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }
                }
            } else {
                // Admin is active — show toggle and fingerprint info
                SettingsSwitchRow(
                    "Enable Skippy Lockscreen",
                    "Replaces the Google/Pixel lockscreen entirely — fingerprint to unlock",
                    lockEnabled, PurpleAccent,
                    onChange = onLockToggle,
                )

                // Android 14+ full-screen intent permission — needed for guaranteed launch
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    val nm = context.getSystemService(NotificationManager::class.java)
                    val hasFullScreenPerm = nm.canUseFullScreenIntent()
                    if (!hasFullScreenPerm) {
                        Surface(
                            shape  = RoundedCornerShape(10.dp),
                            color  = Color.Transparent,
                            border = BorderStroke(1.dp, AmberWarning.copy(0.45f)),
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(10.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(Icons.Default.Warning, null, tint = AmberWarning, modifier = Modifier.size(15.dp))
                                    Text("Full-screen permission needed", color = AmberWarning, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                                Text(
                                    "Android 14+ requires \"Use full-screen intents\" permission for the lockscreen to " +
                                    "reliably appear. Tap below to grant it (takes 5 seconds).",
                                    color = WhiteMuted.copy(0.7f), fontSize = 11.sp, lineHeight = 15.sp,
                                )
                                Box(
                                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                        .background(AmberWarning.copy(0.15f))
                                        .border(1.dp, AmberWarning.copy(0.5f), RoundedCornerShape(10.dp))
                                        .clickable {
                                            context.startActivity(
                                                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                                    Uri.parse("package:${context.packageName}"))
                                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                            )
                                        }
                                        .padding(vertical = 10.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("Grant Full-Screen Intent Permission →", color = AmberWarning, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }

                if (lockEnabled) {
                    Surface(
                        shape  = RoundedCornerShape(10.dp),
                        color  = Color.Transparent,
                        border = BorderStroke(1.dp, GreenSuccess.copy(0.3f)),
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            // Status header
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.padding(bottom = 4.dp),
                            ) {
                                Box(Modifier.size(6.dp).clip(CircleShape).background(GreenSuccess))
                                Text("Skippy lockscreen is ACTIVE", color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                            listOf(
                                "🔒" to "Replaces the Google lockscreen — you'll see Skippy when you lock",
                                "👆" to "Fingerprint prompt appears automatically — touch sensor to unlock",
                                "🔑" to "Tap \"Use PIN / Pattern\" on the fingerprint sheet for PIN fallback",
                                "💬" to "Quick Skippy chat available right from the lockscreen",
                                "⬆️" to "Tap the fingerprint icon or swipe up to re-trigger the prompt",
                            ).forEach { (emoji, text) ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(emoji, fontSize = 13.sp)
                                    Text(text, color = WhiteMuted.copy(0.75f), fontSize = 11.sp, lineHeight = 15.sp)
                                }
                            }
                            // Quick-link to Android biometric settings
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 4.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(CyanPrimary.copy(0.07f))
                                    .border(1.dp, CyanPrimary.copy(0.25f), RoundedCornerShape(8.dp))
                                    .clickable {
                                        context.startActivity(
                                            Intent(Settings.ACTION_SECURITY_SETTINGS)
                                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                        )
                                    }
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(Icons.Default.Fingerprint, null, tint = CyanPrimary, modifier = Modifier.size(14.dp))
                                    Text("Manage fingerprints in Android Settings →", color = CyanPrimary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                                }
                            }
                        }
                    }
                }
                // Deactivate link
                TextButton(
                    onClick  = { showDeactivateConfirm = true },
                    modifier = Modifier.align(Alignment.End),
                ) {
                    Icon(Icons.Default.RemoveCircleOutline, null, tint = ErrorRed.copy(0.7f), modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Remove device admin & restore stock lockscreen", color = ErrorRed.copy(0.7f), fontSize = 11.sp)
                }
            }
        }
    }
}

// ── Accordion Section ──────────────────────────────────────────────────────────

@Composable
private fun AccordionSection(
    id: String,
    expanded: String?,
    icon: ImageVector,
    title: String,
    summary: String,
    iconTint: Color,
    onToggle: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val isExpanded = expanded == id
    Surface(
        shape  = RoundedCornerShape(18.dp),
        color  = NavyCard,
        border = BorderStroke(1.dp, if (isExpanded) iconTint.copy(alpha = 0.45f) else SurfaceBorder),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            // ── Always-visible header row ───────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle)
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(
                    modifier = Modifier.size(40.dp).clip(RoundedCornerShape(11.dp))
                        .background(iconTint.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(icon, null, tint = iconTint, modifier = Modifier.size(20.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, color = WhiteText, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    Text(summary, color = WhiteMuted.copy(0.5f), fontSize = 11.sp, maxLines = 1)
                }
                Icon(
                    if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    null, tint = WhiteMuted.copy(0.35f), modifier = Modifier.size(20.dp),
                )
            }
            // ── Collapsible content ────────────────────────────────────────
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(tween(220)) + fadeIn(tween(180)),
                exit  = shrinkVertically(tween(200)) + fadeOut(tween(160)),
            ) {
                Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                    HorizontalDivider(color = SurfaceBorder.copy(alpha = 0.4f), modifier = Modifier.padding(bottom = 12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        content()
                    }
                }
            }
        }
    }
}

// ── Shared components ──────────────────────────────────────────────────────────

@Composable
private fun WidgetToggleGrid(items: List<Triple<String, Boolean, (Boolean) -> Unit>>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { (label, checked, onChange) ->
                    Surface(
                        modifier = Modifier.weight(1f).clickable { onChange(!checked) },
                        shape    = RoundedCornerShape(12.dp),
                        color    = if (checked) CyanPrimary.copy(0.12f) else NavyDeep,
                        border   = BorderStroke(1.dp, if (checked) CyanPrimary.copy(0.4f) else SurfaceBorder),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(label, color = if (checked) CyanPrimary else WhiteMuted, fontSize = 12.sp, fontWeight = if (checked) FontWeight.SemiBold else FontWeight.Normal)
                            Box(
                                modifier = Modifier.size(16.dp).clip(CircleShape)
                                    .background(if (checked) CyanPrimary else SurfaceBorder),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (checked) Icon(Icons.Default.Check, null, tint = NavyDeep, modifier = Modifier.size(10.dp))
                            }
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PremiumButton(text: String, icon: ImageVector, color: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(listOf(color.copy(0.22f), color.copy(0.10f))))
            .border(1.dp, color.copy(0.5f), RoundedCornerShape(12.dp)).clickable(onClick = onClick)
            .padding(vertical = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, tint = color, modifier = Modifier.size(16.dp))
            Text(text, color = color, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        }
    }
}

@Composable
private fun DangerButton(text: String, icon: ImageVector, color: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .border(1.dp, color.copy(0.4f), RoundedCornerShape(12.dp)).clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, tint = color, modifier = Modifier.size(16.dp))
            Text(text, color = color, fontWeight = FontWeight.Medium, fontSize = 14.sp)
        }
    }
}

@Composable
private fun StatusBadge(text: String, color: Color) {
    Box(
        modifier = Modifier.clip(RoundedCornerShape(20.dp)).background(color.copy(0.12f))
            .border(1.dp, color.copy(0.35f), RoundedCornerShape(20.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SettingsLabel(text: String) {
    Text(text, color = WhiteMuted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 2.dp))
}

@Composable
private fun SettingsSwitchRow(label: String, sublabel: String, checked: Boolean, accentColor: Color = CyanPrimary, onChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
            Text(label, color = WhiteText, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(sublabel, color = WhiteMuted.copy(0.55f), fontSize = 11.sp, lineHeight = 14.sp)
        }
        Switch(
            checked = checked, onCheckedChange = onChange,
            colors  = SwitchDefaults.colors(checkedThumbColor = NavyDeep, checkedTrackColor = accentColor, uncheckedThumbColor = WhiteMuted, uncheckedTrackColor = NavyMid),
        )
    }
}

@Composable
private fun SettingsSliderRow(label: String, value: Float, valueLabel: String, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = WhiteMuted, fontSize = 12.sp)
            Text(valueLabel, color = CyanPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Slider(
            value = value, onValueChange = onChange, valueRange = range,
            colors = SliderDefaults.colors(thumbColor = CyanPrimary, activeTrackColor = CyanPrimary, inactiveTrackColor = CyanGlow),
        )
    }
}

@Composable
private fun SettingsInfoRow(label: String, value: String, icon: ImageVector? = null) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (icon != null) Icon(icon, null, tint = WhiteMuted.copy(0.5f), modifier = Modifier.size(14.dp))
            Text(label, color = WhiteMuted, fontSize = 13.sp)
        }
        Text(value, color = WhiteText, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}
