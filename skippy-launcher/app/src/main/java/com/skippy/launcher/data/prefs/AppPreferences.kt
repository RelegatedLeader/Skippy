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

    // Package names of pinned dock apps (ordered)
    var pinnedApps: List<String>
        get() = (prefs.getString("pinned_apps", null) ?: "").split(",").filter { it.isNotBlank() }
        set(value) = prefs.edit().putString("pinned_apps", value.joinToString(",")).apply()

    // TTS voice tuning  (deep male voice defaults)
    var speechRate: Float
        get() = prefs.getFloat("speech_rate", 0.90f)
        set(value) = prefs.edit().putFloat("speech_rate", value).apply()

    var speechPitch: Float
        get() = prefs.getFloat("speech_pitch", 0.85f)
        set(value) = prefs.edit().putFloat("speech_pitch", value).apply()
}
