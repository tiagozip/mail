package zip.estrogen.mail.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "estrogen_mail_prefs")

data class Credentials(
    val apiKey: String,
    val baseUrl: String
)

class SettingsStore(private val context: Context) {

    private val keyApiKey = stringPreferencesKey("api_key")
    private val keyBaseUrl = stringPreferencesKey("base_url")
    private val keyDynamicColor = stringPreferencesKey("dynamic_color")
    private val keyPgpPublicKey = stringPreferencesKey("pgp_public_key")

    val credentials: Flow<Credentials?> = context.dataStore.data.map { prefs ->
        val key = prefs[keyApiKey]
        val url = prefs[keyBaseUrl] ?: DEFAULT_BASE_URL
        if (key.isNullOrBlank()) null else Credentials(key, url)
    }

    val dynamicColor: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[keyDynamicColor]?.let { it == "true" } ?: true
    }

    val pgpPublicKey: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[keyPgpPublicKey]
    }

    suspend fun save(apiKey: String, baseUrl: String) {
        context.dataStore.edit { prefs ->
            prefs[keyApiKey] = apiKey.trim()
            prefs[keyBaseUrl] = baseUrl.trim().trimEnd('/').ifBlank { DEFAULT_BASE_URL }
        }
    }

    suspend fun setDynamicColor(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[keyDynamicColor] = if (enabled) "true" else "false"
        }
    }

    suspend fun setPgpPublicKey(armored: String?) {
        context.dataStore.edit { prefs ->
            if (armored.isNullOrBlank()) prefs.remove(keyPgpPublicKey)
            else prefs[keyPgpPublicKey] = armored
        }
    }

    suspend fun clear() {
        context.dataStore.edit { prefs ->
            val keep = prefs[keyDynamicColor]
            prefs.clear()
            if (keep != null) prefs[keyDynamicColor] = keep
        }
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://mail.estrogen.delivery"
    }
}
