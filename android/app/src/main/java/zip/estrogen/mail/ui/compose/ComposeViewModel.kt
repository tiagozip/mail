package zip.estrogen.mail.ui.compose

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.SendRequest
import zip.estrogen.mail.data.pgp.PgpStatus

data class ComposeState(
    val from: String = "",
    val to: String = "",
    val cc: String = "",
    val bcc: String = "",
    val subject: String = "",
    val body: String = "",
    val showCcBcc: Boolean = false,
    val inReplyTo: String? = null,
    val references: List<String> = emptyList(),
    val sending: Boolean = false,
    val error: String? = null,
    val sent: Boolean = false,
    val pgpAvailable: Boolean = false,
    val encrypt: Boolean = false,
    val encryptionReady: Boolean = false,
    val encryptionNote: String? = null
)

class ComposeViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(ComposeState())
    val state = _state.asStateFlow()

    private var initialized = false

    fun init(prefill: ComposePrefillData?) {
        if (initialized) return
        initialized = true

        viewModelScope.launch {
            repository.loadMe().onSuccess { me ->
                _state.update {
                    it.copy(
                        from = me.user.address ?: it.from,
                        pgpAvailable = me.user.pgpEnabled && repository.pgp.hasPrivateKey
                    )
                }
                repository.pgp.tryAutoUnlock()
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

    fun onTo(value: String) {
        _state.update { it.copy(to = value, error = null, encryptionReady = false, encryptionNote = null) }
    }

    fun onCc(value: String) = _state.update { it.copy(cc = value, encryptionReady = false) }
    fun onBcc(value: String) = _state.update { it.copy(bcc = value) }
    fun onSubject(value: String) = _state.update { it.copy(subject = value) }
    fun onBody(value: String) = _state.update { it.copy(body = value) }
    fun toggleCcBcc() = _state.update { it.copy(showCcBcc = !it.showCcBcc) }

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
            val missing = mutableListOf<String>()
            for (addr in recipients) {
                val key = repository.lookupPublicKey(addr).getOrNull()
                if (key.isNullOrBlank()) missing.add(addr)
            }
            if (missing.isEmpty()) {
                _state.update { it.copy(encryptionReady = true, encryptionNote = "End to end encrypted") }
            } else {
                _state.update {
                    it.copy(
                        encryptionReady = false,
                        encryptionNote = "No key for ${missing.joinToString(", ")}"
                    )
                }
            }
        }
    }

    fun send() {
        val s = _state.value
        val recipients = parseAddresses(s.to)
        if (recipients.isEmpty()) {
            _state.update { it.copy(error = "Add at least one recipient") }
            return
        }
        if (s.encrypt) {
            sendEncrypted(s, recipients)
            return
        }
        sendPlain(s, recipients)
    }

    private fun sendPlain(s: ComposeState, recipients: List<String>) {
        _state.update { it.copy(sending = true, error = null) }
        val request = SendRequest(
            to = recipients,
            cc = parseAddresses(s.cc),
            bcc = parseAddresses(s.bcc),
            subject = s.subject.ifBlank { "(no subject)" },
            text = s.body,
            from = s.from.ifBlank { null },
            inReplyTo = s.inReplyTo,
            references = s.references
        )
        dispatchSend(request)
    }

    private fun sendEncrypted(s: ComposeState, recipients: List<String>) {
        if (!repository.pgp.tryAutoUnlock() && repository.pgp.status.value != PgpStatus.UNLOCKED) {
            _state.update { it.copy(error = "Unlock your PGP key in Settings before sending encrypted mail") }
            return
        }
        val allRecipients = recipients + parseAddresses(s.cc)
        _state.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            val keys = mutableListOf<String>()
            val missing = mutableListOf<String>()
            for (addr in allRecipients) {
                val key = repository.lookupPublicKey(addr).getOrNull()
                if (key.isNullOrBlank()) missing.add(addr) else keys.add(key)
            }
            if (missing.isNotEmpty()) {
                _state.update {
                    it.copy(sending = false, error = "Cannot encrypt: no key for ${missing.joinToString(", ")}")
                }
                return@launch
            }
            val armored = withContext(Dispatchers.Default) { repository.pgp.encryptFor(keys, s.body) }
            armored.fold(
                onSuccess = { ciphertext ->
                    val request = SendRequest(
                        to = recipients,
                        cc = parseAddresses(s.cc),
                        subject = s.subject.ifBlank { "(no subject)" },
                        text = ciphertext,
                        from = s.from.ifBlank { null },
                        inReplyTo = s.inReplyTo,
                        references = s.references,
                        pgp = true
                    )
                    repository.send(request).fold(
                        onSuccess = { resp ->
                            if (resp.ok || resp.id != null) _state.update { it.copy(sending = false, sent = true) }
                            else _state.update { it.copy(sending = false, error = "Send failed") }
                        },
                        onFailure = { err ->
                            _state.update { it.copy(sending = false, error = err.message ?: "Send failed") }
                        }
                    )
                },
                onFailure = {
                    _state.update { it.copy(sending = false, error = "Encryption failed") }
                }
            )
        }
    }

    private fun dispatchSend(request: SendRequest) {
        viewModelScope.launch {
            repository.send(request).fold(
                onSuccess = { resp ->
                    if (resp.ok || resp.id != null) _state.update { it.copy(sending = false, sent = true) }
                    else _state.update { it.copy(sending = false, error = "Send failed") }
                },
                onFailure = { err ->
                    _state.update { it.copy(sending = false, error = err.message ?: "Send failed") }
                }
            )
        }
    }

    private fun parseAddresses(raw: String): List<String> =
        raw.split(',', ';', '\n')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
}
