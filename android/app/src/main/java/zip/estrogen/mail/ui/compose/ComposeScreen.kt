package zip.estrogen.mail.ui.compose

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FormatBold
import androidx.compose.material.icons.rounded.FormatItalic
import androidx.compose.material.icons.rounded.FormatListBulleted
import androidx.compose.material.icons.rounded.FormatListNumbered
import androidx.compose.material.icons.rounded.FormatStrikethrough
import androidx.compose.material.icons.rounded.FormatUnderlined
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mohamedrejeb.richeditor.model.rememberRichTextState
import com.mohamedrejeb.richeditor.ui.material3.RichTextEditor
import com.mohamedrejeb.richeditor.ui.material3.RichTextEditorDefaults
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.Avatar
import zip.estrogen.mail.ui.common.fullTime
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ComposeScreen(
    onBack: () -> Unit,
    onSent: () -> Unit
) {
    val viewModel = appViewModel<ComposeViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    var showSchedule by remember { mutableStateOf(false) }
    var showLinkDialog by remember { mutableStateOf(false) }
    val richState = rememberRichTextState()
    var seeded by remember { mutableStateOf(false) }

    LaunchedEffect(state.body) {
        if (!seeded && state.body.isNotBlank()) {
            seeded = true
            val body = state.body
            if (body.trimStart().startsWith("<")) richState.setHtml(body) else richState.setText(body)
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        uris.forEach { viewModel.addAttachment(context, it) }
    }

    LaunchedEffect(Unit) {
        viewModel.init(ComposePrefill.pending)
        ComposePrefill.pending = null
    }
    LaunchedEffect(state.sent) {
        if (state.sent) {
            snackbarHostState.showSnackbar(if (state.scheduled) "Scheduled" else "Message sent")
            onSent()
        }
    }
    LaunchedEffect(state.error) { state.error?.let { snackbarHostState.showSnackbar(it); viewModel.clearError() } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("New message", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Rounded.Close, contentDescription = "Discard") }
                },
                actions = {
                    IconButton(onClick = { picker.launch("*/*") }) {
                        Icon(Icons.Rounded.AttachFile, contentDescription = "Attach")
                    }
                    IconButton(onClick = { showSchedule = true }) {
                        Icon(Icons.Rounded.Schedule, contentDescription = "Schedule", tint = if (state.sendAt != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (state.sending) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp).padding(end = 8.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                    } else {
                        IconButton(onClick = { viewModel.send(richState.toHtml(), richState.annotatedString.text) }, enabled = state.to.isNotBlank()) {
                            Icon(Icons.Rounded.Send, contentDescription = "Send", tint = if (state.to.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, titleContentColor = MaterialTheme.colorScheme.onSurface)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
            ) {
                FromRow(state, viewModel)
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)

                FieldRow(label = "To", trailing = {
                    TextButton(onClick = viewModel::toggleCcBcc) { Text(if (state.showCcBcc) "Hide" else "Cc/Bcc") }
                }) {
                    FlatField(state.to, viewModel::onTo, "name@example.com")
                }
                if (state.suggestions.isNotEmpty()) SuggestionList(state, viewModel)
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)

                if (state.showCcBcc) {
                    FieldRow(label = "Cc") { FlatField(state.cc, viewModel::onCc, "") }
                    HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                    FieldRow(label = "Bcc") { FlatField(state.bcc, viewModel::onBcc, "") }
                    HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                }

                FieldRow(label = "Subject") { FlatField(state.subject, viewModel::onSubject, "") }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)

                if (state.attachments.isNotEmpty()) {
                    Spacer(Modifier.size(10.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        state.attachments.forEach { att ->
                            InputChip(
                                selected = false,
                                onClick = {},
                                label = { Text(att.filename, maxLines = 1) },
                                avatar = {
                                    if (att.uploading) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                    else Icon(Icons.Rounded.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                                },
                                trailingIcon = {
                                    IconButton(onClick = { viewModel.removeAttachment(att) }, modifier = Modifier.size(20.dp)) {
                                        Icon(Icons.Rounded.Close, contentDescription = "Remove", modifier = Modifier.size(16.dp))
                                    }
                                }
                            )
                        }
                    }
                }

                if (state.pgpAvailable) {
                    Spacer(Modifier.size(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        FilterChip(
                            selected = state.encrypt,
                            enabled = state.canEncrypt,
                            onClick = { viewModel.setEncrypt(!state.encrypt) },
                            label = { Text(if (state.encrypt) "Encrypted" else "Encrypt") },
                            leadingIcon = { Icon(if (state.encrypt) Icons.Rounded.Lock else Icons.Rounded.LockOpen, contentDescription = null, modifier = Modifier.size(18.dp)) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        )
                        if (state.encrypt && state.encryptionNote != null) {
                            Spacer(Modifier.width(10.dp))
                            Text(state.encryptionNote ?: "", style = MaterialTheme.typography.bodySmall, color = if (state.encryptionReady) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                        }
                    }
                }

                if (state.sendAt != null) {
                    Spacer(Modifier.size(8.dp))
                    AssistChip(onClick = { showSchedule = true }, label = { Text("Scheduled for ${fullTime(state.sendAt!!)}") }, leadingIcon = { Icon(Icons.Rounded.Schedule, contentDescription = null, modifier = Modifier.size(18.dp)) })
                }

                Spacer(Modifier.size(12.dp))
                FormatToolbar(richState, onLink = { showLinkDialog = true })
                Spacer(Modifier.size(8.dp))
                RichTextEditor(
                    state = richState,
                    placeholder = { Text("Write your message", style = MaterialTheme.typography.bodyLarge) },
                    textStyle = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 260.dp),
                    colors = RichTextEditorDefaults.richTextEditorColors(
                        containerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    )
                )
                Spacer(Modifier.size(64.dp))
            }

            state.holdRemaining?.let { remaining ->
                UndoBar(remaining, onUndo = viewModel::undoSend, modifier = Modifier.align(Alignment.BottomCenter))
            }
        }
    }

    if (showSchedule) {
        ScheduleSheet(
            onPick = { ts -> viewModel.setSchedule(ts); showSchedule = false },
            onClear = { viewModel.setSchedule(null); showSchedule = false },
            onDismiss = { showSchedule = false }
        )
    }

    if (showLinkDialog) {
        LinkDialog(
            onConfirm = { text, url -> richState.addLink(text.ifBlank { url }, url); showLinkDialog = false },
            onDismiss = { showLinkDialog = false }
        )
    }
}

@Composable
private fun FormatToolbar(state: com.mohamedrejeb.richeditor.model.RichTextState, onLink: () -> Unit) {
    val span = state.currentSpanStyle
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            ToolbarButton(Icons.Rounded.FormatBold, "Bold", span.fontWeight == FontWeight.Bold) {
                state.toggleSpanStyle(SpanStyle(fontWeight = FontWeight.Bold))
            }
            ToolbarButton(Icons.Rounded.FormatItalic, "Italic", span.fontStyle == FontStyle.Italic) {
                state.toggleSpanStyle(SpanStyle(fontStyle = FontStyle.Italic))
            }
            ToolbarButton(Icons.Rounded.FormatUnderlined, "Underline", span.textDecoration == TextDecoration.Underline) {
                state.toggleSpanStyle(SpanStyle(textDecoration = TextDecoration.Underline))
            }
            ToolbarButton(Icons.Rounded.FormatStrikethrough, "Strikethrough", span.textDecoration == TextDecoration.LineThrough) {
                state.toggleSpanStyle(SpanStyle(textDecoration = TextDecoration.LineThrough))
            }
            ToolbarButton(Icons.Rounded.FormatListBulleted, "Bulleted list", state.isUnorderedList) {
                state.toggleUnorderedList()
            }
            ToolbarButton(Icons.Rounded.FormatListNumbered, "Numbered list", state.isOrderedList) {
                state.toggleOrderedList()
            }
            ToolbarButton(Icons.Rounded.Link, "Link", false, onLink)
        }
    }
}

@Composable
private fun ToolbarButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, active: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(
            icon,
            contentDescription = label,
            tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun LinkDialog(onConfirm: (String, String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add link") },
        text = {
            Column {
                OutlinedTextField(value = text, onValueChange = { text = it }, label = { Text("Text") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.size(8.dp))
                OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("https://") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { TextButton(onClick = { if (url.isNotBlank()) onConfirm(text, url) }) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FromRow(state: ComposeState, viewModel: ComposeViewModel) {
    Box {
        Row(
            modifier = Modifier.fillMaxWidth().clickable(enabled = state.fromOptions.size > 1) { viewModel.setShowFromMenu(true) },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("From", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(56.dp))
            Text(
                text = state.from.ifBlank { "your primary address" },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f).padding(vertical = 14.dp)
            )
            if (state.fromOptions.size > 1) Icon(Icons.Rounded.ArrowDropDown, contentDescription = "Change", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DropdownMenu(expanded = state.showFromMenu, onDismissRequest = { viewModel.setShowFromMenu(false) }) {
            state.fromOptions.forEach { addr ->
                DropdownMenuItem(text = { Text(addr) }, onClick = { viewModel.setFrom(addr) })
            }
        }
    }
}

@Composable
private fun SuggestionList(state: ComposeState, viewModel: ComposeViewModel) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
        Column {
            state.suggestions.forEach { contact ->
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { viewModel.pickSuggestion(contact) }.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Avatar(url = contact.avatar, seed = contact.address, label = contact.name.ifBlank { contact.address }, size = 32.dp)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        if (contact.name.isNotBlank()) Text(contact.name, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text(contact.address, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun UndoBar(remaining: Int, onUndo: () -> Unit, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.inverseSurface, shape = MaterialTheme.shapes.large, modifier = modifier.fillMaxWidth().padding(16.dp)) {
        Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Sending in ${remaining}s", color = MaterialTheme.colorScheme.inverseOnSurface, modifier = Modifier.weight(1f))
            TextButton(onClick = onUndo) { Text("Undo", color = MaterialTheme.colorScheme.inversePrimary, fontWeight = FontWeight.SemiBold) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScheduleSheet(onPick: (Long) -> Unit, onClear: () -> Unit, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState()
    val now = System.currentTimeMillis()
    val options = listOf(
        "In 1 hour" to now + TimeUnit.HOURS.toMillis(1),
        "In 3 hours" to now + TimeUnit.HOURS.toMillis(3),
        "Tomorrow morning" to now + TimeUnit.HOURS.toMillis(15),
        "Tomorrow" to now + TimeUnit.DAYS.toMillis(1),
        "Next week" to now + TimeUnit.DAYS.toMillis(7)
    )
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 32.dp)) {
            Text("Schedule send", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(20.dp))
            options.forEach { (label, ts) ->
                Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.fillMaxWidth().clickable { onPick(ts) }.padding(horizontal = 24.dp, vertical = 14.dp))
            }
            TextButton(onClick = onClear, modifier = Modifier.padding(horizontal = 16.dp)) { Text("Send now instead") }
        }
    }
}

@Composable
private fun FieldRow(label: String, trailing: (@Composable () -> Unit)? = null, content: @Composable () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(56.dp))
        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) { content() }
        if (trailing != null) trailing()
    }
}

@Composable
private fun FlatField(value: String, onValueChange: (String) -> Unit, placeholder: String) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { if (placeholder.isNotEmpty()) Text(placeholder) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent
        )
    )
}
