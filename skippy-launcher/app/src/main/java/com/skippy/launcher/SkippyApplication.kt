package com.skippy.launcher

import android.app.Application
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import com.skippy.launcher.viewmodel.LauncherViewModel

/**
 * Application subclass that holds a single, process-scoped LauncherViewModel.
 *
 * WHY THIS EXISTS — both MainActivity and SkippyLockScreenActivity need a
 * LauncherViewModel. If each creates its own via viewModels(), we get:
 *   • Two full copies of every installed app icon (100-200+ Drawables × ~300 KB each)
 *   • Two TextToSpeech engine instances (each ~10 MB native heap)
 *   • Two background sync coroutine loops doing duplicate network work
 *
 * The java_pid*.hprof heap dump in the project confirms an OOM crash from this.
 * Sharing a single Application-scoped ViewModel eliminates all duplicate allocations.
 */
class SkippyApplication : Application(), ViewModelStoreOwner {

    // A long-lived ViewModelStore for the app — cleared only when the process dies.
    override val viewModelStore = ViewModelStore()

    /**
     * The one and only LauncherViewModel for the entire app process.
     * Both MainActivity and SkippyLockScreenActivity read from this.
     */
    val sharedViewModel: LauncherViewModel by lazy {
        ViewModelProvider(
            this,
            ViewModelProvider.AndroidViewModelFactory.getInstance(this),
        )[LauncherViewModel::class.java]
    }

    override fun onTerminate() {
        viewModelStore.clear()
        super.onTerminate()
    }
}

