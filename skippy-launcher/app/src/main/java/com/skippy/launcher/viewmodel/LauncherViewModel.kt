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
import com.skippy.launcher.api.SkippyRestApi
import com.skippy.launcher.api.WeatherApi
import com.skippy.launcher.data.*
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

sealed class LoginState {
    data object Idle    : LoginState()
    data object Loading : LoginState()
    data class  Error(val message: String) : LoginState()
    data object Success : LoginState()
}

class LauncherViewModel(application: Application) : AndroidViewModel(application) {

    val prefs = AppPreferences(application)

    // ── Core launcher state ────────────────────────────────────────────────────

    private val _apps        = MutableStateFlow<List<AppInfo>>(emptyList())
    val apps: StateFlow<List<AppInfo>> = _apps.asStateFlow()

    private val _weather     = MutableStateFlow<WeatherData?>(null)
    val weather: StateFlow<WeatherData?> = _weather.asStateFlow()

    private val _voiceState  = MutableStateFlow<VoiceState>(VoiceState.Idle)
    val voiceState: StateFlow<VoiceState> = _voiceState.asStateFlow()

    private val _lastResponse = MutableStateFlow("")
    val lastResponse: StateFlow<String> = _lastResponse.asStateFlow()

    private val _chatLog     = MutableStateFlow<List<ChatEntry>>(emptyList())
    val chatLog: StateFlow<List<ChatEntry>> = _chatLog.asStateFlow()

    private val _isLoading   = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val chatHistory  = mutableListOf<ChatMessage>()

    // ── Feature state ──────────────────────────────────────────────────────────

    private val _memories = MutableStateFlow<List<Memory>>(emptyList())
    val memories: StateFlow<List<Memory>> = _memories.asStateFlow()

    private val _memoriesLoading = MutableStateFlow(false)
    val memoriesLoading: StateFlow<Boolean> = _memoriesLoading.asStateFlow()

    private val _todos = MutableStateFlow<List<TodoItem>>(emptyList())
    val todos: StateFlow<List<TodoItem>> = _todos.asStateFlow()

    private val _todosLoading = MutableStateFlow(false)
    val todosLoading: StateFlow<Boolean> = _todosLoading.asStateFlow()

    private val _reminders = MutableStateFlow<List<Reminder>>(emptyList())
    val reminders: StateFlow<List<Reminder>> = _reminders.asStateFlow()

    private val _remindersLoading = MutableStateFlow(false)
    val remindersLoading: StateFlow<Boolean> = _remindersLoading.asStateFlow()

    private val _notes = MutableStateFlow<List<Note>>(emptyList())
    val notes: StateFlow<List<Note>> = _notes.asStateFlow()

    private val _notesLoading = MutableStateFlow(false)
    val notesLoading: StateFlow<Boolean> = _notesLoading.asStateFlow()

    private val _summaries = MutableStateFlow<List<Summary>>(emptyList())
    val summaries: StateFlow<List<Summary>> = _summaries.asStateFlow()

    private val _debates = MutableStateFlow<List<Debate>>(emptyList())
    val debates: StateFlow<List<Debate>> = _debates.asStateFlow()

    private val _debatesLoading = MutableStateFlow(false)
    val debatesLoading: StateFlow<Boolean> = _debatesLoading.asStateFlow()

    private val _activeDebate = MutableStateFlow<DebateDetail?>(null)
    val activeDebate: StateFlow<DebateDetail?> = _activeDebate.asStateFlow()

    private val _debateSubmitting = MutableStateFlow(false)
    val debateSubmitting: StateFlow<Boolean> = _debateSubmitting.asStateFlow()

    private val _conversations = MutableStateFlow<List<ConversationSummary>>(emptyList())
    val conversations: StateFlow<List<ConversationSummary>> = _conversations.asStateFlow()

    private val _learnStats = MutableStateFlow<LearnStatsResponse?>(null)
    val learnStats: StateFlow<LearnStatsResponse?> = _learnStats.asStateFlow()

    private val _learnSession = MutableStateFlow<List<LearnWord>>(emptyList())
    val learnSession: StateFlow<List<LearnWord>> = _learnSession.asStateFlow()

    private val _learnLoading = MutableStateFlow(false)
    val learnLoading: StateFlow<Boolean> = _learnLoading.asStateFlow()

    private val _userStats = MutableStateFlow<UserStats?>(null)
    val userStats: StateFlow<UserStats?> = _userStats.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _loginState = MutableStateFlow<LoginState>(LoginState.Idle)
    val loginState: StateFlow<LoginState> = _loginState.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    // ── TTS ────────────────────────────────────────────────────────────────────

    private var tts: TextToSpeech? = null
    private var ttsReady = false

    init {
        initTts()
        loadApps()
        // Restore session cookie if we have one saved
        if (prefs.sessionCookie.isNotBlank()) {
            SkippyRestApi.sessionCookie = prefs.sessionCookie
            _isAuthenticated.value = true
        }
    }

    private fun initTts() {
        tts = TextToSpeech(getApplication()) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.US
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
                        viewModelScope.launch(Dispatchers.Main) { _voiceState.value = VoiceState.Idle }
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(id: String) {
                        viewModelScope.launch(Dispatchers.Main) { _voiceState.value = VoiceState.Idle }
                    }
                })
                ttsReady = true
            }
        }
    }

    fun speak(text: String) {
        if (!ttsReady || !prefs.autoSpeak) return
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "skippy_response")
    }

    fun speakAlways(text: String) {
        if (!ttsReady) return
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "skippy_forced")
    }

    fun stopSpeaking() {
        tts?.stop()
        _voiceState.value = VoiceState.Idle
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

    // ── Feature data loading ───────────────────────────────────────────────────

    fun loadMemories() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _memoriesLoading.value = true
            val result = SkippyRestApi.getMemories(prefs.skippyUrl)
            _memories.value = result
            _memoriesLoading.value = false
        }
    }

    fun deleteMemory(id: String) {
        viewModelScope.launch {
            SkippyRestApi.deleteMemory(prefs.skippyUrl, id)
            _memories.update { it.filter { m -> m.id != id } }
        }
    }

    fun loadTodos() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _todosLoading.value = true
            val result = SkippyRestApi.getTodos(prefs.skippyUrl)
            _todos.value = result
            _todosLoading.value = false
        }
    }

    fun toggleTodo(id: String, isDone: Boolean) {
        viewModelScope.launch {
            val updated = SkippyRestApi.toggleTodo(prefs.skippyUrl, id, isDone)
            if (updated != null) {
                _todos.update { list -> list.map { if (it.id == id) updated else it } }
            }
        }
    }

    fun loadReminders() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _remindersLoading.value = true
            val result = SkippyRestApi.getReminders(prefs.skippyUrl)
            _reminders.value = result
            _remindersLoading.value = false
        }
    }

    fun toggleReminder(id: String, isDone: Boolean) {
        viewModelScope.launch {
            val updated = SkippyRestApi.toggleReminder(prefs.skippyUrl, id, isDone)
            if (updated != null) {
                _reminders.update { list -> list.map { if (it.id == id) updated else it } }
            }
        }
    }

    fun createReminder(content: String, dueDate: String?) {
        viewModelScope.launch {
            val created = SkippyRestApi.createReminder(prefs.skippyUrl, content, dueDate)
            if (created != null) {
                _reminders.update { listOf(created) + it }
            }
        }
    }

    fun deleteReminder(id: String) {
        viewModelScope.launch {
            SkippyRestApi.deleteReminder(prefs.skippyUrl, id)
            _reminders.update { it.filter { r -> r.id != id } }
        }
    }

    fun loadNotes() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _notesLoading.value = true
            val result = SkippyRestApi.getNotes(prefs.skippyUrl)
            _notes.value = result
            _notesLoading.value = false
        }
    }

    fun createNote(title: String, content: String) {
        viewModelScope.launch {
            val created = SkippyRestApi.createNote(prefs.skippyUrl, title, content)
            if (created != null) {
                _notes.update { listOf(created) + it }
            }
        }
    }

    fun deleteNote(id: String) {
        viewModelScope.launch {
            SkippyRestApi.deleteNote(prefs.skippyUrl, id)
            _notes.update { it.filter { n -> n.id != id } }
        }
    }

    fun loadSummaries() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            val result = SkippyRestApi.getSummaries(prefs.skippyUrl)
            _summaries.value = result
        }
    }

    fun loadDebates() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _debatesLoading.value = true
            val result = SkippyRestApi.getDebates(prefs.skippyUrl)
            _debates.value = result
            _debatesLoading.value = false
        }
    }

    fun loadDebateDetail(id: String) {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            val detail = SkippyRestApi.getDebateDetail(prefs.skippyUrl, id)
            _activeDebate.value = detail
        }
    }

    fun createDebate(topic: String, stance: String?) {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _debatesLoading.value = true
            val created = SkippyRestApi.createDebate(prefs.skippyUrl, topic, stance)
            if (created != null) {
                _debates.update { listOf(created) + it }
                loadDebateDetail(created.id)
            }
            _debatesLoading.value = false
        }
    }

    fun submitDebateArgument(debateId: String, argument: String) {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _debateSubmitting.value = true
            val detail = SkippyRestApi.submitDebateRound(prefs.skippyUrl, debateId, argument)
            if (detail != null) {
                _activeDebate.value = detail
                _debates.update { list ->
                    list.map { if (it.id == debateId) detail.debate else it }
                }
                if (prefs.debateAutoRead) {
                    val lastRound = detail.rounds.lastOrNull()
                    if (lastRound != null) speakAlways(lastRound.aiArgument)
                }
            }
            _debateSubmitting.value = false
        }
    }

    fun clearActiveDebate() { _activeDebate.value = null }

    fun loadConversations() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            val result = SkippyRestApi.getConversations(prefs.skippyUrl)
            _conversations.value = result
        }
    }

    fun loadLearnStats() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            val result = SkippyRestApi.getLearnStats(prefs.skippyUrl)
            _learnStats.value = result
        }
    }

    fun startLearnSession(mode: String = "adaptive") {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            _learnLoading.value = true
            val words = SkippyRestApi.getLearnSession(prefs.skippyUrl, mode)
            _learnSession.value = words
            _learnLoading.value = false
        }
    }

    fun submitLearnAnswer(wordId: String, correct: Boolean, exerciseType: String, quality: Int) {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            SkippyRestApi.submitLearnAnswer(prefs.skippyUrl, wordId, correct, exerciseType, quality)
        }
    }

    fun loadUserStats() {
        if (prefs.skippyUrl.isBlank()) return
        viewModelScope.launch {
            val result = SkippyRestApi.getUserStats(prefs.skippyUrl)
            _userStats.value = result
        }
    }

    // Bulk refresh for home page quick stats
    fun refreshHomeData() {
        loadMemories()
        loadTodos()
        loadReminders()
        loadUserStats()
        loadConversations()
    }

    // ── Voice commands ─────────────────────────────────────────────────────────

    fun handleVoiceCommand(text: String): Boolean {
        val lower = text.trim().lowercase()
        val ctx   = getApplication<Application>()

        val openRx = Regex("""^(?:open|launch|start)\s+(.+)$""").find(lower)
        if (openRx != null && launchAppByName(openRx.groupValues[1].trim())) return true

        val callRx = Regex("""^(?:call|phone|dial)\s+(.+)$""").find(lower)
        if (callRx != null) {
            val name   = callRx.groupValues[1].trim()
            val number = findContactNumber(name)
            val uri    = if (!number.isNullOrBlank()) Uri.parse("tel:$number") else Uri.parse("tel:")
            ctx.startActivity(Intent(Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }

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

        val navRx = Regex("""^(?:navigate|directions?|take me|go)\s+(?:to\s+)?(.+)$""").find(lower)
        if (navRx != null) {
            val place = navRx.groupValues[1].trim()
            ctx.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(place)}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            return true
        }

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

        if (lower.matches(Regex(".*\\b(?:camera|take (?:a )?photo|selfie|take (?:a )?picture)\\b.*"))) {
            if (!launchAppByName("camera")) {
                runCatching { ctx.startActivity(Intent(MediaStore.ACTION_IMAGE_CAPTURE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
            return true
        }

        if (lower.matches(Regex(".*\\bsettings\\b.*"))) {
            ctx.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return true
        }

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

    // ── AI Chat ────────────────────────────────────────────────────────────────

    fun askSkippy(text: String) {
        if (_isLoading.value) return
        viewModelScope.launch {
            _isLoading.value = true
            _voiceState.value = VoiceState.Processing
            _chatLog.update { (it + ChatEntry(role = "user", text = text)).takeLast(40) }
            chatHistory.add(ChatMessage("user", text))

            var reply = SkippyApi.chat(prefs.skippyUrl, chatHistory.toList(), prefs.aiModel)

            // If we get an auth error, try re-authenticating once
            if (reply.startsWith("Error 401") || reply.startsWith("Error 403")) {
                reAuthenticate()
                kotlinx.coroutines.delay(1200)
                reply = SkippyApi.chat(prefs.skippyUrl, chatHistory.toList(), prefs.aiModel)
            }

            chatHistory.add(ChatMessage("assistant", reply))
            while (chatHistory.size > 30) chatHistory.removeAt(0)

            _chatLog.update { (it + ChatEntry(role = "skippy", text = reply)).takeLast(40) }
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
    fun clearError() { _errorMessage.value = null }

    // ── Setup ──────────────────────────────────────────────────────────────────

    /** Full login: URL + credentials → session cookie → load data */
    fun login(url: String, username: String, password: String, accessCode: String) {
        viewModelScope.launch {
            _loginState.value = LoginState.Loading
            val cleanUrl = url.trim().trimEnd('/')
            val cookie = SkippyRestApi.login(cleanUrl, username, password, accessCode)
            if (cookie != null) {
                prefs.skippyUrl   = cleanUrl
                prefs.username    = username
                prefs.password    = password
                prefs.accessCode  = accessCode
                prefs.sessionCookie = cookie
                prefs.isSetupDone = true
                _isAuthenticated.value = true
                if (prefs.pinnedApps.isEmpty()) {
                    prefs.pinnedApps = listOf(
                        "com.google.android.dialer",
                        "com.google.android.apps.messaging",
                        "com.android.chrome",
                        "com.google.android.apps.photos",
                    )
                }
                refreshHomeData()
                _loginState.value = LoginState.Success
            } else {
                _loginState.value = LoginState.Error("Invalid credentials or server unreachable.")
            }
        }
    }

    /** Re-authenticate using stored credentials (e.g., after session expiry) */
    fun reAuthenticate() {
        val url = prefs.skippyUrl
        val user = prefs.username
        val pass = prefs.password
        val code = prefs.accessCode
        if (url.isBlank() || user.isBlank() || pass.isBlank() || code.isBlank()) return
        login(url, user, pass, code)
    }

    fun logout() {
        prefs.sessionCookie = ""
        prefs.isSetupDone   = false
        SkippyRestApi.sessionCookie = ""
        _isAuthenticated.value = false
        _loginState.value = LoginState.Idle
        clearChat()
    }

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
        refreshHomeData()
    }

    fun launchApp(packageName: String) {
        val ctx = getApplication<Application>()
        ctx.packageManager.getLaunchIntentForPackage(packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ?.let { ctx.startActivity(it) }
    }

    fun launchAppByName(name: String): Boolean {
        val app = _apps.value.firstOrNull { it.name.lowercase().contains(name.lowercase()) } ?: return false
        launchApp(app.packageName)
        return true
    }

    override fun onCleared() {
        super.onCleared()
        tts?.shutdown()
    }
}
