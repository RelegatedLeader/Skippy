package com.skippy.launcher.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val SkippyColorScheme = darkColorScheme(
    primary            = CyanPrimary,
    onPrimary          = NavyDark,
    primaryContainer   = CyanGlow,
    onPrimaryContainer = CyanPrimary,
    background         = NavyDeep,
    surface            = NavyMid,
    onBackground       = WhiteText,
    onSurface          = WhiteText,
    outline            = CyanGlow,
)

@Composable
fun SkippyTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.setDecorFitsSystemWindows(window, false)
        }
    }
    MaterialTheme(
        colorScheme = SkippyColorScheme,
        typography  = SkippyTypography,
        content     = content,
    )
}
