package com.skippy.launcher.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.ui.theme.CyanPrimary
import com.skippy.launcher.ui.theme.WhiteMuted
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun ClockWidget(modifier: Modifier = Modifier, compact: Boolean = false) {
    var time by remember { mutableStateOf(fmtTime()) }
    var ampm by remember { mutableStateOf(fmtAmPm()) }
    var date by remember { mutableStateOf(fmtDate()) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            time = fmtTime()
            ampm = fmtAmPm()
            date = fmtDate()
        }
    }

    if (compact) {
        Column(modifier = modifier) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    time,
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Light,
                    color = MaterialTheme.colorScheme.onBackground,
                    letterSpacing = (-1).sp,
                    lineHeight = 36.sp
                )
                Text(
                    ampm,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Light,
                    color = CyanPrimary,
                    modifier = Modifier.padding(bottom = 5.dp, start = 4.dp)
                )
            }
            Text(date, fontSize = 11.sp, color = WhiteMuted)
        }
    } else {
        Column(
            modifier = modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    time,
                    fontSize = 88.sp,
                    fontWeight = FontWeight.Thin,
                    color = MaterialTheme.colorScheme.onBackground,
                    letterSpacing = (-3).sp,
                    lineHeight = 88.sp
                )
                Text(
                    ampm,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Light,
                    color = CyanPrimary,
                    modifier = Modifier.padding(bottom = 14.dp, start = 6.dp)
                )
            }
            Text(
                date,
                fontSize = 16.sp,
                color = WhiteMuted,
                letterSpacing = 1.sp
            )
        }
    }
}

private fun fmtTime() = SimpleDateFormat("h:mm", Locale.getDefault()).format(Date())
private fun fmtAmPm() = SimpleDateFormat("a", Locale.getDefault()).format(Date())
private fun fmtDate() = SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(Date())
