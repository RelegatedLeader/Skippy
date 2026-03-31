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
