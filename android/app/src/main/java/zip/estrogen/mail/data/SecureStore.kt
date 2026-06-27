package zip.estrogen.mail.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureStore(context: Context) {

    private val appContext = context.applicationContext

    private val prefs: SharedPreferences? by lazy { buildPrefs() }

    private fun buildPrefs(): SharedPreferences? = runCatching {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }.onFailure { Log.e(TAG, "secure prefs unavailable", it) }.getOrNull()

    var armoredPrivateKey: String?
        get() = runCatching { prefs?.getString(KEY_PRIVATE, null) }.getOrNull()
        set(value) {
            runCatching {
                prefs?.edit()?.apply {
                    if (value.isNullOrBlank()) remove(KEY_PRIVATE) else putString(KEY_PRIVATE, value)
                }?.apply()
            }
        }

    var passphrase: String?
        get() = runCatching { prefs?.getString(KEY_PASS, null) }.getOrNull()
        set(value) {
            runCatching {
                prefs?.edit()?.apply {
                    if (value.isNullOrBlank()) remove(KEY_PASS) else putString(KEY_PASS, value)
                }?.apply()
            }
        }

    val hasPrivateKey: Boolean
        get() = !armoredPrivateKey.isNullOrBlank()

    fun clear() {
        runCatching { prefs?.edit()?.clear()?.apply() }
    }

    companion object {
        private const val TAG = "SecureStore"
        private const val FILE_NAME = "estrogen_mail_secure"
        private const val KEY_PRIVATE = "pgp_private_key"
        private const val KEY_PASS = "pgp_passphrase"
    }
}
