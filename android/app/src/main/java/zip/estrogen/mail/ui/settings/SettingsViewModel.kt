package zip.estrogen.mail.ui.settings

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.pgp.PgpStatus

data class SettingsState(
    val baseUrl: String = "",
    val address: String? = null,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val dynamicColor: Boolean = true,
    val dynamicSupported: Boolean = true,
    val pgpStatus: PgpStatus = PgpStatus.ABSENT,
    val pgpEnabledOnServer: Boolean = false,
    val importVisible: Boolean = false,
    val importKeyText: String = "",
    val passphrase: String = "",
    val rememberPassphrase: Boolean = true,
    val busy: Boolean = false,
    val message: String? = null,
    val signedOut: Boolean = false
)

class SettingsViewModel(
    private val repository: MailRepository
) : ViewModel() {

    private val _state = MutableStateFlow(
        SettingsState(dynamicSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
    )
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val creds = repository.credentials.first()
            val dynamic = repository.dynamicColor.first()
            _state.update {
                it.copy(
                    baseUrl = creds?.baseUrl ?: "",
                    dynamicColor = dynamic,
                    pgpStatus = repository.pgp.status.value
                )
            }
            repository.loadMe().onSuccess { me ->
                _state.update {
                    it.copy(
                        address = me.user.address,
                        displayName = me.user.displayName ?: me.user.username,
                        avatarUrl = me.user.avatarUrl,
                        pgpEnabledOnServer = me.user.pgpEnabled
                    )
                }
            }
            repository.pgp.tryAutoUnlock()
            _state.update { it.copy(pgpStatus = repository.pgp.status.value) }
        }
    }

    fun setDynamicColor(enabled: Boolean) {
        _state.update { it.copy(dynamicColor = enabled) }
        viewModelScope.launch { repository.setDynamicColor(enabled) }
    }

    fun toggleImport() {
        _state.update { it.copy(importVisible = !it.importVisible, message = null) }
    }

    fun onImportKeyText(value: String) = _state.update { it.copy(importKeyText = value) }
    fun onPassphrase(value: String) = _state.update { it.copy(passphrase = value) }
    fun setRememberPassphrase(value: Boolean) = _state.update { it.copy(rememberPassphrase = value) }

    fun fetchKeyFromServer() {
        _state.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            repository.fetchPgpFromServer().fold(
                onSuccess = { (_, privateKeyEnc) ->
                    if (privateKeyEnc.isNullOrBlank()) {
                        _state.update { it.copy(busy = false, message = "No private key returned. Paste it manually below.") }
                    } else {
                        _state.update {
                            it.copy(busy = false, importKeyText = privateKeyEnc, importVisible = true, message = "Key loaded. Enter your passphrase to unlock.")
                        }
                    }
                },
                onFailure = {
                    _state.update {
                        it.copy(busy = false, importVisible = true, message = "Server would not share the key with an API key. Paste your private key below.")
                    }
                }
            )
        }
    }

    fun importAndUnlock() {
        val keyText = _state.value.importKeyText.trim()
        val pass = _state.value.passphrase
        if (keyText.isBlank()) {
            _state.update { it.copy(message = "Paste your armored private key") }
            return
        }
        if (pass.isBlank()) {
            _state.update { it.copy(message = "Enter your passphrase") }
            return
        }
        _state.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            val imported = repository.pgp.importPrivateKey(keyText)
            if (imported.isFailure) {
                _state.update { it.copy(busy = false, message = "That does not look like a valid private key") }
                return@launch
            }
            val unlocked = withContext(Dispatchers.Default) {
                repository.pgp.unlock(pass, _state.value.rememberPassphrase)
            }
            unlocked.fold(
                onSuccess = {
                    repository.storeOwnPublicKey(repository.pgp.ownPublicKey)
                    _state.update {
                        it.copy(
                            busy = false,
                            importVisible = false,
                            importKeyText = "",
                            passphrase = "",
                            pgpStatus = PgpStatus.UNLOCKED,
                            message = "PGP key unlocked"
                        )
                    }
                },
                onFailure = {
                    _state.update {
                        it.copy(busy = false, pgpStatus = repository.pgp.status.value, message = "Could not unlock. Check your passphrase.")
                    }
                }
            )
        }
    }

    fun unlockExisting() {
        val pass = _state.value.passphrase
        if (pass.isBlank()) {
            _state.update { it.copy(message = "Enter your passphrase") }
            return
        }
        _state.update { it.copy(busy = true, message = null) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.Default) {
                repository.pgp.unlock(pass, _state.value.rememberPassphrase)
            }
            result.fold(
                onSuccess = {
                    repository.storeOwnPublicKey(repository.pgp.ownPublicKey)
                    _state.update { it.copy(busy = false, passphrase = "", pgpStatus = PgpStatus.UNLOCKED, message = "Unlocked") }
                },
                onFailure = {
                    _state.update { it.copy(busy = false, message = "Could not unlock. Check your passphrase.") }
                }
            )
        }
    }

    fun lock() {
        repository.pgp.lock()
        _state.update { it.copy(pgpStatus = repository.pgp.status.value, message = "Locked and forgot passphrase") }
    }

    fun forgetKey() {
        viewModelScope.launch {
            repository.pgp.forget()
            repository.storeOwnPublicKey(null)
            _state.update { it.copy(pgpStatus = PgpStatus.ABSENT, message = "Removed PGP key from this device") }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun signOut() {
        viewModelScope.launch {
            repository.signOut()
            _state.update { it.copy(signedOut = true) }
        }
    }
}
