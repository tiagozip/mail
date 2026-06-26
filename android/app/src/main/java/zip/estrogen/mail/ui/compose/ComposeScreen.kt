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
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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

    LaunchedEffect(Unit) {
        viewModel.init(ComposePrefill.pending)
        ComposePrefill.pending = null
    }

    LaunchedEffect(state.sent) {
        if (state.sent) onSent()
    }

    Scaffold(
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
                        IconButton(onClick = viewModel::send) {
                            Icon(
                                Icons.Rounded.Send,
                                contentDescription = "Send",
                                tint = MaterialTheme.colorScheme.primary
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

            if (state.error != null) {
                Text(
                    text = state.error!!,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }

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
