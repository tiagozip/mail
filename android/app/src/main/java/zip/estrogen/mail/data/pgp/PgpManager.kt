package zip.estrogen.mail.data.pgp

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import zip.estrogen.mail.data.SecureStore

enum class PgpStatus {
    ABSENT,
    LOCKED,
    UNLOCKED
}

class PgpManager(private val secureStore: SecureStore) {

    private var identity: UnlockedIdentity? = null

    private val _status = MutableStateFlow(initialStatus())
    val status: StateFlow<PgpStatus> = _status.asStateFlow()

    private fun initialStatus(): PgpStatus =
        if (secureStore.hasPrivateKey) PgpStatus.LOCKED else PgpStatus.ABSENT

    val hasPrivateKey: Boolean get() = secureStore.hasPrivateKey

    val ownPublicKey: String? get() = identity?.armoredPublicKey

    val hasRememberedPassphrase: Boolean get() = secureStore.passphrase != null

    var requireBiometric: Boolean
        get() = secureStore.requireBiometric
        set(value) { secureStore.requireBiometric = value }

    val fingerprint: String? get() = identity?.armoredPublicKey?.let { PgpEngine.fingerprint(it) }

    fun exportPrivateKey(): String? = secureStore.armoredPrivateKey

    fun generate(name: String, email: String, passphrase: String, remember: Boolean): Result<GeneratedIdentity> {
        val gen = PgpEngine.generateIdentity(name, email, passphrase)
        return gen.fold(
            onSuccess = { id ->
                secureStore.armoredPrivateKey = id.privateKeyEnc
                PgpEngine.unlock(id.privateKeyEnc, passphrase).fold(
                    onSuccess = {
                        identity = it
                        if (remember) secureStore.passphrase = passphrase else secureStore.passphrase = null
                        _status.value = PgpStatus.UNLOCKED
                        Result.success(id)
                    },
                    onFailure = { Result.failure(it) }
                )
            },
            onFailure = { Result.failure(it) }
        )
    }

    fun importPrivateKey(armoredPrivateKey: String): Result<Unit> {
        val check = PgpEngine.publicKeyFromPrivate(armoredPrivateKey)
        if (check.isFailure) return Result.failure(check.exceptionOrNull() ?: IllegalArgumentException("Invalid key"))
        secureStore.armoredPrivateKey = armoredPrivateKey
        identity = null
        _status.value = PgpStatus.LOCKED
        return Result.success(Unit)
    }

    fun unlock(passphrase: String, remember: Boolean): Result<Unit> {
        val armored = secureStore.armoredPrivateKey
            ?: return Result.failure(IllegalStateException("No private key imported"))
        val result = PgpEngine.unlock(armored, passphrase)
        return result.fold(
            onSuccess = {
                identity = it
                if (remember) secureStore.passphrase = passphrase else secureStore.passphrase = null
                _status.value = PgpStatus.UNLOCKED
                Result.success(Unit)
            },
            onFailure = { Result.failure(it) }
        )
    }

    fun tryAutoUnlock(): Boolean {
        if (identity != null) return true
        val armored = secureStore.armoredPrivateKey ?: return false
        val pass = secureStore.passphrase ?: return false
        return PgpEngine.unlock(armored, pass).fold(
            onSuccess = {
                identity = it
                _status.value = PgpStatus.UNLOCKED
                true
            },
            onFailure = {
                _status.value = PgpStatus.LOCKED
                false
            }
        )
    }

    fun decrypt(armoredMessage: String): Result<String> {
        val id = identity ?: return Result.failure(IllegalStateException("PGP key is locked"))
        return PgpEngine.decrypt(id, armoredMessage)
    }

    fun encryptFor(recipientKeys: List<String>, plaintext: String): Result<String> {
        val own = identity?.armoredPublicKey
        val keys = if (own != null) recipientKeys + own else recipientKeys
        return PgpEngine.encrypt(keys, plaintext)
    }

    fun lock() {
        identity = null
        secureStore.passphrase = null
        _status.value = if (secureStore.hasPrivateKey) PgpStatus.LOCKED else PgpStatus.ABSENT
    }

    fun forget() {
        identity = null
        secureStore.clear()
        _status.value = PgpStatus.ABSENT
    }
}
