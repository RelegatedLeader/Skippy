package com.skippy.launcher.viewmodel

import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.skippy.launcher.api.SkippyApi
import com.skippy.launcher.api.WeatherApi
import com.skippy.launcher.data.AppInfo
import com.skippy.launcher.data.ChatMessage
import com.skippy.launcher.data.WeatherData
import com.skippy.launcher.data.prefs.AppPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
                // Prefer an offline male voice (Pixel has great Google TTS)
                val voices = tts?.voices?.filter { v ->
                    v.locale.language == "en" && !v.isNetworkConnectionRequired
                } ?: emptyList()
                val maleVoice = voices.firstOrNull { it.name.contains("male", ignoreCase = true) }
                    ?: voices.firstOrNull { !it.name.contains("female", ignoreCase = true) }
                if (maleVoice != null) tts?.voice = maleVoice
                tts?.setSpeechRate(0.92f)
                tts?.setPitch(0.85f)
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

    // ── Skippy chat ────────────────────────────────────────────────────────────

    fun askSkippy(text: String) {
        if (_isLoading.value) return
        viewModelScope.launch {
            _isLoading.value = true
            _voiceState.value = VoiceState.Processing
            chatHistory.add(ChatMessage("user", text))

            val reply = SkippyApi.chat(prefs.skippyUrl, chatHistory.toList())
            chatHistory.add(ChatMessage("assistant", reply))

            // Keep history manageable
            while (chatHistory.size > 20) { chatHistory.removeAt(0) }

            _lastResponse.value = reply
            _isLoading.value = false
            _voiceState.value = VoiceState.Speaking
            speak(reply)
        }
    }

    fun setVoiceState(state: VoiceState) { _voiceState.value = state }
    fun onSpeakDone() { _voiceState.value = VoiceState.Idle }

    // ── Setup ──────────────────────────────────────────────────────────────────

    fun completeSetup(url: String) {
        prefs.skippyUrl  = url.trimEnd('/')
        prefs.isSetupDone = true
        // Seed dock with Google essentials if not already configured
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

    /** Try to find and launch an app by partial name — used for voice commands. */
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
