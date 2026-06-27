package zip.estrogen.mail.ui.thread

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.data.pgp.PgpEngine
import zip.estrogen.mail.data.pgp.PgpStatus

data class ThreadState(
    val loading: Boolean = true,
    val error: String? = null,
    val messages: List<FullMessage> = emptyList(),
    val expanded: Set<String> = emptySet(),
    val decrypted: Map<String, String> = emptyMap(),
    val decryptFailed: Set<String> = emptySet(),
    val pgpStatus: PgpStatus = PgpStatus.ABSENT,
    val unlocking: Boolean = false,
    val unlockError: String? = null,
    val actionMessage: String? = null
)

class ThreadViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(ThreadState())
    val state = _state.asStateFlow()

    private var loadedThread: String? = null

    fun load(threadId: String, seedMessageId: String) {
        if (loadedThread == threadId) return
        loadedThread = threadId
        _state.update { it.copy(loading = true, error = null, pgpStatus = repository.pgp.status.value) }
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
                    repository.pgp.tryAutoUnlock()
                    _state.update { it.copy(pgpStatus = repository.pgp.status.value) }
                    lastId?.let { decryptIfNeeded(it) }
                },
                onFailure = { err ->
                    _state.update { it.copy(loading = false, error = err.message ?: "Failed to load this conversation") }
                }
            )
        }
    }

    fun toggle(messageId: String) {
        _state.update {
            val next = if (messageId in it.expanded) it.expanded - messageId else it.expanded + messageId
            it.copy(expanded = next)
        }
        if (messageId in _state.value.expanded) decryptIfNeeded(messageId)
    }

    private fun decryptIfNeeded(messageId: String) {
        val message = _state.value.messages.firstOrNull { it.id == messageId } ?: return
        val armored = message.bodyText
        if (!message.pgp || armored == null || !PgpEngine.looksEncrypted(armored)) return
        if (messageId in _state.value.decrypted) return
        if (repository.pgp.status.value != PgpStatus.UNLOCKED) {
            _state.update { it.copy(pgpStatus = repository.pgp.status.value) }
            return
        }
        viewModelScope.launch {
            val result = withContext(Dispatchers.Default) { repository.pgp.decrypt(armored) }
            result.fold(
                onSuccess = { plain ->
                    _state.update {
                        it.copy(
                            decrypted = it.decrypted + (messageId to plain),
                            decryptFailed = it.decryptFailed - messageId
                        )
                    }
                },
                onFailure = {
                    _state.update { it.copy(decryptFailed = it.decryptFailed + messageId) }
                }
            )
        }
    }

    fun unlock(passphrase: String, remember: Boolean) {
        if (passphrase.isBlank()) {
            _state.update { it.copy(unlockError = "Enter your passphrase") }
            return
        }
        _state.update { it.copy(unlocking = true, unlockError = null) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.Default) { repository.pgp.unlock(passphrase, remember) }
            result.fold(
                onSuccess = {
                    _state.update { it.copy(unlocking = false, pgpStatus = PgpStatus.UNLOCKED) }
                    _state.value.expanded.forEach { decryptIfNeeded(it) }
                },
                onFailure = {
                    _state.update {
                        it.copy(
                            unlocking = false,
                            unlockError = "Could not unlock. Check your passphrase."
                        )
                    }
                }
            )
        }
    }

    fun toggleStar(message: FullMessage) {
        val newValue = !message.isStarred
        _state.update { s ->
            s.copy(messages = s.messages.map { if (it.id == message.id) it.copy(isStarred = newValue) else it })
        }
        viewModelScope.launch {
            repository.setStar(message.id, newValue).onFailure {
                _state.update { s ->
                    s.copy(messages = s.messages.map { if (it.id == message.id) it.copy(isStarred = !newValue) else it })
                }
            }
        }
    }

    fun moveThread(folder: Folder, onDone: () -> Unit) {
        val ids = _state.value.messages.map { it.id }
        if (ids.isEmpty()) {
            onDone()
            return
        }
        viewModelScope.launch {
            ids.forEach { repository.move(it, folder) }
            onDone()
        }
    }

    fun consumeActionMessage() {
        _state.update { it.copy(actionMessage = null) }
    }

    private fun markRead(id: String) {
        viewModelScope.launch { repository.setRead(id, true) }
    }
}
