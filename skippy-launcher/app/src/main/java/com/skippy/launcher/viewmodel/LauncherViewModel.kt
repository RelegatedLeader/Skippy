package com.skippy.launcher.viewmodel

import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.skippy.launcher.api.SkippyApi
import com.skippy.launcher.api.WeatherApi
import com.skippy.launcher.data.AppInfo
import com.skippy.launcher.data.ChatEntry
import com.skippy.launcher.data.ChatMessage
import com.skippy.launcher.data.WeatherData
import com.skippy.launcher.data.prefs.AppPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

sealed class VoiceState {
    data object Idle       : VoiceState()
    data object Listening  : VoiceState()
    data object Processing : VoiceState()
    data object Speaking   : VoiceState()
}

class LauncherViewModel(application: Application) : AndroidViewModel(application) {

    val prefs = AppPreferences(application)

    // ── State flows ────────────────────────────────────────────────────────────

    private val _apps        = MutableStateFlow<List<AppInfo>>(emptyList())
    val apps: StateFlow<List<AppInfo>> = _apps.asStateFlow()

    private val _weather     = MutableStateFlow<WeatherData?>(null)
    val weather: StateFlow<WeatherData?> = _weather.asStateFlow()

    private val _voiceState  = MutableStateFlow<VoiceState>(VoiceState.Idle)
    val voiceState: StateFlow<VoiceState> = _voiceState.asStateFlow()

    private val _lastResponse = MutableStateFlow("")
    val lastResponse: StateFlow<String> = _lastResponse.asStateFlow()

    // On-screen conversation log (capped at 12 entries)
    private val _chatLog     = MutableStateFlow<List<ChatEntry>>(emptyList())
    val chatLog: StateFlow<List<ChatEntry>> = _chatLog.asStateFlow()

    private val _isLoading   = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val chatHistory  = mutableListOf<ChatMessage>()

    // ── TTS ────────────────────────────────────────────────────────────────────

    private var tts: TextToSpeech? = null
    private var ttsReady = false

    init {
        initTts()
        loadApps()
    }

    private fun initTts() {
        tts = TextToSpeech(getApplication()) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.US
                // Prefer high-quality offline male voice (Pixel 9a has Google TTS installed)
                val allVoices = tts?.voices?.filter { v ->
                    v.locale.language == "en" && v.locale.country in listOf("US", "GB")
                } ?: emptyList()
                val offline = allVoices.filter { !it.isNetworkConnectionRequired }
                val bestVoice =
                    offline.firstOrNull { it.name.contains("male", ignoreCase = true) && it.quality >= 300 }
                    ?: offline.firstOrNull { !it.name.contains("female", ignoreCase = true) && it.quality >= 300 }
                    ?: offline.firstOrNull { it.name.contains("male", ignoreCase = true) }
                    ?: offline.firstOrNull { !it.name.contains("female", ignoreCase = true) }
                if (bestVoice != null) tts?.voice = bestVoice
                tts?.setSpeechRate(prefs.speechRate)
                tts?.setPitch(prefs.speechPitch)
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String) {}
                    override fun onDone(id: String) {
                        viewModelScope.launch(Dispatchers.Main) {
                            _voiceState.value = VoiceState.Idle
                        }
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(id: String) {
                        viewModelScope.launch(Dispatchers.Main) {
                            _voiceState.value = VoiceState.Idle
                        }
                    }
                })
                ttsReady = true
            }
        }
    }

    private fun speak(text: String) {
        if (!ttsReady) return
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "skippy_response")
    }

    // ── Apps ───────────────────────────────────────────────────────────────────

    private fun loadApps() {
        viewModelScope.launch {
            val pm = getApplication<Application>().packageManager
            val list = withContext(Dispatchers.IO) {
                pm.queryIntentActivities(
                    Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),
                    PackageManager.GET_META_DATA,
                ).map { ri ->
                    AppInfo(
                        name        = ri.loadLabel(pm).toString(),
                        packageName = ri.activityInfo.packageName,
                        icon        = ri.loadIcon(pm),
                    )
                }.filter { it.packageName != "com.skippy.launcher" }
                    .sortedBy { it.name.lowercase() }
            }
            _apps.value = list
        }
    }

    // ── Weather ────────────────────────────────────────────────────────────────

    fun updateWeather(lat: Double, lon: Double) {
        viewModelScope.launch {
            val data = WeatherApi.fetchWeather(lat, lon, prefs.temperatureUnit)
            if (data != null) {
                val city = WeatherApi.cityName(lat, lon)
                _weather.value = data.copy(city = city)
            }
        }
    }

    // ── System voice commands ──────────────────────────────────────────────────
    // Returns true if the command was handled locally (no AI call needed).
    // Handles: open, call, text, navigate, alarm, camera, settings, search.

    fun handleVoiceCommand(text: String): Boolean {
        val lower = text.trim().lowercase()
        val ctx   = getApplication<Application>()

        // open / launch / start <app>
        val openRx = Regex("""^(?:open|launch|start)\s+(.+)$""").find(lower)
        if (openRx != null && launchAppByName(openRx.groupValues[1].trim())) return true

        // call / phone / dial <name>
        val callRx = Regex("""^(?:call|phone|dial)\s+(.+)$""").find(lower)
        if (callRx != null) {
            val name   = callRx.groupValues[1].trim()
            val number = findContactNumber(name)
            val uri    = if (!number.isNullOrBlank()) Uri.parse("tel:$number") else Uri.parse("tel:")
            ctx.startActivity(Intent(Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }

        // text / message / sms <name> [message body]
        val smsRx = Regex("""^(?:text|message|sms|msg)\s+(\S+)(?:\s+(.+))?$""").find(lower)
        if (smsRx != null) {
            val name   = smsRx.groupValues[1].trim()
            val body   = smsRx.groupValues[2].trim()
            val number = findContactNumber(name)
            val intent = Intent(Intent.ACTION_SENDTO).apply {
                data = Uri.parse("sms:${number ?: ""}")
                if (body.isNotBlank()) putExtra("sms_body", body)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
            return true
        }

        // navigate / directions / take me to <place>
        val navRx = Regex("""^(?:navigate|directions?|take me|go)\s+(?:to\s+)?(.+)$""").find(lower)
        if (navRx != null) {
            val place = navRx.groupValues[1].trim()
            ctx.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(place)}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            return true
        }

        // set alarm / wake me up [at/for] <time>
        val alarmRx = Regex("""^(?:set\s+(?:an?\s+)?alarm|wake me(?:\s+up)?)\s+(?:at\s+|for\s+)?(.+)$""").find(lower)
        if (alarmRx != null) {
            val (hour, min) = parseTime(alarmRx.groupValues[1].trim()) ?: (7 to 0)
            ctx.startActivity(Intent(AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(AlarmClock.EXTRA_HOUR, hour)
                putExtra(AlarmClock.EXTRA_MINUTES, min)
                putExtra(AlarmClock.EXTRA_SKIP_UI, false)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            return true
        }

        // camera / take a photo / selfie
        if (lower.matches(Regex(".*\\b(?:camera|take (?:a )?photo|selfie|take (?:a )?picture)\\b.*"))) {
            if (!launchAppByName("camera")) {
                runCatching {
                    ctx.startActivity(
                        Intent(MediaStore.ACTION_IMAGE_CAPTURE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            }
            return true
        }

        // settings
        if (lower.matches(Regex(".*\\bsettings\\b.*"))) {
            ctx.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }

        // search / google <query>
        val searchRx = Regex("""^(?:search|google|look up|find)\s+(?:for\s+)?(.+)$""").find(lower)
        if (searchRx != null) {
            val query = searchRx.groupValues[1].trim()
            ctx.startActivity(
                Intent(Intent.ACTION_WEB_SEARCH).apply {
                    putExtra("query", query)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            return true
        }

        return false
    }

    private fun parseTime(timeStr: String): Pair<Int, Int>? {
        val rx = Regex("""(\d{1,2})(?::(\d{2}))?\s*(am|pm)?""", RegexOption.IGNORE_CASE)
        val m  = rx.find(timeStr) ?: return null
        var hour = m.groupValues[1].toIntOrNull() ?: return null
        val min  = m.groupValues[2].toIntOrNull() ?: 0
        when (m.groupValues[3].lowercase()) {
            "pm" -> if (hour < 12) hour += 12
            "am" -> if (hour == 12) hour = 0
        }
        return hour to min
    }

    private fun findContactNumber(name: String): String? = runCatching {
        val cursor = getApplication<Application>().contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
            arrayOf("%$name%"),
            null,
        ) ?: return@runCatching null
        cursor.use { if (it.moveToFirst()) it.getString(0) else null }
    }.getOrNull()

    // ── Skippy AI chat ─────────────────────────────────────────────────────────

    fun askSkippy(text: String) {
        if (_isLoading.value) return
        viewModelScope.launch {
            _isLoading.value = true
            _voiceState.value = VoiceState.Processing
            _chatLog.update { (it + ChatEntry(role = "user", text = text)).takeLast(12) }
            chatHistory.add(ChatMessage("user", text))

            val reply = SkippyApi.chat(prefs.skippyUrl, chatHistory.toList())
            chatHistory.add(ChatMessage("assistant", reply))
            while (chatHistory.size > 20) chatHistory.removeAt(0)

            _chatLog.update { (it + ChatEntry(role = "skippy", text = reply)).takeLast(12) }
            _lastResponse.value = reply
            _isLoading.value = false
            _voiceState.value = VoiceState.Speaking
            speak(reply)
        }
    }

    fun clearChat() {
        chatHistory.clear()
        _chatLog.value = emptyList()
        _lastResponse.value = ""
    }

    fun setVoiceState(state: VoiceState) { _voiceState.value = state }
    fun onSpeakDone() { _voiceState.value = VoiceState.Idle }

    // ── Setup ──────────────────────────────────────────────────────────────────

    fun completeSetup(url: String) {
        prefs.skippyUrl  = url.trimEnd('/')
        prefs.isSetupDone = true
        if (prefs.pinnedApps.isEmpty()) {
            prefs.pinnedApps = listOf(
                "com.google.android.dialer",
                "com.google.android.apps.messaging",
                "com.android.chrome",
                "com.google.android.apps.photos",
            )
        }
    }

    fun launchApp(packageName: String) {
        val ctx = getApplication<Application>()
        ctx.packageManager.getLaunchIntentForPackage(packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ?.let { ctx.startActivity(it) }
    }

    fun launchAppByName(name: String): Boolean {
        val app = _apps.value.firstOrNull {
            it.name.lowercase().contains(name.lowercase())
        } ?: return false
        launchApp(app.packageName)
        return true
    }

    override fun onCleared() {
        super.onCleared()
        tts?.shutdown()
    }
}


