package com.skippy.launcher.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.ui.theme.*

@Composable
fun SetupScreen(onComplete: (url: String) -> Unit) {
    var url   by remember { mutableStateOf("https://") }
    var error by remember { mutableStateOf("") }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(colors = listOf(NavyDark, NavyMid, NavyDeep)))
            .statusBarsPadding()
            .navigationBarsPadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text("⚡", fontSize = 72.sp)

            Text(
                text      = "Skippy Launcher",
                fontSize  = 32.sp,
                fontWeight = FontWeight.Light,
                color     = WhiteText,
                textAlign = TextAlign.Center,
            )
            Text(
                text      = "Enter your Skippy server URL to connect.\nThis is your Vercel deployment URL.",
                style     = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color     = WhiteMuted,
            )

            Spacer(Modifier.height(4.dp))

            OutlinedTextField(
                value         = url,
                onValueChange = { url = it; error = "" },
                label         = { Text("Skippy URL", color = WhiteMuted) },
                placeholder   = { Text("https://your-skippy.vercel.app", color = WhiteDim) },
                modifier      = Modifier.fillMaxWidth(),
                colors        = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor    = CyanPrimary,
                    unfocusedBorderColor  = CyanGlow,
                    focusedTextColor      = WhiteText,
                    unfocusedTextColor    = WhiteText,
                    cursorColor           = CyanPrimary,
                    focusedLabelColor     = CyanPrimary,
                    unfocusedLabelColor   = WhiteMuted,
                    focusedContainerColor   = CyanDim,
                    unfocusedContainerColor = NavyMid,
                ),
                shape         = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction    = ImeAction.Done,
                ),
                isError       = error.isNotEmpty(),
                singleLine    = true,
            )

            AnimatedVisibility(visible = error.isNotEmpty()) {
                Text(error, color = ErrorRed, fontSize = 13.sp)
            }

            Button(
                onClick = {
                    val trimmed = url.trim()
                    when {
                        !trimmed.startsWith("http") ->
                            error = "URL must start with https://"
                        trimmed.length < 12 ->
                            error = "Enter a valid URL"
                        else -> onComplete(trimmed)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = CyanPrimary,
                    contentColor   = NavyDark,
                ),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Connect to Skippy", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
    }
}
