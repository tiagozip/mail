package zip.estrogen.mail.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import zip.estrogen.mail.ui.theme.AppPalette
import zip.estrogen.mail.ui.theme.DarkMode

private val Context.dataStore by preferencesDataStore(name = "estrogen_mail_prefs")

data class Credentials(
    val apiKey: String,
    val baseUrl: String
)

data class Appearance(
    val palette: AppPalette = AppPalette.PLUM,
    val dynamicColor: Boolean = true,
    val darkMode: DarkMode = DarkMode.SYSTEM,
    val amoled: Boolean = false
)

class SettingsStore(private val context: Context) {

    private val secureStore = SecureStore(context)

    private val keyApiKey = stringPreferencesKey("api_key")
    private val keyBaseUrl = stringPreferencesKey("base_url")
    private val keyDynamicColor = stringPreferencesKey("dynamic_color")
    private val keyPalette = stringPreferencesKey("palette")
    private val keyDarkMode = stringPreferencesKey("dark_mode")
    private val keyAmoled = stringPreferencesKey("amoled")
    private val keyPgpPublicKey = stringPreferencesKey("pgp_public_key")
    private val keyNotifications = stringPreferencesKey("notifications")
    private val keySwipeRight = stringPreferencesKey("swipe_right")
    private val keySwipeLeft = stringPreferencesKey("swipe_left")

    val credentials: Flow<Credentials?> = context.dataStore.data.map { prefs ->
        val legacyKey = prefs[keyApiKey]
        if (!legacyKey.isNullOrBlank()) {
            secureStore.apiKey = legacyKey
            context.dataStore.edit { it.remove(keyApiKey) }
        }
        val key = secureStore.apiKey ?: legacyKey
        val url = prefs[keyBaseUrl] ?: DEFAULT_BASE_URL
        if (key.isNullOrBlank()) null else Credentials(key, url)
    }

    val dynamicColor: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[keyDynamicColor]?.let { it == "true" } ?: true
    }

    val appearance: Flow<Appearance> = context.dataStore.data.map { prefs ->
        Appearance(
            palette = AppPalette.fromKey(prefs[keyPalette]),
            dynamicColor = prefs[keyDynamicColor]?.let { it == "true" } ?: true,
            darkMode = DarkMode.fromKey(prefs[keyDarkMode]),
            amoled = prefs[keyAmoled] == "true"
        )
    }

    val pgpPublicKey: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[keyPgpPublicKey]
    }

    val notificationsEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[keyNotifications] == "true"
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs -> prefs[keyNotifications] = if (enabled) "true" else "false" }
    }

    val swipeConfig: Flow<SwipeConfig> = context.dataStore.data.map { prefs ->
        SwipeConfig(
            right = prefs[keySwipeRight]?.let { SwipeAction.from(it) } ?: SwipeAction.ARCHIVE,
            left = prefs[keySwipeLeft]?.let { SwipeAction.from(it) } ?: SwipeAction.TRASH
        )
    }

    suspend fun setSwipe(right: SwipeAction, left: SwipeAction) {
        context.dataStore.edit { prefs ->
            prefs[keySwipeRight] = right.key
            prefs[keySwipeLeft] = left.key
        }
    }

    suspend fun save(apiKey: String, baseUrl: String) {
        secureStore.apiKey = apiKey.trim()
        context.dataStore.edit { prefs ->
            prefs.remove(keyApiKey)
            prefs[keyBaseUrl] = baseUrl.trim().trimEnd('/').ifBlank { DEFAULT_BASE_URL }
        }
    }

    suspend fun setDynamicColor(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[keyDynamicColor] = if (enabled) "true" else "false"
        }
    }

    suspend fun setPalette(palette: AppPalette) {
        context.dataStore.edit { prefs -> prefs[keyPalette] = palette.key }
    }

    suspend fun setDarkMode(mode: DarkMode) {
        context.dataStore.edit { prefs -> prefs[keyDarkMode] = mode.key }
    }

    suspend fun setAmoled(enabled: Boolean) {
        context.dataStore.edit { prefs -> prefs[keyAmoled] = if (enabled) "true" else "false" }
    }

    suspend fun setPgpPublicKey(armored: String?) {
        context.dataStore.edit { prefs ->
            if (armored.isNullOrBlank()) prefs.remove(keyPgpPublicKey)
            else prefs[keyPgpPublicKey] = armored
        }
    }

    suspend fun clear() {
        secureStore.clear()
        context.dataStore.edit { prefs ->
            val palette = prefs[keyPalette]
            val dynamic = prefs[keyDynamicColor]
            val dark = prefs[keyDarkMode]
            val amoled = prefs[keyAmoled]
            prefs.clear()
            palette?.let { prefs[keyPalette] = it }
            dynamic?.let { prefs[keyDynamicColor] = it }
            dark?.let { prefs[keyDarkMode] = it }
            amoled?.let { prefs[keyAmoled] = it }
        }
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://mail.estrogen.delivery"
    }
}
