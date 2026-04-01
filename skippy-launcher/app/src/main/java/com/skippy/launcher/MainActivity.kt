package com.skippy.launcher

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.animation.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.skippy.launcher.ui.screens.*
import com.skippy.launcher.ui.theme.SkippyTheme
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.LoginState

class MainActivity : ComponentActivity() {

    private val viewModel: LauncherViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SkippyTheme {
                SkippyApp(viewModel = viewModel)
            }
        }
    }
}

@Composable
private fun SkippyApp(viewModel: LauncherViewModel) {
    val isAuthenticated by viewModel.isAuthenticated.collectAsState()
    val loginState      by viewModel.loginState.collectAsState()
    var showDrawer      by remember { mutableStateOf(false) }

    val goHome = isAuthenticated && loginState !is LoginState.Loading

    if (!goHome) {
        LoginScreen(viewModel = viewModel)
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
        HomeScreen(
            viewModel    = viewModel,
            onOpenDrawer = { showDrawer = true },
            onLogout     = { viewModel.logout() },
        )

        AnimatedVisibility(
            visible = showDrawer,
            enter   = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            exit    = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
        ) {
            val apps by viewModel.apps.collectAsState()
            AppDrawerScreen(
                apps           = apps,
                pinnedPackages = viewModel.prefs.pinnedApps,
                onAppClick     = { pkg -> viewModel.launchApp(pkg) },
                onPinToggle    = { pkg -> viewModel.togglePinApp(pkg) },
                onDismiss      = { showDrawer = false },
            )
        }
    }
}
