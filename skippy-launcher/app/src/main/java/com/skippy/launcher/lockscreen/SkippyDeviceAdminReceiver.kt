package com.skippy.launcher.lockscreen

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Device Admin receiver — required to call DevicePolicyManager.setKeyguardDisabled().
 * The user must grant Device Admin permission once (from Settings) before Skippy can
 * replace the system lockscreen.
 */
class SkippyDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        // Called when the user grants device-admin rights.
        // Keyguard will be disabled by the settings screen after this returns.
    }

    override fun onDisabled(context: Context, intent: Intent) {
        // Called when device admin is revoked — system keyguard is automatically restored.
        // Stop the lock service so our lockscreen no longer appears.
        runCatching {
            context.stopService(
                Intent().apply {
                    setClassName(context.packageName, "${ context.packageName }.lockscreen.SkippyLockService")
                }
            )
        }
    }

    companion object {
        @JvmStatic
        fun getComponentName(context: Context): ComponentName =
            ComponentName(context, SkippyDeviceAdminReceiver::class.java)
    }
}



