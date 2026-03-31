package com.skippy.launcher.data

import android.graphics.drawable.Drawable

data class AppInfo(
    val name: String,
    val packageName: String,
    val icon: Drawable,
)

data class WeatherData(
    val temperature: Double,
    val unit: String = "°F",
    val condition: String,
    val windSpeed: Double,
    val city: String = "",
    val emoji: String,
)

data class ChatMessage(
    val role: String,     // "user" or "assistant"
    val content: String,
)
