package zip.estrogen.mail

import android.app.Application
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.SecureStore
import zip.estrogen.mail.data.SettingsStore
import zip.estrogen.mail.data.auth.AuthManager
import zip.estrogen.mail.data.local.AppDatabase
import zip.estrogen.mail.data.pgp.PgpManager
import zip.estrogen.mail.util.CrashReporter

sealed interface AuthPhase {
    data object Idle : AuthPhase
    data object Working : AuthPhase
    data class Error(val message: String) : AuthPhase
}

class MailApp : Application() {

    lateinit var settings: SettingsStore
        private set

    lateinit var secureStore: SecureStore
        private set

    lateinit var pgp: PgpManager
        private set

    lateinit var repository: MailRepository
        private set

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _authPhase = MutableStateFlow<AuthPhase>(AuthPhase.Idle)
    val authPhase: StateFlow<AuthPhase> = _authPhase.asStateFlow()

    private var pendingAuthBaseUrl = SettingsStore.DEFAULT_BASE_URL

    override fun onCreate() {
        super.onCreate()
        CrashReporter.install(this)
        settings = SettingsStore(this)
        secureStore = SecureStore(this)
        pgp = PgpManager(secureStore)
        repository = MailRepository(settings, pgp, AppDatabase.get(this))
        bootstrapDevCredentials()
    }

    fun startNativeLogin(context: Context, baseUrl: String) {
        pendingAuthBaseUrl = baseUrl.trim().trimEnd('/').ifBlank { SettingsStore.DEFAULT_BASE_URL }
        _authPhase.value = AuthPhase.Idle
        AuthManager.launchLogin(context, pendingAuthBaseUrl)
    }

    fun completeNativeLogin(code: String) {
        _authPhase.value = AuthPhase.Working
        appScope.launch {
            AuthManager.exchange(pendingAuthBaseUrl, code).fold(
                onSuccess = {
                    repository.saveCredentials(it.apiKey, pendingAuthBaseUrl)
                    _authPhase.value = AuthPhase.Idle
                },
                onFailure = {
                    _authPhase.value = AuthPhase.Error(it.message ?: "Sign-in failed")
                }
            )
        }
    }

    fun resetAuthPhase() {
        _authPhase.value = AuthPhase.Idle
    }

    private fun bootstrapDevCredentials() {
        if (!BuildConfig.DEBUG) return
        val key = BuildConfig.DEV_API_KEY
        val url = BuildConfig.DEV_BASE_URL
        if (key.isBlank() || url.isBlank()) return
        appScope.launch {
            if (settings.credentials.first() == null) {
                repository.saveCredentials(key, url)
            }
        }
    }
}
