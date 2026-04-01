package com.skippy.launcher.lockscreen

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.skippy.launcher.MainActivity
import com.skippy.launcher.R

/**
 * No-op foreground service stub.
 *
 * The SCREEN_ON/OFF broadcast handling was removed because launching a
 * FLAG_SHOW_WHEN_LOCKED activity during the screen-off/on transition
 * caused the Pixel lockscreen to appear on top of Skippy's UI, breaking
 * the pager and crashing the launcher.
 *
 * All lockscreen logic now lives in LockScreenPage (in-app Compose overlay).
 */
class SkippyLockService : Service() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Skippy", NotificationManager.IMPORTANCE_MIN)
                .apply { setShowBadge(false) }
        )
    }

    private fun buildNotification(): Notification {
        val tapIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Skippy").setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(tapIntent).setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true).setSilent(true).build()
    }

    companion object {
        const val NOTIF_ID           = 9001
        const val CHANNEL_ID         = "skippy_lockscreen"
        const val TRIGGER_NOTIF_ID   = 9002
        const val TRIGGER_CHANNEL_ID = "skippy_lock_trigger"
    }
}
