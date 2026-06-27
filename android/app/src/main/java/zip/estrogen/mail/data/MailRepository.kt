package zip.estrogen.mail.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import zip.estrogen.mail.data.model.FoldersResponse
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.data.model.MeResponse
import zip.estrogen.mail.data.model.MessagesResponse
import zip.estrogen.mail.data.model.MoveBody
import zip.estrogen.mail.data.model.ReadBody
import zip.estrogen.mail.data.model.SendRequest
import zip.estrogen.mail.data.model.SendResponse
import zip.estrogen.mail.data.model.StarBody
import zip.estrogen.mail.data.pgp.PgpManager
import zip.estrogen.mail.data.remote.ApiFactory
import zip.estrogen.mail.data.remote.MailApi

class MailRepository(
    private val settings: SettingsStore,
    val pgp: PgpManager
) {

    val credentials: Flow<Credentials?> = settings.credentials
    val dynamicColor: Flow<Boolean> = settings.dynamicColor

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
        return cachedApi ?: throw IllegalStateException("Client unavailable")
    }

    private suspend fun <T> call(block: suspend (MailApi) -> T): Result<T> =
        withContext(Dispatchers.IO) {
            runCatching { block(api()) }
        }

    suspend fun validate(baseUrl: String, apiKey: String): Result<MeResponse> =
        withContext(Dispatchers.IO) {
            runCatching { ApiFactory.create(baseUrl, apiKey).me() }
        }

    suspend fun saveCredentials(apiKey: String, baseUrl: String) {
        settings.save(apiKey, baseUrl)
        cachedApi = null
        cachedFor = null
    }

    suspend fun setDynamicColor(enabled: Boolean) = settings.setDynamicColor(enabled)

    suspend fun signOut() {
        settings.clear()
        settings.setPgpPublicKey(null)
        pgp.forget()
        cachedApi = null
        cachedFor = null
        _me.value = null
    }

    suspend fun loadMe(): Result<MeResponse> = call { it.me() }.onSuccess { _me.value = it }

    suspend fun loadFolders(): Result<FoldersResponse> = call { it.folders() }

    suspend fun loadMessages(folder: Folder, cursor: String? = null): Result<MessagesResponse> =
        call { it.messages(folder.key, cursor = cursor) }

    suspend fun loadThread(threadId: String): Result<List<FullMessage>> =
        call { it.thread(threadId).messages }

    suspend fun loadMessage(id: String): Result<FullMessage> =
        call { it.message(id).message }

    suspend fun setRead(id: String, read: Boolean): Result<Unit> =
        call { it.setRead(id, ReadBody(read)) }

    suspend fun setStar(id: String, star: Boolean): Result<Unit> =
        call { it.setStar(id, StarBody(star)) }

    suspend fun move(id: String, folder: Folder): Result<Unit> =
        call { it.move(id, MoveBody(folder.key)) }

    suspend fun send(request: SendRequest): Result<SendResponse> =
        call { it.send(request) }

    suspend fun lookupPublicKey(address: String): Result<String?> =
        call { it.pubkey(address).publicKey }

    suspend fun fetchPgpFromServer(): Result<Pair<String?, String?>> =
        call { val r = it.pgp(); r.publicKey to r.privateKeyEnc }

    suspend fun storeOwnPublicKey(armored: String?) = settings.setPgpPublicKey(armored)
}
