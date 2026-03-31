package com.skippy.launcher.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.skippy.launcher.data.WeatherData
import com.skippy.launcher.ui.theme.*
import kotlin.math.roundToInt

@Composable
fun WeatherWidget(weather: WeatherData?, modifier: Modifier = Modifier, compact: Boolean = false) {
    AnimatedVisibility(visible = weather != null, enter = fadeIn(), exit = fadeOut()) {
        weather ?: return@AnimatedVisibility

        if (compact) {
            Column(modifier = modifier, horizontalAlignment = Alignment.End) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(weather.emoji, fontSize = 20.sp)
                    Text(
                        "${weather.temperature.roundToInt()}°${weather.unit.take(1)}",
                        fontSize = 22.sp, fontWeight = FontWeight.Light, color = WhiteText,
                    )
                }
                if (weather.city.isNotEmpty()) {
                    Text(weather.city, fontSize = 11.sp, color = CyanPrimary)
                }
            }
        } else {
            Surface(
                modifier = modifier
                    .fillMaxWidth()
                    .border(1.dp, CyanGlow, RoundedCornerShape(16.dp)),
                shape = RoundedCornerShape(16.dp),
                color = CyanDim,
                tonalElevation = 0.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Text(text = weather.emoji, fontSize = 40.sp)
                        Column {
                            Text(
                                text = "${weather.temperature.roundToInt()}${weather.unit}",
                                fontSize = 30.sp, fontWeight = FontWeight.Light, color = WhiteText,
                            )
                            Text(text = weather.condition, fontSize = 13.sp, color = WhiteMuted)
                        }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        if (weather.city.isNotEmpty()) {
                            Text(text = weather.city, fontSize = 13.sp, color = CyanPrimary, fontWeight = FontWeight.Medium)
                        }
                        Text(text = "💨 ${weather.windSpeed.roundToInt()} mph", fontSize = 12.sp, color = WhiteDim)
                    }
                }
            }
        }
    }
}
