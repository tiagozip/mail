package zip.estrogen.mail.ui.compose

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.ui.appViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposeScreen(
    onBack: () -> Unit,
    onSent: () -> Unit
) {
    val viewModel = appViewModel<ComposeViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.init(ComposePrefill.pending)
        ComposePrefill.pending = null
    }

    LaunchedEffect(state.sent) {
        if (state.sent) {
            snackbarHostState.showSnackbar(if (state.encrypt) "Encrypted message sent" else "Message sent")
            onSent()
        }
    }

    LaunchedEffect(state.error) {
        state.error?.let { snackbarHostState.showSnackbar(it) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("New message", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.Close, contentDescription = "Discard")
                    }
                },
                actions = {
                    if (state.sending) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp).padding(end = 4.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.size(12.dp))
                    } else {
                        IconButton(onClick = viewModel::send, enabled = state.to.isNotBlank()) {
                            Icon(
                                Icons.Rounded.Send,
                                contentDescription = "Send",
                                tint = if (state.to.isNotBlank()) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
        ) {
            FieldRow(label = "From") {
                Text(
                    text = state.from.ifBlank { "your primary address" },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 14.dp)
                )
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)

            FieldRow(
                label = "To",
                trailing = {
                    TextButton(onClick = viewModel::toggleCcBcc) {
                        Text(if (state.showCcBcc) "Hide" else "Cc/Bcc")
                    }
                }
            ) {
                FlatField(value = state.to, onValueChange = viewModel::onTo, placeholder = "name@example.com")
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)

            if (state.showCcBcc) {
                FieldRow(label = "Cc") {
                    FlatField(value = state.cc, onValueChange = viewModel::onCc, placeholder = "")
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                FieldRow(label = "Bcc") {
                    FlatField(value = state.bcc, onValueChange = viewModel::onBcc, placeholder = "")
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
            }

            FieldRow(label = "Subject") {
                FlatField(value = state.subject, onValueChange = viewModel::onSubject, placeholder = "")
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)

            if (state.pgpAvailable) {
                Spacer(Modifier.size(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FilterChip(
                        selected = state.encrypt,
                        onClick = { viewModel.setEncrypt(!state.encrypt) },
                        label = { Text(if (state.encrypt) "Encrypted" else "Encrypt") },
                        leadingIcon = {
                            Icon(
                                if (state.encrypt) Icons.Rounded.Lock else Icons.Rounded.LockOpen,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    )
                    if (state.encrypt && state.encryptionNote != null) {
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = state.encryptionNote ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (state.encryptionReady) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.error
                        )
                    }
                }
            }

            Spacer(Modifier.size(8.dp))

            OutlinedTextField(
                value = state.body,
                onValueChange = viewModel::onBody,
                placeholder = { Text("Write your message") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                minLines = 8
            )

            Spacer(Modifier.size(48.dp))
        }
    }
}

@Composable
private fun FieldRow(
    label: String,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(56.dp)
        )
        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            content()
        }
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
