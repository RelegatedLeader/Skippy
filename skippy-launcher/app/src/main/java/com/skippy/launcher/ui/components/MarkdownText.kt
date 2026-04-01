package com.skippy.launcher.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.skippy.launcher.ui.theme.*

/**
 * Renders a markdown-formatted string with:
 *  **bold** → cyan bold | *italic* → italic | `code` → monospaced cyan
 *  # / ## / ### headings → sized cyan bold | - / * bullets → • bullets
 *  --- dividers → horizontal rule
 */
@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    baseColor: Color = WhiteText,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 20.sp,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    val annotated = remember(text, baseColor, fontSize) {
        parseMarkdown(text, baseColor, fontSize.value)
    }
    Text(
        text      = annotated,
        modifier  = modifier,
        lineHeight = lineHeight,
        maxLines  = maxLines,
        overflow  = overflow,
    )
}

// ── Parser ────────────────────────────────────────────────────────────────────

fun parseMarkdown(raw: String, baseColor: Color, baseSizeSp: Float): AnnotatedString =
    buildAnnotatedString {
        raw.split("\n").forEachIndexed { idx, line ->
            if (idx > 0) append("\n")
            val t = line.trimStart()
            when {
                t.startsWith("### ") ->
                    withStyle(SpanStyle(color = CyanPrimary, fontWeight = FontWeight.Bold,
                        fontSize = (baseSizeSp + 1f).sp)) { append(t.removePrefix("### ")) }
                t.startsWith("## ") ->
                    withStyle(SpanStyle(color = CyanPrimary, fontWeight = FontWeight.Bold,
                        fontSize = (baseSizeSp + 3f).sp)) { append(t.removePrefix("## ")) }
                t.startsWith("# ") ->
                    withStyle(SpanStyle(color = CyanPrimary, fontWeight = FontWeight.ExtraBold,
                        fontSize = (baseSizeSp + 5f).sp)) { append(t.removePrefix("# ")) }
                (t.startsWith("- ") || t.startsWith("• ")) && !t.startsWith("---") -> {
                    withStyle(SpanStyle(color = CyanPrimary)) { append("  • ") }
                    appendInline(t.drop(2), baseColor)
                }
                t.startsWith("* ") && !t.startsWith("**") -> {
                    withStyle(SpanStyle(color = CyanPrimary)) { append("  • ") }
                    appendInline(t.drop(2), baseColor)
                }
                t.matches(Regex("^\\d+\\. .*")) -> {
                    val num  = t.substringBefore(". ")
                    val rest = t.substringAfter(". ")
                    withStyle(SpanStyle(color = CyanPrimary, fontWeight = FontWeight.SemiBold)) {
                        append("  $num. ")
                    }
                    appendInline(rest, baseColor)
                }
                t == "---" || t == "═══" || t == "===" ->
                    withStyle(SpanStyle(color = baseColor.copy(alpha = 0.2f))) {
                        append("─────────────────────")
                    }
                else -> appendInline(line, baseColor)
            }
        }
    }

private fun AnnotatedString.Builder.appendInline(text: String, baseColor: Color) {
    var i = 0
    val plain = StringBuilder()

    fun flushPlain() {
        if (plain.isNotEmpty()) {
            withStyle(SpanStyle(color = baseColor)) { append(plain.toString()) }
            plain.clear()
        }
    }

    while (i < text.length) {
        when {
            // Bold-italic: ***text***
            text.startsWith("***", i) -> {
                val end = text.indexOf("***", i + 3)
                if (end > i + 2) {
                    flushPlain()
                    withStyle(SpanStyle(color = CyanPrimary, fontWeight = FontWeight.Bold,
                        fontStyle = FontStyle.Italic)) {
                        append(text.substring(i + 3, end))
                    }
                    i = end + 3
                } else { plain.append(text[i]); i++ }
            }
            // Bold: **text**
            text.startsWith("**", i) -> {
                val end = text.indexOf("**", i + 2)
                if (end > i + 1) {
                    flushPlain()
                    withStyle(SpanStyle(color = CyanPrimary, fontWeight = FontWeight.Bold)) {
                        append(text.substring(i + 2, end))
                    }
                    i = end + 2
                } else { plain.append(text[i]); i++ }
            }
            // Italic: *text*
            text[i] == '*' -> {
                val end = text.indexOf('*', i + 1).takeIf { it > i }
                if (end != null) {
                    flushPlain()
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic,
                        color = baseColor.copy(alpha = 0.85f))) {
                        append(text.substring(i + 1, end))
                    }
                    i = end + 1
                } else { plain.append(text[i]); i++ }
            }
            // Italic: _text_
            text[i] == '_' && i + 1 < text.length && text[i + 1] != ' ' -> {
                val end = text.indexOf('_', i + 1).takeIf { it > i }
                if (end != null) {
                    flushPlain()
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic,
                        color = baseColor.copy(alpha = 0.85f))) {
                        append(text.substring(i + 1, end))
                    }
                    i = end + 1
                } else { plain.append(text[i]); i++ }
            }
            // Inline code: `text`
            text[i] == '`' -> {
                val end = text.indexOf('`', i + 1).takeIf { it > i }
                if (end != null) {
                    flushPlain()
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace,
                        background = NavyCard, color = CyanPrimary, fontSize = 12.sp)) {
                        append(" ${text.substring(i + 1, end)} ")
                    }
                    i = end + 1
                } else { plain.append(text[i]); i++ }
            }
            else -> { plain.append(text[i]); i++ }
        }
    }
    flushPlain()
}

