package com.skippy.launcher.lockscreen

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * Fully retired stub — stops itself immediately on start.
 *
 * Previously this was a foreground service that watched SCREEN_ON/OFF and launched
 * SkippyLockScreenActivity. That caused:
 *   - Android protecting the process from being killed (blocking IDE "Run")
 *   - Pixel system lockscreen bleed-through and launcher crashes
 *
 * All lockscreen logic now lives in LockScreenPage (in-app Compose overlay).
 * The class is kept so the manifest entry compiles; it does nothing.
 */
class SkippyLockService : Service() {
    override fun onCreate() {
        super.onCreate()
        stopSelf() // stop immediately — never become a foreground service
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val NOTIF_ID           = 9001
        const val CHANNEL_ID         = "skippy_lockscreen"
        const val TRIGGER_NOTIF_ID   = 9002
        const val TRIGGER_CHANNEL_ID = "skippy_lock_trigger"
    }
}
