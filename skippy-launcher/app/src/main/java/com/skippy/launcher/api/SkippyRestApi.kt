package com.skippy.launcher.api

import com.skippy.launcher.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object SkippyRestApi {

    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json".toMediaType()

    /** Thread-safe session cookie holder — set after successful login */
    @Volatile var sessionCookie: String = ""

    // ── Auth ───────────────────────────────────────────────────────────────────

    /**
     * Login to the Skippy backend.
     * Returns the raw session cookie string on success, null on failure.
     */
    suspend fun login(baseUrl: String, username: String, password: String, accessCode: String): String? =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = JSONObject()
                    .put("username", username)
                    .put("password", password)
                    .put("accessCode", accessCode)
                val req = Request.Builder()
                    .url("$baseUrl/api/auth/login")
                    .post(body.toString().toRequestBody(JSON))
                    .build()
                val res = client.newCall(req).execute()
                if (!res.isSuccessful) return@runCatching null
                // Extract Set-Cookie header
                val setCookie = res.headers("Set-Cookie")
                    .firstOrNull { it.startsWith("skippy_session=") }
                    ?: return@runCatching null
                // Parse just "skippy_session=<token>" without attributes
                val cookieValue = setCookie.split(";").first().trim()
                sessionCookie = cookieValue
                cookieValue
            }.getOrNull()
        }

    /** Check auth status — returns true if the stored cookie is valid */
    suspend fun checkAuthStatus(baseUrl: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder()
                .url("$baseUrl/api/auth/status")
                .get()
                .addHeader("Cookie", sessionCookie)
                .build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@runCatching false
            val body = res.body?.string() ?: return@runCatching false
            JSONObject(body).optBoolean("authenticated", false)
        }.getOrDefault(false)
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private suspend fun get(url: String): JSONObject? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(url).get()
                .addHeader("Cookie", sessionCookie)
                .build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@runCatching null
            val body = res.body?.string() ?: return@runCatching null
            if (body.trimStart().startsWith("[")) JSONObject().put("_array", JSONArray(body))
            else JSONObject(body)
        }.getOrNull()
    }

    private suspend fun getArray(url: String): JSONArray? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(url).get()
                .addHeader("Cookie", sessionCookie)
                .build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@runCatching null
            val body = res.body?.string() ?: return@runCatching null
            if (body.trimStart().startsWith("[")) JSONArray(body)
            else JSONObject(body).optJSONArray("_array")
        }.getOrNull()
    }

    private suspend fun post(url: String, body: JSONObject): JSONObject? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(url).post(body.toString().toRequestBody(JSON))
                .addHeader("Cookie", sessionCookie)
                .build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@runCatching null
            val b = res.body?.string() ?: return@runCatching null
            if (b.trimStart().startsWith("{")) JSONObject(b) else null
        }.getOrNull()
    }

    private suspend fun patch(url: String, body: JSONObject): JSONObject? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(url).patch(body.toString().toRequestBody(JSON))
                .addHeader("Cookie", sessionCookie)
                .build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@runCatching null
            val b = res.body?.string() ?: return@runCatching null
            if (b.trimStart().startsWith("{")) JSONObject(b) else null
        }.getOrNull()
    }

    private suspend fun delete(url: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(url).delete()
                .addHeader("Cookie", sessionCookie)
                .build()
            client.newCall(req).execute().isSuccessful
        }.getOrDefault(false)
    }

    private fun JSONArray.toStringList(): List<String> =
        (0 until length()).mapNotNull { optString(it).takeIf { s -> s.isNotEmpty() } }

    // ── Memories ───────────────────────────────────────────────────────────────

    suspend fun getMemories(baseUrl: String): List<Memory> {
        val obj = get("$baseUrl/api/memories") ?: return emptyList()
        val arr = obj.optJSONArray("memories") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val m = arr.getJSONObject(i)
                val rawTags = m.opt("tags")
                val tags: List<String> = when (rawTags) {
                    is JSONArray -> rawTags.toStringList()
                    is String -> if (rawTags.startsWith("[")) JSONArray(rawTags).toStringList() else emptyList()
                    else -> emptyList()
                }
                Memory(
                    id = m.getString("id"),
                    category = m.optString("category", "general"),
                    content = m.optString("content", ""),
                    importance = m.optInt("importance", 5),
                    confidence = m.optDouble("confidence", 0.8).toFloat(),
                    tags = tags,
                    healthScore = m.optDouble("healthScore", 0.5).toFloat(),
                    emotionalValence = m.opt("emotionalValence")?.let { if (it == JSONObject.NULL) null else m.optDouble("emotionalValence").toFloat() },
                    needsReview = m.optBoolean("needsReview", false),
                    createdAt = m.optString("createdAt", ""),
                    updatedAt = m.optString("updatedAt", ""),
                )
            }.getOrNull()
        }
    }

    suspend fun deleteMemory(baseUrl: String, id: String): Boolean =
        delete("$baseUrl/api/memories?id=$id")

    // ── Todos ──────────────────────────────────────────────────────────────────

    suspend fun getTodos(baseUrl: String): List<TodoItem> {
        val arr = getArray("$baseUrl/api/todos") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val t = arr.getJSONObject(i)
                val rawTags = t.opt("tags")
                val tags: List<String> = when (rawTags) {
                    is JSONArray -> rawTags.toStringList()
                    is String -> if (rawTags.startsWith("[")) JSONArray(rawTags).toStringList() else emptyList()
                    else -> emptyList()
                }
                TodoItem(
                    id = t.getString("id"),
                    content = t.optString("content", ""),
                    isDone = t.optBoolean("isDone", false),
                    priority = t.optString("priority", "normal"),
                    dueDate = t.optString("dueDate").takeIf { it.isNotEmpty() && it != "null" },
                    tags = tags,
                    createdAt = t.optString("createdAt", ""),
                )
            }.getOrNull()
        }
    }

    suspend fun toggleTodo(baseUrl: String, id: String, isDone: Boolean): TodoItem? {
        val obj = patch("$baseUrl/api/todos/$id", JSONObject().put("isDone", isDone)) ?: return null
        return runCatching {
            val rawTags = obj.opt("tags")
            val tags: List<String> = when (rawTags) {
                is JSONArray -> rawTags.toStringList()
                is String -> if (rawTags.startsWith("[")) JSONArray(rawTags).toStringList() else emptyList()
                else -> emptyList()
            }
            TodoItem(
                id = obj.getString("id"),
                content = obj.optString("content", ""),
                isDone = obj.optBoolean("isDone", false),
                priority = obj.optString("priority", "normal"),
                dueDate = obj.optString("dueDate").takeIf { it.isNotEmpty() && it != "null" },
                tags = tags,
                createdAt = obj.optString("createdAt", ""),
            )
        }.getOrNull()
    }

    // ── Reminders ──────────────────────────────────────────────────────────────

    suspend fun getReminders(baseUrl: String): List<Reminder> {
        val arr = getArray("$baseUrl/api/reminders") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val r = arr.getJSONObject(i)
                Reminder(
                    id = r.getString("id"),
                    content = r.optString("content", ""),
                    dueDate = r.optString("dueDate").takeIf { it.isNotEmpty() && it != "null" },
                    timeframeLabel = r.optString("timeframeLabel").takeIf { it.isNotEmpty() && it != "null" },
                    isDone = r.optBoolean("isDone", false),
                    createdAt = r.optString("createdAt", ""),
                )
            }.getOrNull()
        }
    }

    suspend fun toggleReminder(baseUrl: String, id: String, isDone: Boolean): Reminder? {
        val obj = patch("$baseUrl/api/reminders/$id", JSONObject().put("isDone", isDone)) ?: return null
        return runCatching {
            Reminder(
                id = obj.getString("id"),
                content = obj.optString("content", ""),
                dueDate = obj.optString("dueDate").takeIf { it.isNotEmpty() && it != "null" },
                timeframeLabel = obj.optString("timeframeLabel").takeIf { it.isNotEmpty() && it != "null" },
                isDone = obj.optBoolean("isDone", false),
                createdAt = obj.optString("createdAt", ""),
            )
        }.getOrNull()
    }

    suspend fun createReminder(baseUrl: String, content: String, dueDate: String?): Reminder? {
        val body = JSONObject().put("content", content)
        if (!dueDate.isNullOrBlank()) body.put("dueDate", dueDate)
        val obj = post("$baseUrl/api/reminders", body) ?: return null
        return runCatching {
            Reminder(
                id = obj.getString("id"),
                content = obj.optString("content", content),
                dueDate = obj.optString("dueDate").takeIf { it.isNotEmpty() && it != "null" },
                timeframeLabel = obj.optString("timeframeLabel").takeIf { it.isNotEmpty() && it != "null" },
                isDone = false,
                createdAt = obj.optString("createdAt", ""),
            )
        }.getOrNull()
    }

    suspend fun deleteReminder(baseUrl: String, id: String): Boolean =
        delete("$baseUrl/api/reminders/$id")

    // ── Notes ──────────────────────────────────────────────────────────────────

    suspend fun getNotes(baseUrl: String): List<Note> {
        val arr = getArray("$baseUrl/api/notes") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val n = arr.getJSONObject(i)
                val rawTags = n.opt("tags")
                val tags: List<String> = when (rawTags) {
                    is JSONArray -> rawTags.toStringList()
                    is String -> if (rawTags.startsWith("[")) JSONArray(rawTags).toStringList() else emptyList()
                    else -> emptyList()
                }
                Note(
                    id = n.getString("id"),
                    title = n.optString("title", "Untitled"),
                    content = n.optString("content", ""),
                    isPinned = n.optBoolean("isPinned", false),
                    tags = tags,
                    wordCount = n.optInt("wordCount", 0),
                    updatedAt = n.optString("updatedAt", ""),
                    createdAt = n.optString("createdAt", ""),
                )
            }.getOrNull()
        }
    }

    suspend fun createNote(baseUrl: String, title: String, content: String): Note? {
        val obj = post("$baseUrl/api/notes", JSONObject().put("title", title).put("content", content)) ?: return null
        return runCatching {
            Note(
                id = obj.getString("id"),
                title = obj.optString("title", title),
                content = obj.optString("content", content),
                isPinned = false,
                tags = emptyList(),
                wordCount = content.split(" ").size,
                updatedAt = obj.optString("updatedAt", ""),
                createdAt = obj.optString("createdAt", ""),
            )
        }.getOrNull()
    }

    suspend fun deleteNote(baseUrl: String, id: String): Boolean =
        delete("$baseUrl/api/notes/$id")

    suspend fun updateNote(baseUrl: String, id: String, title: String, content: String): Note? {
        val obj = patch("$baseUrl/api/notes/$id", JSONObject().put("title", title).put("content", content)) ?: return null
        return runCatching {
            val rawTags = obj.opt("tags")
            val tags: List<String> = when (rawTags) {
                is JSONArray -> rawTags.toStringList()
                is String -> if (rawTags.startsWith("[")) JSONArray(rawTags).toStringList() else emptyList()
                else -> emptyList()
            }
            Note(
                id = obj.optString("id", id),
                title = obj.optString("title", title),
                content = obj.optString("content", content),
                isPinned = obj.optBoolean("isPinned", false),
                tags = tags,
                wordCount = obj.optInt("wordCount", content.split(" ").size),
                updatedAt = obj.optString("updatedAt", ""),
                createdAt = obj.optString("createdAt", ""),
            )
        }.getOrNull()
    }

    // ── Summaries ──────────────────────────────────────────────────────────────

    suspend fun getSummaries(baseUrl: String): List<Summary> {
        val arr = getArray("$baseUrl/api/summaries") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val s = arr.getJSONObject(i)
                Summary(
                    id = s.getString("id"),
                    period = s.optString("period", ""),
                    title = s.optString("title", ""),
                    content = s.optString("content", ""),
                    noteCount = s.optInt("noteCount", 0),
                    createdAt = s.optString("createdAt", ""),
                )
            }.getOrNull()
        }
    }

    // ── Debates ────────────────────────────────────────────────────────────────

    suspend fun getDebates(baseUrl: String): List<Debate> {
        val arr = getArray("$baseUrl/api/debates") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val d = arr.getJSONObject(i)
                Debate(
                    id = d.getString("id"),
                    topic = d.optString("topic", ""),
                    userStance = d.optString("userStance").takeIf { it.isNotEmpty() && it != "null" },
                    status = d.optString("status", "active"),
                    currentRound = d.optInt("currentRound", 0),
                    maxRounds = d.optInt("maxRounds", 5),
                    winner = d.optString("winner").takeIf { it.isNotEmpty() && it != "null" },
                    createdAt = d.optString("createdAt", ""),
                )
            }.getOrNull()
        }
    }

    suspend fun createDebate(baseUrl: String, topic: String, stance: String?): Debate? {
        val body = JSONObject().put("topic", topic)
        if (!stance.isNullOrBlank()) body.put("userStance", stance)
        val obj = post("$baseUrl/api/debates", body) ?: return null
        return runCatching {
            Debate(
                id = obj.getString("id"),
                topic = obj.optString("topic", topic),
                userStance = stance,
                status = "active",
                currentRound = 0,
                maxRounds = obj.optInt("maxRounds", 5),
                winner = null,
                createdAt = obj.optString("createdAt", ""),
            )
        }.getOrNull()
    }

    suspend fun getDebateDetail(baseUrl: String, id: String): DebateDetail? {
        val obj = get("$baseUrl/api/debates/$id") ?: return null
        return runCatching {
            val d = obj.optJSONObject("debate") ?: obj
            val debate = Debate(
                id = d.optString("id", id),
                topic = d.optString("topic", ""),
                userStance = d.optString("userStance").takeIf { it.isNotEmpty() && it != "null" },
                status = d.optString("status", "active"),
                currentRound = d.optInt("currentRound", 0),
                maxRounds = d.optInt("maxRounds", 5),
                winner = d.optString("winner").takeIf { it.isNotEmpty() && it != "null" },
                createdAt = d.optString("createdAt", ""),
            )
            val rawRounds = obj.optJSONArray("rounds") ?: JSONArray()
            val rounds = (0 until rawRounds.length()).mapNotNull { i ->
                runCatching {
                    val r = rawRounds.getJSONObject(i)
                    DebateRound(
                        id = r.getString("id"),
                        roundNumber = r.optInt("roundNumber", i + 1),
                        userArgument = r.optString("userArgument", ""),
                        aiArgument = r.optString("aiArgument", ""),
                        userScore = r.optInt("userScore").takeIf { r.has("userScore") },
                        aiScore = r.optInt("aiScore").takeIf { r.has("aiScore") },
                    )
                }.getOrNull()
            }
            DebateDetail(
                debate = debate,
                rounds = rounds,
                conclusion = obj.optString("conclusion").takeIf { it.isNotEmpty() && it != "null" },
            )
        }.getOrNull()
    }

    suspend fun submitDebateRound(baseUrl: String, debateId: String, argument: String): DebateDetail? {
        val obj = post("$baseUrl/api/debates/$debateId/round", JSONObject().put("argument", argument))
            ?: return null
        return getDebateDetail(baseUrl, debateId)
    }

    // ── Conversations ──────────────────────────────────────────────────────────

    suspend fun getConversations(baseUrl: String): List<ConversationSummary> {
        val arr = getArray("$baseUrl/api/conversations") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val c = arr.getJSONObject(i)
                ConversationSummary(
                    id = c.getString("id"),
                    title = c.optString("title").takeIf { it.isNotEmpty() && it != "null" },
                    messageCount = c.optInt("messageCount", 0),
                    lastMessage = c.optString("lastMessage").takeIf { it.isNotEmpty() && it != "null" },
                    updatedAt = c.optString("updatedAt", ""),
                    createdAt = c.optString("createdAt", ""),
                )
            }.getOrNull()
        }
    }

    suspend fun getConversationMessages(baseUrl: String, id: String): List<ChatMessage> {
        val obj = get("$baseUrl/api/conversations/$id") ?: return emptyList()
        val arr = obj.optJSONArray("messages") ?: obj.optJSONArray("history") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val m = arr.getJSONObject(i)
                val role = m.optString("role", "user")
                val content = m.optString("content", "")
                if (content.isBlank()) null
                else ChatMessage(role = role, content = content)
            }.getOrNull()
        }
    }

    // ── Learn ──────────────────────────────────────────────────────────────────

    suspend fun getLearnStats(baseUrl: String): LearnStatsResponse? {
        val obj = get("$baseUrl/api/learn") ?: return null
        return runCatching {
            val p = obj.optJSONObject("progress")
            LearnStatsResponse(
                progress = p?.let {
                    LangStats(
                        totalXP = it.optInt("totalXP", 0),
                        wordsLearned = it.optInt("wordsLearned", 0),
                        wordsMastered = it.optInt("wordsMastered", 0),
                        sessionsCompleted = it.optInt("sessionsCompleted", 0),
                        currentStreak = it.optInt("currentStreak", 0),
                        longestStreak = it.optInt("longestStreak", 0),
                    )
                },
                totalWords = obj.optInt("totalWords", 0),
                learnedWords = obj.optInt("learnedWords", 0),
                masteredWords = obj.optInt("masteredWords", 0),
            )
        }.getOrNull()
    }

    suspend fun getLearnSession(baseUrl: String, mode: String = "adaptive", count: Int = 5): List<LearnWord> {
        val body = JSONObject().put("mode", mode).put("count", count)
        val obj = post("$baseUrl/api/learn/session", body) ?: return emptyList()
        val arr = obj.optJSONArray("words") ?: obj.optJSONArray("items") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val w = arr.getJSONObject(i)
                val distArr = w.optJSONArray("distractors") ?: JSONArray()
                LearnWord(
                    id = w.optString("id", ""),
                    simplified = w.optString("simplified", ""),
                    pinyin = w.optString("pinyin", ""),
                    meaning = w.optString("meaning", ""),
                    hsk = w.optInt("hsk", 1),
                    pos = w.optString("pos", ""),
                    example = w.optString("example", ""),
                    exMeaning = w.optString("exMeaning", ""),
                    exerciseType = w.optString("exerciseType", "meaning_mc"),
                    distractors = distArr.toStringList(),
                )
            }.getOrNull()
        }
    }

    suspend fun submitLearnAnswer(
        baseUrl: String,
        wordId: String,
        correct: Boolean,
        exerciseType: String,
        quality: Int,
    ): Boolean {
        val body = JSONObject()
            .put("quality", quality)
            .put("correct", correct)
            .put("exerciseType", exerciseType)
        return post("$baseUrl/api/learn/words/$wordId", body) != null
    }

    // ── User Stats ─────────────────────────────────────────────────────────────

    suspend fun getUserStats(baseUrl: String): UserStats? {
        val obj = get("$baseUrl/api/user-stats") ?: return null
        return runCatching {
            UserStats(
                totalMessages = obj.optInt("totalMessages", 0),
                totalMemories = obj.optInt("totalMemories", 0),
                totalNotes = obj.optInt("totalNotes", 0),
                totalTodos = obj.optInt("totalTodos", 0),
                pendingReminders = obj.optInt("pendingReminders", 0),
                currentDebates = obj.optInt("currentDebates", 0),
            )
        }.getOrNull()
    }
}

