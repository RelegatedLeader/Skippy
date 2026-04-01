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

object SkippyApi {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /**
     * Send messages to Skippy and stream the plain-text response back.
     * The server sends Content-Type: text/plain with raw streamed text chunks —
     * NOT SSE (data:) or Vercel AI SDK (0:) format.
     * [onChunk] is called for each chunk as it arrives for live streaming UI updates.
     */
    suspend fun chat(
        baseUrl: String,
        messages: List<ChatMessage>,
        model: String = "grok",
        conversationId: String? = null,
        onChunk: ((String) -> Unit)? = null,
    ): String = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("messages", JSONArray().apply {
                    messages.forEach { m ->
                        put(JSONObject().apply {
                            put("role", m.role)
                            put("content", m.content)
                        })
                    }
                })
                put("model", model)
                // Include conversationId so memories/todos are saved server-side
                conversationId?.let { put("conversationId", it) }
                // Send timezone offset for reminder time calculations
                val tzOffset = java.util.TimeZone.getDefault().rawOffset / 60000
                put("timezoneOffsetMinutes", tzOffset)
            }.toString().toRequestBody("application/json".toMediaType())

            val req = Request.Builder()
                .url("$baseUrl/api/chat")
                .post(body)
                .addHeader("Cookie", SkippyRestApi.sessionCookie)
                .addHeader("Accept", "text/plain, application/json")
                .build()

            val response = client.newCall(req).execute()
            when {
                response.code == 401 || response.code == 403 ->
                    return@withContext "__AUTH_ERROR__"
                response.code == 429 ->
                    return@withContext "You're sending messages too fast — please wait a moment."
                !response.isSuccessful ->
                    return@withContext "Server error (${response.code}). Please try again."
            }

            val contentType = response.header("Content-Type", "") ?: ""
            val source = response.body?.source() ?: return@withContext ""
            val sb = StringBuilder()

            // The Skippy server streams raw plain text — just read chunks as they arrive
            val okioBuffer = okio.Buffer()
            while (!source.exhausted()) {
                val bytesRead = source.read(okioBuffer, 512)
                if (bytesRead == -1L) break
                val chunk = okioBuffer.readUtf8()
                if (chunk.isNotEmpty()) {
                    // Strip any SSE/AI SDK prefixes if server changes format
                    val clean = when {
                        chunk.startsWith("0:") -> {
                            try { JSONArray("[${chunk.substring(2)}]").getString(0) }
                            catch (_: Exception) { chunk.substring(2).trim('"') }
                        }
                        chunk.startsWith("data: ") -> {
                            val d = chunk.removePrefix("data: ").trim()
                            if (d == "[DONE]" || d.isEmpty()) ""
                            else try { JSONObject(d).optString("text", d) } catch (_: Exception) { d }
                        }
                        else -> chunk
                    }
                    if (clean.isNotEmpty()) {
                        sb.append(clean)
                        onChunk?.invoke(clean)
                    }
                }
            }

            val result = sb.toString().trim()
            result.ifEmpty { "Sorry, I didn't get a response. Please try again." }
        } catch (e: java.net.SocketTimeoutException) {
            "Request timed out — Skippy is thinking hard. Please try again."
        } catch (e: Exception) {
            "Connection error: ${e.message}"
        }
    }

    /** Create a new conversation and return its ID */
    suspend fun createConversation(baseUrl: String): String? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder()
                .url("$baseUrl/api/conversations")
                .post(JSONObject().apply { put("title", "New Conversation") }.toString()
                    .toRequestBody("application/json".toMediaType()))
                .addHeader("Cookie", SkippyRestApi.sessionCookie)
                .build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@runCatching null
            JSONObject(res.body?.string() ?: return@runCatching null).optString("id")
                .takeIf { it.isNotBlank() }
        }.getOrNull()
    }
}
