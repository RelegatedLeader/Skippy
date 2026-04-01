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
import com.skippy.launcher.lockscreen.SkippyLockScreenActivity
import com.skippy.launcher.lockscreen.SkippyLockService
import com.skippy.launcher.ui.screens.*
import com.skippy.launcher.ui.theme.SkippyTheme
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.LoginState

class MainActivity : ComponentActivity() {

    // Shared Application-level ViewModel — prevents duplicate app-icon loading
    // that caused OOM when MainActivity and SkippyLockScreenActivity each created
    // their own LauncherViewModel with a full copy of all installed app icons.
    private val viewModel: LauncherViewModel by lazy {
        (application as SkippyApplication).sharedViewModel
    }

    // Prevents the onResume → startActivity(PREPARE) → onResume infinite loop.
    // The lockscreen's moveTaskToBack() causes MainActivity to resume again; without
    // this guard every resume would re-launch the lockscreen and the app would freeze.
    private var prewarmDone = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // If device admin is granted + lockscreen enabled → ensure the lock service is running.
        // This covers the case where the service was stopped and the user re-opens the app.
        maybeStartLockService()

        setContent {
            SkippyTheme {
                SkippyApp(viewModel = viewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (!prewarmDone) {
            maybePreWarmLockScreen()
        }
    }

    override fun onDestroy() {
        // Allow a fresh pre-warm next time the activity is created.
        prewarmDone = false
        super.onDestroy()
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

    private fun maybePreWarmLockScreen() {
        val prefs = viewModel.prefs
        if (!prefs.lockscreenPageEnabled) return
        val dpm   = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = SkippyDeviceAdminReceiver.getComponentName(this)
        if (!dpm.isAdminActive(admin)) return

        // Set the guard BEFORE startActivity so that if onResume() fires again during the
        // task shuffle (lockscreen onResume → moveTaskToBack → MainActivity onResume) we
        // don't re-enter and create an infinite launch loop.
        prewarmDone = true

        runCatching {
            val intent = Intent(this, SkippyLockScreenActivity::class.java).apply {
                putExtra(SkippyLockScreenActivity.EXTRA_MODE, SkippyLockScreenActivity.MODE_PREPARE)
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_NO_ANIMATION
                )
            }
            // Plain startActivity — no makeTaskLaunchBehind which was causing the UI
            // to freeze on many devices by leaving the window manager in a confused state.
            // The lockscreen immediately calls moveTaskToBack(true) in onResume() so
            // there is no visible flash (the black placeholder + FLAG_ACTIVITY_NO_ANIMATION
            // prevent any transition flicker).
            startActivity(intent)
        }.onFailure {
            // If launch failed (e.g. admin not yet granted), allow a retry next time.
            prewarmDone = false
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
