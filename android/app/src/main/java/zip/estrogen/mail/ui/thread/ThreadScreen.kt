package zip.estrogen.mail.ui.thread

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.automirrored.rounded.ReplyAll
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Forward
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.model.Attachment
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.data.pgp.PgpStatus
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
    val snackbarHostState = remember { SnackbarHostState() }
    val dark = isSystemInDarkTheme()

    LaunchedEffect(threadId) { viewModel.load(threadId, seedMessageId) }

    LaunchedEffect(state.actionMessage) {
        state.actionMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeActionMessage()
        }
    }

    val firstMessage = state.messages.firstOrNull()
    val lastMessage = state.messages.lastOrNull()
    val subject = firstMessage?.subject?.takeIf { it.isNotBlank() } ?: "Conversation"
    val starred = lastMessage?.isStarred == true
    var menuOpen by remember { mutableStateOf(false) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                actions = {
                    IconButton(
                        onClick = { lastMessage?.let { viewModel.toggleStar(it) } },
                        enabled = lastMessage != null
                    ) {
                        Icon(
                            imageVector = if (starred) Icons.Rounded.Star else Icons.Outlined.StarBorder,
                            contentDescription = if (starred) "Unstar" else "Star",
                            tint = if (starred) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(
                        onClick = { viewModel.moveThread(Folder.ARCHIVE) { onBack() } },
                        enabled = state.messages.isNotEmpty()
                    ) {
                        Icon(Icons.Rounded.Archive, contentDescription = "Archive")
                    }
                    IconButton(
                        onClick = { viewModel.moveThread(Folder.TRASH) { onBack() } },
                        enabled = state.messages.isNotEmpty()
                    ) {
                        Icon(Icons.Rounded.Delete, contentDescription = "Delete")
                    }
                    Box {
                        IconButton(onClick = { menuOpen = true }, enabled = lastMessage != null) {
                            Icon(Icons.Rounded.MoreVert, contentDescription = "More")
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Reply") },
                                onClick = {
                                    menuOpen = false
                                    lastMessage?.let { onReply(buildReply(it, all = false)) }
                                },
                                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.Reply, null) }
                            )
                            DropdownMenuItem(
                                text = { Text("Reply all") },
                                onClick = {
                                    menuOpen = false
                                    lastMessage?.let { onReply(buildReply(it, all = true)) }
                                },
                                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.ReplyAll, null) }
                            )
                            DropdownMenuItem(
                                text = { Text("Forward") },
                                onClick = {
                                    menuOpen = false
                                    lastMessage?.let { onReply(buildForward(it)) }
                                },
                                leadingIcon = { Icon(Icons.Rounded.Forward, null) }
                            )
                        }
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
                        state.error ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp)
                ) {
                    items(state.messages, key = { it.id }) { message ->
                        MessageCard(
                            message = message,
                            expanded = message.id in state.expanded,
                            decrypted = state.decrypted[message.id],
                            decryptFailed = message.id in state.decryptFailed,
                            pgpStatus = state.pgpStatus,
                            unlocking = state.unlocking,
                            unlockError = state.unlockError,
                            dark = dark,
                            onToggle = { viewModel.toggle(message.id) },
                            onToggleStar = { viewModel.toggleStar(message) },
                            onUnlock = viewModel::unlock,
                            onReply = { onReply(buildReply(message, all = false)) },
                            onReplyAll = { onReply(buildReply(message, all = true)) },
                            onForward = { onReply(buildForward(message)) }
                        )
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
    decrypted: String?,
    decryptFailed: Boolean,
    pgpStatus: PgpStatus,
    unlocking: Boolean,
    unlockError: String?,
    dark: Boolean,
    onToggle: () -> Unit,
    onToggleStar: () -> Unit,
    onUnlock: (String, Boolean) -> Unit,
    onReply: () -> Unit,
    onReplyAll: () -> Unit,
    onForward: () -> Unit
) {
    val sender = message.from.name?.takeIf { it.isNotBlank() }
        ?: message.from.address?.takeIf { it.isNotBlank() } ?: "Unknown"

    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.large
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle)
            ) {
                Avatar(
                    url = message.from.avatar,
                    seed = message.from.address ?: sender,
                    label = sender,
                    size = 44.dp
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
                if (message.pgp) {
                    Icon(
                        imageVector = Icons.Rounded.Lock,
                        contentDescription = "Encrypted",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(8.dp))
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

            AnimatedVisibility(visible = expanded) {
                Column {
                    Spacer(Modifier.size(12.dp))
                    MessageBody(
                        message = message,
                        decrypted = decrypted,
                        decryptFailed = decryptFailed,
                        pgpStatus = pgpStatus,
                        unlocking = unlocking,
                        unlockError = unlockError,
                        dark = dark,
                        onUnlock = onUnlock
                    )

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
    }
}

@Composable
private fun MessageBody(
    message: FullMessage,
    decrypted: String?,
    decryptFailed: Boolean,
    pgpStatus: PgpStatus,
    unlocking: Boolean,
    unlockError: String?,
    dark: Boolean,
    onUnlock: (String, Boolean) -> Unit
) {
    val html = message.bodyHtml

    if (message.pgp) {
        when {
            decrypted != null -> Text(
                text = decrypted,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
            decryptFailed -> EncryptedNotice(
                title = "Could not decrypt",
                detail = "This message is not encrypted to your current key."
            )
            pgpStatus == PgpStatus.UNLOCKED -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text("Decrypting", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            pgpStatus == PgpStatus.LOCKED -> UnlockPrompt(unlocking, unlockError, onUnlock)
            else -> EncryptedNotice(
                title = "Encrypted message",
                detail = "Import your PGP key in Settings to read encrypted mail on this device."
            )
        }
        return
    }

    if (message.hasHtml && !html.isNullOrBlank()) {
        HtmlBody(
            html = html,
            textColor = MaterialTheme.colorScheme.onSurface,
            linkColor = MaterialTheme.colorScheme.primary,
            dark = dark
        )
    } else {
        Text(
            text = message.bodyText?.takeIf { it.isNotBlank() } ?: "(empty message)",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun UnlockPrompt(
    unlocking: Boolean,
    unlockError: String?,
    onUnlock: (String, Boolean) -> Unit
) {
    var passphrase by remember { mutableStateOf("") }
    var rememberPass by remember { mutableStateOf(true) }

    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(
                    "Encrypted message",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Spacer(Modifier.size(8.dp))
            Text(
                "Enter your PGP passphrase to unlock and read it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.size(12.dp))
            OutlinedTextField(
                value = passphrase,
                onValueChange = { passphrase = it },
                label = { Text("Passphrase") },
                singleLine = true,
                enabled = !unlocking,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                isError = unlockError != null,
                modifier = Modifier.fillMaxWidth()
            )
            if (unlockError != null) {
                Spacer(Modifier.size(6.dp))
                Text(unlockError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.size(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.Checkbox(checked = rememberPass, onCheckedChange = { rememberPass = it })
                Text("Remember on this device", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.size(8.dp))
            FilledTonalButton(
                onClick = { onUnlock(passphrase, rememberPass) },
                enabled = !unlocking
            ) {
                Icon(Icons.Rounded.LockOpen, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(if (unlocking) "Unlocking" else "Unlock")
            }
        }
    }
}

@Composable
private fun EncryptedNotice(title: String, detail: String) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun AttachmentRow(attachment: Attachment) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHighest,
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
                    Icons.Rounded.Description,
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
    return if (unit == 0) "$bytes B" else String.format("%.1f %s", value, units[unit])
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
