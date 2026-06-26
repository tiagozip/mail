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

    val credentials: Flow<Credentials?> = context.dataStore.data.map { prefs ->
        val key = prefs[keyApiKey]
        val url = prefs[keyBaseUrl] ?: DEFAULT_BASE_URL
        if (key.isNullOrBlank()) null else Credentials(key, url)
    }

    suspend fun save(apiKey: String, baseUrl: String) {
        context.dataStore.edit { prefs ->
            prefs[keyApiKey] = apiKey.trim()
            prefs[keyBaseUrl] = baseUrl.trim().trimEnd('/').ifBlank { DEFAULT_BASE_URL }
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://mail.estrogen.delivery"
    }
}
