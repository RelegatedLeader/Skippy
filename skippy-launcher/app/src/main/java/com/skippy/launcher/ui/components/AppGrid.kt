package com.skippy.launcher.ui.components

import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import com.skippy.launcher.data.AppInfo
import com.skippy.launcher.ui.theme.WhiteMuted

@Composable
fun AppGrid(
    apps: List<AppInfo>,
    columns: Int = 4,
    iconSize: Dp = 56.dp,
    onAppClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        contentPadding = PaddingValues(8.dp),
    ) {
        items(apps, key = { it.packageName }) { app ->
            AppIconItem(
                app      = app,
                iconSize = iconSize,
                onClick  = { onAppClick(app.packageName) },
            )
        }
    }
}

@Composable
fun AppIconItem(
    app: AppInfo,
    iconSize: Dp = 56.dp,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        DrawableImage(
            drawable            = app.icon,
            contentDescription  = app.name,
            modifier            = Modifier.size(iconSize),
        )
        Text(
            text     = app.name,
            fontSize = 11.sp,
            color    = WhiteMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun DrawableImage(
    drawable: Drawable,
    contentDescription: String?,
    modifier: Modifier = Modifier,
) {
    val bitmap = remember(drawable) { drawable.toBitmap() }
    Image(
        bitmap             = bitmap.asImageBitmap(),
        contentDescription = contentDescription,
        modifier           = modifier,
    )
}
