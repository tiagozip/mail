package zip.estrogen.mail.ui.maillist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.FolderCounts
import zip.estrogen.mail.data.model.MessageSummary
import zip.estrogen.mail.data.model.User

data class MailListState(
    val folder: Folder = Folder.INBOX,
    val user: User? = null,
    val counts: FolderCounts = FolderCounts(),
    val messages: List<MessageSummary> = emptyList(),
    val nextCursor: String? = null,
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
    val signedOut: Boolean = false
)

class MailListViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(MailListState())
    val state = _state.asStateFlow()

    private var started = false

    fun start() {
        if (started) return
        started = true
        viewModelScope.launch {
            repository.loadMe().onSuccess { me -> _state.update { it.copy(user = me.user) } }
        }
        refreshFolders()
        loadMessages(Folder.INBOX, reset = true, refreshing = false)
    }

    fun selectFolder(folder: Folder) {
        if (folder == _state.value.folder && _state.value.messages.isNotEmpty()) return
        _state.update { it.copy(folder = folder, messages = emptyList(), nextCursor = null) }
        loadMessages(folder, reset = true, refreshing = false)
    }

    fun refresh() {
        refreshFolders()
        loadMessages(_state.value.folder, reset = true, refreshing = true)
    }

    private fun refreshFolders() {
        viewModelScope.launch {
            repository.loadFolders().onSuccess { resp ->
                _state.update { it.copy(counts = resp.counts) }
            }
        }
    }

    private fun loadMessages(folder: Folder, reset: Boolean, refreshing: Boolean) {
        _state.update {
            it.copy(
                loading = reset && !refreshing,
                refreshing = refreshing,
                error = null
            )
        }
        viewModelScope.launch {
            repository.loadMessages(folder).fold(
                onSuccess = { resp ->
                    _state.update {
                        if (it.folder != folder) it
                        else it.copy(
                            messages = resp.messages,
                            nextCursor = resp.nextCursor,
                            loading = false,
                            refreshing = false
                        )
                    }
                },
                onFailure = { err ->
                    _state.update {
                        it.copy(
                            loading = false,
                            refreshing = false,
                            error = err.message ?: "Failed to load messages"
                        )
                    }
                }
            )
        }
    }

    fun loadMore() {
        val current = _state.value
        val cursor = current.nextCursor ?: return
        if (current.loadingMore) return
        _state.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            repository.loadMessages(current.folder, cursor).fold(
                onSuccess = { resp ->
                    _state.update {
                        it.copy(
                            messages = it.messages + resp.messages,
                            nextCursor = resp.nextCursor,
                            loadingMore = false
                        )
                    }
                },
                onFailure = { _state.update { it.copy(loadingMore = false) } }
            )
        }
    }

    fun toggleStar(message: MessageSummary) {
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

    fun markReadLocally(messageId: String) {
        _state.update { s ->
            s.copy(messages = s.messages.map { if (it.id == messageId) it.copy(isRead = true) else it })
        }
    }

    fun signOut() {
        viewModelScope.launch {
            repository.signOut()
            _state.update { it.copy(signedOut = true) }
        }
    }
}
