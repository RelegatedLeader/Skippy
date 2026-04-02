package com.skippy.launcher.api

import com.skippy.launcher.data.ChatMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Grok API (xAI) — OpenAI-compatible chat completions with streaming.
 *
 * Grok and Claude are BOTH "Skippy" — two engines of the same AI assistant.
 * • Grok  → real-time web search, live news, current events, world knowledge.
 * • Claude → deep reasoning, empathy, personal task management via Skippy backend.
 *
 * When Grok is the active model, it can ALSO manage personal tasks (todos, reminders,
 * notes, memories) by embedding a SKIPPY_ACTIONS block in its response.  The launcher
 * parses those blocks and calls the Skippy REST API directly — so the user experience
 * is seamless regardless of which engine is active.
 *
 * Endpoint: https://api.x.ai/v1/chat/completions
 * Primary model : grok-3       (live-search enabled)
 * Fallback model: grok-3-mini  (if grok-3 returns 410/404)
 */
object GrokApi {

    private const val BASE_URL   = "https://api.x.ai/v1"
    private const val MODEL      = "grok-3"
    private const val MODEL_MINI = "grok-3-mini"

    /**
     * Marker used to embed structured actions inside a Grok response.
     * Format (always on its own line at the very end of the response):
     *   SKIPPY_ACTIONS:[{"type":"todo","content":"...","priority":"normal"},...]
     *
     * Supported action types:
     *   todo     → {"type":"todo","content":"...","priority":"normal|high|urgent"}
     *   reminder → {"type":"reminder","content":"...","dueDate":"YYYY-MM-DD or null"}
     *   note     → {"type":"note","title":"...","content":"..."}
     *   memory   → {"type":"memory","content":"...","category":"...","tags":["..."],"importance":7}
     */
    const val ACTIONS_MARKER = "SKIPPY_ACTIONS:"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json".toMediaType()

    // ── Emotional / deep-reasoning patterns → always route to Claude ─────────────
    val EMOTIONAL_PATTERNS = listOf(
        Regex("""(?i)\b(i feel|i'm feeling|i am feeling|feeling (sad|happy|anxious|depressed|lonely|excited|scared|angry|overwhelmed|stressed|grateful|hopeful|confused|lost|empty|numb|hurt|frustrated|exhausted|burned out|burnt out))\b"""),
        Regex("""(?i)\b(i feel like|i feel (as if|that)|makes me feel|it feels like)\b"""),
        Regex("""(?i)\b(why do i|why am i|why can't i|what's wrong with me|am i (ok|okay|normal|weird|broken))\b"""),
        Regex("""(?i)\b(mental health|therapy|therapist|anxiety|depression|panic attack|self.esteem|self.worth|confidence|insecurity|trauma|grief|loss|heartbreak|breakup|divorce)\b"""),
        Regex("""(?i)\b(relationship|friendship|family|parents|mom|dad|sister|brother|boyfriend|girlfriend|partner|spouse|marriage|dating)\s+(problem|issue|advice|help|trouble|struggle)\b"""),
        Regex("""(?i)\b(i need (advice|help|someone to talk to|support|guidance)|can you help me (understand|figure out|process)|talk me through)\b"""),
        Regex("""(?i)\b(what should i do|what would you do|what do you think i should|how do i deal with|how do i cope|how do i handle)\b"""),
        Regex("""(?i)\b(life advice|personal growth|self improvement|motivation|purpose|meaning of life|philosophy of life|existential|spiritual)\b"""),
        Regex("""(?i)\b(i'm (going through|struggling with|dealing with|facing)|i've been (feeling|thinking|struggling))\b"""),
        Regex("""(?i)\b(help me (think|understand|process|decide|figure out)|let('?s| us) (think|explore|discuss|reason))\b"""),
        Regex("""(?i)\b(argue|debate|logic|critical thinking|ethics|morality|right or wrong|good vs evil|pros and cons|analyze|analyse)\b"""),
    )

    // ── Personal task commands — Grok CAN handle these via SKIPPY_ACTIONS ────────
    // In auto-routing mode these still go to Claude (native backend support).
    // When Grok is forced or sticky, Grok handles them itself via action blocks.
    val PERSONAL_TASK_PATTERNS = listOf(
        Regex("""(?i)^(add|create|make|set a?|remind me|schedule|save|note down|take a? note|remember this|store this)\b"""),
        Regex("""(?i)\b(my todo|my task|my reminder|my note|my memory|my schedule|my calendar)\b"""),
        Regex("""(?i)^(remind me to|set a? reminder|add a? (todo|task|reminder|note))\b"""),
        Regex("""(?i)\b(don'?t forget|save this|remember that|make a note|write this down)\b"""),
        Regex("""(?i)^(what (do i|should i|can i|are my|is my)|show me my|list my)\s+(todo|task|remind|note|memor|schedule)\b"""),
        Regex("""(?i)\b(clear chat|start new chat|new conversation)\b"""),
    )

    // ── Patterns that Grok handles (real-time / world knowledge) ─────────────────
    val REALTIME_PATTERNS = listOf(
        Regex("""(?i)\b(news|latest news|breaking news|today'?s news|what'?s happening|current event|world event)\b"""),
        Regex("""(?i)\b(what happened|what is happening|whats going on|what'?s going on|what'?s new)\b"""),
        Regex("""(?i)\b(stock|stocks|market|nasdaq|dow|s&p 500|nyse|crypto|bitcoin|btc|ethereum|eth|price of|trading|hedge fund|ipo)\b"""),
        Regex("""(?i)\b(weather|temperature outside|forecast|rain today|snow today|humidity|feels like outside)\b"""),
        Regex("""(?i)\b(score|scores|game result|who won|nfl|nba|mlb|nhl|premier league|la liga|bundesliga|serie a|champions league|world cup|olympics|match|tournament|standings|playoffs)\b"""),
        Regex("""(?i)\b(election|elections|president|prime minister|congress|senate|parliament|vote|poll|democrat|republican|political party|government)\b"""),
        Regex("""(?i)\b(earthquake|hurricane|typhoon|tornado|flood|wildfire|disaster|crisis|war|invasion|conflict|attack|terror|shooting|bombing|explosion|protest|riot)\b"""),
        Regex("""(?i)\b(still alive|passed away|died|was arrested|was convicted|was released|got elected|just announced|just launched|just resigned|recently|was fired)\b"""),
        Regex("""(?i)\b(right now|at the moment|currently|today|this week|this month|this year|in 2024|in 2025|in 2026|as of)\b"""),
        Regex("""(?i)\b(who is|who are|who was|who were|what is|what are|what was|what were|where is|where are)\s+.{3,}"""),
        Regex("""(?i)\b(tell me about|can you explain|what do you know about|describe|history of|background on)\b"""),
        Regex("""(?i)\b(trending|viral|going viral|social media|twitter|tiktok|reddit|instagram|youtube)\b"""),
        Regex("""(?i)\b(apple|google|microsoft|meta|amazon|tesla|spacex|openai|anthropic|nvidia|samsung|launched|release date|new model|new version|update)\b"""),
        Regex("""(?i)\b(ukraine|russia|china|nato|middle east|gaza|israel|iran|north korea|taiwan|climate change|pandemic|covid|inflation|interest rate)\b"""),
        Regex("""(?i)\b(elon musk|donald trump|joe biden|taylor swift|beyoncé|kanye|kardashian|lebron|messi|ronaldo|keanu|celebrity)\b"""),
        Regex("""(?i)^(what|who|where|when|why|how)\s+(is|are|was|were|did|does|do|has|have|will|would|could|can)\s+.{5,}"""),
        Regex("""(?i)^(explain|describe|tell me|give me|show me)\s+.{8,}"""),
        Regex("""(?i)\b(latest|recent|new|current|updated?)\s+(info|information|news|update|development|event|data|stats)\b"""),
    )

    fun isPersonalTaskCommand(text: String): Boolean =
        PERSONAL_TASK_PATTERNS.any { it.containsMatchIn(text) }

    fun isEmotionalQuery(text: String): Boolean =
        EMOTIONAL_PATTERNS.any { it.containsMatchIn(text) }

    /**
     * Returns true if query needs Grok's real-time search capability.
     * In auto-routing: personal task commands go to Claude (native backend integration).
     */
    fun isRealTimeQuery(text: String): Boolean {
        if (isPersonalTaskCommand(text)) return false
        if (isEmotionalQuery(text)) return false
        return REALTIME_PATTERNS.any { it.containsMatchIn(text) }
    }

    fun shouldContinueWithGrok(text: String, conversationUsedGrok: Boolean): Boolean {
        if (!conversationUsedGrok) return false
        if (isPersonalTaskCommand(text)) return false
        return true
    }

    /**
     * Stream a chat response from Grok (acting as "Skippy").
     *
     * Both Claude and Grok are the same Skippy assistant — they share the user's
     * memories, preferences, and context.  Grok adds real-time search on top.
     *
     * When the user asks to create todos/reminders/notes/memories while Grok is
     * active, Grok embeds a SKIPPY_ACTIONS block at the end of its reply so the
     * launcher can execute those actions via the Skippy REST API.
     *
     * [userContext] — concise profile string built from the user's memories/todos.
     * [hasTaskCapability] — true when the launcher is connected to the Skippy backend
     *   so Grok should include SKIPPY_ACTIONS when needed.
     */
    suspend fun chat(
        apiKey: String,
        messages: List<ChatMessage>,
        userContext: String = "",
        hasTaskCapability: Boolean = true,
        onChunk: ((String) -> Unit)? = null,
    ): String = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) return@withContext "⚠ Grok API key not configured. Add it in **Settings → AI & Intelligence**."

        val currentDate = java.text.SimpleDateFormat("MMMM d, yyyy", java.util.Locale.US)
            .format(java.util.Date())

        val systemPrompt = buildString {
            append("You are Skippy, a highly intelligent AI assistant. ")
            append("You have two complementary AI engines — Grok (you, with real-time web search) and Claude (deep reasoning & empathy). ")
            append("Together you are ONE unified assistant called Skippy. Always refer to yourself as 'Skippy', never as 'Grok' or 'xAI'. ")
            append("Today's date is $currentDate. Always use this as your reference for 'current', 'today', 'recent', etc. ")
            append("You have live web search access — always fetch current data for news, stocks, sports, events. ")
            append("\n\n")

            if (userContext.isNotBlank()) {
                append("--- USER PROFILE (from Skippy memory system) ---\n")
                append(userContext)
                append("\n--- END USER PROFILE ---\n\n")
                append("Use this profile to personalise every response. ")
            }

            if (hasTaskCapability) {
                append("\n\n--- PERSONAL TASK MANAGEMENT ---\n")
                append("You can create todos, reminders, notes, and memories directly in the user's Skippy account. ")
                append("When the user asks you to create any of these items, ALWAYS include a SKIPPY_ACTIONS block ")
                append("at the very END of your response on its own line, in this exact format:\n\n")
                append("SKIPPY_ACTIONS:[{\"type\":\"todo\",\"content\":\"...\",\"priority\":\"normal\"},...]  ← no text after this line\n\n")
                append("Supported action types:\n")
                append("  • todo     → {\"type\":\"todo\",\"content\":\"Buy groceries\",\"priority\":\"normal|high|urgent\"}\n")
                append("  • reminder → {\"type\":\"reminder\",\"content\":\"Call dentist\",\"dueDate\":\"YYYY-MM-DD or null\"}\n")
                append("  • note     → {\"type\":\"note\",\"title\":\"Meeting Notes\",\"content\":\"Key points...\"}\n")
                append("  • memory   → {\"type\":\"memory\",\"content\":\"User loves hiking\",\"category\":\"preference\",\"tags\":[\"interest\"],\"importance\":7}\n\n")
                append("Examples:\n")
                append("  User: 'add buy milk to my todos'\n")
                append("  You:  'Done! I've added **Buy milk** to your to-do list. ✅'\n")
                append("  Then: SKIPPY_ACTIONS:[{\"type\":\"todo\",\"content\":\"Buy milk\",\"priority\":\"normal\"}]\n\n")
                append("  User: 'remind me to call my dentist'\n")
                append("  You:  'Got it! Reminder set for **Call my dentist**. 🔔'\n")
                append("  Then: SKIPPY_ACTIONS:[{\"type\":\"reminder\",\"content\":\"Call my dentist\",\"dueDate\":null}]\n\n")
                append("IMPORTANT: Only include SKIPPY_ACTIONS when actually creating items. NEVER include it for regular questions. ")
                append("The block must be valid JSON and must be the very last line of your response.\n")
                append("--- END TASK MANAGEMENT ---\n\n")
            }

            append("General guidelines:\n")
            append("• Use markdown: **bold** for key facts, bullet points for lists.\n")
            append("• Be concise — aim for under 150 words unless the user asks for more detail (mobile app).\n")
            append("• When discussing news/events, mention the timeframe (e.g. 'As of $currentDate…').\n")
            append("• You have real-time web search — always fetch live data rather than relying on training data.")
        }

        val messagesJson = JSONArray().apply {
            put(JSONObject().put("role", "system").put("content", systemPrompt))
            messages.forEach { m ->
                put(JSONObject().put("role", m.role).put("content", m.content))
            }
        }

        val attempts = listOf(
            Pair(MODEL, true),
            Pair(MODEL_MINI, true),
            Pair(MODEL, false),
        )

        for ((attemptModel, useSearch) in attempts) {
            try {
                val bodyObj = JSONObject().apply {
                    put("model", attemptModel)
                    put("stream", onChunk != null)
                    if (useSearch) put("search_parameters", JSONObject().put("mode", "on"))
                    put("messages", messagesJson)
                    put("temperature", 0.7)
                    put("max_tokens", 600)
                }

                val req = Request.Builder()
                    .url("$BASE_URL/chat/completions")
                    .post(bodyObj.toString().toRequestBody(JSON))
                    .addHeader("Authorization", "Bearer $apiKey")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("Accept", if (onChunk != null) "text/event-stream" else "application/json")
                    .build()

                val response = client.newCall(req).execute()

                when {
                    response.code == 401 || response.code == 403 ->
                        return@withContext "⚠ Grok API key is invalid or expired. Update it in **Settings → AI & Intelligence**."
                    response.code == 429 ->
                        return@withContext "⚠ Grok rate limit reached — please wait a moment."
                    response.code == 410 || response.code == 404 -> {
                        response.close(); continue
                    }
                    response.code == 400 -> {
                        val errBody = response.body?.string() ?: ""
                        response.close()
                        if (useSearch) continue else return@withContext "⚠ Grok request error: ${errBody.take(120)}"
                    }
                    !response.isSuccessful -> {
                        response.close(); continue
                    }
                }

                val source = response.body?.source() ?: return@withContext ""
                val sb = StringBuilder()
                val buf = okio.Buffer()

                if (onChunk != null) {
                    while (!source.exhausted()) {
                        val bytesRead = source.read(buf, 4096)
                        if (bytesRead == -1L) break
                        val raw = buf.readUtf8()
                        raw.split("\n").forEach { line ->
                            val trimmed = line.trim()
                            when {
                                trimmed == "data: [DONE]" -> return@forEach
                                trimmed.startsWith("data: ") -> {
                                    val jsonStr = trimmed.removePrefix("data: ")
                                    runCatching {
                                        val obj = JSONObject(jsonStr)
                                        val delta = obj
                                            .getJSONArray("choices")
                                            .getJSONObject(0)
                                            .getJSONObject("delta")
                                            .optString("content", "")
                                        if (delta.isNotEmpty()) {
                                            sb.append(delta)
                                            onChunk(delta)
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    while (!source.exhausted()) { source.read(buf, 8192) }
                    val bodyText = buf.readUtf8()
                    runCatching {
                        val obj = JSONObject(bodyText)
                        val content = obj
                            .getJSONArray("choices")
                            .getJSONObject(0)
                            .getJSONObject("message")
                            .getString("content")
                        sb.append(content)
                    }.onFailure { sb.append(bodyText) }
                }

                val result = sb.toString().trim()
                return@withContext result.ifEmpty { "Skippy didn't return a response. Please try again." }

            } catch (_: java.net.SocketTimeoutException) {
                continue
            } catch (_: Exception) {
                continue
            }
        }

        "⚠ Skippy's live intelligence is temporarily unavailable. Please try again in a moment."
    }
}
