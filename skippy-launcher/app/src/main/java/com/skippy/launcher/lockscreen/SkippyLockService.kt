package com.skippy.launcher.lockscreen

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.KeyguardManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.skippy.launcher.MainActivity
import com.skippy.launcher.R

/**
 * Persistent foreground service — watches SCREEN_OFF/ON and drives the lockscreen.
 *
 * Two-phase approach:
 *   SCREEN_OFF → pre-launch SkippyLockScreenActivity in PREPARE mode (warms up silently)
 *   SCREEN_ON  → if locked, escalate to SHOW mode via two methods:
 *                1. Direct startActivity (fast — works when app has a recent visible window)
 *                2. fullScreenIntent notification (guaranteed bypass for Android 12+ bg restrictions)
 */
class SkippyLockService : Service() {

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val prefs = getSharedPreferences("skippy_launcher", MODE_PRIVATE)
            if (!prefs.getBoolean("lockscreen_page_enabled", false)) return

            when (intent.action) {
                Intent.ACTION_SCREEN_OFF -> {
                    // Pre-warm the lockscreen silently while the screen is off.
                    runCatching {
                        startActivity(
                            Intent(context, SkippyLockScreenActivity::class.java).apply {
                                putExtra(SkippyLockScreenActivity.EXTRA_MODE,
                                         SkippyLockScreenActivity.MODE_PREPARE)
                                addFlags(
                                    Intent.FLAG_ACTIVITY_NEW_TASK or
                                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                                    Intent.FLAG_ACTIVITY_NO_ANIMATION
                                )
                            }
                        )
                    }
                }

                Intent.ACTION_SCREEN_ON -> {
                    val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
                    if (!km.isKeyguardLocked) return

                    val showIntent = Intent(context, SkippyLockScreenActivity::class.java).apply {
                        putExtra(SkippyLockScreenActivity.EXTRA_MODE,
                                 SkippyLockScreenActivity.MODE_SHOW)
                        addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                            Intent.FLAG_ACTIVITY_NO_ANIMATION
                        )
                    }

                    // Method 1: direct launch (fastest — wins the race if already pre-warmed)
                    runCatching { startActivity(showIntent) }

                    // Method 2: full-screen notification — guaranteed to fire even when
                    // Android 12+ blocks background activity launches.
                    // The activity cancels this notification immediately in onCreate.
                    fireFullScreenLaunchNotification(showIntent)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        startForeground(NOTIF_ID, buildPersistentNotification())
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        }
        // RECEIVER_NOT_EXPORTED: ACTION_SCREEN_OFF/ON are system-protected broadcasts —
        // they can only come from the OS, so NOT_EXPORTED is both correct and required
        // on Android 14+ (API 34+) to avoid an IllegalArgumentException.
        ContextCompat.registerReceiver(
            this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    // START_REDELIVER_INTENT: if killed, Android re-delivers the last intent on restart.
    // This is more robust than START_STICKY (which delivers a null intent).
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int =
        START_REDELIVER_INTENT

    override fun onDestroy() {
        runCatching { unregisterReceiver(screenReceiver) }
        super.onDestroy()
    }

    /**
     * Called when the user swipes the launcher out of recents.
     * Schedules an alarm 2 s out so the service restarts itself automatically.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val prefs = getSharedPreferences("skippy_launcher", MODE_PRIVATE)
        if (!prefs.getBoolean("lockscreen_page_enabled", false)) return

        val restartPi = PendingIntent.getService(
            this, RESTART_REQUEST_CODE,
            Intent(this, SkippyLockService::class.java),
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE,
        )
        (getSystemService(Context.ALARM_SERVICE) as AlarmManager)
            .set(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                 SystemClock.elapsedRealtime() + 2_000L,
                 restartPi)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── notifications ─────────────────────────────────────────────────────────

    private fun createNotificationChannels() {
        val nm = getSystemService(NotificationManager::class.java)

        // Persistent service notification — minimal, silent
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Skippy Lockscreen", NotificationManager.IMPORTANCE_MIN)
                .apply { description = "Keeps Skippy lockscreen active"; setShowBadge(false) }
        )

        // Trigger channel — HIGH importance required for fullScreenIntent to fire immediately.
        // We disable sound/vibration so it's completely silent.
        nm.createNotificationChannel(
            NotificationChannel(TRIGGER_CHANNEL_ID, "Skippy Lock Trigger", NotificationManager.IMPORTANCE_HIGH)
                .apply {
                    description = "Used to show lockscreen — no sound/vibration"
                    setSound(null, null)
                    enableVibration(false)
                    setShowBadge(false)
                }
        )
    }

    private fun buildPersistentNotification(): Notification {
        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Skippy Lockscreen Active")
            .setContentText("Skippy is your lockscreen 🤖")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(tapIntent)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    /**
     * Posts a HIGH-priority notification with a fullScreenIntent pointing at
     * SkippyLockScreenActivity. On Android 12+ this bypasses the background activity
     * launch restriction — the system fires the intent immediately when posted on a
     * locked screen. The activity cancels this notification as soon as it starts.
     */
    private fun fireFullScreenLaunchNotification(showIntent: Intent) {
        val pi = PendingIntent.getActivity(
            this, TRIGGER_REQUEST_CODE, showIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, TRIGGER_CHANNEL_ID)
            .setContentTitle("Skippy")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)   // pre-grants USE_FULL_SCREEN_INTENT
            .setFullScreenIntent(pi, true)
            .setSilent(true)
            .setAutoCancel(true)
            .setOngoing(false)
            .build()

        getSystemService(NotificationManager::class.java)
            .notify(TRIGGER_NOTIF_ID, notification)
    }

    companion object {
        const val NOTIF_ID             = 9001
        const val TRIGGER_NOTIF_ID     = 9002
        const val CHANNEL_ID           = "skippy_lockscreen"
        const val TRIGGER_CHANNEL_ID   = "skippy_lock_trigger"
        const val TRIGGER_REQUEST_CODE = 42
        const val RESTART_REQUEST_CODE = 43
    }
}
