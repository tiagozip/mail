package zip.estrogen.mail.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.SettingsStore

data class SetupState(
    val apiKey: String = "",
    val baseUrl: String = SettingsStore.DEFAULT_BASE_URL,
    val loading: Boolean = false,
    val error: String? = null,
    val greeting: String? = null,
    val done: Boolean = false
)

class SetupViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(SetupState())
    val state = _state.asStateFlow()

    fun onApiKeyChange(value: String) {
        _state.update { it.copy(apiKey = value, error = null) }
    }

    fun onBaseUrlChange(value: String) {
        _state.update { it.copy(baseUrl = value, error = null) }
    }

    fun submit() {
        val current = _state.value
        val key = current.apiKey.trim()
        val url = current.baseUrl.trim().trimEnd('/').ifBlank { SettingsStore.DEFAULT_BASE_URL }

        if (!key.startsWith("emk_")) {
            _state.update { it.copy(error = "API keys start with emk_") }
            return
        }

        _state.update { it.copy(loading = true, error = null, greeting = null) }
        viewModelScope.launch {
            repository.validate(url, key).fold(
                onSuccess = { me ->
                    repository.saveCredentials(key, url)
                    val who = me.user.displayName ?: me.user.address ?: me.user.username
                    _state.update { it.copy(loading = false, greeting = who, done = true) }
                },
                onFailure = { err ->
                    _state.update {
                        it.copy(
                            loading = false,
                            error = "Could not verify the key: ${err.message ?: "unknown error"}"
                        )
                    }
                }
            )
        }
    }
}
