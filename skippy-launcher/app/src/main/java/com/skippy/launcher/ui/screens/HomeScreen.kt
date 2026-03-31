package com.skippy.launcher.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.android.gms.location.LocationServices
import com.skippy.launcher.ui.components.*
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel

@SuppressLint("MissingPermission")
@Composable
fun HomeScreen(
    viewModel: LauncherViewModel,
    onOpenDrawer: () -> Unit,
) {
    val context     = LocalContext.current
    val weather     by viewModel.weather.collectAsState()
    val apps        by viewModel.apps.collectAsState()
    var swipeOffset by remember { mutableFloatStateOf(0f) }

    // Location → weather
    val locPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val client = LocationServices.getFusedLocationProviderClient(context)
            client.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) viewModel.updateWeather(loc.latitude, loc.longitude)
            }
        }
    }

    LaunchedEffect(Unit) {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED
        ) {
            val client = LocationServices.getFusedLocationProviderClient(context)
            client.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) viewModel.updateWeather(loc.latitude, loc.longitude)
            }
        } else {
            locPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.0f to NavyDark,
                        0.5f to NavyMid,
                        1.0f to NavyDeep,
                    )
                )
            )
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { _, delta -> swipeOffset += delta },
                    onDragEnd = {
                        if (swipeOffset < -60f) onOpenDrawer()
                        swipeOffset = 0f
                    },
                    onDragCancel = { swipeOffset = 0f },
                )
            },
    ) {
        // Scrollable main content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(bottom = 100.dp)          // leave room for dock
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Spacer(Modifier.height(12.dp))

            // Large clock
            ClockWidget()

            // Weather (appears once data loads)
            WeatherWidget(weather = weather)

            Spacer(Modifier.height(8.dp))

            // Skippy voice + chat widget
            SkippyWidget(viewModel = viewModel)

            Spacer(Modifier.height(8.dp))
        }

        // Fixed dock at bottom
        AppDock(
            apps            = apps,
            pinnedPackages  = viewModel.prefs.pinnedApps,
            onAppClick      = { pkg -> viewModel.launchApp(pkg) },
            onDrawerClick   = onOpenDrawer,
            modifier        = Modifier.align(Alignment.BottomCenter),
        )
    }
}
