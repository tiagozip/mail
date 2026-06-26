package zip.estrogen.mail.ui.thread

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.automirrored.rounded.ReplyAll
import androidx.compose.material.icons.rounded.Forward
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.model.Attachment
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.Avatar
import zip.estrogen.mail.ui.common.fullTime
import zip.estrogen.mail.ui.common.relativeTime
import zip.estrogen.mail.ui.compose.ComposePrefillData

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadScreen(
    threadId: String,
    seedMessageId: String,
    onBack: () -> Unit,
    onReply: (ComposePrefillData) -> Unit
) {
    val viewModel = appViewModel<ThreadViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(threadId) { viewModel.load(threadId, seedMessageId) }

    val subject = state.messages.firstOrNull()?.subject?.takeIf { it.isNotBlank() } ?: "Conversation"

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = subject,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
                state.error != null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text(
                        state.error!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.messages, key = { it.id }) { message ->
                        MessageCard(
                            message = message,
                            expanded = message.id in state.expanded,
                            onToggle = { viewModel.toggle(message.id) },
                            onToggleStar = { viewModel.toggleStar(message) },
                            onReply = { onReply(buildReply(message, all = false)) },
                            onReplyAll = { onReply(buildReply(message, all = true)) },
                            onForward = { onReply(buildForward(message)) }
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant, thickness = 0.6.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageCard(
    message: FullMessage,
    expanded: Boolean,
    onToggle: () -> Unit,
    onToggleStar: () -> Unit,
    onReply: () -> Unit,
    onReplyAll: () -> Unit,
    onForward: () -> Unit
) {
    val sender = message.from.name?.takeIf { it.isNotBlank() }
        ?: message.from.address?.takeIf { it.isNotBlank() } ?: "Unknown"

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle)
        ) {
            Avatar(
                url = message.from.avatar,
                seed = message.from.address ?: sender,
                label = sender,
                size = 42.dp
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = sender,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = if (expanded) fullTime(message.date) else (message.snippet?.takeIf { it.isNotBlank() } ?: relativeTime(message.date)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            IconButton(onClick = onToggleStar, modifier = Modifier.size(36.dp)) {
                Icon(
                    imageVector = if (message.isStarred) Icons.Rounded.Star else Icons.Outlined.StarBorder,
                    contentDescription = null,
                    tint = if (message.isStarred) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (expanded) {
            Spacer(Modifier.size(12.dp))

            val html = message.bodyHtml
            if (message.pgp) {
                EncryptedChip()
            } else if (message.hasHtml && !html.isNullOrBlank()) {
                HtmlBody(
                    html = html,
                    textColor = MaterialTheme.colorScheme.onSurface,
                    linkColor = MaterialTheme.colorScheme.primary
                )
            } else {
                Text(
                    text = message.bodyText?.takeIf { it.isNotBlank() } ?: "(empty message)",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            if (message.attachments.isNotEmpty()) {
                Spacer(Modifier.size(12.dp))
                message.attachments.forEach { AttachmentRow(it) }
            }

            Spacer(Modifier.size(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onReply) {
                    Icon(Icons.AutoMirrored.Rounded.Reply, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Reply")
                }
                TextButton(onClick = onReplyAll) {
                    Icon(Icons.AutoMirrored.Rounded.ReplyAll, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Reply all")
                }
                TextButton(onClick = onForward) {
                    Icon(Icons.Rounded.Forward, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Forward")
                }
            }
        }
    }
}

@Composable
private fun EncryptedChip() {
    AssistChip(
        onClick = {},
        enabled = false,
        label = { Text("Encrypted, open on web") },
        leadingIcon = { Icon(Icons.Rounded.Lock, contentDescription = null, modifier = Modifier.size(18.dp)) },
        colors = AssistChipDefaults.assistChipColors(
            disabledContainerColor = MaterialTheme.colorScheme.primaryContainer,
            disabledLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
            disabledLeadingIconContentColor = MaterialTheme.colorScheme.onPrimaryContainer
        )
    )
}

@Composable
private fun AttachmentRow(attachment: Attachment) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Rounded.Forward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = attachment.filename ?: "attachment",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = humanSize(attachment.size),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private fun humanSize(bytes: Long): String {
    if (bytes <= 0) return ""
    val units = listOf("B", "KB", "MB", "GB")
    var value = bytes.toDouble()
    var unit = 0
    while (value >= 1024 && unit < units.lastIndex) {
        value /= 1024
        unit++
    }
    return if (unit == 0) "${bytes} B" else String.format("%.1f %s", value, units[unit])
}

private fun buildReply(message: FullMessage, all: Boolean): ComposePrefillData {
    val to = message.from.address.orEmpty()
    val cc = if (all) message.cc.mapNotNull { it.address }.joinToString(", ") else ""
    val subject = ensurePrefix(message.subject, "Re: ")
    val quoted = quote(message)
    return ComposePrefillData(
        to = to,
        cc = cc,
        subject = subject,
        body = "\n\n$quoted",
        inReplyTo = message.id,
        references = listOf(message.id)
    )
}

private fun buildForward(message: FullMessage): ComposePrefillData {
    val subject = ensurePrefix(message.subject, "Fwd: ")
    val quoted = quote(message)
    return ComposePrefillData(
        subject = subject,
        body = "\n\n$quoted"
    )
}

private fun quote(message: FullMessage): String {
    val who = message.from.name ?: message.from.address ?: "sender"
    val body = message.bodyText?.takeIf { it.isNotBlank() } ?: message.snippet.orEmpty()
    val lines = body.lineSequence().joinToString("\n") { "> $it" }
    return "On ${fullTime(message.date)}, $who wrote:\n$lines"
}

private fun ensurePrefix(subject: String?, prefix: String): String {
    val s = subject?.trim().orEmpty()
    return if (s.startsWith(prefix, ignoreCase = true)) s else "$prefix$s"
}
