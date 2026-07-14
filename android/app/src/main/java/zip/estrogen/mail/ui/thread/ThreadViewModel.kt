package zip.estrogen.mail.ui.thread

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.ResponseBody
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.Attachment
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.data.model.Label
import zip.estrogen.mail.data.pgp.PgpEngine
import zip.estrogen.mail.data.pgp.PgpStatus
import java.io.File

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
    val actionMessage: String? = null,
    val allLabels: List<Label> = emptyList(),
    val showLabelSheet: Boolean = false
)

class ThreadViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(ThreadState())
    val state = _state.asStateFlow()

    private var loadedThread: String? = null
    private var lastSeed: String = ""

    init {
        viewModelScope.launch {
            repository.sendStatus.collect { status ->
                if (status == "Message sent") reload()
            }
        }
    }

    private fun reload() {
        val threadId = loadedThread ?: return
        loadedThread = null
        load(threadId, lastSeed)
    }

    fun load(threadId: String, seedMessageId: String) {
        if (loadedThread == threadId) return
        loadedThread = threadId
        lastSeed = seedMessageId
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
                    loadLabels()
                    withContext(Dispatchers.Default) { repository.pgp.tryAutoUnlock() }
                    _state.update { it.copy(pgpStatus = repository.pgp.status.value) }
                    resolved.forEach { if (it.pgp) decryptIfNeeded(it.id) }
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
                    _state.value.messages.forEach { if (it.pgp) decryptIfNeeded(it.id) }
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
            val label = if (folder == Folder.TRASH) "Moved to Trash" else "Archived"
            repository.postUndoable(label) {
                ids.forEach { repository.move(it, Folder.INBOX) }
            }
            onDone()
        }
    }

    fun openAttachment(context: Context, attachment: Attachment) {
        _state.update { it.copy(actionMessage = "Downloading ${attachment.filename ?: "attachment"}…") }
        viewModelScope.launch {
            repository.downloadAttachment(attachment.id).fold(
                onSuccess = { body ->
                    val file = withContext(Dispatchers.IO) { saveAttachment(context, attachment, body) }
                    if (file != null) {
                        _state.update { it.copy(actionMessage = null) }
                        openFile(context, file, attachment.mime)
                    } else {
                        _state.update { it.copy(actionMessage = "Could not save attachment") }
                    }
                },
                onFailure = { _state.update { it.copy(actionMessage = "Download failed") } }
            )
        }
    }

    private fun saveAttachment(context: Context, attachment: Attachment, body: ResponseBody): File? = runCatching {
        val dir = File(context.cacheDir, "attachments").apply { mkdirs() }
        val name = (attachment.filename ?: "attachment").replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "attachment" }
        val file = File(dir, name)
        body.byteStream().use { input -> file.outputStream().use { output -> input.copyTo(output) } }
        file
    }.getOrNull()

    private fun openFile(context: Context, file: File, mime: String?) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime ?: "*/*")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(Intent.createChooser(intent, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            .onFailure { _state.update { it.copy(actionMessage = "No app can open this file") } }
    }

    private fun loadLabels() {
        viewModelScope.launch {
            repository.labels().onSuccess { labels ->
                _state.update { it.copy(allLabels = labels) }
            }
        }
    }

    fun openLabelSheet() {
        _state.update { it.copy(showLabelSheet = true) }
    }

    fun closeLabelSheet() {
        _state.update { it.copy(showLabelSheet = false) }
    }

    fun toggleLabel(label: Label) {
        val messages = _state.value.messages
        if (messages.isEmpty()) return
        val hasLabel = messages.any { msg -> msg.labels.any { it.id == label.id } }
        _state.update { s ->
            s.copy(
                messages = s.messages.map { msg ->
                    when {
                        hasLabel -> msg.copy(labels = msg.labels.filterNot { it.id == label.id })
                        msg.labels.any { it.id == label.id } -> msg
                        else -> msg.copy(labels = msg.labels + label)
                    }
                }
            )
        }
        viewModelScope.launch {
            messages.forEach { msg ->
                if (hasLabel) {
                    repository.setLabels(msg.id, add = emptyList(), remove = listOf(label.id))
                } else {
                    repository.setLabels(msg.id, add = listOf(label.id), remove = emptyList())
                }
            }
        }
    }

    fun consumeActionMessage() {
        _state.update { it.copy(actionMessage = null) }
    }

    private fun markRead(id: String) {
        viewModelScope.launch { repository.setRead(id, true) }
    }
}
