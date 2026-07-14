package zip.estrogen.mail.ui.byod

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.Domain

enum class ByodStep { DOMAIN, DEPLOY, CONNECT }

data class ByodState(
    val domains: List<Domain> = emptyList(),
    val loading: Boolean = true,
    val wizardOpen: Boolean = false,
    val step: ByodStep = ByodStep.DOMAIN,
    val domainInput: String = "",
    val activeId: String = "",
    val activeDomain: String = "",
    val relayConfig: String = "",
    val deployUrl: String = "",
    val relayUrlInput: String = "",
    val busy: Boolean = false,
    val verifying: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val rotatingId: String? = null
)

private const val VERIFY_ATTEMPTS = 30
private const val VERIFY_INTERVAL_MS = 3000L

class ByodViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(ByodState())
    val state = _state.asStateFlow()

    init {
        loadDomains()
    }

    fun loadDomains() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.listDomains().fold(
                onSuccess = { list ->
                    _state.update { it.copy(loading = false, domains = list.filter { d -> !d.builtIn }) }
                },
                onFailure = { _state.update { it.copy(loading = false, message = "Could not load domains") } }
            )
        }
    }

    fun openWizard() {
        _state.update {
            it.copy(
                wizardOpen = true,
                step = ByodStep.DOMAIN,
                domainInput = "",
                activeId = "",
                activeDomain = "",
                relayConfig = "",
                deployUrl = "",
                relayUrlInput = "",
                error = null,
                busy = false,
                verifying = false
            )
        }
    }

    fun closeWizard() {
        _state.update { it.copy(wizardOpen = false, verifying = false, busy = false, error = null) }
    }

    fun resume(domain: Domain) {
        _state.update {
            it.copy(
                wizardOpen = true,
                step = ByodStep.DEPLOY,
                domainInput = domain.domain,
                activeDomain = domain.domain,
                relayUrlInput = domain.relayUrl,
                error = null,
                busy = true,
                verifying = false
            )
        }
        viewModelScope.launch {
            repository.addByodDomain(domain.domain).fold(
                onSuccess = { res ->
                    _state.update {
                        it.copy(
                            busy = false,
                            activeId = res.id,
                            activeDomain = res.domain,
                            relayConfig = res.relayConfig,
                            deployUrl = res.deployUrl,
                            relayUrlInput = res.relayUrl.ifBlank { it.relayUrlInput }
                        )
                    }
                },
                onFailure = { e -> _state.update { it.copy(busy = false, error = e.message ?: "Could not load domain") } }
            )
        }
    }

    fun onDomainInput(v: String) = _state.update { it.copy(domainInput = v, error = null) }
    fun onRelayUrlInput(v: String) = _state.update { it.copy(relayUrlInput = v, error = null) }
    fun goToDeploy() = _state.update { it.copy(step = ByodStep.DEPLOY, error = null) }
    fun goToConnect() = _state.update { it.copy(step = ByodStep.CONNECT, error = null) }
    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun submitDomain() {
        val d = _state.value.domainInput.trim().lowercase()
        if (d.isBlank()) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            repository.addByodDomain(d).fold(
                onSuccess = { res ->
                    _state.update {
                        it.copy(
                            busy = false,
                            step = ByodStep.DEPLOY,
                            activeId = res.id,
                            activeDomain = res.domain,
                            relayConfig = res.relayConfig,
                            deployUrl = res.deployUrl,
                            relayUrlInput = res.relayUrl
                        )
                    }
                },
                onFailure = { e -> _state.update { it.copy(busy = false, error = e.message ?: "Could not add domain") } }
            )
        }
    }

    fun connect() {
        val s = _state.value
        val relayUrl = s.relayUrlInput.trim()
        if (relayUrl.isBlank() || s.activeId.isBlank()) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            repository.setupRelay(s.activeId, relayUrl).fold(
                onSuccess = { res ->
                    if (res.verified) {
                        finishConnected()
                        return@fold
                    }
                    _state.update { it.copy(busy = false, verifying = true) }
                    pollUntilVerified(s.activeId)
                },
                onFailure = { e -> _state.update { it.copy(busy = false, error = e.message ?: "Could not connect") } }
            )
        }
    }

    private suspend fun pollUntilVerified(id: String) {
        repeat(VERIFY_ATTEMPTS) {
            delay(VERIFY_INTERVAL_MS)
            val ok = repository.relayStatus(id).getOrNull()?.verified == true
            if (ok) {
                finishConnected()
                return
            }
        }
        _state.update {
            it.copy(
                verifying = false,
                error = "Sent a verification email to your domain but didn't see it come back. Make sure the Email Routing catch-all points at your Worker, then try again."
            )
        }
    }

    private fun finishConnected() {
        val domain = _state.value.activeDomain
        _state.update {
            it.copy(
                wizardOpen = false,
                verifying = false,
                busy = false,
                message = "$domain is ready to send and receive"
            )
        }
        loadDomains()
    }

    fun checkHealth(id: String) {
        viewModelScope.launch {
            repository.relayHealth(id).fold(
                onSuccess = { res ->
                    _state.update {
                        it.copy(message = if (res.ok) "Relay is online" else (res.error ?: "Relay is offline"))
                    }
                    loadDomains()
                },
                onFailure = { _state.update { it.copy(message = "Could not reach relay") } }
            )
        }
    }

    fun rotateSecret(domain: Domain) {
        _state.update { it.copy(rotatingId = domain.id, busy = true, error = null) }
        viewModelScope.launch {
            repository.rotateRelay(domain.id).fold(
                onSuccess = { res ->
                    _state.update {
                        it.copy(
                            rotatingId = null,
                            busy = false,
                            wizardOpen = true,
                            step = ByodStep.DEPLOY,
                            activeId = res.id,
                            activeDomain = res.domain,
                            domainInput = res.domain,
                            relayConfig = res.relayConfig,
                            deployUrl = res.deployUrl,
                            relayUrlInput = domain.relayUrl,
                            message = "Secret rotated, redeploy your Worker"
                        )
                    }
                    loadDomains()
                },
                onFailure = { _state.update { it.copy(rotatingId = null, busy = false, message = "Could not rotate secret") } }
            )
        }
    }
}
