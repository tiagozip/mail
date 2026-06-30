package zip.estrogen.mail.data.remote

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

object ApiFactory {

    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    fun client(
        apiKey: String,
        onUnauthorized: () -> Unit = {},
        onAuthorized: () -> Unit = {}
    ): OkHttpClient {
        val authInterceptor = Interceptor { chain ->
            val request = chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $apiKey")
                .addHeader("X-API-Key", apiKey)
                .addHeader("Accept", "application/json")
                .build()
            chain.proceed(request)
        }
        val statusInterceptor = Interceptor { chain ->
            val response = chain.proceed(chain.request())
            when (response.code) {
                401 -> onUnauthorized()
                in 200..299 -> onAuthorized()
            }
            response
        }
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(statusInterceptor)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    fun create(
        baseUrl: String,
        apiKey: String,
        onUnauthorized: () -> Unit = {},
        onAuthorized: () -> Unit = {},
        client: OkHttpClient = client(apiKey, onUnauthorized, onAuthorized)
    ): MailApi {
        val normalized = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return Retrofit.Builder()
            .baseUrl(normalized)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MailApi::class.java)
    }
}
