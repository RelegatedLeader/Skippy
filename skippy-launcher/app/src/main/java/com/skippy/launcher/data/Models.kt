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

/** A single entry in the on-screen conversation log. */
data class ChatEntry(
    val role: String,   // "user" or "skippy"
    val text: String,
    val id: String = System.nanoTime().toString(),
)
