package zip.estrogen.mail.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import zip.estrogen.mail.data.model.FoldersResponse
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.data.model.MeResponse
import zip.estrogen.mail.data.model.MessagesResponse
import zip.estrogen.mail.data.model.MoveBody
import zip.estrogen.mail.data.model.ReadBody
import zip.estrogen.mail.data.model.SendRequest
import zip.estrogen.mail.data.model.SendResponse
import zip.estrogen.mail.data.model.StarBody
import zip.estrogen.mail.data.remote.ApiFactory
import zip.estrogen.mail.data.remote.MailApi

class MailRepository(private val settings: SettingsStore) {

    val credentials: Flow<Credentials?> = settings.credentials

    private var cachedApi: MailApi? = null
    private var cachedFor: String? = null

    private val _me = MutableStateFlow<MeResponse?>(null)
    val me = _me.asStateFlow()

    private suspend fun api(): MailApi {
        val creds = settings.credentials.first()
            ?: throw IllegalStateException("Not configured")
        val signature = "${creds.baseUrl}::${creds.apiKey}"
        if (cachedApi == null || cachedFor != signature) {
            cachedApi = ApiFactory.create(creds.baseUrl, creds.apiKey)
            cachedFor = signature
        }
        return cachedApi!!
    }

    suspend fun validate(baseUrl: String, apiKey: String): Result<MeResponse> = runCatching {
        ApiFactory.create(baseUrl, apiKey).me()
    }

    suspend fun saveCredentials(apiKey: String, baseUrl: String) {
        settings.save(apiKey, baseUrl)
        cachedApi = null
        cachedFor = null
    }

    suspend fun signOut() {
        settings.clear()
        cachedApi = null
        cachedFor = null
        _me.value = null
    }

    suspend fun loadMe(): Result<MeResponse> = runCatching {
        api().me().also { _me.value = it }
    }

    suspend fun loadFolders(): Result<FoldersResponse> = runCatching { api().folders() }

    suspend fun loadMessages(folder: Folder, cursor: String? = null): Result<MessagesResponse> =
        runCatching { api().messages(folder.key, cursor = cursor) }

    suspend fun loadThread(threadId: String): Result<List<FullMessage>> =
        runCatching { api().thread(threadId).messages }

    suspend fun loadMessage(id: String): Result<FullMessage> =
        runCatching { api().message(id).message }

    suspend fun setRead(id: String, read: Boolean): Result<Unit> =
        runCatching { api().setRead(id, ReadBody(read)) }

    suspend fun setStar(id: String, star: Boolean): Result<Unit> =
        runCatching { api().setStar(id, StarBody(star)) }

    suspend fun move(id: String, folder: Folder): Result<Unit> =
        runCatching { api().move(id, MoveBody(folder.key)) }

    suspend fun send(request: SendRequest): Result<SendResponse> =
        runCatching { api().send(request) }
}
