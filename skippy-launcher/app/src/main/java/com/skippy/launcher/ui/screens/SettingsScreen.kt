package com.skippy.launcher.ui.screens

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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.R
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel

@Composable
fun SettingsScreen(
    viewModel: LauncherViewModel,
    onResetSetup: () -> Unit,
) {
    val prefs = viewModel.prefs
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
    var saved       by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState()),
    ) {
        // ── Robot hero banner ─────────────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 60.dp, bottom = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(70.dp)
                    .clip(CircleShape)
                    .background(CyanDim)
                    .border(1.5.dp, CyanGlow, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.skippy_robot),
                    contentDescription = "Skippy",
                    modifier = Modifier.size(50.dp),
                    contentScale = ContentScale.Fit,
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Settings", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WhiteText)
            if (saved) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Default.Check, null, tint = GreenSuccess, modifier = Modifier.size(18.dp))
                    Text("Saved", color = GreenSuccess, fontSize = 13.sp)
                }
            }
        }

        Column(modifier = Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

            // ── Account ─────────────────────────────────────────────────────
            SettingsSection(title = "Account", icon = "👤") {
                if (prefs.username.isNotBlank()) {
                    InfoRow("Username", prefs.username)
                    InfoRow("Server", prefs.skippyUrl.removePrefix("https://").take(32))
                    InfoRow("Status", "✅ Connected")
                }
                Spacer(Modifier.height(4.dp))
                Button(
                    onClick = { viewModel.reAuthenticate(); saved = true },
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = CyanPrimary, contentColor = NavyDeep),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Default.Refresh, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Refresh Session", fontWeight = FontWeight.Bold)
                }
            }

            // ── AI Model ────────────────────────────────────────────────────
            SettingsSection(title = "AI Model", icon = "🤖") {
                SettingsLabel("Preferred model")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    listOf("auto", "grok", "claude").forEach { m ->
                        val sel = aiModel == m
                        Surface(
                            modifier = Modifier.weight(1f).clickable { aiModel = m; prefs.aiModel = m },
                            shape = RoundedCornerShape(10.dp),
                            color = if (sel) CyanPrimary.copy(alpha = 0.18f) else NavyCard,
                            border = BorderStroke(1.dp, if (sel) CyanPrimary.copy(alpha = 0.6f) else SurfaceBorder),
                        ) {
                            Text(
                                m.replaceFirstChar { it.uppercase() },
                                modifier = Modifier.padding(vertical = 10.dp).fillMaxWidth().wrapContentWidth(),
                                color = if (sel) CyanPrimary else WhiteMuted,
                                fontSize = 13.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }

            // ── Voice ────────────────────────────────────────────────────────
            SettingsSection(title = "Voice", icon = "🎙") {
                SettingsSwitchRow("Auto-speak responses", "Skippy reads its answers aloud", autoSpeak)
                    { autoSpeak = it; prefs.autoSpeak = it }
                Spacer(Modifier.height(4.dp))
                SettingsSwitchRow("Debate auto-read", "Read AI debate arguments aloud", debateRead)
                    { debateRead = it; prefs.debateAutoRead = it }
                Spacer(Modifier.height(8.dp))
                SettingsLabel("Speech rate: ${String.format("%.2f", speechRate)}x")
                Slider(
                    value = speechRate, onValueChange = { speechRate = it; prefs.speechRate = it },
                    valueRange = 0.4f..2.0f,
                    colors = SliderDefaults.colors(thumbColor = CyanPrimary, activeTrackColor = CyanPrimary, inactiveTrackColor = CyanGlow),
                )
                SettingsLabel("Voice pitch: ${String.format("%.2f", speechPitch)}x")
                Slider(
                    value = speechPitch, onValueChange = { speechPitch = it; prefs.speechPitch = it },
                    valueRange = 0.5f..1.5f,
                    colors = SliderDefaults.colors(thumbColor = CyanPrimary, activeTrackColor = CyanPrimary, inactiveTrackColor = CyanGlow),
                )
            }

            // ── Home Widgets ─────────────────────────────────────────────────
            SettingsSection(title = "Home Widgets", icon = "🧩") {
                SettingsLabel("Toggle which widgets appear on your home screen")
                Spacer(Modifier.height(4.dp))
                SettingsSwitchRow("Clock & Date", "Large clock on home", showClock)
                    { showClock = it; prefs.showClockWidget = it }
                SettingsSwitchRow("Weather", "Current weather conditions", showWeather)
                    { showWeather = it; prefs.showWeatherWidget = it }
                SettingsSwitchRow("Todos", "Pending todo items", showTodos)
                    { showTodos = it; prefs.showTodosWidget = it }
                SettingsSwitchRow("Reminders", "Upcoming reminders", showRemind)
                    { showRemind = it; prefs.showRemindersWidget = it }
                SettingsSwitchRow("Memory count", "How many memories Skippy has", showMem)
                    { showMem = it; prefs.showMemoriesWidget = it }
                SettingsSwitchRow("Last Skippy reply", "Preview of last response", showChat)
                    { showChat = it; prefs.showRecentChatWidget = it }
            }

            // ── Display ──────────────────────────────────────────────────────
            SettingsSection(title = "Display", icon = "🎨") {
                SettingsSwitchRow("Show quick stats on home", "Todos, reminders, memory count", showStats)
                    { showStats = it; prefs.showQuickStats = it }
                Spacer(Modifier.height(8.dp))
                SettingsLabel("Temperature unit")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    listOf("fahrenheit" to "°F", "celsius" to "°C").forEach { (key, label) ->
                        val sel = tempUnit == key
                        Surface(
                            modifier = Modifier.weight(1f).clickable { tempUnit = key; prefs.temperatureUnit = key },
                            shape = RoundedCornerShape(10.dp),
                            color = if (sel) CyanPrimary.copy(alpha = 0.18f) else NavyCard,
                            border = BorderStroke(1.dp, if (sel) CyanPrimary.copy(alpha = 0.6f) else SurfaceBorder),
                        ) {
                            Text(
                                label,
                                modifier = Modifier.padding(vertical = 10.dp).fillMaxWidth().wrapContentWidth(),
                                color = if (sel) CyanPrimary else WhiteMuted,
                                fontSize = 14.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }

            // ── About ────────────────────────────────────────────────────────
            SettingsSection(title = "About", icon = "ℹ️") {
                InfoRow("App", "Skippy Launcher")
                InfoRow("Version", "3.0.0")
                InfoRow("Engine", "Grok + Claude (auto)")
                InfoRow("Sync", "Live — shares your Skippy backend")
                InfoRow("Features", "Chat · Memory · Notes · Debates · Learn")
            }

            // ── Danger Zone ──────────────────────────────────────────────────
            SettingsSection(title = "Danger Zone", icon = "⚠️") {
                OutlinedButton(
                    onClick = { viewModel.clearChat() },
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    border = BorderStroke(1.dp, AmberWarning.copy(alpha = 0.5f)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Default.DeleteOutline, null, tint = AmberWarning, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Clear Chat History", color = AmberWarning, fontWeight = FontWeight.Medium)
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { onResetSetup() },
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    border = BorderStroke(1.dp, ErrorRed.copy(alpha = 0.4f)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.AutoMirrored.Filled.Logout, null, tint = ErrorRed, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Sign Out", color = ErrorRed, fontWeight = FontWeight.Medium)
                }
            }

            Spacer(Modifier.height(80.dp))
        }
    }
}

@Composable
private fun SettingsSection(title: String, icon: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(16.dp), color = NavyCard,
        border = BorderStroke(1.dp, SurfaceBorder), modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(icon, fontSize = 16.sp)
                Text(title, color = WhiteText, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
            HorizontalDivider(color = SurfaceBorder.copy(alpha = 0.5f))
            content()
        }
    }
}

@Composable
private fun SettingsLabel(text: String) {
    Text(text, color = WhiteMuted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 2.dp))
}

@Composable
private fun SettingsSwitchRow(label: String, sublabel: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = WhiteText, fontSize = 13.sp)
            Text(sublabel, color = WhiteMuted.copy(alpha = 0.6f), fontSize = 11.sp)
        }
        Switch(
            checked = checked, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = NavyDeep, checkedTrackColor = CyanPrimary,
                uncheckedThumbColor = WhiteMuted, uncheckedTrackColor = NavyMid,
            ),
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = WhiteMuted, fontSize = 13.sp)
        Text(value, color = WhiteText, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}
