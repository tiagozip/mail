package zip.estrogen.mail.ui.compose

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.SendRequest

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
    val sent: Boolean = false
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
                _state.update { it.copy(from = me.user.address ?: it.from) }
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

    fun onTo(value: String) = _state.update { it.copy(to = value, error = null) }
    fun onCc(value: String) = _state.update { it.copy(cc = value) }
    fun onBcc(value: String) = _state.update { it.copy(bcc = value) }
    fun onSubject(value: String) = _state.update { it.copy(subject = value) }
    fun onBody(value: String) = _state.update { it.copy(body = value) }
    fun toggleCcBcc() = _state.update { it.copy(showCcBcc = !it.showCcBcc) }

    fun send() {
        val s = _state.value
        val recipients = parseAddresses(s.to)
        if (recipients.isEmpty()) {
            _state.update { it.copy(error = "Add at least one recipient") }
            return
        }

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

        viewModelScope.launch {
            repository.send(request).fold(
                onSuccess = { resp ->
                    if (resp.ok || resp.id != null) {
                        _state.update { it.copy(sending = false, sent = true) }
                    } else {
                        _state.update { it.copy(sending = false, error = "Send failed") }
                    }
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
