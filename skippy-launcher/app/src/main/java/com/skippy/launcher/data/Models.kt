package com.skippy.launcher.data

import android.graphics.drawable.Drawable

data class AppInfo(
    val name: String,
    val packageName: String,
    val icon: Drawable,
)

data class WeatherData(
    val temperature: Double,
    val unit: String = "F",
    val condition: String,
    val windSpeed: Double,
    val city: String = "",
    val emoji: String,
)

data class ChatMessage(
    val role: String,
    val content: String,
)

data class ChatEntry(
    val role: String,
    val text: String,
    val id: String = System.nanoTime().toString(),
)

// ── Skippy Feature Models ──────────────────────────────────────────────────

data class Memory(
    val id: String,
    val category: String,
    val content: String,
    val importance: Int,
    val confidence: Float,
    val tags: List<String>,
    val healthScore: Float,
    val emotionalValence: Float?,
    val needsReview: Boolean,
    val createdAt: String,
    val updatedAt: String,
)

data class TodoItem(
    val id: String,
    val content: String,
    val isDone: Boolean,
    val priority: String,
    val dueDate: String?,
    val tags: List<String>,
    val createdAt: String,
)

data class Reminder(
    val id: String,
    val content: String,
    val dueDate: String?,
    val timeframeLabel: String?,
    val isDone: Boolean,
    val createdAt: String,
)

data class Note(
    val id: String,
    val title: String,
    val content: String,
    val isPinned: Boolean,
    val tags: List<String>,
    val wordCount: Int,
    val updatedAt: String,
    val createdAt: String,
)

data class Summary(
    val id: String,
    val period: String,
    val title: String,
    val content: String,
    val noteCount: Int,
    val createdAt: String,
)

data class Debate(
    val id: String,
    val topic: String,
    val userStance: String?,
    val status: String,
    val currentRound: Int,
    val maxRounds: Int,
    val winner: String?,
    val createdAt: String,
)

data class DebateRound(
    val id: String,
    val roundNumber: Int,
    val userArgument: String,
    val aiArgument: String,
    val userScore: Int?,
    val aiScore: Int?,
)

data class DebateDetail(
    val debate: Debate,
    val rounds: List<DebateRound>,
    val conclusion: String?,
)

data class ConversationSummary(
    val id: String,
    val title: String?,
    val messageCount: Int,
    val lastMessage: String?,
    val updatedAt: String,
    val createdAt: String,
)

data class LearnWord(
    val id: String,
    val simplified: String,
    val pinyin: String,
    val meaning: String,
    val hsk: Int,
    val pos: String,
    val example: String,
    val exMeaning: String,
    val exerciseType: String,
    val distractors: List<String>,
)

data class LangStats(
    val totalXP: Int,
    val wordsLearned: Int,
    val wordsMastered: Int,
    val sessionsCompleted: Int,
    val currentStreak: Int,
    val longestStreak: Int,
)

data class LearnStatsResponse(
    val progress: LangStats?,
    val totalWords: Int,
    val learnedWords: Int,
    val masteredWords: Int,
)

data class UserStats(
    val totalMessages: Int,
    val totalMemories: Int,
    val totalNotes: Int,
    val totalTodos: Int,
    val pendingReminders: Int,
    val currentDebates: Int,
)
