package com.skippy.launcher

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.skippy.launcher.lockscreen.SkippyDeviceAdminReceiver
import com.skippy.launcher.lockscreen.SkippyLockService
import com.skippy.launcher.ui.screens.*
import com.skippy.launcher.ui.theme.SkippyTheme
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.LoginState

class MainActivity : ComponentActivity() {

    private val viewModel: LauncherViewModel by lazy {
        (application as SkippyApplication).sharedViewModel
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        maybeStartLockService()
        setContent {
            SkippyTheme {
                SkippyApp(viewModel = viewModel)
            }
        }
    }

    private fun maybeStartLockService() {
        val prefs = viewModel.prefs
        if (!prefs.lockscreenPageEnabled) return
        val dpm   = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = SkippyDeviceAdminReceiver.getComponentName(this)
        if (dpm.isAdminActive(admin)) {
            startForegroundService(Intent(this, SkippyLockService::class.java))
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
