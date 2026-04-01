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
import com.skippy.launcher.ui.components.*
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.VoiceState
import kotlinx.coroutines.launch

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
    val prefs     = viewModel.prefs
    var swipeOffset by remember { mutableFloatStateOf(0f) }

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
                .padding(bottom = 100.dp)
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

        // ── Fixed bottom dock ─────────────────────────────────────────────
        AppDock(
            apps           = apps,
            pinnedPackages = viewModel.prefs.pinnedApps,
            onAppClick     = { pkg -> viewModel.launchApp(pkg) },
            onDrawerClick  = onOpenDrawer,
            pendingCount   = todos.count { !it.isDone },
            modifier       = Modifier.align(Alignment.BottomCenter),
        )
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
