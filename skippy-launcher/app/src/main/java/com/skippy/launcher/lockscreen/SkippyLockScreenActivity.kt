package com.skippy.launcher.lockscreen

import android.os.Bundle
import androidx.fragment.app.FragmentActivity

/**
 * Dead-code stub — the activity-level lockscreen was retired.
 * All lockscreen UI now lives in the in-app LockScreenPage Compose overlay
 * inside HomeScreen, which shows AFTER the system keyguard and never
 * fights with it. This activity does nothing and finishes immediately.
 */
class SkippyLockScreenActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        finish()
    }

    companion object {
        const val EXTRA_MODE   = "skippy_lock_mode"
        const val MODE_PREPARE = "prepare"
        const val MODE_SHOW    = "show"
    }
}
