package zip.estrogen.mail.ui.encryption

import android.content.Context
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.pgp.BiometricGate
import zip.estrogen.mail.data.pgp.PgpStatus

enum class EncMode { NONE, GENERATE, IMPORT, UNLOCK }

data class EncryptionState(
    val status: PgpStatus = PgpStatus.ABSENT,
    val pgpEnabledOnServer: Boolean = false,
    val address: String? = null,
    val displayName: String? = null,
    val mode: EncMode = EncMode.NONE,
    val passphrase: String = "",
    val confirm: String = "",
    val importKey: String = "",
    val rememberPassphrase: Boolean = true,
    val requireBiometric: Boolean = false,
    val biometricAvailable: Boolean = false,
    val hasRemembered: Boolean = false,
    val fingerprint: String? = null,
    val busy: Boolean = false,
    val message: String? = null,
    val error: String? = null
)

class EncryptionViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(EncryptionState())
    val state = _state.asStateFlow()

    fun start(context: Context) {
        _state.update {
            it.copy(
                status = repository.pgp.status.value,
                requireBiometric = repository.pgp.requireBiometric,
                biometricAvailable = BiometricGate.available(context),
                hasRemembered = repository.pgp.hasRememberedPassphrase
            )
        }
        viewModelScope.launch {
            repository.loadMe().onSuccess { me ->
                _state.update {
                    it.copy(
                        address = me.user?.address,
                        displayName = me.user?.displayName ?: me.user?.username,
                        pgpEnabledOnServer = me.user?.pgpEnabled == true
                    )
                }
            }
            withContext(Dispatchers.Default) { repository.pgp.tryAutoUnlock() }
            refreshStatus()
        }
    }

    private fun refreshStatus() {
        _state.update {
            it.copy(
                status = repository.pgp.status.value,
                fingerprint = repository.pgp.fingerprint,
                hasRemembered = repository.pgp.hasRememberedPassphrase
            )
        }
    }

    fun setMode(mode: EncMode) = _state.update { it.copy(mode = mode, error = null, message = null) }
    fun onPassphrase(v: String) = _state.update { it.copy(passphrase = v, error = null) }
    fun onConfirm(v: String) = _state.update { it.copy(confirm = v, error = null) }
    fun onImportKey(v: String) = _state.update { it.copy(importKey = v, error = null) }
    fun setRemember(v: Boolean) = _state.update { it.copy(rememberPassphrase = v) }
    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun generate() {
        val s = _state.value
        if (s.passphrase.length < 8) {
            _state.update { it.copy(error = "Use a passphrase of at least 8 characters") }
            return
        }
        if (s.passphrase != s.confirm) {
            _state.update { it.copy(error = "Passphrases do not match") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val gen = withContext(Dispatchers.Default) {
                repository.pgp.generate(
                    name = s.displayName ?: s.address ?: "",
                    email = s.address ?: "",
                    passphrase = s.passphrase,
                    remember = s.rememberPassphrase
                )
            }
            gen.fold(
                onSuccess = { identity ->
                    val published = repository.enablePgp(identity.publicKey, identity.privateKeyEnc)
                    repository.storeOwnPublicKey(identity.publicKey)
                    _state.update {
                        it.copy(
                            busy = false,
                            mode = EncMode.NONE,
                            passphrase = "",
                            confirm = "",
                            pgpEnabledOnServer = published.isSuccess || it.pgpEnabledOnServer,
                            message = if (published.isSuccess) "Encryption enabled and key published"
                            else "Key created on device (could not publish to server)"
                        )
                    }
                    refreshStatus()
                },
                onFailure = {
                    _state.update { it.copy(busy = false, error = "Could not generate a key") }
                }
            )
        }
    }

    fun importAndUnlock() {
        val s = _state.value
        if (s.importKey.isBlank()) {
            _state.update { it.copy(error = "Paste your armored private key") }
            return
        }
        if (s.passphrase.isBlank()) {
            _state.update { it.copy(error = "Enter your passphrase") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val imported = repository.pgp.importPrivateKey(s.importKey.trim())
            if (imported.isFailure) {
                _state.update { it.copy(busy = false, error = "That does not look like a valid private key") }
                return@launch
            }
            val unlocked = withContext(Dispatchers.Default) {
                repository.pgp.unlock(s.passphrase, s.rememberPassphrase)
            }
            unlocked.fold(
                onSuccess = {
                    repository.storeOwnPublicKey(repository.pgp.ownPublicKey)
                    _state.update {
                        it.copy(busy = false, mode = EncMode.NONE, passphrase = "", importKey = "", message = "Key imported and unlocked")
                    }
                    refreshStatus()
                },
                onFailure = {
                    _state.update { it.copy(busy = false, error = "Could not unlock. Check your passphrase.") }
                }
            )
        }
    }

    fun fetchFromServer() {
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            repository.fetchPgpFromServer().fold(
                onSuccess = { (_, privateKeyEnc) ->
                    if (privateKeyEnc.isNullOrBlank()) {
                        _state.update { it.copy(busy = false, mode = EncMode.IMPORT, message = "No key on the server yet. Generate or paste one.") }
                    } else {
                        _state.update { it.copy(busy = false, mode = EncMode.UNLOCK, importKey = privateKeyEnc, message = "Key fetched. Enter your passphrase to unlock.") }
                    }
                },
                onFailure = {
                    _state.update { it.copy(busy = false, mode = EncMode.IMPORT, error = "Could not reach the server. Paste your key instead.") }
                }
            )
        }
    }

    fun unlockFetched() {
        val s = _state.value
        if (s.importKey.isBlank()) { setMode(EncMode.IMPORT); return }
        importAndUnlock()
    }

    fun unlock() {
        val s = _state.value
        if (s.passphrase.isBlank()) {
            _state.update { it.copy(error = "Enter your passphrase") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.Default) { repository.pgp.unlock(s.passphrase, s.rememberPassphrase) }
            result.fold(
                onSuccess = {
                    repository.storeOwnPublicKey(repository.pgp.ownPublicKey)
                    _state.update { it.copy(busy = false, passphrase = "", message = "Unlocked") }
                    refreshStatus()
                },
                onFailure = {
                    _state.update { it.copy(busy = false, error = "Could not unlock. Check your passphrase.") }
                }
            )
        }
    }

    fun unlockWithBiometric(activity: FragmentActivity) {
        BiometricGate.authenticate(
            activity = activity,
            title = "Unlock encryption",
            subtitle = "Confirm it's you to decrypt your mail"
        ) { ok ->
            if (!ok) {
                _state.update { it.copy(error = "Authentication cancelled") }
                return@authenticate
            }
            viewModelScope.launch {
                val unlocked = withContext(Dispatchers.Default) { repository.pgp.tryAutoUnlock() }
                if (unlocked) {
                    _state.update { it.copy(message = "Unlocked") }
                    refreshStatus()
                } else {
                    _state.update { it.copy(mode = EncMode.UNLOCK, error = "Enter your passphrase to unlock") }
                }
            }
        }
    }

    fun setRequireBiometric(activity: FragmentActivity, enabled: Boolean) {
        if (enabled) {
            BiometricGate.authenticate(activity, "Enable biometric lock", "Confirm it's you") { ok ->
                if (ok) {
                    repository.pgp.requireBiometric = true
                    _state.update { it.copy(requireBiometric = true, message = "Biometric unlock on") }
                }
            }
        } else {
            repository.pgp.requireBiometric = false
            _state.update { it.copy(requireBiometric = false) }
        }
    }

    fun lock() {
        repository.pgp.lock()
        _state.update { it.copy(message = "Locked") }
        refreshStatus()
    }

    fun disable() {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            repository.disablePgp()
            repository.pgp.forget()
            repository.storeOwnPublicKey(null)
            _state.update {
                it.copy(busy = false, status = PgpStatus.ABSENT, pgpEnabledOnServer = false, fingerprint = null, mode = EncMode.NONE, message = "Encryption disabled and key removed")
            }
        }
    }

    fun removeFromDevice() {
        repository.pgp.forget()
        viewModelScope.launch { repository.storeOwnPublicKey(null) }
        _state.update { it.copy(status = PgpStatus.ABSENT, fingerprint = null, mode = EncMode.NONE, message = "Key removed from this device") }
    }

    fun exportPrivateKey(): String? = repository.pgp.exportPrivateKey()
}
