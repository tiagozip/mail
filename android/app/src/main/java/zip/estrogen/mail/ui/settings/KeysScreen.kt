package zip.estrogen.mail.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.ApiKey
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.relativeTime

data class KeysState(
    val keys: List<ApiKey> = emptyList(),
    val loading: Boolean = true,
    val unavailable: Boolean = false,
    val newName: String = "",
    val freshKey: String? = null,
    val message: String? = null,
    val showCreate: Boolean = false
)

class KeysViewModel(private val repository: MailRepository) : ViewModel() {
    private val _state = MutableStateFlow(KeysState())
    val state = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            repository.apiKeys().fold(
                onSuccess = { keys -> _state.update { it.copy(loading = false, keys = keys, unavailable = false) } },
                onFailure = { _state.update { it.copy(loading = false, unavailable = true) } }
            )
        }
    }

    fun onName(value: String) = _state.update { it.copy(newName = value) }
    fun setShowCreate(show: Boolean) = _state.update { it.copy(showCreate = show, newName = "") }
    fun consumeMessage() = _state.update { it.copy(message = null) }
    fun dismissFresh() = _state.update { it.copy(freshKey = null) }

    fun create() {
        val name = _state.value.newName.trim().ifBlank { "Android" }
        viewModelScope.launch {
            repository.createApiKey(name).fold(
                onSuccess = { key ->
                    _state.update { it.copy(showCreate = false, freshKey = key.key, message = "Key created") }
                    load()
                },
                onFailure = { _state.update { it.copy(showCreate = false, message = "Manage keys in the web app — the app can't mint keys") } }
            )
        }
    }

    fun delete(id: String) {
        _state.update { it.copy(keys = it.keys.filterNot { k -> k.id == id }) }
        viewModelScope.launch { repository.deleteApiKey(id) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KeysScreen(onBack: () -> Unit) {
    val viewModel = appViewModel<KeysViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val clipboard = LocalClipboardManager.current

    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); viewModel.consumeMessage() } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("API keys", fontWeight = FontWeight.SemiBold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, titleContentColor = MaterialTheme.colorScheme.onSurface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Keys let scripts send and read mail. Treat them like passwords.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (state.unavailable) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                    shape = MaterialTheme.shapes.large
                ) {
                    Text(
                        "For security, API keys are managed in the web app under developer settings.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            } else {
                state.keys.forEach { key ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                        shape = MaterialTheme.shapes.large
                    ) {
                        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(key.name.ifBlank { "Key" }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                                Text("${key.prefix}…  ·  ${if (key.lastUsed != null) "used ${relativeTime(key.lastUsed!!)}" else "never used"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(onClick = { viewModel.delete(key.id) }) {
                                Icon(Icons.Rounded.Delete, contentDescription = "Revoke", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
                OutlinedButton(onClick = { viewModel.setShowCreate(true) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Create key")
                }
            }
        }
    }

    if (state.showCreate) {
        AlertDialog(
            onDismissRequest = { viewModel.setShowCreate(false) },
            title = { Text("New API key") },
            text = {
                OutlinedTextField(value = state.newName, onValueChange = viewModel::onName, label = { Text("Name") }, singleLine = true)
            },
            confirmButton = { Button(onClick = viewModel::create) { Text("Create") } },
            dismissButton = { TextButton(onClick = { viewModel.setShowCreate(false) }) { Text("Cancel") } }
        )
    }

    state.freshKey?.let { key ->
        AlertDialog(
            onDismissRequest = viewModel::dismissFresh,
            title = { Text("Copy your key now") },
            text = {
                Column {
                    Text("This is the only time the full key is shown.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.size(10.dp))
                    SelectionContainer {
                        Text(key, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace), color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            },
            confirmButton = {
                Button(onClick = { clipboard.setText(AnnotatedString(key)); viewModel.dismissFresh() }) {
                    Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Copy")
                }
            }
        )
    }
}
