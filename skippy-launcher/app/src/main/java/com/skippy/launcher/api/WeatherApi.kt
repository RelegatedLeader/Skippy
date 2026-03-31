package com.skippy.launcher.api

import com.skippy.launcher.data.WeatherData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

object WeatherApi {
    private val client = OkHttpClient()

    private val WMO_CODES = mapOf(
        0  to ("Clear Sky"       to "☀️"),
        1  to ("Mostly Clear"    to "🌤️"),
        2  to ("Partly Cloudy"   to "⛅"),
        3  to ("Overcast"        to "☁️"),
        45 to ("Foggy"           to "🌫️"),
        48 to ("Icy Fog"         to "🌫️"),
        51 to ("Light Drizzle"   to "🌦️"),
        53 to ("Drizzle"         to "🌦️"),
        55 to ("Heavy Drizzle"   to "🌧️"),
        61 to ("Light Rain"      to "🌧️"),
        63 to ("Rain"            to "🌧️"),
        65 to ("Heavy Rain"      to "🌧️"),
        71 to ("Light Snow"      to "🌨️"),
        73 to ("Snow"            to "❄️"),
        75 to ("Heavy Snow"      to "❄️"),
        80 to ("Showers"         to "🌦️"),
        81 to ("Showers"         to "🌦️"),
        82 to ("Heavy Showers"   to "⛈️"),
        95 to ("Thunderstorm"    to "⛈️"),
        99 to ("Thunderstorm"    to "⛈️"),
    )

    suspend fun fetchWeather(lat: Double, lon: Double, unit: String = "fahrenheit"): WeatherData? =
        withContext(Dispatchers.IO) {
            try {
                val url = "https://api.open-meteo.com/v1/forecast" +
                    "?latitude=$lat&longitude=$lon" +
                    "&current=temperature_2m,weather_code,wind_speed_10m" +
                    "&temperature_unit=$unit&wind_speed_unit=mph"
                val body = client.newCall(Request.Builder().url(url).build())
                    .execute().body?.string() ?: return@withContext null
                val current = JSONObject(body).getJSONObject("current")
                val temp    = current.getDouble("temperature_2m")
                val code    = current.getInt("weather_code")
                val wind    = current.getDouble("wind_speed_10m")
                val (cond, emoji) = WMO_CODES[code] ?: ("Unknown" to "🌡️")
                val unitSymbol = if (unit == "fahrenheit") "°F" else "°C"
                WeatherData(temp, unitSymbol, cond, wind, emoji = emoji)
            } catch (e: Exception) {
                null
            }
        }

    suspend fun cityName(lat: Double, lon: Double): String =
        withContext(Dispatchers.IO) {
            try {
                val url = "https://geocoding-api.open-meteo.com/v1/reverse" +
                    "?latitude=$lat&longitude=$lon&count=1"
                val body = client.newCall(Request.Builder().url(url).build())
                    .execute().body?.string() ?: return@withContext ""
                JSONObject(body).optJSONArray("results")
                    ?.getJSONObject(0)?.optString("name", "") ?: ""
            } catch (e: Exception) {
                ""
            }
        }
}
