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
import androidx.compose.material.icons.automirrored.filled.Article
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.location.LocationServices
import com.skippy.launcher.R
import com.skippy.launcher.data.AppInfo
import com.skippy.launcher.ui.components.*
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.VoiceState
import kotlinx.coroutines.launch
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items

// Page indices
private const val PAGE_CHAT     = 0
private const val PAGE_HOME     = 1
private const val PAGE_MEMORY   = 2
private const val PAGE_NOTES    = 3
private const val PAGE_EXPLORE  = 4
private const val PAGE_SETTINGS = 5
private const val PAGE_COUNT    = 6

private data class PageMeta(val icon: ImageVector, val label: String, val tint: Color)
private val PAGE_META = listOf(
    PageMeta(Icons.AutoMirrored.Filled.Chat,       "Chat",     CyanPrimary),
    PageMeta(Icons.Default.Home,                   "Home",     CyanPrimary),
    PageMeta(Icons.Default.Psychology,             "Memory",   PurpleAccent),
    PageMeta(Icons.AutoMirrored.Filled.Article,    "Notes",    AccentGold),
    PageMeta(Icons.Default.Explore,                "Explore",  GreenSuccess),
    PageMeta(Icons.Default.Settings,               "Settings", WhiteMuted),
)

@SuppressLint("MissingPermission")
@Composable
fun HomeScreen(
    viewModel: LauncherViewModel,
    onOpenDrawer: () -> Unit,
    onLogout: () -> Unit,
) {
    val context    = LocalContext.current
    val scope      = rememberCoroutineScope()
    val pagerState = rememberPagerState(initialPage = PAGE_HOME) { PAGE_COUNT }
    val voiceState by viewModel.voiceState.collectAsState()

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
        // Subtle animated star-field background dots
        StarFieldBackground()

        // Main pager
        HorizontalPager(
            state    = pagerState,
            modifier = Modifier.fillMaxSize(),
            key      = { it },
        ) { page ->
            when (page) {
                PAGE_CHAT    -> ChatPage(viewModel = viewModel)
                PAGE_HOME    -> HomeLandingPage(
                    viewModel      = viewModel,
                    onOpenDrawer   = onOpenDrawer,
                    onNavigateTo   = { idx -> scope.launch { pagerState.animateScrollToPage(idx) } },
                )
                PAGE_MEMORY  -> MemoryPage(viewModel = viewModel)
                PAGE_NOTES   -> NotesPage(viewModel = viewModel)
                PAGE_EXPLORE -> ExplorePage(viewModel = viewModel)
                PAGE_SETTINGS -> SettingsScreen(
                    viewModel    = viewModel,
                    onResetSetup = { onLogout() },
                )
                else -> Box(Modifier.fillMaxSize())
            }
        }

        // Top tab bar (shown on non-home pages)
        val currentPage = pagerState.currentPage
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AnimatedVisibility(
                visible = currentPage != PAGE_HOME,
                enter = fadeIn() + slideInVertically { -it },
                exit  = fadeOut() + slideOutVertically { -it },
            ) {
                Surface(
                    modifier = Modifier.padding(horizontal = 12.dp),
                    shape    = RoundedCornerShape(20.dp),
                    color    = NavyDeep.copy(alpha = 0.90f),
                    border   = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.5f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        PAGE_META.forEachIndexed { idx, meta ->
                            val selected = currentPage == idx
                            Surface(
                                modifier  = Modifier
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable { scope.launch { pagerState.animateScrollToPage(idx) } },
                                shape     = RoundedCornerShape(14.dp),
                                color     = if (selected) meta.tint.copy(alpha = 0.2f) else Color.Transparent,
                            ) {
                                Column(
                                    modifier            = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Icon(
                                        meta.icon, meta.label,
                                        tint     = if (selected) meta.tint else WhiteMuted.copy(alpha = 0.4f),
                                        modifier = Modifier.size(18.dp),
                                    )
                                    if (selected) {
                                        Text(meta.label, fontSize = 9.sp, color = meta.tint, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Bottom page dots — only on home page, positioned above dock
        AnimatedVisibility(
            visible = currentPage == PAGE_HOME,
            enter   = fadeIn(),
            exit    = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 100.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment     = Alignment.CenterVertically,
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
        }

        // Global voice indicator
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
                shape  = RoundedCornerShape(20.dp),
                color  = NavyMid.copy(alpha = 0.95f),
                border = BorderStroke(1.dp, CyanGlow),
            ) {
                val pulseAnim = rememberInfiniteTransition(label = "vp")
                val alpha by pulseAnim.animateFloat(
                    initialValue = 0.6f, targetValue = 1f,
                    animationSpec = infiniteRepeatable(tween(600), RepeatMode.Reverse),
                    label = "va",
                )
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment   = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier.size(8.dp).clip(CircleShape)
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
                        color = WhiteText, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

// ── Animated starfield ─────────────────────────────────────────────────────────

@Composable
private fun StarFieldBackground() {
    val infiniteTransition = rememberInfiniteTransition(label = "stars")
    val offset by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(20000, easing = LinearEasing)),
        label = "so",
    )
    Canvas(modifier = Modifier.fillMaxSize()) {
        val stars = listOf(
            Triple(0.08f, 0.12f, 1.5f), Triple(0.22f, 0.31f, 1f), Triple(0.41f, 0.08f, 2f),
            Triple(0.67f, 0.19f, 1.5f), Triple(0.83f, 0.07f, 1f), Triple(0.15f, 0.54f, 1.2f),
            Triple(0.55f, 0.44f, 1.8f), Triple(0.72f, 0.62f, 1f), Triple(0.91f, 0.38f, 1.5f),
            Triple(0.35f, 0.76f, 1.2f), Triple(0.48f, 0.85f, 2f), Triple(0.78f, 0.81f, 1f),
        )
        stars.forEachIndexed { i, (xf, yf, radius) ->
            val alpha = ((offset + i * 0.08f) % 1f).let { t ->
                if (t < 0.5f) t * 2f else (1f - t) * 2f
            }
            drawCircle(
                color = Color(0xFF29C2E6).copy(alpha = alpha * 0.35f),
                radius = radius.dp.toPx(),
                center = androidx.compose.ui.geometry.Offset(xf * size.width, yf * size.height),
            )
        }
    }
}

// ── Home Landing Page ─────────────────────────────────────────────────────────

@SuppressLint("MissingPermission")
@Composable
fun HomeLandingPage(
    viewModel: LauncherViewModel,
    onOpenDrawer: () -> Unit,
    onNavigateTo: (Int) -> Unit = {},
) {
    val weather   by viewModel.weather.collectAsState()
    val apps      by viewModel.apps.collectAsState()
    val todos     by viewModel.todos.collectAsState()
    val reminders by viewModel.reminders.collectAsState()
    val memories  by viewModel.memories.collectAsState()
    val userStats by viewModel.userStats.collectAsState()
    val homeApps  by viewModel.homeApps.collectAsState()
    val prefs     = viewModel.prefs
    var swipeOffset by remember { mutableFloatStateOf(0f) }
    var editHomeApps by remember { mutableStateOf(false) }
    var showDockEdit by remember { mutableStateOf(false) }

    // Robot float animation
    val floatAnim = rememberInfiniteTransition(label = "rf")
    val robotY by floatAnim.animateFloat(
        initialValue = 0f, targetValue = -8f,
        animationSpec = infiniteRepeatable(tween(2200, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "ry",
    )
    val glowAlpha by floatAnim.animateFloat(
        initialValue = 0.25f, targetValue = 0.55f,
        animationSpec = infiniteRepeatable(tween(2000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "ga",
    )

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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(bottom = 140.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(8.dp))

            // ── Clock + Weather row ───────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ClockWidget(compact = true)
                WeatherWidget(weather = weather, compact = true)
            }

            // ── Skippy Robot Hero ─────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                // Glow beneath robot
                Box(
                    modifier = Modifier
                        .size(120.dp)
                        .align(Alignment.Center)
                        .offset(y = 20.dp)
                        .blur(24.dp)
                        .clip(CircleShape)
                        .background(CyanPrimary.copy(alpha = glowAlpha)),
                )

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Image(
                        painter = painterResource(R.drawable.skippy_robot),
                        contentDescription = "Skippy",
                        modifier = Modifier
                            .size(110.dp)
                            .offset(y = robotY.dp),
                        contentScale = ContentScale.Fit,
                    )

                    val greeting = remember {
                        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
                        when {
                            hour < 12 -> "Good morning! ☀️"
                            hour < 17 -> "Good afternoon! ⚡"
                            else      -> "Good evening! 🌙"
                        }
                    }
                    Text(
                        greeting,
                        color = WhiteText,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (prefs.username.isNotBlank()) {
                        Text(
                            prefs.username,
                            color = CyanPrimary,
                            fontSize = 13.sp,
                        )
                    }
                }
            }

            // ── Smart Search / Ask Skippy bar ─────────────────────────────
            SkippyWidget(viewModel = viewModel, compact = true)

            // ── Quick-launch apps grid (up to 8, customisable) ────────────
            HomeAppsSection(
                homeApps     = homeApps,
                allApps      = apps,
                editMode     = editHomeApps,
                onToggleEdit = { editHomeApps = !editHomeApps },
                onLaunch     = { pkg -> if (!editHomeApps) viewModel.launchApp(pkg) },
                onRemove     = { pkg -> viewModel.updateHomeApps(homeApps.filter { it != pkg }) },
            )

            // ── Quick stats strip ─────────────────────────────────────────
            val pendingTodos      = todos.count { !it.isDone }
            val pendingReminders  = reminders.count { !it.isDone }
            if (memories.isNotEmpty() || pendingTodos > 0 || pendingReminders > 0) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (memories.isNotEmpty()) QuickStatChip("🧠", "${memories.size}", "memories", PurpleAccent, Modifier.weight(1f), onClick = { onNavigateTo(PAGE_MEMORY) })
                    if (pendingTodos > 0) QuickStatChip("✅", "$pendingTodos", "todos", AccentGold, Modifier.weight(1f), onClick = { onNavigateTo(PAGE_MEMORY) })
                    if (pendingReminders > 0) QuickStatChip("🔔", "$pendingReminders", "reminders", OrangeAccent, Modifier.weight(1f), onClick = { onNavigateTo(PAGE_MEMORY) })
                }
            }

            // ── Active todo preview (widget) ──────────────────────────────
            if (prefs.showTodosWidget && todos.isNotEmpty()) {
                HomeWidgetCard(
                    title = "Today's Todos",
                    icon = "✅",
                    accentColor = AccentGold,
                    onViewAll = { onNavigateTo(PAGE_MEMORY) },
                ) {
                    val pending = todos.filter { !it.isDone }
                    pending.take(4).forEach { todo ->
                        val pColor = when (todo.priority) {
                            "urgent" -> Color(0xFFEF4444)
                            "high"   -> OrangeAccent
                            "normal" -> CyanPrimary
                            else     -> WhiteMuted.copy(alpha = 0.4f)
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .clickable { viewModel.toggleTodo(todo.id, true) }
                                .padding(vertical = 5.dp, horizontal = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.RadioButtonUnchecked,
                                contentDescription = "Mark done",
                                tint = pColor,
                                modifier = Modifier.size(17.dp),
                            )
                            Text(
                                text = todo.content,
                                color = WhiteMuted, fontSize = 13.sp, maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            if (todo.priority == "urgent" || todo.priority == "high") {
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(pColor),
                                )
                            }
                        }
                    }
                    val remaining = pending.size - 4
                    if (remaining > 0) {
                        Text(
                            text = "+ $remaining more",
                            color = AccentGold.copy(alpha = 0.55f),
                            fontSize = 11.sp,
                            modifier = Modifier.padding(start = 25.dp, top = 3.dp),
                        )
                    }
                }
            }

            // ── Reminders preview ─────────────────────────────────────────
            if (prefs.showRemindersWidget && reminders.any { !it.isDone }) {
                HomeWidgetCard(
                    title = "Reminders",
                    icon = "🔔",
                    accentColor = OrangeAccent,
                    onViewAll = { onNavigateTo(PAGE_MEMORY) },
                ) {
                    reminders.filter { !it.isDone }.take(4).forEach { r ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .clickable { viewModel.toggleReminder(r.id, true) }
                                .padding(vertical = 5.dp, horizontal = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.NotificationsActive,
                                contentDescription = "Dismiss",
                                tint = OrangeAccent.copy(alpha = 0.75f),
                                modifier = Modifier.size(15.dp),
                            )
                            Text(
                                text = r.content,
                                color = WhiteMuted, fontSize = 13.sp, maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            r.timeframeLabel?.let {
                                Text(
                                    text = it,
                                    color = OrangeAccent.copy(alpha = 0.7f), fontSize = 11.sp,
                                )
                            }
                        }
                    }
                }
            }

            // ── Last Skippy response preview ──────────────────────────────
            val chatLog by viewModel.chatLog.collectAsState()
            if (prefs.showRecentChatWidget && chatLog.isNotEmpty()) {
                val last = chatLog.last()
                if (last.role == "skippy") {
                    HomeWidgetCard(
                        title = "Last from Skippy",
                        icon = "💬",
                        accentColor = CyanPrimary,
                        onViewAll = { onNavigateTo(PAGE_CHAT) },
                    ) {
                        Text(
                            last.text, color = WhiteMuted, fontSize = 13.sp,
                            maxLines = 3, lineHeight = 18.sp,
                        )
                    }
                }
            }

            // ── User stats ────────────────────────────────────────────────
            userStats?.let { stats ->
                HomeWidgetCard(title = "My Skippy Stats", icon = "📊", accentColor = GreenSuccess) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        StatPill("💬", "${stats.totalMessages}", "msgs")
                        StatPill("🧠", "${stats.totalMemories}", "memories")
                        StatPill("📝", "${stats.totalNotes}", "notes")
                        StatPill("📋", "${stats.totalTodos}", "todos")
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
        }

        // ── App picker overlay ────────────────────────────────────────────
        AnimatedVisibility(
            visible  = editHomeApps,
            enter    = fadeIn(tween(180)) + slideInVertically(tween(250)) { it / 2 },
            exit     = fadeOut(tween(180)) + slideOutVertically(tween(250)) { it / 2 },
            modifier = Modifier.fillMaxSize(),
        ) {
            AppPickerSheet(
                homeApps      = homeApps,
                allApps       = apps,
                usageCounts   = remember(prefs.appUsageCounts) {
                    prefs.appUsageCounts.split(",").mapNotNull {
                        val p = it.split("="); if (p.size == 2) p[0] to (p[1].toIntOrNull() ?: 0) else null
                    }.toMap()
                },
                sheetTitle    = "Choose Quick Apps",
                sheetSubtitle = "${homeApps.size}/12 · tap to toggle",
                maxItems      = 12,
                onDismiss     = { editHomeApps = false },
                onToggle      = { pkg ->
                    if (homeApps.contains(pkg)) viewModel.updateHomeApps(homeApps.filter { it != pkg })
                    else if (homeApps.size < 12) viewModel.updateHomeApps(homeApps + pkg)
                },
            )
        }

        // ── Fixed bottom dock ─────────────────────────────────────────────
        AppDock(
            apps           = apps,
            pinnedPackages = viewModel.prefs.pinnedApps,
            onAppClick     = { pkg -> viewModel.launchApp(pkg) },
            onDrawerClick  = onOpenDrawer,
            pendingCount   = todos.count { !it.isDone },
            onEditDock     = { showDockEdit = true },
            modifier       = Modifier.align(Alignment.BottomCenter),
        )

        // ── Dock edit overlay ─────────────────────────────────────────────
        AnimatedVisibility(
            visible  = showDockEdit,
            enter    = fadeIn(tween(180)) + slideInVertically(tween(250)) { it / 2 },
            exit     = fadeOut(tween(180)) + slideOutVertically(tween(250)) { it / 2 },
            modifier = Modifier.fillMaxSize(),
        ) {
            AppPickerSheet(
                homeApps    = viewModel.prefs.pinnedApps,
                allApps     = apps,
                usageCounts = remember(prefs.appUsageCounts) {
                    prefs.appUsageCounts.split(",").mapNotNull {
                        val p = it.split("="); if (p.size == 2) p[0] to (p[1].toIntOrNull() ?: 0) else null
                    }.toMap()
                },
                sheetTitle  = "Edit Dock",
                sheetSubtitle = "${viewModel.prefs.pinnedApps.size} pinned · tap to pin/unpin",
                maxItems    = 6,
                onDismiss   = { showDockEdit = false },
                onToggle    = { pkg -> viewModel.togglePinApp(pkg) },
            )
        }
    }
}

@Composable
private fun HomeWidgetCard(
    title: String,
    icon: String,
    accentColor: Color,
    onViewAll: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape  = RoundedCornerShape(16.dp),
        color  = NavyCard,
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.25f)),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(icon, fontSize = 14.sp)
                    Text(title, color = accentColor, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                if (onViewAll != null) {
                    TextButton(
                        onClick = onViewAll,
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                    ) {
                        Text("See all →", color = accentColor.copy(alpha = 0.7f), fontSize = 11.sp)
                    }
                }
            }
            content()
        }
    }
}

@Composable
private fun QuickStatChip(
    icon: String, value: String, label: String, color: Color,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    Surface(
        modifier  = modifier.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        shape     = RoundedCornerShape(12.dp),
        color     = color.copy(alpha = 0.1f),
        border    = BorderStroke(1.dp, color.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(icon, fontSize = 16.sp)
            Text(value, color = color, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text(label, color = color.copy(alpha = 0.8f), fontSize = 10.sp)
        }
    }
}

@Composable
private fun StatPill(icon: String, value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(icon, fontSize = 18.sp)
        Text(value, color = WhiteText, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text(label, color = WhiteMuted, fontSize = 10.sp)
    }
}

// ── Home Quick-launch Apps ──────────────────────────────────────────────────

@Composable
private fun HomeAppsSection(
    homeApps: List<String>,
    allApps: List<AppInfo>,
    editMode: Boolean,
    onToggleEdit: () -> Unit,
    onLaunch: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    val appsMap = remember(allApps) { allApps.associateBy { it.packageName } }
    val appInfos = remember(homeApps, appsMap) { homeApps.mapNotNull { appsMap[it] } }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape  = RoundedCornerShape(16.dp),
        color  = NavyCard,
        border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.25f)),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("⚡", fontSize = 14.sp)
                    Text("Quick Apps", color = CyanPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text("${homeApps.size}/12", color = WhiteMuted.copy(alpha = 0.45f), fontSize = 11.sp)
                }
                TextButton(
                    onClick = onToggleEdit,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                ) {
                    Icon(
                        if (editMode) Icons.Default.Check else Icons.Default.Edit,
                        null,
                        tint = if (editMode) CyanPrimary else WhiteMuted.copy(alpha = 0.6f),
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        if (editMode) "Done" else "Edit",
                        color = if (editMode) CyanPrimary else WhiteMuted.copy(alpha = 0.6f),
                        fontSize = 11.sp,
                    )
                }
            }

            if (appInfos.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("📱", fontSize = 24.sp)
                        Text("Tap Edit to add up to 12 quick-launch apps", color = WhiteMuted, fontSize = 12.sp)
                    }
                }
            } else {
                // 4-column grid
                val rows = appInfos.chunked(4)
                rows.forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        row.forEach { app ->
                            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.TopEnd) {
                                AppIconItem(
                                    app = app,
                                    iconSize = 48.dp,
                                    onClick = { onLaunch(app.packageName) },
                                )
                                if (editMode) {
                                    Box(
                                        modifier = Modifier
                                            .offset(x = (-2).dp, y = 2.dp)
                                            .size(18.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFFEF4444))
                                            .clickable { onRemove(app.packageName) },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(Icons.Default.Close, null, tint = Color.White, modifier = Modifier.size(10.dp))
                                    }
                                }
                            }
                        }
                        // Fill remaining slots with empty weight boxes
                        repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }

            // Add more button in edit mode when < 8 apps
            if (editMode && homeApps.size < 12) {
                OutlinedButton(
                    onClick = onToggleEdit, // tapping "Edit" again dismisses and shows picker via parent
                    modifier = Modifier.fillMaxWidth(),
                    border = BorderStroke(1.dp, CyanPrimary.copy(alpha = 0.4f)),
                    shape  = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = CyanPrimary),
                    contentPadding = PaddingValues(vertical = 8.dp),
                ) {
                    Icon(Icons.Default.Add, null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Add apps (${12 - homeApps.size} slots left)", fontSize = 12.sp)
                }
            }
        }
    }
}

// ── App Picker Sheet ────────────────────────────────────────────────────────

@Composable
private fun AppPickerSheet(
    homeApps: List<String>,
    allApps: List<AppInfo>,
    usageCounts: Map<String, Int>,
    sheetTitle: String = "Choose Apps",
    sheetSubtitle: String = "${homeApps.size} selected · tap to toggle",
    maxItems: Int = 12,
    onDismiss: () -> Unit,
    onToggle: (String) -> Unit,
) {
    var searchQuery by remember { mutableStateOf("") }
    val sortedApps = remember(allApps, usageCounts) {
        allApps.sortedWith(compareByDescending<AppInfo> { usageCounts[it.packageName] ?: 0 }.thenBy { it.name.lowercase() })
    }
    val filtered = remember(searchQuery, sortedApps) {
        if (searchQuery.isBlank()) sortedApps
        else sortedApps.filter { it.name.contains(searchQuery, ignoreCase = true) }
    }

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
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 60.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(sheetTitle, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = WhiteText)
                    Text(sheetSubtitle, fontSize = 12.sp, color = WhiteMuted)
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, "Close", tint = WhiteMuted, modifier = Modifier.size(22.dp))
                }
            }

            // Search
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search apps…", color = WhiteDim, fontSize = 13.sp) },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = CyanPrimary, unfocusedBorderColor = CyanGlow,
                    focusedTextColor = WhiteText, unfocusedTextColor = WhiteText,
                    cursorColor = CyanPrimary,
                    focusedContainerColor = NavyDeep.copy(alpha = 0.3f),
                    unfocusedContainerColor = NavyDeep.copy(alpha = 0.3f),
                ),
                shape = RoundedCornerShape(12.dp),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, null, tint = WhiteMuted, modifier = Modifier.size(18.dp)) },
                trailingIcon = {
                    if (searchQuery.isNotBlank()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Clear, null, tint = WhiteMuted, modifier = Modifier.size(16.dp))
                        }
                    }
                },
            )

            Spacer(Modifier.height(12.dp))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(bottom = 80.dp),
            ) {
                items(filtered, key = { it.packageName }) { app ->
                    val isSelected = homeApps.contains(app.packageName)
                    val canAdd = homeApps.size < maxItems || isSelected
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = canAdd) { onToggle(app.packageName) },
                        shape  = RoundedCornerShape(12.dp),
                        color  = if (isSelected) CyanPrimary.copy(alpha = 0.12f) else NavyCard,
                        border = BorderStroke(1.dp, if (isSelected) CyanPrimary.copy(alpha = 0.5f) else SurfaceBorder),
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            DrawableImage(
                                drawable = app.icon, contentDescription = app.name,
                                modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)),
                            )
                            Text(
                                app.name, color = if (isSelected) CyanPrimary else WhiteText,
                                fontSize = 14.sp, fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                modifier = Modifier.weight(1f),
                            )
                            if (isSelected) {
                                Icon(Icons.Default.CheckCircle, "Selected", tint = CyanPrimary, modifier = Modifier.size(20.dp))
                            } else if (!canAdd) {
                                Text("Full", color = WhiteMuted.copy(alpha = 0.4f), fontSize = 11.sp)
                            } else {
                                Icon(Icons.Default.AddCircleOutline, "Add", tint = WhiteMuted.copy(alpha = 0.4f), modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

