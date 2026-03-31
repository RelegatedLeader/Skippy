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
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()

    /**
     * Send messages to Skippy and collect the full streamed response.
     * Handles both the Vercel AI SDK v3 protocol (0:"chunk") and standard SSE (data: {...}).
     */
    suspend fun chat(
        baseUrl: String,
        messages: List<ChatMessage>,
        model: String = "grok",
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
            }.toString().toRequestBody("application/json".toMediaType())

            val req = Request.Builder()
                .url("$baseUrl/api/chat")
                .post(body)
                .addHeader("Cookie", SkippyRestApi.sessionCookie)
                .build()

            val response = client.newCall(req).execute()
            if (!response.isSuccessful) return@withContext "Error ${response.code}"

            val sb = StringBuilder()
            val source = response.body?.source() ?: return@withContext ""

            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                when {
                    // Vercel AI SDK v3: "0:\"chunk text\""
                    line.startsWith("0:") -> {
                        try {
                            val text = JSONArray("[${line.substring(2)}]").getString(0)
                            if (text.isNotEmpty()) sb.append(text)
                        } catch (_: Exception) {
                            val raw = line.substring(2).trim('"')
                            if (raw.isNotEmpty()) sb.append(raw)
                        }
                    }
                    // Standard SSE data
                    line.startsWith("data: ") -> {
                        val data = line.removePrefix("data: ").trim()
                        if (data == "[DONE]") break
                        try {
                            val json = JSONObject(data)
                            val text = json.optString("text", "")
                                .ifEmpty {
                                    json.optJSONArray("choices")
                                        ?.getJSONObject(0)
                                        ?.optJSONObject("delta")
                                        ?.optString("content", "") ?: ""
                                }
                            if (text.isNotEmpty()) sb.append(text)
                        } catch (_: Exception) {
                            if (data.isNotEmpty() && !data.startsWith("{") && !data.startsWith("["))
                                sb.append(data)
                        }
                    }
                }
            }

            sb.toString().trim().ifEmpty { "I couldn't process that — please try again." }
        } catch (e: Exception) {
            "Connection error: ${e.message}"
        }
    }
}
