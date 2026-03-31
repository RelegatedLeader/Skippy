package com.skippy.launcher.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import com.skippy.launcher.data.AppInfo
import com.skippy.launcher.ui.theme.*

@Composable
fun AppDrawerScreen(
    apps: List<AppInfo>,
    pinnedPackages: List<String>,
    onAppClick: (String) -> Unit,
    onPinToggle: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query   by remember { mutableStateOf("") }
    var longPressedPkg by remember { mutableStateOf<String?>(null) }

    val filtered = remember(apps, query) {
        if (query.isBlank()) apps
        else apps.filter { it.name.contains(query, ignoreCase = true) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(NavyDeep.copy(alpha = 0.97f), NavyMid.copy(alpha = 0.97f))
                )
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = WhiteMuted)
                }
                Text(
                    text  = "All Apps",
                    style = MaterialTheme.typography.titleLarge,
                    color = WhiteText,
                    modifier = Modifier.weight(1f).padding(start = 4.dp),
                )
                Text(
                    "${filtered.size} apps",
                    color = WhiteMuted,
                    fontSize = 12.sp,
                )
            }

            // Search bar
            OutlinedTextField(
                value            = query,
                onValueChange    = { query = it },
                placeholder      = { Text("Search apps…", color = WhiteDim) },
                leadingIcon      = { Icon(Icons.Default.Search, null, tint = WhiteMuted) },
                trailingIcon     = if (query.isNotBlank()) {
                    { IconButton(onClick = { query = "" }) {
                        Icon(Icons.Default.Clear, null, tint = WhiteMuted)
                    }}
                } else null,
                modifier         = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                colors           = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor   = CyanPrimary,
                    unfocusedBorderColor = CyanGlow,
                    focusedTextColor     = WhiteText,
                    unfocusedTextColor   = WhiteText,
                    cursorColor          = CyanPrimary,
                    focusedContainerColor   = CyanDim,
                    unfocusedContainerColor = NavyDeep.copy(alpha = 0.4f),
                ),
                shape            = RoundedCornerShape(14.dp),
                singleLine       = true,
                keyboardOptions  = KeyboardOptions(imeAction = ImeAction.Search),
            )

            // Pinned hint
            if (pinnedPackages.isNotEmpty() && query.isBlank()) {
                Row(
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(Icons.Default.PushPin, null, tint = CyanPrimary, modifier = Modifier.size(13.dp))
                    Text("Long-press any app to pin/unpin to dock", color = WhiteMuted, fontSize = 11.sp)
                }
            }

            // App grid
            LazyVerticalGrid(
                columns = GridCells.Fixed(4),
                modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                items(filtered, key = { it.packageName }) { app ->
                    val isPinned = pinnedPackages.contains(app.packageName)
                    DrawerAppItem(
                        app = app,
                        isPinned = isPinned,
                        isLongPressed = longPressedPkg == app.packageName,
                        onLongPress = { longPressedPkg = if (longPressedPkg == app.packageName) null else app.packageName },
                        onPinToggle = { onPinToggle(app.packageName); longPressedPkg = null },
                        onClick = { onAppClick(app.packageName); onDismiss() },
                    )
                }
            }
        }

        // Long-press context menu overlay
        if (longPressedPkg != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(NavyDeep.copy(alpha = 0.4f))
                    .clickable { longPressedPkg = null },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DrawerAppItem(
    app: AppInfo,
    isPinned: Boolean,
    isLongPressed: Boolean,
    onLongPress: () -> Unit,
    onPinToggle: () -> Unit,
    onClick: () -> Unit,
) {
    Box(modifier = Modifier.padding(4.dp), contentAlignment = Alignment.TopEnd) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(if (isLongPressed) CyanDim else androidx.compose.ui.graphics.Color.Transparent)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = onLongPress,
                )
                .padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val bitmap = remember(app.packageName) {
                runCatching { app.icon.toBitmap(96, 96).asImageBitmap() }.getOrNull()
            }
            if (bitmap != null) {
                androidx.compose.foundation.Image(
                    bitmap = bitmap,
                    contentDescription = app.name,
                    modifier = Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)),
                )
            } else {
                Box(
                    modifier = Modifier.size(52.dp).clip(RoundedCornerShape(14.dp))
                        .background(NavyCard),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(app.name.take(1), color = CyanPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
            }
            Text(
                text = app.name,
                color = WhiteText,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 14.sp,
            )
        }

        // Pin badge
        if (isPinned) {
            Box(
                modifier = Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(CyanPrimary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.PushPin, null, tint = NavyDeep, modifier = Modifier.size(10.dp))
            }
        }

        // Long-press actions
        AnimatedVisibility(visible = isLongPressed, modifier = Modifier.align(Alignment.BottomCenter)) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp),
                color = NavyCard,
                border = BorderStroke(1.dp, CyanGlow),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().clickable(onClick = onPinToggle).padding(8.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (isPinned) Icons.Default.PushPin else Icons.Default.PushPin,
                        null, tint = if (isPinned) ErrorRed else CyanPrimary,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        if (isPinned) "Unpin" else "Pin to Dock",
                        color = if (isPinned) ErrorRed else CyanPrimary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

