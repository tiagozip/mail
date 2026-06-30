package zip.estrogen.mail.ui.maillist

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import zip.estrogen.mail.data.model.Label
import zip.estrogen.mail.ui.common.Avatar
import zip.estrogen.mail.ui.common.relativeTime

@Composable
fun MailRow(
    item: MailItem,
    selected: Boolean,
    onClick: () -> Unit,
    onToggleStar: () -> Unit
) {
    val unread = !item.isRead
    val subject = item.subject?.takeIf { it.isNotBlank() } ?: "(no subject)"
    val container =
        if (selected) MaterialTheme.colorScheme.secondaryContainer
        else MaterialTheme.colorScheme.surface

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(container)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(contentAlignment = Alignment.Center) {
            Avatar(
                url = item.fromAvatar,
                seed = item.fromAddress ?: item.senderLabel,
                label = item.senderLabel,
                size = 44.dp
            )
            if (selected) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Rounded.Check, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                }
            }
        }

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (unread) {
                    Box(
                        modifier = Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary)
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    text = item.senderLabel,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
                if (item.threadCount > 1) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                            .padding(horizontal = 7.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = item.threadCount.toString(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                if (item.isSpoofed) {
                    Icon(Icons.Rounded.WarningAmber, contentDescription = "Spoofed", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    text = relativeTime(item.date),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(Modifier.size(2.dp))

            Text(
                text = subject,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(Modifier.size(2.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = item.preview,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                if (item.hasAttachments) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Rounded.AttachFile, contentDescription = "Attachment", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                }
            }

            if (item.labels.isNotEmpty()) {
                Spacer(Modifier.size(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    item.labels.take(3).forEach { LabelChip(it) }
                }
            }
        }

        IconButton(onClick = onToggleStar, modifier = Modifier.size(36.dp)) {
            Icon(
                imageVector = if (item.isStarred) Icons.Rounded.Star else Icons.Outlined.StarBorder,
                contentDescription = if (item.isStarred) "Unstar" else "Star",
                tint = if (item.isStarred) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LabelChip(label: Label) {
    val color = runCatching { Color(android.graphics.Color.parseColor(label.color)) }.getOrDefault(MaterialTheme.colorScheme.primary)
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.18f))
            .padding(horizontal = 8.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(5.dp))
        Text(label.name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface)
    }
}
