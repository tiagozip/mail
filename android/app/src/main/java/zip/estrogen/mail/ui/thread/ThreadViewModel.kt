package zip.estrogen.mail.ui.thread

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.FullMessage

data class ThreadState(
    val loading: Boolean = true,
    val error: String? = null,
    val messages: List<FullMessage> = emptyList(),
    val expanded: Set<String> = emptySet()
)

class ThreadViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(ThreadState())
    val state = _state.asStateFlow()

    private var loadedThread: String? = null

    fun load(threadId: String, seedMessageId: String) {
        if (loadedThread == threadId) return
        loadedThread = threadId
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            repository.loadThread(threadId).fold(
                onSuccess = { messages ->
                    val resolved = messages.ifEmpty {
                        repository.loadMessage(seedMessageId).getOrNull()?.let { listOf(it) } ?: emptyList()
                    }
                    val lastId = resolved.lastOrNull()?.id
                    _state.update {
                        it.copy(
                            loading = false,
                            messages = resolved,
                            expanded = setOfNotNull(lastId)
                        )
                    }
                    resolved.lastOrNull()?.takeIf { !it.isRead }?.let { markRead(it.id) }
                },
                onFailure = { err ->
                    _state.update { it.copy(loading = false, error = err.message ?: "Failed to load thread") }
                }
            )
        }
    }

    fun toggle(messageId: String) {
        _state.update {
            val next = if (messageId in it.expanded) it.expanded - messageId else it.expanded + messageId
            it.copy(expanded = next)
        }
    }

    fun toggleStar(message: FullMessage) {
        val newValue = !message.isStarred
        _state.update { s ->
            s.copy(messages = s.messages.map { if (it.id == message.id) it.copy(isStarred = newValue) else it })
        }
        viewModelScope.launch { repository.setStar(message.id, newValue) }
    }

    private fun markRead(id: String) {
        viewModelScope.launch { repository.setRead(id, true) }
    }
}
