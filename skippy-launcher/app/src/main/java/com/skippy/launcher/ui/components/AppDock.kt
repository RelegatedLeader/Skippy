package com.skippy.launcher.ui.components

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import com.skippy.launcher.data.AppInfo
import com.skippy.launcher.ui.theme.*

@Composable
fun AppDock(
    apps: List<AppInfo>,
    pinnedPackages: List<String>,
    onAppClick: (String) -> Unit,
    onDrawerClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val docked = pinnedPackages.mapNotNull { pkg -> apps.firstOrNull { it.packageName == pkg } }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(26.dp))
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(NavyMid.copy(alpha = 0.96f), NavyDark.copy(alpha = 0.96f))
                    )
                )
                .border(1.dp, CyanGlow, RoundedCornerShape(26.dp))
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            docked.forEach { app ->
                AppIconItem(
                    app      = app,
                    iconSize = 48.dp,
                    onClick  = { onAppClick(app.packageName) },
                )
            }
            // App drawer button
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(CyanDim)
                    .border(1.5.dp, CyanPrimary, CircleShape)
                    .clickable(onClick = onDrawerClick),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector       = Icons.Default.Apps,
                    contentDescription = "All apps",
                    tint              = CyanPrimary,
                    modifier          = Modifier.size(28.dp),
                )
            }
        }
    }
}
