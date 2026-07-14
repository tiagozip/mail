package zip.estrogen.mail.ui.thread

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Forward
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import zip.estrogen.mail.ui.common.Tray
import zip.estrogen.mail.ui.common.TrayCloseIcon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.request.ImageRequest
import zip.estrogen.mail.MailApp
import zip.estrogen.mail.ui.common.ImageViewer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.model.Attachment
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.data.model.Label
import zip.estrogen.mail.data.pgp.PgpStatus
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.Avatar
import zip.estrogen.mail.ui.common.fullTime
import zip.estrogen.mail.ui.common.relativeTime
import zip.estrogen.mail.ui.compose.ComposePrefillData
import zip.estrogen.mail.ui.maillist.stripHtml
import zip.estrogen.mail.ui.thread.html.HtmlBlocks
import zip.estrogen.mail.ui.thread.html.QuotedToggle
import zip.estrogen.mail.ui.thread.html.isAttribution
import zip.estrogen.mail.ui.thread.html.rememberParsedHtml

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
    val context = LocalContext.current

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
                    IconButton(
                        onClick = { viewModel.openLabelSheet() },
                        enabled = state.messages.isNotEmpty()
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.Label, contentDescription = "Labels")
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
                                    lastMessage?.let { onReply(buildReply(it, all = false, quotedSource(it, state.decrypted[it.id]))) }
                                },
                                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.Reply, null) }
                            )
                            DropdownMenuItem(
                                text = { Text("Reply all") },
                                onClick = {
                                    menuOpen = false
                                    lastMessage?.let { onReply(buildReply(it, all = true, quotedSource(it, state.decrypted[it.id]))) }
                                },
                                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.ReplyAll, null) }
                            )
                            DropdownMenuItem(
                                text = { Text("Forward") },
                                onClick = {
                                    menuOpen = false
                                    lastMessage?.let { onReply(buildForward(it, quotedSource(it, state.decrypted[it.id]))) }
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
        },
        bottomBar = {
            val last = state.messages.lastOrNull()
            if (last != null && !state.loading && state.error == null) {
                val body = quotedSource(last, state.decrypted[last.id])
                ReplyBar(
                    onReply = { onReply(buildReply(last, all = false, body)) },
                    onReplyAll = { onReply(buildReply(last, all = true, body)) },
                    onForward = { onReply(buildForward(last, body)) }
                )
            }
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
                            onOpenAttachment = { viewModel.openAttachment(context, it) }
                        )
                    }
                }
            }
        }
    }

    if (state.showLabelSheet) {
        val applied = state.messages.flatMap { it.labels }.map { it.id }.toSet()
        Tray(onDismiss = viewModel::closeLabelSheet, title = "Labels", leadingIcon = TrayCloseIcon) {
            Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                if (state.allLabels.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No labels yet. Create them in Settings.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    state.allLabels.forEach { label ->
                        LabelRow(
                            label = label,
                            checked = label.id in applied,
                            onToggle = { viewModel.toggleLabel(label) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LabelRow(label: Label, checked: Boolean, onToggle: () -> Unit) {
    val dotColor = runCatching { Color(android.graphics.Color.parseColor(label.color)) }
        .getOrDefault(MaterialTheme.colorScheme.primary)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = 24.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(14.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(dotColor)
        )
        Spacer(Modifier.width(16.dp))
        Text(
            text = label.name,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Checkbox(checked = checked, onCheckedChange = { onToggle() })
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
    onOpenAttachment: (Attachment) -> Unit
) {
    val sender = message.from.name?.takeIf { it.isNotBlank() }
        ?: message.from.address?.takeIf { it.isNotBlank() } ?: "Unknown"

    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.extraLarge
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(18.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle)
            ) {
                Avatar(
                    url = message.from.avatar,
                    seed = message.from.address ?: sender,
                    label = sender,
                    size = 46.dp
                )
                Spacer(Modifier.width(14.dp))
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
                        text = when {
                            expanded -> fullTime(message.date)
                            message.pgp && decrypted != null -> stripHtml(decrypted).take(100).ifBlank { relativeTime(message.date) }
                            message.pgp -> relativeTime(message.date)
                            else -> message.snippet?.takeIf { it.isNotBlank() } ?: relativeTime(message.date)
                        },
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
                        message.attachments.forEach { att -> AttachmentRow(att) { onOpenAttachment(att) } }
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
    if (message.pgp) {
        when {
            decrypted != null -> BodyContent(content = decrypted, isHtml = looksLikeHtml(decrypted), message = message)
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
                detail = "Set up your key in Settings to read encrypted mail on this device."
            )
        }
        return
    }

    val html = message.bodyHtml
    if (message.hasHtml && !html.isNullOrBlank()) {
        BodyContent(content = html, isHtml = true, message = message)
    } else {
        PlainBody(message.bodyText?.takeIf { it.isNotBlank() } ?: "(empty message)")
    }
}

@Composable
private fun ReplyBar(onReply: () -> Unit, onReplyAll: () -> Unit, onForward: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Row(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            FilledTonalButton(
                onClick = onReply,
                modifier = Modifier.weight(1f).height(54.dp),
                shape = MaterialTheme.shapes.large
            ) {
                Icon(Icons.AutoMirrored.Rounded.Reply, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Reply", style = MaterialTheme.typography.titleSmall)
            }
            ReplyBarAction(Icons.AutoMirrored.Rounded.ReplyAll, "Reply all", onReplyAll)
            ReplyBarAction(Icons.Rounded.Forward, "Forward", onForward)
        }
    }
}

@Composable
private fun ReplyBarAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(54.dp)
            .clip(MaterialTheme.shapes.large)
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun PlainBody(text: String) {
    val split = remember(text) { splitQuotedPlain(text) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (split.first.isNotBlank()) {
            Text(
                text = split.first,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        val quoted = split.second
        if (quoted != null) {
            var expanded by remember(text) { mutableStateOf(false) }
            QuotedToggle(expanded = expanded, onToggle = { expanded = !expanded })
            AnimatedVisibility(visible = expanded) {
                Row(modifier = Modifier.height(IntrinsicSize.Min)) {
                    Box(
                        modifier = Modifier
                            .width(3.dp)
                            .fillMaxHeight()
                            .background(MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(2.dp))
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = quoted,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

private fun splitQuotedPlain(text: String): Pair<String, String?> {
    val lines = text.lines()
    val boundary = lines.indexOfFirst { it.isNotBlank() && isAttribution(it) }
    if (boundary < 0) return text.trimEnd() to null
    val primary = lines.subList(0, boundary).joinToString("\n").trimEnd()
    val quoted = lines.subList(boundary, lines.size)
        .joinToString("\n") { it.replaceFirst(Regex("^(>+ ?)+"), "") }
        .trim()
    return primary to quoted.ifBlank { null }
}

private fun looksLikeHtml(text: String): Boolean {
    val t = text.lowercase()
    return t.contains("</") || t.contains("<p") || t.contains("<div") || t.contains("<br") ||
        t.contains("<a ") || t.contains("<img") || t.contains("<table") || t.contains("<span")
}

@Composable
private fun BodyContent(content: String, isHtml: Boolean, message: FullMessage) {
    if (!isHtml) {
        PlainBody(content)
        return
    }
    val parsed = rememberParsedHtml(content)
    var allowImages by remember(content) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (message.authStatus == "fail") SpoofBanner(message.authDetail)
        val trackers = maxOf(message.trackersBlocked, parsed.trackersBlocked)
        if (trackers > 0) {
            InfoBanner(
                icon = Icons.Rounded.Shield,
                text = "Blocked $trackers tracker${if (trackers == 1) "" else "s"}"
            )
        }
        if (parsed.hasRemoteImages && !allowImages) {
            ImagesBanner(onShow = { allowImages = true })
        }
        HtmlBlocks(parsed = parsed, allowImages = allowImages)
    }
}

@Composable
private fun SpoofBanner(detail: zip.estrogen.mail.data.model.AuthDetail?) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.errorContainer,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.WarningAmber, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(Modifier.width(10.dp))
            Column {
                Text("This message may be spoofed", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onErrorContainer)
                val parts = listOfNotNull(
                    detail?.spf?.let { "SPF $it" },
                    detail?.dkim?.let { "DKIM $it" },
                    detail?.dmarc?.let { "DMARC $it" }
                )
                Text(
                    if (parts.isNotEmpty()) parts.joinToString(" · ") else "Authentication failed. Don't trust links or attachments.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }
    }
}

@Composable
private fun InfoBanner(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ImagesBanner(onShow: () -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Image, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text("Remote images hidden", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            TextButton(onClick = onShow) { Text("Show") }
        }
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
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            zip.estrogen.mail.ui.common.TonalIconBadge(
                icon = Icons.Rounded.Lock,
                container = MaterialTheme.colorScheme.primaryContainer,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                size = 40.dp,
                shape = androidx.compose.foundation.shape.CircleShape
            )
            Spacer(Modifier.width(14.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun AttachmentRow(attachment: Attachment, onClick: () -> Unit) {
    val context = LocalContext.current
    val creds by (context.applicationContext as MailApp).repository.credentials
        .collectAsStateWithLifecycle(initialValue = null)
    val isImage = attachment.mime?.startsWith("image/") == true && !attachment.pgp && creds != null
    val model = remember(attachment.id, isImage, creds?.baseUrl) {
        if (isImage && creds != null) {
            ImageRequest.Builder(context)
                .data("${creds!!.baseUrl.trimEnd('/')}/api/attachments/${attachment.id}")
                .addHeader("Authorization", "Bearer ${creds!!.apiKey}")
                .addHeader("X-API-Key", creds!!.apiKey)
                .crossfade(true)
                .build()
        } else null
    }
    var showViewer by remember { mutableStateOf(false) }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHighest,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
            .clickable { if (model != null) showViewer = true else onClick() }
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (model != null) {
                AsyncImage(
                    model = model,
                    contentDescription = attachment.filename,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp))
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (attachment.mime?.startsWith("image/") == true) Icons.Rounded.Image else Icons.Rounded.Description,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(18.dp)
                    )
                }
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

    if (showViewer && model != null) {
        ImageViewer(model = model, onDismiss = { showViewer = false })
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

private fun quotedSource(message: FullMessage, decrypted: String?): String {
    val raw = decrypted?.takeIf { it.isNotBlank() }
        ?: message.bodyText?.takeIf { it.isNotBlank() }
        ?: message.snippet.orEmpty()
    return htmlToText(raw)
}

private fun htmlToText(raw: String): String {
    if (!raw.contains('<')) return raw.trim()
    return raw
        .replace(Regex("(?i)<br\\s*/?>"), "\n")
        .replace(Regex("(?i)</(p|div|li|h[1-6]|tr)>"), "\n")
        .replace(Regex("<[^>]*>"), "")
        .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<")
        .replace("&gt;", ">").replace("&#39;", "'").replace("&quot;", "\"")
        .replace(Regex("\n{3,}"), "\n\n")
        .trim()
}

private fun buildReply(message: FullMessage, all: Boolean, body: String): ComposePrefillData {
    val to = message.from.address.orEmpty()
    val cc = if (all) message.cc.mapNotNull { it.address }.joinToString(", ") else ""
    val subject = ensurePrefix(message.subject, "Re: ")
    val quoted = quote(message, body)
    return ComposePrefillData(
        to = to,
        cc = cc,
        subject = subject,
        body = "\n\n$quoted",
        inReplyTo = message.id,
        references = listOf(message.id)
    )
}

private fun buildForward(message: FullMessage, body: String): ComposePrefillData {
    val subject = ensurePrefix(message.subject, "Fwd: ")
    val quoted = quote(message, body)
    return ComposePrefillData(
        subject = subject,
        body = "\n\n$quoted"
    )
}

private fun quote(message: FullMessage, body: String): String {
    val who = message.from.name ?: message.from.address ?: "sender"
    val lines = body.lineSequence().joinToString("\n") { "> $it" }
    return "On ${fullTime(message.date)}, $who wrote:\n$lines"
}

private fun ensurePrefix(subject: String?, prefix: String): String {
    val s = subject?.trim().orEmpty()
    return if (s.startsWith(prefix, ignoreCase = true)) s else "$prefix$s"
}
