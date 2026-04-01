package com.skippy.launcher.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.skippy.launcher.MainActivity
import com.skippy.launcher.R
import com.skippy.launcher.data.prefs.AppPreferences

/**
 * Skippy home-screen widget.
 *
 * Shows the most recent AI response snippet and two action buttons:
 *   • "💬 New Chat"   → opens Skippy on the Chat page
 *   • "🏠 Home"       → opens Skippy on the Home page
 *
 * The widget auto-refreshes every 30 minutes (see skippy_widget_info.xml).
 * Call [updateAll] statically whenever a new AI response arrives.
 */
class SkippyWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_NEW_CHAT = "com.skippy.launcher.widget.ACTION_NEW_CHAT"
        const val ACTION_OPEN_HOME = "com.skippy.launcher.widget.ACTION_OPEN_HOME"
        const val EXTRA_PAGE = "skippy_page"

        /** Call this from anywhere (e.g., ViewModel) to push a fresh response to the widget. */
        fun updateAll(context: Context) {
            val man = AppWidgetManager.getInstance(context)
            val ids = man.getAppWidgetIds(ComponentName(context, SkippyWidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                val intent = Intent(context, SkippyWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                context.sendBroadcast(intent)
            }
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        val prefs = AppPreferences(context)
        val lastResponse = prefs.lastAiResponse.ifBlank { "Ask Skippy anything…" }

        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.skippy_widget)

            // Response text
            val snippet = lastResponse
                .replace(Regex("""— (Grok|Claude).*$"""), "")
                .trim()
                .take(160)
            views.setTextViewText(R.id.widget_response, snippet.ifBlank { "Tap below to start chatting with Skippy!" })

            // "New Chat" button — opens MainActivity, navigates to Chat page
            val newChatIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                action = ACTION_NEW_CHAT
                putExtra(EXTRA_PAGE, 0) // PAGE_CHAT = 0
            }
            val newChatPending = PendingIntent.getActivity(
                context, 1, newChatIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_btn_new_chat, newChatPending)

            // "Home" button — opens MainActivity on Home page
            val homeIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                action = ACTION_OPEN_HOME
                putExtra(EXTRA_PAGE, 1) // PAGE_HOME = 1
            }
            val homePending = PendingIntent.getActivity(
                context, 2, homeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_btn_home, homePending)

            // Root click → also open app
            views.setOnClickPendingIntent(R.id.widget_root, homePending)

            appWidgetManager.updateAppWidget(id, views)
        }
    }
}

