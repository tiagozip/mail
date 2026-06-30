package zip.estrogen.mail.ui.scheduled

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.ScheduledSend
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.fullTime

data class ScheduledState(
    val sends: List<ScheduledSend> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null
)

class ScheduledViewModel(private val repository: MailRepository) : ViewModel() {
    private val _state = MutableStateFlow(ScheduledState())
    val state = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            repository.scheduledSends().fold(
                onSuccess = { sends -> _state.update { it.copy(loading = false, sends = sends) } },
                onFailure = { err -> _state.update { it.copy(loading = false, error = err.message) } }
            )
        }
    }

    fun cancel(id: String) {
        _state.update { it.copy(sends = it.sends.filterNot { s -> s.id == id }) }
        viewModelScope.launch { repository.cancelScheduledSend(id) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduledScreen(onBack: () -> Unit) {
    val viewModel = appViewModel<ScheduledViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scheduled", fontWeight = FontWeight.SemiBold) },
                navigationIcon = { zip.estrogen.mail.ui.common.BackButton(onBack) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, titleContentColor = MaterialTheme.colorScheme.onSurface)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.primary)
                state.sends.isEmpty() -> zip.estrogen.mail.ui.common.EmptyState(
                    icon = Icons.Rounded.Schedule,
                    title = "Nothing scheduled",
                    detail = "Messages you schedule to send later will wait here until it's time.",
                    modifier = Modifier.align(Alignment.Center)
                )
                else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(state.sends, key = { it.id }) { send ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                            shape = MaterialTheme.shapes.extraLarge
                        ) {
                            Row(modifier = Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                                zip.estrogen.mail.ui.common.TonalIconBadge(
                                    icon = Icons.Rounded.Schedule,
                                    container = MaterialTheme.colorScheme.primaryContainer,
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                    size = 44.dp
                                )
                                Spacer(Modifier.width(14.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        send.subject.ifBlank { "(no subject)" },
                                        style = MaterialTheme.typography.titleMedium,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text("To ${send.to.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Spacer(Modifier.size(4.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Rounded.Schedule, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                                        Spacer(Modifier.width(6.dp))
                                        Text(fullTime(send.sendAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                                IconButton(onClick = { viewModel.cancel(send.id) }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "Cancel", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
