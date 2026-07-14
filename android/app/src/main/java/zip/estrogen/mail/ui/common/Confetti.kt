package zip.estrogen.mail.ui.common

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import kotlin.random.Random

private data class ConfettiPiece(
    val xFraction: Float,
    val startDelay: Float,
    val drift: Float,
    val spin: Float,
    val size: Float,
    val colorIndex: Int,
    val round: Boolean
)

@Composable
fun ConfettiOverlay(visible: Boolean, onDone: () -> Unit) {
    if (!visible) return
    val colors = listOf(
        MaterialTheme.colorScheme.primary,
        MaterialTheme.colorScheme.tertiary,
        MaterialTheme.colorScheme.secondary,
        MaterialTheme.colorScheme.primaryContainer,
        MaterialTheme.colorScheme.tertiaryContainer
    )
    val pieces = remember {
        List(90) {
            ConfettiPiece(
                xFraction = Random.nextFloat(),
                startDelay = Random.nextFloat() * 0.25f,
                drift = (Random.nextFloat() - 0.5f) * 0.4f,
                spin = (Random.nextFloat() - 0.5f) * 1600f,
                size = 16f + Random.nextFloat() * 18f,
                colorIndex = Random.nextInt(colors.size),
                round = Random.nextBoolean()
            )
        }
    }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.animateTo(1f, tween(2400, easing = LinearEasing))
        onDone()
    }

    Canvas(modifier = Modifier.fillMaxSize()) {
        val t = progress.value
        pieces.forEach { p ->
            val local = ((t - p.startDelay) / (1f - p.startDelay)).coerceIn(0f, 1f)
            if (local <= 0f) return@forEach
            val x = (p.xFraction + p.drift * local) * size.width
            val y = (local * 1.15f - 0.12f) * size.height
            val alpha = if (local > 0.82f) ((1f - local) / 0.18f).coerceIn(0f, 1f) else 1f
            val color = colors[p.colorIndex].copy(alpha = alpha)
            rotate(degrees = p.spin * local, pivot = Offset(x, y)) {
                if (p.round) {
                    drawCircle(color = color, radius = p.size / 2.4f, center = Offset(x, y))
                } else {
                    drawRect(
                        color = color,
                        topLeft = Offset(x - p.size / 2f, y - p.size / 3f),
                        size = Size(p.size, p.size * 0.62f)
                    )
                }
            }
        }
    }
}
