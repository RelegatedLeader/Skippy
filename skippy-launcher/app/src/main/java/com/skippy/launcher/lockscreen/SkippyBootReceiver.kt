package com.skippy.launcher.lockscreen

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the SkippyLockService after device reboot so the
 * lockscreen is active immediately — no need to open the app first.
 */
class SkippyBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = context.getSharedPreferences("skippy_launcher", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("lockscreen_page_enabled", false)) return
        val dpm   = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = SkippyDeviceAdminReceiver.getComponentName(context)
        if (dpm.isAdminActive(admin)) {
            context.startForegroundService(Intent(context, SkippyLockService::class.java))
        }
    }
}

