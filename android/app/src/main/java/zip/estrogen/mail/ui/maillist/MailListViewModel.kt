package zip.estrogen.mail.ui.maillist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.SwipeAction
import zip.estrogen.mail.data.SwipeConfig
import zip.estrogen.mail.data.model.FolderCounts
import zip.estrogen.mail.data.model.Label
import zip.estrogen.mail.data.model.User
import zip.estrogen.mail.data.pgp.PgpStatus
import zip.estrogen.mail.data.pgp.SnippetCipher

sealed interface ListView {
    data class FolderView(val folder: Folder) : ListView
    data class LabelView(val id: String, val name: String) : ListView
    data class SearchView(val query: String) : ListView
    data object Snoozed : ListView

    val title: String
        get() = when (this) {
            is FolderView -> folder.label
            is LabelView -> name
            is SearchView -> "Search"
            Snoozed -> "Snoozed"
        }
}

data class MailListUi(
    val user: User? = null,
    val counts: FolderCounts = FolderCounts(),
    val labels: List<Label> = emptyList(),
    val selected: Set<String> = emptySet(),
    val query: String = "",
    val searchActive: Boolean = false,
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val loadingMore: Boolean = false,
    val nextCursor: String? = null,
    val error: String? = null,
    val snackbar: String? = null,
    val signedOut: Boolean = false,
    val pgpUnlocked: Boolean = false,
    val swipe: SwipeConfig = SwipeConfig()
) {
    val selecting: Boolean get() = selected.isNotEmpty()
}

class MailListViewModel(private val repository: MailRepository) : ViewModel() {

    private val _view = MutableStateFlow<ListView>(ListView.FolderView(Folder.INBOX))
    val view = _view.asStateFlow()

    private val _ui = MutableStateFlow(MailListUi())
    val ui = _ui.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    val items = _view
        .flatMapLatest { v ->
            when (v) {
                is ListView.FolderView -> repository.observeFolder(v.folder)
                is ListView.LabelView -> repository.observeLabel(v.id)
                is ListView.SearchView -> if (v.query.isBlank()) flowOf(emptyList()) else {
                    val parsed = SearchQueryParser.parse(v.query)
                    repository.search(parsed.text).map { list -> list.filter { parsed.matches(it) } }
                }
                ListView.Snoozed -> repository.observeSnoozed()
            }
        }
        .map { list ->
            withContext(Dispatchers.Default) {
                list.map { it.toItem(SnippetCipher.decrypt(it.decryptedSnippet)) }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private var started = false

    fun start() {
        if (started) return
        started = true
        viewModelScope.launch {
            repository.loadMe().onSuccess { me -> _ui.update { it.copy(user = me.user) } }
        }
        viewModelScope.launch {
            repository.swipeConfig.collect { cfg -> _ui.update { it.copy(swipe = cfg) } }
        }
        refreshMeta()
        refresh(initial = true)
        viewModelScope.launch {
            withContext(Dispatchers.Default) { repository.pgp.tryAutoUnlock() }
            _ui.update { it.copy(pgpUnlocked = repository.pgp.status.value == PgpStatus.UNLOCKED) }
            decryptPreviews()
            repository.syncDelta()
        }
    }

    private fun refreshMeta() {
        viewModelScope.launch {
            repository.loadFolders().onSuccess { resp -> _ui.update { it.copy(counts = resp.counts) } }
        }
        viewModelScope.launch {
            repository.labels().onSuccess { labels -> _ui.update { it.copy(labels = labels) } }
        }
    }

    fun selectFolder(folder: Folder) {
        if (_view.value == ListView.FolderView(folder)) return
        _view.value = ListView.FolderView(folder)
        _ui.update { it.copy(selected = emptySet(), nextCursor = null, searchActive = false, query = "") }
        refresh(initial = true)
    }

    fun openLabel(id: String, name: String) {
        _view.value = ListView.LabelView(id, name)
        _ui.update { it.copy(selected = emptySet(), nextCursor = null, searchActive = false) }
        refresh(initial = true)
    }

    fun openSnoozed() {
        _view.value = ListView.Snoozed
        _ui.update { it.copy(selected = emptySet(), searchActive = false) }
        refresh(initial = true)
    }

    fun openSearch() {
        _ui.update { it.copy(searchActive = true) }
        _view.value = ListView.SearchView("")
    }

    fun closeSearch() {
        _ui.update { it.copy(searchActive = false, query = "") }
        selectFolder(Folder.INBOX)
    }

    fun setQuery(q: String) {
        _ui.update { it.copy(query = q) }
        _view.value = ListView.SearchView(q)
        val text = SearchQueryParser.parse(q).text
        if (text.length >= 2) {
            viewModelScope.launch {
                repository.searchRemote(text)
                decryptPreviews()
            }
        }
    }

    fun refresh(initial: Boolean = false) {
        val v = _view.value
        _ui.update { it.copy(loading = initial, refreshing = !initial, error = null) }
        viewModelScope.launch {
            val result = when (v) {
                is ListView.FolderView -> repository.refreshMessages(v.folder, replace = false).map { it.nextCursor }
                is ListView.LabelView -> repository.refreshLabel(v.id).map { it.nextCursor }
                is ListView.SearchView -> if (v.query.isBlank()) Result.success(null) else repository.searchRemote(v.query).map { null }
                ListView.Snoozed -> repository.refreshMessages(Folder.INBOX).map { null }
            }
            result.fold(
                onSuccess = { cursor -> _ui.update { it.copy(loading = false, refreshing = false, nextCursor = cursor) } },
                onFailure = { err -> _ui.update { it.copy(loading = false, refreshing = false, error = if (items.value.isEmpty()) err.message else null) } }
            )
            refreshMeta()
            decryptPreviews()
        }
    }

    fun loadMore() {
        val v = _view.value
        val cursor = _ui.value.nextCursor ?: return
        if (_ui.value.loadingMore || v !is ListView.FolderView) return
        _ui.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            repository.refreshMessages(v.folder, cursor = cursor).fold(
                onSuccess = { resp -> _ui.update { it.copy(loadingMore = false, nextCursor = resp.nextCursor) } },
                onFailure = { _ui.update { it.copy(loadingMore = false) } }
            )
            decryptPreviews()
        }
    }

    private fun decryptPreviews() {
        if (repository.pgp.status.value != PgpStatus.UNLOCKED) return
        viewModelScope.launch(Dispatchers.Default) {
            val targets = items.value.filter { it.pgp && it.decryptedPreview == null }.take(12)
            for (item in targets) {
                val full = repository.loadMessage(item.id).getOrNull() ?: continue
                val body = full.bodyText ?: continue
                val plain = repository.pgp.decrypt(body).getOrNull() ?: continue
                val preview = plain
                    .replace(Regex("<[^>]*>"), " ")
                    .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                    .replace(Regex("\\s+"), " ")
                    .trim()
                    .take(140)
                repository.cacheDecryptedSnippet(item.id, SnippetCipher.encrypt(preview))
            }
        }
    }

    fun toggleStar(item: MailItem) {
        viewModelScope.launch { repository.setStar(item.id, !item.isStarred) }
    }

    fun markRead(id: String) {
        viewModelScope.launch { repository.setRead(id, true) }
    }

    fun archive(item: MailItem) = moveWithUndo(item, Folder.ARCHIVE, "Archived")
    fun trash(item: MailItem) = moveWithUndo(item, Folder.TRASH, "Moved to Trash")

    fun performSwipe(item: MailItem, action: SwipeAction) {
        when (action) {
            SwipeAction.ARCHIVE -> archive(item)
            SwipeAction.TRASH -> trash(item)
            SwipeAction.READ -> viewModelScope.launch { repository.setRead(item.id, !item.isRead) }
            SwipeAction.STAR -> toggleStar(item)
            SwipeAction.SNOOZE -> snooze(item.id, System.currentTimeMillis() + java.util.concurrent.TimeUnit.DAYS.toMillis(1))
            SwipeAction.NONE -> {}
        }
    }

    private fun moveWithUndo(item: MailItem, folder: Folder, label: String) {
        viewModelScope.launch {
            repository.move(item.id, folder)
            _ui.update { it.copy(snackbar = label) }
            refreshMeta()
        }
    }

    fun snooze(id: String, until: Long?) {
        viewModelScope.launch {
            repository.snooze(id, until)
            _ui.update { it.copy(snackbar = if (until != null) "Snoozed" else "Unsnoozed") }
        }
    }

    fun toggleSelect(id: String) {
        _ui.update {
            val next = if (id in it.selected) it.selected - id else it.selected + id
            it.copy(selected = next)
        }
    }

    fun clearSelection() = _ui.update { it.copy(selected = emptySet()) }

    fun snoozeSelected(until: Long?) {
        val ids = _ui.value.selected.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            ids.forEach { repository.snooze(it, until) }
            _ui.update { it.copy(selected = emptySet(), snackbar = "Snoozed") }
        }
    }

    fun selectionAction(action: String, value: String? = null) {
        val ids = _ui.value.selected.toList()
        if (ids.isEmpty()) return
        viewModelScope.launch {
            repository.bulk(ids, action, value)
            _ui.update { it.copy(selected = emptySet(), snackbar = "Done") }
            refreshMeta()
        }
    }

    fun consumeSnackbar() = _ui.update { it.copy(snackbar = null) }

    fun signOut() {
        viewModelScope.launch {
            repository.signOut()
            _ui.update { it.copy(signedOut = true) }
        }
    }
}
