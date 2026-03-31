package com.skippy.launcher.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.skippy.launcher.data.AppInfo
import com.skippy.launcher.ui.components.AppGrid
import com.skippy.launcher.ui.theme.*

@Composable
fun AppDrawerScreen(
    apps: List<AppInfo>,
    onAppClick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query   by remember { mutableStateOf("") }
    val filtered = remember(apps, query) {
        if (query.isBlank()) apps
        else apps.filter { it.name.contains(query, ignoreCase = true) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(NavyDeep.copy(alpha = 0.97f), NavyMid.copy(alpha = 0.97f))
                )
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.ArrowBack, "Back", tint = WhiteMuted)
                }
                Text(
                    text  = "All Apps",
                    style = MaterialTheme.typography.titleLarge,
                    color = WhiteText,
                    modifier = Modifier.weight(1f).padding(start = 4.dp),
                )
            }

            // Search bar
            OutlinedTextField(
                value            = query,
                onValueChange    = { query = it },
                placeholder      = { Text("Search apps...", color = WhiteDim) },
                leadingIcon      = { Icon(Icons.Default.Search, null, tint = WhiteMuted) },
                modifier         = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                colors           = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor   = CyanPrimary,
                    unfocusedBorderColor = CyanGlow,
                    focusedTextColor     = WhiteText,
                    unfocusedTextColor   = WhiteText,
                    cursorColor          = CyanPrimary,
                    focusedContainerColor   = CyanDim,
                    unfocusedContainerColor = NavyDeep.copy(alpha = 0.4f),
                ),
                shape            = RoundedCornerShape(14.dp),
                singleLine       = true,
                keyboardOptions  = KeyboardOptions(imeAction = ImeAction.Search),
            )

            // App grid
            AppGrid(
                apps       = filtered,
                columns    = 4,
                onAppClick = { pkg -> onAppClick(pkg); onDismiss() },
                modifier   = Modifier.fillMaxSize(),
            )
        }
    }
}
