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
import com.skippy.launcher.api.GrokApi
import com.skippy.launcher.api.WeatherApi
import com.skippy.launcher.widget.SkippyWidgetProvider
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

    private val _streamingText = MutableStateFlow("")
    val streamingText: StateFlow<String> = _streamingText.asStateFlow()

    private val _isGrokStreaming = MutableStateFlow(false)
    val isGrokStreaming: StateFlow<Boolean> = _isGrokStreaming.asStateFlow()

    // Tracks whether the current conversation has been using Grok — sticky routing
    private var conversationUsesGrok = false

    // Forced AI override for current session (persisted across app restarts)
    private val _forcedAiMode = MutableStateFlow(prefs.forcedAiMode) // "" | "claude" | "grok"
    val forcedAiMode: StateFlow<String?> = _forcedAiMode.asStateFlow()

    fun setForcedAiMode(mode: String) {
        _forcedAiMode.value = mode
        prefs.forcedAiMode = mode
    }

    private val chatHistory  = mutableListOf<ChatMessage>()
    private var currentConversationId: String? = null

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

    private val _conversationsLoading = MutableStateFlow(false)
    val conversationsLoading: StateFlow<Boolean> = _conversationsLoading.asStateFlow()

    // ── Local launcher intelligence (never sent to Skippy API) ─────────────────

    private val _homeApps = MutableStateFlow<List<String>>(emptyList())
    val homeApps: StateFlow<List<String>> = _homeApps.asStateFlow()

    private val _searchHistory = MutableStateFlow<List<String>>(emptyList())
    val searchHistory: StateFlow<List<String>> = _searchHistory.asStateFlow()

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
        // Initialize home apps — pre-populate with pinned apps on first run
        _homeApps.value = if (prefs.homeApps.isEmpty() && prefs.pinnedApps.isNotEmpty()) {
            val defaults = prefs.pinnedApps.take(12)
            prefs.homeApps = defaults
            defaults
        } else prefs.homeApps
        // Load local search history
        _searchHistory.value = prefs.searchHistory
        // Background periodic sync every 3 minutes — covers all data types
        viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(3 * 60 * 1000L)
                if (_isAuthenticated.value) {
                    loadTodos()
                    loadReminders()
                    loadNotes()
                    loadMemories()
                    loadConversations()
                    loadUserStats()
                }
            }
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
        // speak() is only called when enableVoice=true (call mode) — text queries always have enableVoice=false
        // The autoSpeak setting lets users opt out of TTS even in call mode
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
        // Optimistic update — immediate UI feedback
        _todos.update { list -> list.map { if (it.id == id) it.copy(isDone = isDone) else it } }
        viewModelScope.launch {
            val updated = SkippyRestApi.toggleTodo(prefs.skippyUrl, id, isDone)
            if (updated != null) {
                _todos.update { list -> list.map { if (it.id == id) updated else it } }
            } else {
                // Revert on API failure
                _todos.update { list -> list.map { if (it.id == id) it.copy(isDone = !isDone) else it } }
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
        // Optimistic update — immediate UI feedback
        _reminders.update { list -> list.map { if (it.id == id) it.copy(isDone = isDone) else it } }
        viewModelScope.launch {
            val updated = SkippyRestApi.toggleReminder(prefs.skippyUrl, id, isDone)
            if (updated != null) {
                _reminders.update { list -> list.map { if (it.id == id) updated else it } }
            } else {
                // Revert on API failure
                _reminders.update { list -> list.map { if (it.id == id) it.copy(isDone = !isDone) else it } }
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

    fun updateNote(id: String, title: String, content: String) {
        // Optimistic update
        _notes.update { list -> list.map { if (it.id == id) it.copy(title = title, content = content) else it } }
        viewModelScope.launch {
            val updated = SkippyRestApi.updateNote(prefs.skippyUrl, id, title, content)
            if (updated != null) {
                _notes.update { list -> list.map { if (it.id == id) updated else it } }
            }
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
            _conversationsLoading.value = true
            val result = SkippyRestApi.getConversations(prefs.skippyUrl)
            _conversations.value = result
            _conversationsLoading.value = false
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

        // Add todo command: "add todo buy groceries" / "todo: X"
        val todoRx = Regex("""^(?:add (?:a )?todo|add (?:a )?task|todo:?)\s+(.+)$""").find(lower)
        if (todoRx != null) {
            val content = todoRx.groupValues[1].trim()
            if (content.isNotBlank()) {
                askSkippy("Add a todo: $content")
                return true
            }
        }

        // Add reminder command: "remind me to X" / "set reminder for X"
        val reminderRx = Regex("""^(?:remind me to|set (?:a )?reminder(?:\s+for)?|reminder:?)\s+(.+)$""").find(lower)
        if (reminderRx != null) {
            val content = reminderRx.groupValues[1].trim()
            if (content.isNotBlank()) {
                viewModelScope.launch { SkippyRestApi.createReminder(prefs.skippyUrl, content, null); loadReminders() }
                speakAlways("Reminder set: $content")
                return true
            }
        }

        // Add note command: "take note X" / "note: X"
        val noteRx = Regex("""^(?:take (?:a )?note|note:?|add (?:a )?note)\s+(.+)$""").find(lower)
        if (noteRx != null) {
            val content = noteRx.groupValues[1].trim()
            if (content.isNotBlank()) {
                viewModelScope.launch { SkippyRestApi.createNote(prefs.skippyUrl, "Quick Note", content); loadNotes() }
                speakAlways("Note saved!")
                return true
            }
        }

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

    // ── Shared user context — injected into both Claude and Grok ──────────────

    /**
     * Builds a concise user-profile string from memories, todos, and prefs.
     * Passed as context to both Claude (via Skippy backend) and Grok so both
     * AIs operate as a single coherent system that knows the user.
     *
     * Deliberately kept short (5 memories, 3 todos) to minimise token usage —
     * the full dataset is stored server-side and available via the backend.
     */
    private fun buildUserContext(): String {
        val sb = StringBuilder()
        val userName = prefs.username
        if (userName.isNotBlank()) sb.appendLine("User's name: $userName")

        // Top 5 memories by importance (was 12 — reducing saves ~600 tokens/request)
        val topMemories = _memories.value
            .sortedByDescending { it.importance }
            .take(5)
        if (topMemories.isNotEmpty()) {
            sb.appendLine("Key things I know about this user:")
            topMemories.forEach { m -> sb.appendLine("  • [${m.category}] ${m.content}") }
        }

        // Top 3 urgent todos (was 5)
        val urgentTodos = _todos.value
            .filter { !it.isDone && (it.priority == "urgent" || it.priority == "high") }
            .take(3)
        if (urgentTodos.isNotEmpty()) {
            sb.appendLine("User's urgent/high-priority todos:")
            urgentTodos.forEach { t -> sb.appendLine("  • ${t.content}") }
        }

        return sb.toString().trim()
    }

    // ── Auto-interest extraction ───────────────────────────────────────────────
    // Pattern map: Regex → (category, tagList, importanceBoost)
    private val INTEREST_PATTERNS = listOf(
        Triple(Regex("""(?i)\bi (?:love|adore|am obsessed with|am passionate about)\s+([a-zA-Z0-9 ',]+)"""), "preference", listOf("auto-learned", "interest")),
        Triple(Regex("""(?i)\bi (?:hate|despise|can't stand|dislike)\s+([a-zA-Z0-9 ',]+)"""), "preference", listOf("auto-learned", "dislike")),
        Triple(Regex("""(?i)\bi (?:enjoy|like|really like|am into)\s+([a-zA-Z0-9 ',]+)"""), "preference", listOf("auto-learned", "interest")),
        Triple(Regex("""(?i)\bmy (?:favorite|favourite)\s+\w+\s+is\s+([a-zA-Z0-9 ',]+)"""), "preference", listOf("auto-learned", "favorite")),
        Triple(Regex("""(?i)\bi(?:'m| am) a[n]? ([a-zA-Z ]+?) (?:by profession|by trade|professionally|developer|designer|engineer|artist|writer|doctor|teacher|musician|student)\b"""), "identity", listOf("auto-learned", "profession")),
        Triple(Regex("""(?i)\bi work (?:as|in)\s+([a-zA-Z0-9 ',]+)"""), "work", listOf("auto-learned", "career")),
        Triple(Regex("""(?i)\bi live in\s+([a-zA-Z ,]+)"""), "fact", listOf("auto-learned", "location")),
        Triple(Regex("""(?i)\bmy name is\s+([a-zA-Z ]+)"""), "identity", listOf("auto-learned", "name")),
        Triple(Regex("""(?i)\bi(?:'m| am) (?:learning|studying|practicing)\s+([a-zA-Z0-9 ',]+)"""), "learning", listOf("auto-learned", "skill")),
        Triple(Regex("""(?i)\bi(?:'m| am) training for\s+([a-zA-Z0-9 ',]+)"""), "goal", listOf("auto-learned", "training")),
        Triple(Regex("""(?i)\bmy goal is (?:to\s+)?([a-zA-Z0-9 ',]+)"""), "goal", listOf("auto-learned", "goal")),
    )

    // Cooldown: only save up to 3 auto-memories per conversation to avoid spam
    private var autoMemoriesThisConversation = 0

    /**
     * Analyzes user message for interest/preference signals and stores them
     * as memories. Called after each user message if auto-learn is enabled.
     */
    private suspend fun maybeExtractInterests(userMessage: String) {
        if (!prefs.autoLearnMemories) return
        if (prefs.skippyUrl.isBlank()) return
        if (autoMemoriesThisConversation >= 3) return // cap per conversation

        for ((regex, category, tags) in INTEREST_PATTERNS) {
            val match = regex.find(userMessage) ?: continue
            val detail = match.groupValues.getOrNull(1)?.trim()?.take(80) ?: continue
            if (detail.length < 3) continue

            // Skip if very similar memory already exists
            val alreadyKnown = _memories.value.any {
                it.content.contains(detail, ignoreCase = true) ||
                detail.contains(it.content.take(30), ignoreCase = true)
            }
            if (alreadyKnown) continue

            val memContent = buildString {
                append("From conversation — User said: \"")
                append(userMessage.take(140))
                append("\"")
            }
            val created = SkippyRestApi.createMemory(prefs.skippyUrl, memContent, category, tags, importance = 7)
            if (created != null) {
                _memories.update { listOf(created) + it }
                autoMemoriesThisConversation++
                if (autoMemoriesThisConversation >= 3) break
            }
        }
    }

    // ── Chat history auto-compaction ───────────────────────────────────────────

    /**
     * When the in-memory chat history grows beyond COMPACT_AT messages, summarise
     * the oldest half into a single "Earlier conversation" context note and discard
     * them.  This keeps the history tight WITHOUT an extra API call.
     *
     * Result: a long conversation of 24 messages becomes ~12 after compaction.
     * Each subsequent API request then sends at most 10 of those 12 = very cheap.
     */
    private val COMPACT_AT   = 20
    private val COMPACT_KEEP = 10

    private fun autoCompactHistory() {
        if (chatHistory.size <= COMPACT_AT) return

        val toSummarise = chatHistory.dropLast(COMPACT_KEEP)
        val toKeep      = chatHistory.takeLast(COMPACT_KEEP)

        // Build a brief plain-text summary of the old messages (no API call)
        val summary = buildString {
            append("[Earlier conversation context — ")
            toSummarise.filter { it.role == "user" }.takeLast(5).forEach { m ->
                append("User: \"${m.content.take(70).replace('\n', ' ').trim()}\"  ")
            }
            append("]")
        }

        chatHistory.clear()
        chatHistory.add(ChatMessage("user", summary))   // prepend as context note
        chatHistory.add(ChatMessage("assistant", "Got it — I have context from our earlier exchange."))
        chatHistory.addAll(toKeep)

        // Show a subtle info entry in the chat log so the user knows it happened
        _chatLog.update { log ->
            if (log.none { it.role == "system" }) {
                (log + ChatEntry(role = "system", text = "💬 Conversation auto-compacted to keep things fast & affordable")).takeLast(40)
            } else log
        }
    }

    // ── AI Chat ────────────────────────────────────────────────────────────────

    fun askSkippy(text: String, enableVoice: Boolean = false) {
        if (_isLoading.value) return
        viewModelScope.launch {
            _isLoading.value = true
            if (enableVoice) _voiceState.value = VoiceState.Processing
            _streamingText.value = ""
            _chatLog.update { (it + ChatEntry(role = "user", text = text)).takeLast(40) }
            chatHistory.add(ChatMessage("user", text))
            addSearchHistory(text.take(80)) // Track locally for smart suggestions

            // Auto-compact history before sending to keep API costs low
            autoCompactHistory()

            // Extract user interests asynchronously (non-blocking — fire and forget)
            viewModelScope.launch { maybeExtractInterests(text) }

            // ── Smart routing ────────────────────────────────────────────────────
            // Priority: forced mode > emotional override > auto-route
            val forced = _forcedAiMode.value
            val useGrok = when {
                forced == "grok"   -> true
                forced == "claude" -> false
                // Emotional/reasoning queries → always Claude (even in Grok conversation)
                GrokApi.isEmotionalQuery(text) -> false
                // Auto-route: real-time query or sticky Grok conversation
                prefs.grokAutoRoute && (
                    GrokApi.isRealTimeQuery(text) ||
                    GrokApi.shouldContinueWithGrok(text, conversationUsesGrok)
                ) -> true
                else -> false
            }

            var reply: String

            if (useGrok) {
                // Add a "Searching…" indicator in streaming text
                _streamingText.value = ""
                _isGrokStreaming.value = true
            // Build a trimmed history for Grok — 4 messages keeps cost low
            val grokHistory = chatHistory.takeLast(4)
                reply = GrokApi.chat(
                    apiKey      = prefs.grokApiKey,
                    messages    = grokHistory,
                    userContext = buildUserContext(),
                    onChunk     = { chunk ->
                        viewModelScope.launch(Dispatchers.Main) {
                            _streamingText.value += chunk
                            if (enableVoice) _voiceState.value = VoiceState.Speaking
                        }
                    },
                )
                _isGrokStreaming.value = false
                // Annotate the reply so user knows it's live from Grok
                if (!reply.startsWith("⚠")) {
                    reply = "$reply\n\n*— Grok (live)*"
                }
            } else {
                // ── Default: route to Skippy backend (Claude) ────────────────────
                if (currentConversationId == null) {
                    currentConversationId = SkippyApi.createConversation(prefs.skippyUrl)
                }
                reply = SkippyApi.chat(
                    baseUrl = prefs.skippyUrl,
                    // Send only the last 10 messages to Claude — cuts ~65% of context tokens
                    // for long conversations while keeping full recent context.
                    messages = chatHistory.takeLast(10),
                    model = prefs.aiModel,
                    conversationId = currentConversationId,
                    onChunk = { chunk ->
                        viewModelScope.launch(Dispatchers.Main) {
                            _streamingText.value += chunk
                            if (enableVoice) _voiceState.value = VoiceState.Speaking
                        }
                    },
                )

                // If we get an auth error, re-authenticate and retry once
                if (reply == "__AUTH_ERROR__" || reply.startsWith("Error 401") || reply.startsWith("Error 403")) {
                    reAuthenticate()
                    kotlinx.coroutines.delay(1500)
                    reply = SkippyApi.chat(prefs.skippyUrl, chatHistory.takeLast(10), prefs.aiModel)
                    if (reply == "__AUTH_ERROR__") {
                        reply = "Session expired — signing you back in. Please try again in a moment."
                        _isAuthenticated.value = false
                    }
                }
            }

            chatHistory.add(ChatMessage("assistant", reply))
            while (chatHistory.size > 30) chatHistory.removeAt(0)

            // Update sticky Grok mode for this conversation
            conversationUsesGrok = useGrok

            _streamingText.value = ""
            _chatLog.update { (it + ChatEntry(role = "skippy", text = reply, isGrok = useGrok)).takeLast(40) }
            _lastResponse.value = reply

            // Cache last response for home-screen widget
            prefs.lastAiResponse = reply.take(200).replace(Regex("""\*[^*]*\*"""), "").trim()
            // Push update to any placed Skippy widgets
            SkippyWidgetProvider.updateAll(getApplication())

            _isLoading.value = false
            _voiceState.value = if (enableVoice) VoiceState.Speaking else VoiceState.Idle
            if (enableVoice) speak(reply)

            // Refresh todos/reminders after chat — Skippy may have created some
            if (!useGrok) {
                loadTodos()
                loadReminders()
            }
        }
    }

    fun clearChat() {
        chatHistory.clear()
        _chatLog.value = emptyList()
        _lastResponse.value = ""
        _streamingText.value = ""
        _isGrokStreaming.value = false
        conversationUsesGrok = false
        currentConversationId = null
        autoMemoriesThisConversation = 0
    }

    /** Resume an existing conversation — loads context so next message continues it server-side */
    fun resumeConversation(id: String, title: String?) {
        chatHistory.clear()
        currentConversationId = id
        _streamingText.value = ""
        // Show a loading placeholder immediately
        _chatLog.value = listOf(
            ChatEntry(role = "skippy", text = "💬 Loading ${title ?: "conversation"}…")
        )
        viewModelScope.launch {
            val messages = SkippyRestApi.getConversationMessages(prefs.skippyUrl, id)
            if (messages.isNotEmpty()) {
                // Restore chat history for context
                chatHistory.addAll(messages)
                _chatLog.value = messages.map {
                    ChatEntry(
                        role = if (it.role == "assistant") "skippy" else it.role,
                        text = it.content,
                    )
                }
            } else {
                _chatLog.value = listOf(
                    ChatEntry(role = "skippy", text = "💬 Continuing ${title ?: "your conversation"}. What would you like to say?")
                )
            }
        }
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
        trackAppUsage(packageName)
    }

    fun launchAppByName(name: String): Boolean {
        val app = _apps.value.firstOrNull { it.name.lowercase().contains(name.lowercase()) } ?: return false
        launchApp(app.packageName)
        return true
    }

    fun togglePinApp(packageName: String) {
        val current = prefs.pinnedApps.toMutableList()
        if (current.contains(packageName)) current.remove(packageName) else current.add(packageName)
        prefs.pinnedApps = current
    }

    fun refreshApps() { loadApps() }

    // ── Local launcher intelligence ────────────────────────────────────────────

    fun updateHomeApps(packages: List<String>) {
        val cleaned = packages.take(12)
        prefs.homeApps = cleaned
        _homeApps.value = cleaned
    }

    fun addSearchHistory(query: String) {
        if (query.isBlank() || query.length < 2) return
        val current = prefs.searchHistory.toMutableList()
        current.remove(query)
        current.add(0, query)
        val updated = current.take(20)
        prefs.searchHistory = updated
        _searchHistory.value = updated
    }

    fun trackAppUsage(packageName: String) {
        val raw = prefs.appUsageCounts
        val counts = if (raw.isBlank()) mutableMapOf()
        else raw.split(",").mapNotNull {
            val p = it.split("=")
            if (p.size == 2) p[0] to (p[1].toIntOrNull() ?: 0) else null
        }.toMap().toMutableMap()
        counts[packageName] = (counts[packageName] ?: 0) + 1
        prefs.appUsageCounts = counts.entries.joinToString(",") { "${it.key}=${it.value}" }
    }

    override fun onCleared() {
        super.onCleared()
        tts?.shutdown()
    }
}
