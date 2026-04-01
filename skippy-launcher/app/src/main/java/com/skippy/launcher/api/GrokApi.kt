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
 * Used for real-time queries AND general world-knowledge queries that Claude can't answer
 * (Claude has no internet access).
 * Endpoint: https://api.x.ai/v1/chat/completions
 * Primary model: grok-3  (live-search enabled)
 * Fallback model: grok-3-mini (if grok-3 unavailable)
 */
object GrokApi {

    private const val BASE_URL     = "https://api.x.ai/v1"
    private const val MODEL        = "grok-3"          // primary — confirmed valid April 2026
    private const val MODEL_MINI   = "grok-3-mini"     // fallback if primary returns 410/404

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json".toMediaType()

    // ── Emotional / deep-reasoning patterns → always route to Claude ───────────
    // Claude is the more empathetic, reasoning-capable model — feelings, philosophy,
    // personal reflection, mental health, relationships → always Claude.
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

    // ── Personal task commands → always route to Claude ────────────────────────
    // These are things that require Skippy's backend context (todos, notes, memories, etc.)
    private val CLAUDE_TASK_PATTERNS = listOf(
        Regex("""(?i)^(add|create|make|set a?|remind me|schedule|save|note down|take a? note|remember this|store this)\b"""),
        Regex("""(?i)\b(my todo|my task|my reminder|my note|my memory|my schedule|my calendar)\b"""),
        Regex("""(?i)^(remind me to|set a? reminder|add a? (todo|task|reminder|note))\b"""),
        Regex("""(?i)\b(don'?t forget|save this|remember that|make a note|write this down)\b"""),
        Regex("""(?i)^(what (do i|should i|can i|are my|is my)|show me my|list my)\s+(todo|task|remind|note|memor|schedule)\b"""),
        Regex("""(?i)\b(clear chat|start new chat|new conversation)\b"""),
    )

    // ── Patterns that Grok handles (Claude has no internet access) ──────────────
    val REALTIME_PATTERNS = listOf(
        // News / current events
        Regex("""(?i)\b(news|latest news|breaking news|today'?s news|what'?s happening|current event|world event)\b"""),
        Regex("""(?i)\b(what happened|what is happening|whats going on|what'?s going on|what'?s new)\b"""),
        // Finance / markets / crypto
        Regex("""(?i)\b(stock|stocks|market|nasdaq|dow|s&p 500|nyse|crypto|bitcoin|btc|ethereum|eth|price of|trading|hedge fund|ipo)\b"""),
        // Weather
        Regex("""(?i)\b(weather|temperature outside|forecast|rain today|snow today|humidity|feels like outside)\b"""),
        // Sports
        Regex("""(?i)\b(score|scores|game result|who won|nfl|nba|mlb|nhl|premier league|la liga|bundesliga|serie a|champions league|world cup|olympics|match|tournament|standings|playoffs)\b"""),
        // Politics / government / elections
        Regex("""(?i)\b(election|elections|president|prime minister|congress|senate|parliament|vote|poll|democrat|republican|political party|government)\b"""),
        // Disasters / crises / conflicts
        Regex("""(?i)\b(earthquake|hurricane|typhoon|tornado|flood|wildfire|disaster|crisis|war|invasion|conflict|attack|terror|shooting|bombing|explosion|protest|riot)\b"""),
        // Real-time status of people / companies
        Regex("""(?i)\b(still alive|passed away|died|was arrested|was convicted|was released|got elected|just announced|just launched|just resigned|recently|was fired)\b"""),
        // Time-sensitive
        Regex("""(?i)\b(right now|at the moment|currently|today|this week|this month|this year|in 2024|in 2025|in 2026|as of)\b"""),
        // Specific world knowledge triggers
        Regex("""(?i)\b(who is|who are|who was|who were|what is|what are|what was|what were|where is|where are)\s+.{3,}"""),
        Regex("""(?i)\b(tell me about|can you explain|what do you know about|describe|history of|background on)\b"""),
        // Trending / viral / social
        Regex("""(?i)\b(trending|viral|going viral|social media|twitter|tiktok|reddit|instagram|youtube)\b"""),
        // Companies / products / tech releases
        Regex("""(?i)\b(apple|google|microsoft|meta|amazon|tesla|spacex|openai|anthropic|nvidia|samsung|launched|release date|new model|new version|update)\b"""),
        // World affairs
        Regex("""(?i)\b(ukraine|russia|china|nato|middle east|gaza|israel|iran|north korea|taiwan|climate change|pandemic|covid|inflation|interest rate)\b"""),
        // Celebrities / public figures
        Regex("""(?i)\b(elon musk|donald trump|joe biden|taylor swift|beyoncé|kanye|kardashian|lebron|messi|ronaldo|keanu|celebrity)\b"""),
        // Generic open-ended factual questions
        Regex("""(?i)^(what|who|where|when|why|how)\s+(is|are|was|were|did|does|do|has|have|will|would|could|can)\s+.{5,}"""),
        Regex("""(?i)^(explain|describe|tell me|give me|show me)\s+.{8,}"""),
        // Asking about something specific in the world
        Regex("""(?i)\b(latest|recent|new|current|updated?)\s+(info|information|news|update|development|event|data|stats)\b"""),
    )

    /**
     * Returns true if the text is a personal task command that should go to Claude.
     * These require Skippy backend context.
     */
    fun isPersonalTaskCommand(text: String): Boolean =
        CLAUDE_TASK_PATTERNS.any { it.containsMatchIn(text) }

    /**
     * Returns true if the query is emotional/reasoning and should go to Claude.
     * Claude is the empathetic, reflective model — feelings, philosophy, advice.
     */
    fun isEmotionalQuery(text: String): Boolean =
        EMOTIONAL_PATTERNS.any { it.containsMatchIn(text) }

    /**
     * Returns true if the query needs Grok (internet/real-time knowledge).
     * Claude has no internet access — anything about the world should go to Grok.
     */
    fun isRealTimeQuery(text: String): Boolean {
        // Personal task commands always go to Claude
        if (isPersonalTaskCommand(text)) return false
        // Emotional/reasoning queries always go to Claude
        if (isEmotionalQuery(text)) return false
        // Check Grok patterns
        return REALTIME_PATTERNS.any { it.containsMatchIn(text) }
    }

    /**
     * Determine if a follow-up message in a Grok conversation should keep using Grok.
     * If conversation was using Grok and new message isn't a personal task, stay with Grok.
     */
    fun shouldContinueWithGrok(text: String, conversationUsedGrok: Boolean): Boolean {
        if (!conversationUsedGrok) return false
        // If it's a personal task command, send to Claude even in Grok conversation
        if (isPersonalTaskCommand(text)) return false
        // Short follow-ups in a Grok conversation should continue with Grok
        return true
    }

    /**
     * Stream a chat response from Grok. Parses SSE `data: {...}` lines.
     * [onChunk] receives delta text as it streams in.
     * [userContext] is an optional string containing the user's memories/preferences from Skippy
     *   so Grok is aware of the user's personality — making both AIs operate as one system.
     * Returns the full assembled response.
     *
     * Retry strategy:
     *   1. Try MODEL (grok-3) + live search enabled
     *   2. If 410/404 → retry with MODEL_MINI (grok-3-mini) + live search
     *   3. If still failing → retry MODEL without search_parameters (knowledge cutoff fallback)
     */
    suspend fun chat(
        apiKey: String,
        messages: List<ChatMessage>,
        userContext: String = "",
        onChunk: ((String) -> Unit)? = null,
    ): String = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) return@withContext "⚠ Grok API key not configured. Add it in Settings."

        val currentDate = java.text.SimpleDateFormat("MMMM d, yyyy", java.util.Locale.US)
            .format(java.util.Date())

        val systemPrompt = buildString {
            append("You are Grok, an AI by xAI with real-time web search access to current events, live data, and up-to-date world knowledge. ")
            append("Today's date is $currentDate — always use this as your reference for 'current', 'recent', 'today', etc. ")
            append("The user is accessing you through the Skippy Launcher app on Android. ")
            if (userContext.isNotBlank()) {
                append("\n\n--- USER CONTEXT (from Skippy's memory system) ---\n")
                append(userContext)
                append("\n--- END USER CONTEXT ---\n\n")
                append("Use this context to personalise your answers when relevant. ")
            }
            append("Answer questions about news, current events, stock prices, sports scores, real-time information, world affairs, people, companies, and general factual queries clearly and accurately. ")
            append("Use markdown formatting: **bold** for key facts, bullet points for lists. ")
            append("Be concise but comprehensive — this is a mobile app. ")
            append("When discussing news or events, always mention the timeframe (e.g. 'As of $currentDate…'). ")
            append("You have live web search access — always fetch current data rather than relying on training data.")
        }

        // Build message array (shared across all attempts)
        val messagesJson = JSONArray().apply {
            put(JSONObject().put("role", "system").put("content", systemPrompt))
            messages.forEach { m ->
                put(JSONObject().put("role", m.role).put("content", m.content))
            }
        }

        // Attempt sequence: (model, useSearch) — tries each until one succeeds
        val attempts = listOf(
            Pair(MODEL, true),        // grok-3 + live search (best)
            Pair(MODEL_MINI, true),   // grok-3-mini + live search (fallback)
            Pair(MODEL, false),       // grok-3 without search (knowledge cutoff)
        )

        for ((attemptModel, useSearch) in attempts) {
            try {
                val bodyObj = JSONObject().apply {
                    put("model", attemptModel)
                    put("stream", onChunk != null)
                    if (useSearch) put("search_parameters", JSONObject().put("mode", "on"))
                    put("messages", messagesJson)
                    put("temperature", 0.7)
                    put("max_tokens", 1024)
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
                        return@withContext "⚠ Grok API key is invalid or expired. Update it in Settings."
                    response.code == 429 ->
                        return@withContext "⚠ Grok rate limit reached — please wait a moment."
                    response.code == 410 || response.code == 404 -> {
                        // Model gone — try next attempt
                        response.close()
                        continue
                    }
                    response.code == 400 -> {
                        // If search_parameters caused a bad request, try without
                        val errBody = response.body?.string() ?: ""
                        response.close()
                        if (useSearch) continue else return@withContext "⚠ Grok request error: ${errBody.take(120)}"
                    }
                    !response.isSuccessful -> {
                        response.close()
                        continue
                    }
                }

                val source = response.body?.source() ?: return@withContext ""
                val sb = StringBuilder()
                val buf = okio.Buffer()

                if (onChunk != null) {
                    // SSE streaming — parse `data: {...}` lines
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
                    // Non-streaming — read full JSON body
                    while (!source.exhausted()) {
                        source.read(buf, 8192)
                    }
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
                return@withContext result.ifEmpty { "Grok didn't return a response. Please try again." }

            } catch (_: java.net.SocketTimeoutException) {
                continue // try next attempt on timeout
            } catch (_: Exception) {
                continue
            }
        }

        "⚠ Grok is temporarily unavailable. Please try again in a moment."
    }
}

