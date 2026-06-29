package zip.estrogen.mail.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.Address
import zip.estrogen.mail.data.model.HiddenAlias

data class AliasesState(
    val addresses: List<Address> = emptyList(),
    val domains: List<String> = emptyList(),
    val selectedDomain: String = "",
    val newLocalPart: String = "",
    val hidden: List<HiddenAlias> = emptyList(),
    val busy: Boolean = false,
    val message: String? = null
)

class AliasesViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(AliasesState())
    val state = _state.asStateFlow()

    init {
        loadAddresses()
        loadDomains()
        loadHidden()
    }

    private fun loadAddresses() {
        viewModelScope.launch {
            repository.aliases().onSuccess { list -> _state.update { it.copy(addresses = list) } }
        }
    }

    private fun loadDomains() {
        viewModelScope.launch {
            repository.aliasDomains().onSuccess { resp ->
                _state.update {
                    it.copy(
                        domains = resp.domains,
                        selectedDomain = if (it.selectedDomain.isBlank()) resp.builtIn else it.selectedDomain
                    )
                }
            }
        }
    }

    private fun loadHidden() {
        viewModelScope.launch {
            repository.hiddenAliases().onSuccess { list -> _state.update { it.copy(hidden = list) } }
        }
    }

    fun onLocalPart(v: String) = _state.update { it.copy(newLocalPart = v) }
    fun onDomain(v: String) = _state.update { it.copy(selectedDomain = v) }
    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun createAlias() {
        val s = _state.value
        if (s.newLocalPart.isBlank() || s.selectedDomain.isBlank()) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            repository.createAlias(s.newLocalPart.trim(), s.selectedDomain).fold(
                onSuccess = {
                    _state.update { it.copy(busy = false, newLocalPart = "", message = "Address added") }
                    loadAddresses()
                },
                onFailure = { _state.update { it.copy(busy = false, message = "Could not add address") } }
            )
        }
    }

    fun makePrimary(address: String) {
        viewModelScope.launch {
            repository.setPrimaryAlias(address).fold(
                onSuccess = { _state.update { it.copy(message = "Primary address updated") }; loadAddresses() },
                onFailure = { _state.update { it.copy(message = "Could not set primary address") } }
            )
        }
    }

    fun deleteAlias(address: String) {
        viewModelScope.launch {
            repository.deleteAlias(address).fold(
                onSuccess = { _state.update { it.copy(message = "Address removed") }; loadAddresses() },
                onFailure = { _state.update { it.copy(message = "Could not remove address") } }
            )
        }
    }

    fun generateHidden() {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            repository.createHiddenAlias("", null).fold(
                onSuccess = {
                    _state.update { it.copy(busy = false, message = "Hidden address created") }
                    loadHidden()
                },
                onFailure = { _state.update { it.copy(busy = false, message = "Could not create hidden address") } }
            )
        }
    }

    fun setHiddenEnabled(address: String, enabled: Boolean) {
        viewModelScope.launch {
            repository.patchHiddenAlias(address, enabled, null).fold(
                onSuccess = { loadHidden() },
                onFailure = { _state.update { it.copy(message = "Could not update hidden address") } }
            )
        }
    }

    fun deleteHidden(address: String) {
        viewModelScope.launch {
            repository.deleteHiddenAlias(address).fold(
                onSuccess = { _state.update { it.copy(message = "Hidden address deleted") }; loadHidden() },
                onFailure = { _state.update { it.copy(message = "Could not delete hidden address") } }
            )
        }
    }

    fun copied() = _state.update { it.copy(message = "Copied") }
}
