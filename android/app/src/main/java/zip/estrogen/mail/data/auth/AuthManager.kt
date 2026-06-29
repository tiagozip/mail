package zip.estrogen.mail.data.auth

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import zip.estrogen.mail.data.remote.ApiFactory
import java.util.concurrent.TimeUnit

@Serializable
data class NativeAuthResult(val apiKey: String = "", val address: String? = null)

object AuthManager {

    const val REDIRECT_SCHEME = "zip.estrogen.mail"
    private val jsonMedia = "application/json".toMediaType()

    private val client by lazy {
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    fun loginUrl(baseUrl: String): String =
        "${baseUrl.trimEnd('/')}/api/auth/login?native=1"

    fun launchLogin(context: Context, baseUrl: String) {
        val intent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setUrlBarHidingEnabled(true)
            .build()
        intent.intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        intent.launchUrl(context, Uri.parse(loginUrl(baseUrl)))
    }

    suspend fun exchange(baseUrl: String, code: String): Result<NativeAuthResult> =
        withContext(Dispatchers.IO) {
            runCatching {
                val payload = ApiFactory.json.encodeToString(
                    NativeExchangeBody.serializer(),
                    NativeExchangeBody(code)
                )
                val request = Request.Builder()
                    .url("${baseUrl.trimEnd('/')}/api/auth/native/exchange")
                    .post(payload.toRequestBody(jsonMedia))
                    .build()
                client.newCall(request).execute().use { resp ->
                    val text = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) throw IllegalStateException("Sign-in failed (${resp.code})")
                    val result = ApiFactory.json.decodeFromString(NativeAuthResult.serializer(), text)
                    if (result.apiKey.isBlank()) throw IllegalStateException("No key returned")
                    result
                }
            }
        }
}

@Serializable
private data class NativeExchangeBody(val code: String)
