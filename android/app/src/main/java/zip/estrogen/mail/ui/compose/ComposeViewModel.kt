package zip.estrogen.mail.ui.compose

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.Contact
import zip.estrogen.mail.data.model.SendRequest
import zip.estrogen.mail.data.pgp.PgpStatus

data class AttachmentItem(
    val localId: String,
    val filename: String,
    val size: Long,
    val remoteId: String? = null,
    val uploading: Boolean = false,
    val failed: Boolean = false
)

data class ComposeState(
    val from: String = "",
    val fromOptions: List<String> = emptyList(),
    val showFromMenu: Boolean = false,
    val to: String = "",
    val cc: String = "",
    val bcc: String = "",
    val subject: String = "",
    val body: String = "",
    val signature: String = "",
    val showCcBcc: Boolean = false,
    val inReplyTo: String? = null,
    val references: List<String> = emptyList(),
    val sending: Boolean = false,
    val sent: Boolean = false,
    val scheduled: Boolean = false,
    val error: String? = null,
    val pgpAvailable: Boolean = false,
    val encrypt: Boolean = false,
    val encryptionReady: Boolean = false,
    val encryptionNote: String? = null,
    val attachments: List<AttachmentItem> = emptyList(),
    val suggestions: List<Contact> = emptyList(),
    val sendAt: Long? = null,
    val undoSeconds: Int = 0,
    val holdRemaining: Int? = null
) {
    val canEncrypt: Boolean get() = pgpAvailable && bcc.isBlank() && attachments.isEmpty()
}

class ComposeViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(ComposeState())
    val state = _state.asStateFlow()

    private var initialized = false
    private var suggestJob: Job? = null
    private var holdJob: Job? = null

    fun init(prefill: ComposePrefillData?) {
        if (initialized) return
        initialized = true

        viewModelScope.launch {
            repository.loadMe().onSuccess { me ->
                val addresses = me.user?.addresses?.map { it.address } ?: emptyListOf(me.user?.address)
                val primary = me.user?.addresses?.firstOrNull { it.isPrimary }?.address ?: me.user?.address
                val undo = me.user?.settings?.get("undoSend")?.let {
                    runCatching { it.toString().trim('"').toInt() }.getOrNull()
                } ?: 0
                _state.update {
                    it.copy(
                        from = it.from.ifBlank { primary ?: "" },
                        fromOptions = addresses.filterNotNull().distinct(),
                        pgpAvailable = me.user?.pgpEnabled == true && repository.pgp.hasPrivateKey,
                        signature = me.user?.signature ?: "",
                        undoSeconds = undo.coerceIn(0, 30)
                    )
                }
                withContext(Dispatchers.Default) { repository.pgp.tryAutoUnlock() }
            }
        }

        if (prefill != null) {
            _state.update {
                it.copy(
                    to = prefill.to,
                    cc = prefill.cc,
                    subject = prefill.subject,
                    body = prefill.body,
                    inReplyTo = prefill.inReplyTo,
                    references = prefill.references,
                    showCcBcc = prefill.cc.isNotBlank()
                )
            }
        }
    }

    private fun <T> emptyListOf(item: T?): List<T?> = listOf(item)

    fun onTo(value: String) {
        _state.update { it.copy(to = value, error = null, encryptionReady = false) }
        suggest(value)
    }

    fun onCc(value: String) = _state.update { it.copy(cc = value, encryptionReady = false) }
    fun onBcc(value: String) = _state.update { it.copy(bcc = value) }
    fun onSubject(value: String) = _state.update { it.copy(subject = value) }
    fun onBody(value: String) = _state.update { it.copy(body = value) }
    fun toggleCcBcc() = _state.update { it.copy(showCcBcc = !it.showCcBcc) }
    fun setFrom(address: String) = _state.update { it.copy(from = address, showFromMenu = false) }
    fun setShowFromMenu(show: Boolean) = _state.update { it.copy(showFromMenu = show) }
    fun clearError() = _state.update { it.copy(error = null) }

    private fun suggest(value: String) {
        val token = value.substringAfterLast(',').substringAfterLast(';').trim()
        if (token.length < 2) {
            _state.update { it.copy(suggestions = emptyList()) }
            return
        }
        suggestJob?.cancel()
        suggestJob = viewModelScope.launch {
            delay(220)
            repository.contacts(token).onSuccess { list ->
                _state.update { it.copy(suggestions = list.take(5)) }
            }
        }
    }

    fun pickSuggestion(contact: Contact) {
        _state.update { s ->
            val prefix = s.to.substringBeforeLast(',', "").let { if (it.isBlank()) "" else "$it, " }
            s.copy(to = "$prefix${contact.address}, ", suggestions = emptyList())
        }
    }

    fun addAttachment(context: Context, uri: Uri) {
        val localId = uri.toString() + System.nanoTime()
        val (name, size) = queryFile(context, uri)
        _state.update { it.copy(attachments = it.attachments + AttachmentItem(localId, name, size, uploading = true), encrypt = false) }
        viewModelScope.launch {
            val part = withContext(Dispatchers.IO) { buildPart(context, uri, name) }
            if (part == null) {
                _state.update { s -> s.copy(attachments = s.attachments.map { if (it.localId == localId) it.copy(uploading = false, failed = true) else it }) }
                return@launch
            }
            repository.uploadAttachment(part).fold(
                onSuccess = { resp ->
                    _state.update { s -> s.copy(attachments = s.attachments.map { if (it.localId == localId) it.copy(uploading = false, remoteId = resp.id, size = resp.size) else it }) }
                },
                onFailure = {
                    _state.update { s -> s.copy(attachments = s.attachments.map { if (it.localId == localId) it.copy(uploading = false, failed = true) else it }) }
                }
            )
        }
    }

    fun removeAttachment(item: AttachmentItem) {
        _state.update { it.copy(attachments = it.attachments.filterNot { a -> a.localId == item.localId }) }
        item.remoteId?.let { id -> viewModelScope.launch { repository.deleteAttachment(id) } }
    }

    private fun queryFile(context: Context, uri: Uri): Pair<String, Long> {
        var name = "attachment"
        var size = 0L
        runCatching {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (nameIdx >= 0) name = cursor.getString(nameIdx) ?: name
                    if (sizeIdx >= 0) size = cursor.getLong(sizeIdx)
                }
            }
        }
        return name to size
    }

    private fun buildPart(context: Context, uri: Uri, name: String): MultipartBody.Part? = runCatching {
        val bytes = context.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
        val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
        val body = bytes.toRequestBody(mime.toMediaTypeOrNull())
        MultipartBody.Part.createFormData("file", name, body)
    }.getOrNull()

    fun setSchedule(timestamp: Long?) = _state.update { it.copy(sendAt = timestamp) }

    fun setEncrypt(enabled: Boolean) {
        _state.update { it.copy(encrypt = enabled, encryptionNote = null, encryptionReady = false) }
        if (enabled) checkRecipientKeys()
    }

    private fun checkRecipientKeys() {
        val recipients = parseAddresses(_state.value.to) + parseAddresses(_state.value.cc)
        if (recipients.isEmpty()) {
            _state.update { it.copy(encryptionReady = false, encryptionNote = "Add a recipient to encrypt") }
            return
        }
        viewModelScope.launch {
            val missing = recipients.filter { repository.lookupPublicKey(it).getOrNull().isNullOrBlank() }
            if (missing.isEmpty()) _state.update { it.copy(encryptionReady = true, encryptionNote = "End to end encrypted") }
            else _state.update { it.copy(encryptionReady = false, encryptionNote = "No key for ${missing.joinToString(", ")}") }
        }
    }

    fun send() {
        val s = _state.value
        if (parseAddresses(s.to).isEmpty()) {
            _state.update { it.copy(error = "Add at least one recipient") }
            return
        }
        if (s.attachments.any { it.uploading }) {
            _state.update { it.copy(error = "Wait for attachments to finish uploading") }
            return
        }
        if (s.undoSeconds > 0 && s.sendAt == null) {
            startHold(s.undoSeconds)
        } else {
            dispatch()
        }
    }

    private fun startHold(seconds: Int) {
        holdJob?.cancel()
        _state.update { it.copy(holdRemaining = seconds) }
        holdJob = viewModelScope.launch {
            var remaining = seconds
            while (remaining > 0) {
                delay(1000)
                remaining--
                _state.update { it.copy(holdRemaining = remaining) }
            }
            _state.update { it.copy(holdRemaining = null) }
            dispatch()
        }
    }

    fun undoSend() {
        holdJob?.cancel()
        _state.update { it.copy(holdRemaining = null) }
    }

    private fun dispatch() {
        val s = _state.value
        _state.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            val recipients = parseAddresses(s.to)
            val bodyWithSig = if (s.signature.isNotBlank()) "${s.body}\n\n--\n${s.signature}" else s.body
            val attachmentIds = s.attachments.mapNotNull { it.remoteId }

            if (s.encrypt && s.canEncrypt) {
                val ok = sendEncrypted(s, recipients, bodyWithSig, attachmentIds)
                if (!ok) return@launch
            } else {
                val request = SendRequest(
                    to = recipients,
                    cc = parseAddresses(s.cc),
                    bcc = parseAddresses(s.bcc),
                    subject = s.subject.ifBlank { "(no subject)" },
                    text = bodyWithSig,
                    from = s.from.ifBlank { null },
                    inReplyTo = s.inReplyTo,
                    references = s.references,
                    attachmentIds = attachmentIds,
                    sendAt = s.sendAt
                )
                val result = repository.send(request)
                result.fold(
                    onSuccess = { resp ->
                        if (resp.ok || resp.id != null) _state.update { it.copy(sending = false, sent = true, scheduled = resp.scheduled || s.sendAt != null) }
                        else _state.update { it.copy(sending = false, error = "Send failed") }
                    },
                    onFailure = { err -> _state.update { it.copy(sending = false, error = err.message ?: "Send failed") } }
                )
            }
        }
    }

    private suspend fun sendEncrypted(s: ComposeState, recipients: List<String>, body: String, attachmentIds: List<String>): Boolean {
        val unlocked = withContext(Dispatchers.Default) {
            repository.pgp.status.value == PgpStatus.UNLOCKED || repository.pgp.tryAutoUnlock()
        }
        if (!unlocked) {
            _state.update { it.copy(sending = false, error = "Unlock your key in Settings to send encrypted mail") }
            return false
        }
        val allRecipients = recipients + parseAddresses(s.cc)
        val keys = mutableListOf<String>()
        val missing = mutableListOf<String>()
        for (addr in allRecipients) {
            val key = repository.lookupPublicKey(addr).getOrNull()
            if (key.isNullOrBlank()) missing.add(addr) else keys.add(key)
        }
        if (missing.isNotEmpty()) {
            _state.update { it.copy(sending = false, error = "No key for ${missing.joinToString(", ")}") }
            return false
        }
        val armored = withContext(Dispatchers.Default) { repository.pgp.encryptFor(keys, body) }.getOrNull()
        if (armored == null) {
            _state.update { it.copy(sending = false, error = "Encryption failed") }
            return false
        }
        val request = SendRequest(
            to = recipients,
            cc = parseAddresses(s.cc),
            subject = s.subject.ifBlank { "(no subject)" },
            text = armored,
            from = s.from.ifBlank { null },
            inReplyTo = s.inReplyTo,
            references = s.references,
            sendAt = s.sendAt,
            pgp = true
        )
        repository.send(request).fold(
            onSuccess = { resp ->
                if (resp.ok || resp.id != null) _state.update { it.copy(sending = false, sent = true, scheduled = resp.scheduled || s.sendAt != null) }
                else _state.update { it.copy(sending = false, error = "Send failed") }
            },
            onFailure = { err -> _state.update { it.copy(sending = false, error = err.message ?: "Send failed") } }
        )
        return true
    }

    private fun parseAddresses(raw: String): List<String> =
        raw.split(',', ';', '\n').map { it.trim() }.filter { it.isNotEmpty() }
}
