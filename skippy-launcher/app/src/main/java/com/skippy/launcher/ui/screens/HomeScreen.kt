package com.skippy.launcher.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.location.LocationServices
import com.skippy.launcher.ui.components.*
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.VoiceState
import kotlinx.coroutines.launch

// Page indices
private const val PAGE_CHAT    = 0
private const val PAGE_HOME    = 1
private const val PAGE_MEMORY  = 2
private const val PAGE_NOTES   = 3
private const val PAGE_EXPLORE = 4
private const val PAGE_SETTINGS = 5
private const val PAGE_COUNT   = 6

private data class PageMeta(val icon: ImageVector, val label: String, val tint: Color)
private val PAGE_META = listOf(
    PageMeta(Icons.Default.Chat,        "Chat",    CyanPrimary),
    PageMeta(Icons.Default.Home,        "Home",    CyanPrimary),
    PageMeta(Icons.Default.Psychology,  "Memory",  PurpleAccent),
    PageMeta(Icons.Default.Article,     "Notes",   AccentGold),
    PageMeta(Icons.Default.Explore,     "Explore", GreenSuccess),
    PageMeta(Icons.Default.Settings,    "Settings",WhiteMuted),
)

@SuppressLint("MissingPermission")
@Composable
fun HomeScreen(
    viewModel: LauncherViewModel,
    onOpenDrawer: () -> Unit,
) {
    val context     = LocalContext.current
    val scope       = rememberCoroutineScope()
    val pagerState  = rememberPagerState(initialPage = PAGE_HOME) { PAGE_COUNT }
    val voiceState  by viewModel.voiceState.collectAsState()

    // Location → weather (only once at start)
    val locLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val client = LocationServices.getFusedLocationProviderClient(context)
            client.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) viewModel.updateWeather(loc.latitude, loc.longitude)
            }
        }
    }
    LaunchedEffect(Unit) {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED) {
            val client = LocationServices.getFusedLocationProviderClient(context)
            client.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) viewModel.updateWeather(loc.latitude, loc.longitude)
            }
        } else {
            locLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        viewModel.refreshHomeData()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.0f to NavyDark,
                        0.5f to NavyMid,
                        1.0f to NavyDeep,
                    )
                )
            ),
    ) {
        // ── Main pager ──────────────────────────────────────────────────────
        HorizontalPager(
            state    = pagerState,
            modifier = Modifier.fillMaxSize(),
            key      = { it },
        ) { page ->
            when (page) {
                PAGE_CHAT    -> ChatPage(viewModel = viewModel)
                PAGE_HOME    -> HomeLandingPage(viewModel = viewModel, onOpenDrawer = onOpenDrawer)
                PAGE_MEMORY  -> MemoryPage(viewModel = viewModel)
                PAGE_NOTES   -> NotesPage(viewModel = viewModel)
                PAGE_EXPLORE -> ExplorePage(viewModel = viewModel)
                PAGE_SETTINGS -> SettingsScreen(
                    viewModel = viewModel,
                    onResetSetup = { /* handled inside */ },
                )
                else -> Box(Modifier.fillMaxSize())
            }
        }

        // ── Page tab bar ────────────────────────────────────────────────────
        val currentPage = pagerState.currentPage
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Only show mini tab bar on non-home pages
            AnimatedVisibility(
                visible = currentPage != PAGE_HOME,
                enter = fadeIn() + slideInVertically { -it },
                exit  = fadeOut() + slideOutVertically { -it },
            ) {
                Surface(
                    modifier  = Modifier.padding(horizontal = 16.dp),
                    shape     = RoundedCornerShape(20.dp),
                    color     = NavyDeep.copy(alpha = 0.85f),
                    tonalElevation = 0.dp,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        PAGE_META.forEachIndexed { idx, meta ->
                            val selected = currentPage == idx
                            Surface(
                                modifier  = Modifier
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable { scope.launch { pagerState.animateScrollToPage(idx) } },
                                shape     = RoundedCornerShape(14.dp),
                                color     = if (selected) meta.tint.copy(alpha = 0.18f) else Color.Transparent,
                            ) {
                                Column(
                                    modifier            = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Icon(
                                        imageVector        = meta.icon,
                                        contentDescription = meta.label,
                                        tint               = if (selected) meta.tint else WhiteMuted.copy(alpha = 0.4f),
                                        modifier           = Modifier.size(18.dp),
                                    )
                                    if (selected) {
                                        Text(
                                            text       = meta.label,
                                            fontSize   = 9.sp,
                                            color      = meta.tint,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Page dots (compact, at bottom) ──────────────────────────────────
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(PAGE_COUNT) { idx ->
                val selected = pagerState.currentPage == idx
                val meta     = PAGE_META[idx]
                Box(
                    modifier = Modifier
                        .size(if (selected) 8.dp else 5.dp)
                        .clip(CircleShape)
                        .background(if (selected) meta.tint else WhiteDim.copy(alpha = 0.25f))
                        .clickable { scope.launch { pagerState.animateScrollToPage(idx) } }
                )
            }
        }

        // ── Global voice indicator pill (only when not idle) ────────────────
        AnimatedVisibility(
            visible  = voiceState !is VoiceState.Idle && currentPage != PAGE_CHAT,
            enter    = fadeIn() + slideInVertically { it },
            exit     = fadeOut() + slideOutVertically { it },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 24.dp),
        ) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = NavyMid.copy(alpha = 0.95f),
                border = BorderStroke(1.dp, CyanGlow),
            ) {
                val pulseAnim = rememberInfiniteTransition(label = "vp")
                val alpha by pulseAnim.animateFloat(
                    initialValue = 0.6f, targetValue = 1f,
                    animationSpec = infiniteRepeatable(tween(600), RepeatMode.Reverse),
                    label = "va",
                )
                Row(
                    modifier            = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment   = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(when (voiceState) {
                                is VoiceState.Listening -> ListeningRed.copy(alpha = alpha)
                                else -> CyanPrimary.copy(alpha = alpha)
                            })
                    )
                    Text(
                        text = when (voiceState) {
                            is VoiceState.Listening  -> "Listening…"
                            is VoiceState.Processing -> "Thinking…"
                            is VoiceState.Speaking   -> "Speaking…"
                            else -> ""
                        },
                        color    = WhiteText,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

// ── Home Landing Page ─────────────────────────────────────────────────────────

@SuppressLint("MissingPermission")
@Composable
fun HomeLandingPage(
    viewModel: LauncherViewModel,
    onOpenDrawer: () -> Unit,
) {
    val weather   by viewModel.weather.collectAsState()
    val apps      by viewModel.apps.collectAsState()
    val todos     by viewModel.todos.collectAsState()
    val reminders by viewModel.reminders.collectAsState()
    val memories  by viewModel.memories.collectAsState()
    val userStats by viewModel.userStats.collectAsState()
    var swipeOffset by remember { mutableFloatStateOf(0f) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { _, delta -> swipeOffset += delta },
                    onDragEnd = {
                        if (swipeOffset < -60f) onOpenDrawer()
                        swipeOffset = 0f
                    },
                    onDragCancel = { swipeOffset = 0f },
                )
            },
    ) {
        // Scrollable content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(bottom = 100.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Spacer(Modifier.height(48.dp)) // space for tab bar

            ClockWidget()
            WeatherWidget(weather = weather)

            Spacer(Modifier.height(4.dp))

            // Quick stats strip
            val pendingTodos = todos.count { !it.isDone }
            val pendingReminders = reminders.count { !it.isDone }
            if (pendingTodos > 0 || pendingReminders > 0 || memories.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (memories.isNotEmpty()) {
                        QuickStatChip(
                            icon  = "🧠",
                            label = "${memories.size} memories",
                            color = PurpleAccent,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (pendingTodos > 0) {
                        QuickStatChip(
                            icon  = "✅",
                            label = "$pendingTodos todos",
                            color = AccentGold,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (pendingReminders > 0) {
                        QuickStatChip(
                            icon  = "🔔",
                            label = "$pendingReminders reminders",
                            color = OrangeAccent,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            SkippyWidget(viewModel = viewModel)

            // Recent conversation preview
            val chatLog by viewModel.chatLog.collectAsState()
            if (chatLog.isNotEmpty()) {
                val last = chatLog.last()
                if (last.role == "skippy") {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, CyanGlow.copy(alpha = 0.4f), RoundedCornerShape(14.dp)),
                        shape = RoundedCornerShape(14.dp),
                        color = NavyCard.copy(alpha = 0.8f),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Text("⚡", fontSize = 18.sp)
                            Text(
                                text     = last.text,
                                color    = WhiteMuted,
                                fontSize = 13.sp,
                                maxLines = 3,
                                lineHeight = 18.sp,
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
        }

        // Fixed dock
        AppDock(
            apps           = apps,
            pinnedPackages = viewModel.prefs.pinnedApps,
            onAppClick     = { pkg -> viewModel.launchApp(pkg) },
            onDrawerClick  = onOpenDrawer,
            modifier       = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun QuickStatChip(
    icon: String, label: String, color: Color, modifier: Modifier = Modifier,
) {
    Surface(
        modifier  = modifier,
        shape     = RoundedCornerShape(12.dp),
        color     = color.copy(alpha = 0.12f),
        border    = BorderStroke(1.dp, color.copy(alpha = 0.3f)),
    ) {
        Row(
            modifier            = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment   = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(icon, fontSize = 14.sp)
            Text(label, color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}
