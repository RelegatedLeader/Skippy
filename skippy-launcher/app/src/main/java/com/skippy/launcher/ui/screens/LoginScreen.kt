package com.skippy.launcher.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.R
import com.skippy.launcher.ui.theme.*
import com.skippy.launcher.viewmodel.LauncherViewModel
import com.skippy.launcher.viewmodel.LoginState

@Composable
fun LoginScreen(viewModel: LauncherViewModel) {
    val loginState by viewModel.loginState.collectAsState()

    var serverUrl   by remember { mutableStateOf("https://") }
    var username    by remember { mutableStateOf("") }
    var password    by remember { mutableStateOf("") }
    var accessCode  by remember { mutableStateOf("") }
    var showPass    by remember { mutableStateOf(false) }
    var expandConn  by remember { mutableStateOf(false) }

    // Gentle floating animation for the robot
    val floatAnim = rememberInfiniteTransition(label = "float")
    val yOffset by floatAnim.animateFloat(
        initialValue = 0f, targetValue = -12f,
        animationSpec = infiniteRepeatable(
            tween(2000, easing = FastOutSlowInEasing), RepeatMode.Reverse
        ), label = "y"
    )
    val glowAlpha by floatAnim.animateFloat(
        initialValue = 0.3f, targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            tween(1800, easing = FastOutSlowInEasing), RepeatMode.Reverse
        ), label = "glow"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.0f to NavyDark,
                        0.45f to NavyMid,
                        1.0f to NavyDeep,
                    )
                )
            )
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Subtle grid background
        Canvas(modifier = Modifier.fillMaxSize()) {
            val step = 48.dp.toPx()
            val gridColor = Color(0xFF29C2E6).copy(alpha = 0.04f)
            var x = 0f
            while (x < size.width) {
                drawLine(gridColor, start = androidx.compose.ui.geometry.Offset(x, 0f),
                    end = androidx.compose.ui.geometry.Offset(x, size.height), strokeWidth = 1f)
                x += step
            }
            var y = 0f
            while (y < size.height) {
                drawLine(gridColor, start = androidx.compose.ui.geometry.Offset(0f, y),
                    end = androidx.compose.ui.geometry.Offset(size.width, y), strokeWidth = 1f)
                y += step
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(48.dp))

            // ── Robot mascot ──────────────────────────────────────────────
            Box(contentAlignment = Alignment.Center) {
                // Glow ring behind robot
                Box(
                    modifier = Modifier
                        .size(160.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    CyanPrimary.copy(alpha = glowAlpha * 0.5f),
                                    CyanPrimary.copy(alpha = 0f),
                                )
                            )
                        )
                )
                Image(
                    painter = painterResource(R.drawable.skippy_robot),
                    contentDescription = "Skippy",
                    modifier = Modifier
                        .size(140.dp)
                        .offset(y = yOffset.dp),
                    contentScale = ContentScale.Fit,
                )
            }

            Spacer(Modifier.height(16.dp))

            Text(
                "Hey, I'm Skippy!",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = WhiteText,
                textAlign = TextAlign.Center,
            )
            Text(
                "Your personal AI companion.\nSign in to get started.",
                fontSize = 15.sp,
                color = WhiteMuted,
                textAlign = TextAlign.Center,
                lineHeight = 22.sp,
                modifier = Modifier.padding(top = 6.dp),
            )

            Spacer(Modifier.height(32.dp))

            // ── Credentials card ──────────────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = NavyCard,
                border = BorderStroke(1.dp, CyanGlow),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Text(
                        "🔐  Sign In",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = WhiteText,
                    )

                    // Username
                    LoginField(
                        value = username,
                        onValueChange = { username = it },
                        label = "Username",
                        placeholder = "skippy-xxxxxxxx",
                        leadingIcon = { Icon(Icons.Default.Person, null, tint = CyanPrimary, modifier = Modifier.size(20.dp)) },
                    )

                    // Password
                    LoginField(
                        value = password,
                        onValueChange = { password = it },
                        label = "Password",
                        placeholder = "Your password",
                        visualTransformation = if (showPass) VisualTransformation.None else PasswordVisualTransformation(),
                        leadingIcon = { Icon(Icons.Default.Lock, null, tint = CyanPrimary, modifier = Modifier.size(20.dp)) },
                        trailingIcon = {
                            IconButton(onClick = { showPass = !showPass }) {
                                Icon(
                                    if (showPass) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    null, tint = WhiteMuted, modifier = Modifier.size(20.dp),
                                )
                            }
                        },
                        keyboardType = KeyboardType.Password,
                    )

                    // Access code
                    LoginField(
                        value = accessCode,
                        onValueChange = { accessCode = it.uppercase() },
                        label = "Access Code",
                        placeholder = "XXXX-XXXX-XXXX",
                        leadingIcon = { Icon(Icons.Default.VpnKey, null, tint = CyanPrimary, modifier = Modifier.size(20.dp)) },
                    )

                    // Server URL toggle (advanced)
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { expandConn = !expandConn },
                        shape = RoundedCornerShape(10.dp),
                        color = NavyDeep.copy(alpha = 0.5f),
                        border = BorderStroke(1.dp, SurfaceBorder),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(Icons.Default.Cloud, null, tint = WhiteMuted, modifier = Modifier.size(18.dp))
                                Text("Server URL", color = WhiteMuted, fontSize = 13.sp)
                                if (serverUrl.length > 8) {
                                    Text(
                                        serverUrl.removePrefix("https://").take(24) + if (serverUrl.length > 32) "…" else "",
                                        color = CyanPrimary, fontSize = 12.sp,
                                    )
                                }
                            }
                            Icon(
                                if (expandConn) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                null, tint = WhiteMuted, modifier = Modifier.size(18.dp),
                            )
                        }
                    }

                    AnimatedVisibility(visible = expandConn) {
                        LoginField(
                            value = serverUrl,
                            onValueChange = { serverUrl = it },
                            label = "Skippy Server URL",
                            placeholder = "https://your-skippy.vercel.app",
                            leadingIcon = { Icon(Icons.Default.Link, null, tint = CyanPrimary, modifier = Modifier.size(20.dp)) },
                            keyboardType = KeyboardType.Uri,
                        )
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Error message
            AnimatedVisibility(visible = loginState is LoginState.Error) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    color = ErrorRed.copy(alpha = 0.1f),
                    border = BorderStroke(1.dp, ErrorRed.copy(alpha = 0.4f)),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.ErrorOutline, null, tint = ErrorRed, modifier = Modifier.size(18.dp))
                        Text(
                            (loginState as? LoginState.Error)?.message ?: "",
                            color = ErrorRed, fontSize = 13.sp,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            // Sign in button
            Button(
                onClick = {
                    val url = serverUrl.trim().trimEnd('/')
                    viewModel.login(
                        url = if (url.startsWith("http")) url else "https://$url",
                        username = username.trim(),
                        password = password,
                        accessCode = accessCode.trim(),
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                enabled = loginState !is LoginState.Loading &&
                        username.isNotBlank() && password.isNotBlank() &&
                        accessCode.isNotBlank() && serverUrl.length > 10,
                colors = ButtonDefaults.buttonColors(
                    containerColor = CyanPrimary,
                    contentColor = NavyDeep,
                    disabledContainerColor = CyanGlow,
                    disabledContentColor = WhiteMuted,
                ),
                shape = RoundedCornerShape(14.dp),
            ) {
                if (loginState is LoginState.Loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = NavyDeep,
                        strokeWidth = 2.5.dp,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("Signing in…", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                } else {
                    Icon(Icons.Default.Login, null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Sign In to Skippy", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }

            Spacer(Modifier.height(20.dp))

            // Help text
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = NavyCard.copy(alpha = 0.6f),
                border = BorderStroke(1.dp, SurfaceBorder.copy(alpha = 0.4f)),
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("💡 Where do I find my credentials?", color = AccentGold, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Visit your Skippy web app → Setup page. Your username, password, and access code were generated automatically when you first set up Skippy.",
                        color = WhiteMuted,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    )
                }
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

@Composable
private fun LoginField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 12.sp) },
        placeholder = { Text(placeholder, color = WhiteDim, fontSize = 13.sp) },
        leadingIcon = leadingIcon,
        trailingIcon = trailingIcon,
        visualTransformation = visualTransformation,
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = CyanPrimary,
            unfocusedBorderColor = CyanGlow,
            focusedLabelColor = CyanPrimary,
            unfocusedLabelColor = WhiteMuted,
            focusedTextColor = WhiteText,
            unfocusedTextColor = WhiteText,
            cursorColor = CyanPrimary,
            focusedContainerColor = NavyDeep.copy(alpha = 0.4f),
            unfocusedContainerColor = NavyDeep.copy(alpha = 0.3f),
        ),
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboardType,
            imeAction = ImeAction.Next,
        ),
    )
}

