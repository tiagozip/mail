package zip.estrogen.mail.ui.common

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.unit.dp

@Composable
fun Shimmer(modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(6.dp)) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val alpha by transition.animateFloat(
        initialValue = 0.25f,
        targetValue = 0.6f,
        animationSpec = infiniteRepeatable(tween(850), RepeatMode.Reverse),
        label = "alpha"
    )
    Box(modifier.clip(shape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha * 0.25f)))
}

@Composable
fun MailListSkeleton(modifier: Modifier = Modifier) {
    Column(modifier) {
        repeat(9) { SkeletonRow() }
    }
}

@Composable
private fun SkeletonRow() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.Top
    ) {
        Shimmer(Modifier.size(44.dp), CircleShape)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Shimmer(Modifier.fillMaxWidth(0.45f).height(14.dp))
            Spacer(Modifier.height(8.dp))
            Shimmer(Modifier.fillMaxWidth(0.8f).height(12.dp))
            Spacer(Modifier.height(6.dp))
            Shimmer(Modifier.fillMaxWidth(0.62f).height(12.dp))
        }
    }
}
