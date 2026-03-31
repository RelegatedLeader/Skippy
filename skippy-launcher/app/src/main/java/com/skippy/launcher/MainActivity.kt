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
    var setupDone  by remember { mutableStateOf(viewModel.prefs.isSetupDone && viewModel.prefs.skippyUrl.isNotBlank()) }
    var showDrawer by remember { mutableStateOf(false) }

    // Observe prefs changes (reset from settings)
    LaunchedEffect(viewModel.prefs.isSetupDone, viewModel.prefs.skippyUrl) {
        setupDone = viewModel.prefs.isSetupDone && viewModel.prefs.skippyUrl.isNotBlank()
    }

    if (!setupDone) {
        SetupScreen(onComplete = { url ->
            viewModel.completeSetup(url)
            setupDone = true
        })
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
        HomeScreen(
            viewModel    = viewModel,
            onOpenDrawer = { showDrawer = true },
        )

        AnimatedVisibility(
            visible = showDrawer,
            enter   = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            exit    = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
        ) {
            val apps by viewModel.apps.collectAsState()
            AppDrawerScreen(
                apps       = apps,
                onAppClick = { pkg -> viewModel.launchApp(pkg) },
                onDismiss  = { showDrawer = false },
            )
        }
    }
}
