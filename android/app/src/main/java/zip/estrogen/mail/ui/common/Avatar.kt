package zip.estrogen.mail.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import kotlin.math.absoluteValue

private val avatarPalette = listOf(
    Color(0xFFBF3264),
    Color(0xFF8E4585),
    Color(0xFFC2567A),
    Color(0xFF6A4C93),
    Color(0xFFA8326E),
    Color(0xFF7D5BA6)
)

@Composable
fun Avatar(
    url: String?,
    seed: String,
    label: String?,
    size: Dp = 44.dp,
    modifier: Modifier = Modifier
) {
    val initial = (label?.firstOrNull { it.isLetterOrDigit() } ?: seed.firstOrNull { it.isLetterOrDigit() } ?: '?')
        .uppercaseChar()
        .toString()
    val bg = avatarPalette[(seed.hashCode().absoluteValue) % avatarPalette.size]

    Box(
        modifier = modifier.size(size).clip(CircleShape),
        contentAlignment = Alignment.Center
    ) {
        if (!url.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = url,
                contentDescription = label,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size).clip(CircleShape),
                loading = { InitialBubble(initial, bg, size) },
                error = { InitialBubble(initial, bg, size) }
            )
        } else {
            InitialBubble(initial, bg, size)
        }
    }
}

@Composable
private fun InitialBubble(initial: String, bg: Color, size: Dp) {
    Box(
        modifier = Modifier.size(size).clip(CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(bg)
        )
        Text(
            text = initial,
            color = Color(0xFFFFF6FA),
            fontWeight = FontWeight.SemiBold,
            fontSize = (size.value * 0.4f).sp,
            style = MaterialTheme.typography.titleMedium
        )
    }
}
