package com.skippy.launcher.data.prefs

import android.content.Context

class AppPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("skippy_launcher", Context.MODE_PRIVATE)

    var skippyUrl: String
        get() = prefs.getString("skippy_url", "") ?: ""
        set(value) = prefs.edit().putString("skippy_url", value).apply()

    var isSetupDone: Boolean
        get() = prefs.getBoolean("setup_done", false)
        set(value) = prefs.edit().putBoolean("setup_done", value).apply()

    // ── Auth credentials ───────────────────────────────────────────────────
    var username: String
        get() = prefs.getString("auth_username", "") ?: ""
        set(value) = prefs.edit().putString("auth_username", value).apply()

    var password: String
        get() = prefs.getString("auth_password", "") ?: ""
        set(value) = prefs.edit().putString("auth_password", value).apply()

    var accessCode: String
        get() = prefs.getString("auth_access_code", "") ?: ""
        set(value) = prefs.edit().putString("auth_access_code", value).apply()

    /** Raw "skippy_session=<token>" cookie string — sent with every request */
    var sessionCookie: String
        get() = prefs.getString("session_cookie", "") ?: ""
        set(value) = prefs.edit().putString("session_cookie", value).apply()

    val isLoggedIn: Boolean
        get() = sessionCookie.isNotBlank() && skippyUrl.isNotBlank()

    // ── Widget visibility prefs ────────────────────────────────────────────
    var showClockWidget: Boolean
        get() = prefs.getBoolean("widget_clock", true)
        set(v) = prefs.edit().putBoolean("widget_clock", v).apply()

    var showWeatherWidget: Boolean
        get() = prefs.getBoolean("widget_weather", true)
        set(v) = prefs.edit().putBoolean("widget_weather", v).apply()

    var showTodosWidget: Boolean
        get() = prefs.getBoolean("widget_todos", true)
        set(v) = prefs.edit().putBoolean("widget_todos", v).apply()

    var showRemindersWidget: Boolean
        get() = prefs.getBoolean("widget_reminders", true)
        set(v) = prefs.edit().putBoolean("widget_reminders", v).apply()

    var showMemoriesWidget: Boolean
        get() = prefs.getBoolean("widget_memories", true)
        set(v) = prefs.edit().putBoolean("widget_memories", v).apply()

    var showRecentChatWidget: Boolean
        get() = prefs.getBoolean("widget_recent_chat", true)
        set(v) = prefs.edit().putBoolean("widget_recent_chat", v).apply()

    var temperatureUnit: String
        get() = prefs.getString("temp_unit", "fahrenheit") ?: "fahrenheit"
        set(value) = prefs.edit().putString("temp_unit", value).apply()

    var pinnedApps: List<String>
        get() = (prefs.getString("pinned_apps", null) ?: "").split(",").filter { it.isNotBlank() }
        set(value) = prefs.edit().putString("pinned_apps", value.joinToString(",")).apply()

    var speechRate: Float
        get() = prefs.getFloat("speech_rate", 0.90f)
        set(value) = prefs.edit().putFloat("speech_rate", value).apply()

    var speechPitch: Float
        get() = prefs.getFloat("speech_pitch", 0.85f)
        set(value) = prefs.edit().putFloat("speech_pitch", value).apply()

    // New: last active page for the horizontal pager
    var lastActivePage: Int
        get() = prefs.getInt("last_active_page", 1)
        set(value) = prefs.edit().putInt("last_active_page", value).apply()

    // New: voice auto-read responses
    var autoSpeak: Boolean
        get() = prefs.getBoolean("auto_speak", true)
        set(value) = prefs.edit().putBoolean("auto_speak", value).apply()

    // New: show quick stats on home screen
    var showQuickStats: Boolean
        get() = prefs.getBoolean("show_quick_stats", true)
        set(value) = prefs.edit().putBoolean("show_quick_stats", value).apply()

    // New: preferred AI model
    var aiModel: String
        get() = prefs.getString("ai_model", "auto") ?: "auto"
        set(value) = prefs.edit().putString("ai_model", value).apply()

    // New: debate voice auto-read
    var debateAutoRead: Boolean
        get() = prefs.getBoolean("debate_auto_read", false)
        set(value) = prefs.edit().putBoolean("debate_auto_read", value).apply()
}
