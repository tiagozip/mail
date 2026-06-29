package zip.estrogen.mail.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import zip.estrogen.mail.data.local.AppDatabase
import zip.estrogen.mail.data.local.CachedMessage
import zip.estrogen.mail.data.local.SyncMeta
import zip.estrogen.mail.data.local.toEntity
import zip.estrogen.mail.data.model.Address
import zip.estrogen.mail.data.model.AliasDomainsResponse
import zip.estrogen.mail.data.model.ApiKey
import zip.estrogen.mail.data.model.ApiKeyBody
import zip.estrogen.mail.data.model.AttachmentUploadResponse
import zip.estrogen.mail.data.model.AvatarResponse
import zip.estrogen.mail.data.model.BulkBody
import zip.estrogen.mail.data.model.ByodDomainBody
import zip.estrogen.mail.data.model.ByodDomainResponse
import zip.estrogen.mail.data.model.Contact
import zip.estrogen.mail.data.model.Domain
import zip.estrogen.mail.data.model.RelayHealthResponse
import zip.estrogen.mail.data.model.RelayStatusResponse
import zip.estrogen.mail.data.model.RotateRelayResponse
import zip.estrogen.mail.data.model.SetupRelayBody
import zip.estrogen.mail.data.model.SetupRelayResponse
import zip.estrogen.mail.data.model.CreateAliasBody
import zip.estrogen.mail.data.model.CreateHiddenAliasBody
import zip.estrogen.mail.data.model.DraftBody
import zip.estrogen.mail.data.model.DraftResponse
import zip.estrogen.mail.data.model.EnablePgpBody
import zip.estrogen.mail.data.model.Filter
import zip.estrogen.mail.data.model.FilterBody
import zip.estrogen.mail.data.model.FoldersResponse
import zip.estrogen.mail.data.model.FullMessage
import zip.estrogen.mail.data.model.HiddenAlias
import zip.estrogen.mail.data.model.Label
import zip.estrogen.mail.data.model.LabelBody
import zip.estrogen.mail.data.model.LabelsBody
import zip.estrogen.mail.data.model.MeResponse
import zip.estrogen.mail.data.model.MessageSummary
import zip.estrogen.mail.data.model.MessagesResponse
import zip.estrogen.mail.data.model.MoveBody
import zip.estrogen.mail.data.model.PatchHiddenAliasBody
import zip.estrogen.mail.data.model.PrimaryAliasBody
import zip.estrogen.mail.data.model.PushLatestResponse
import zip.estrogen.mail.data.model.ReadBody
import zip.estrogen.mail.data.model.ScheduledSend
import zip.estrogen.mail.data.model.SendRequest
import zip.estrogen.mail.data.model.SendResponse
import zip.estrogen.mail.data.model.SettingsBody
import zip.estrogen.mail.data.model.SnoozeBody
import zip.estrogen.mail.data.model.StarBody
import zip.estrogen.mail.data.pgp.PgpManager
import zip.estrogen.mail.data.remote.ApiFactory
import zip.estrogen.mail.data.remote.MailApi
import zip.estrogen.mail.ui.theme.AppPalette
import zip.estrogen.mail.ui.theme.DarkMode

class MailRepository(
    private val settings: SettingsStore,
    val pgp: PgpManager,
    private val db: AppDatabase
) {

    val messageDao = db.messageDao()
    val contactDao = db.contactDao()
    private val syncMetaDao = db.syncMetaDao()

    val credentials: Flow<Credentials?> = settings.credentials
    val dynamicColor: Flow<Boolean> = settings.dynamicColor
    val appearance: Flow<Appearance> = settings.appearance

    val authState: Flow<AuthState> = settings.credentials.map { creds ->
        if (creds == null) AuthState.SignedOut else AuthState.SignedIn
    }

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
        withContext(Dispatchers.IO) { runCatching { block(api()) } }

    suspend fun baseUrl(): String = settings.credentials.first()?.baseUrl ?: SettingsStore.DEFAULT_BASE_URL
    suspend fun apiKey(): String? = settings.credentials.first()?.apiKey
    suspend fun isConfigured(): Boolean = settings.credentials.first() != null

    suspend fun validate(baseUrl: String, apiKey: String): Result<MeResponse> =
        withContext(Dispatchers.IO) { runCatching { ApiFactory.create(baseUrl, apiKey).me() } }

    suspend fun saveCredentials(apiKey: String, baseUrl: String) {
        settings.save(apiKey, baseUrl)
        cachedApi = null
        cachedFor = null
    }

    suspend fun setDynamicColor(enabled: Boolean) = settings.setDynamicColor(enabled)
    suspend fun setPalette(palette: AppPalette) = settings.setPalette(palette)
    suspend fun setDarkMode(mode: DarkMode) = settings.setDarkMode(mode)
    suspend fun setAmoled(enabled: Boolean) = settings.setAmoled(enabled)

    suspend fun signOut() {
        settings.clear()
        settings.setPgpPublicKey(null)
        pgp.forget()
        withContext(Dispatchers.IO) {
            messageDao.clearAll()
            syncMetaDao.clear()
            contactDao.clear()
        }
        cachedApi = null
        cachedFor = null
        _me.value = null
    }

    suspend fun loadMe(): Result<MeResponse> = call { it.me() }.onSuccess { _me.value = it }

    suspend fun loadFolders(): Result<FoldersResponse> = call { it.folders() }

    fun observeFolder(folder: Folder): Flow<List<CachedMessage>> = when (folder) {
        Folder.STARRED -> messageDao.observeStarred()
        else -> messageDao.observeFolder(folder.key, System.currentTimeMillis())
    }

    fun observeLabel(labelId: String): Flow<List<CachedMessage>> =
        messageDao.observeLabel("\"id\":\"$labelId\"")

    fun observeSnoozed(): Flow<List<CachedMessage>> =
        messageDao.observeSnoozed(System.currentTimeMillis())

    fun search(q: String): Flow<List<CachedMessage>> = messageDao.search(q)

    suspend fun refreshMessages(
        folder: Folder,
        cursor: String? = null,
        replace: Boolean = false
    ): Result<MessagesResponse> = call {
        val resp = it.messages(folder.key, cursor = cursor)
        val entities = resp.messages.map { m ->
            val keepDecrypted = messageDao.decryptedSnippet(m.id)
            m.toEntity(folder.key, keepDecrypted)
        }
        if (replace && cursor == null && folder != Folder.STARRED) messageDao.clearFolder(folder.key)
        messageDao.upsertAll(entities)
        resp
    }

    suspend fun refreshLabel(labelId: String): Result<MessagesResponse> = call {
        val resp = it.messages(label = labelId, limit = 50)
        val entities = resp.messages.map { m -> m.toEntity(m.folder ?: "inbox", messageDao.decryptedSnippet(m.id)) }
        messageDao.upsertAll(entities)
        resp
    }

    suspend fun searchRemote(q: String): Result<List<MessageSummary>> = call {
        val resp = it.messages(q = q, limit = 50)
        val entities = resp.messages.map { m -> m.toEntity(m.folder ?: "inbox", messageDao.decryptedSnippet(m.id)) }
        messageDao.upsertAll(entities)
        resp.messages
    }

    suspend fun syncDelta(): Result<Int> = call { api ->
        val since = syncMetaDao.cursor() ?: 0
        var cursor = since
        var more = true
        var changes = 0
        while (more) {
            val resp = api.sync(cursor)
            val entities = resp.upserts.map { m ->
                m.toEntity(m.folder ?: "inbox", messageDao.decryptedSnippet(m.id))
            }
            if (entities.isNotEmpty()) messageDao.upsertAll(entities)
            if (resp.deletes.isNotEmpty()) messageDao.deleteByIds(resp.deletes)
            changes += entities.size + resp.deletes.size
            cursor = resp.cursor
            more = resp.more
        }
        if (cursor != since) syncMetaDao.set(SyncMeta(0, cursor))
        changes
    }

    suspend fun loadThread(threadId: String): Result<List<FullMessage>> =
        call { it.thread(threadId).messages }

    suspend fun loadMessage(id: String, images: Boolean = false): Result<FullMessage> =
        call { it.message(id, if (images) "1" else null).message }

    suspend fun setRead(id: String, read: Boolean): Result<Unit> = call {
        messageDao.setRead(id, read)
        it.setRead(id, ReadBody(read))
        Unit
    }

    suspend fun setStar(id: String, star: Boolean): Result<Unit> = call {
        messageDao.setStar(id, star)
        it.setStar(id, StarBody(star))
        Unit
    }

    suspend fun move(id: String, folder: Folder): Result<Unit> = call {
        messageDao.setFolder(id, folder.key)
        it.move(id, MoveBody(folder.key))
        Unit
    }

    suspend fun snooze(id: String, until: Long?): Result<Unit> = call {
        messageDao.setSnooze(id, until)
        it.snooze(id, SnoozeBody(until))
        Unit
    }

    suspend fun setLabels(id: String, add: List<String>, remove: List<String>): Result<Unit> =
        call { it.messageLabels(id, LabelsBody(add, remove)); Unit }

    suspend fun bulk(ids: List<String>, action: String, value: String? = null): Result<Unit> = call {
        it.bulk(BulkBody(ids, action, value))
        when (action) {
            "read" -> ids.forEach { id -> messageDao.setRead(id, value == "true") }
            "star" -> ids.forEach { id -> messageDao.setStar(id, value == "true") }
            "move" -> ids.forEach { id -> messageDao.setFolder(id, value ?: "archive") }
            "delete" -> messageDao.deleteByIds(ids)
        }
        Unit
    }

    suspend fun deleteMessage(id: String): Result<Unit> = call {
        messageDao.deleteByIds(listOf(id))
        it.deleteMessage(id)
        Unit
    }

    suspend fun send(request: SendRequest): Result<SendResponse> = call { it.send(request) }

    suspend fun createDraft(body: DraftBody): Result<DraftResponse> = call { it.createDraft(body) }
    suspend fun updateDraft(id: String, body: DraftBody): Result<DraftResponse> = call { it.updateDraft(id, body) }

    suspend fun scheduledSends(): Result<List<ScheduledSend>> = call { it.scheduledSends().sends }
    suspend fun cancelScheduledSend(id: String): Result<Unit> = call { it.deleteScheduledSend(id); Unit }

    suspend fun uploadAttachment(part: MultipartBody.Part): Result<AttachmentUploadResponse> =
        call { it.uploadAttachment(part) }
    suspend fun downloadAttachment(id: String): Result<ResponseBody> = call { it.downloadAttachment(id) }
    suspend fun deleteAttachment(id: String): Result<Unit> = call { it.deleteAttachment(id); Unit }

    suspend fun uploadAvatar(part: MultipartBody.Part): Result<AvatarResponse> = call { it.uploadAvatar(part) }
    suspend fun deleteAvatar(): Result<Unit> = call { it.deleteAvatar(); Unit }

    suspend fun contacts(q: String?): Result<List<Contact>> = call { it.contacts(q).contacts }

    suspend fun cachedContacts(q: String): List<zip.estrogen.mail.data.local.CachedContact> =
        withContext(Dispatchers.IO) { runCatching { contactDao.search(q) }.getOrDefault(emptyList()) }

    suspend fun labels(): Result<List<Label>> = call { it.labels().labels }
    suspend fun createLabel(name: String, color: String): Result<Label> = call { it.createLabel(LabelBody(name, color)) }
    suspend fun updateLabel(id: String, name: String, color: String): Result<Label> = call { it.updateLabel(id, LabelBody(name, color)) }
    suspend fun deleteLabel(id: String): Result<Unit> = call { it.deleteLabel(id); Unit }

    suspend fun filters(): Result<List<Filter>> = call { it.filters().filters }
    suspend fun createFilter(field: String, matchValue: String, action: String): Result<Filter> =
        call { it.createFilter(FilterBody(field, matchValue, action)) }
    suspend fun deleteFilter(id: String): Result<Unit> = call { it.deleteFilter(id); Unit }

    suspend fun aliases(): Result<List<Address>> = call { it.aliases().addresses }
    suspend fun aliasDomains(): Result<AliasDomainsResponse> = call { it.aliasDomains() }
    suspend fun createAlias(localPart: String, domain: String): Result<Address> = call { it.createAlias(CreateAliasBody(localPart, domain)) }
    suspend fun deleteAlias(address: String): Result<Unit> = call { it.deleteAlias(android.net.Uri.encode(address)); Unit }
    suspend fun setPrimaryAlias(address: String): Result<Unit> = call { it.setPrimaryAlias(PrimaryAliasBody(address)); Unit }

    suspend fun hiddenAliases(): Result<List<HiddenAlias>> = call { it.hiddenAliases().aliases }
    suspend fun createHiddenAlias(label: String, domain: String?): Result<HiddenAlias> = call { it.createHiddenAlias(CreateHiddenAliasBody(label, domain)) }
    suspend fun patchHiddenAlias(address: String, enabled: Boolean?, label: String?): Result<Unit> =
        call { it.patchHiddenAlias(android.net.Uri.encode(address), PatchHiddenAliasBody(enabled, label)); Unit }
    suspend fun deleteHiddenAlias(address: String): Result<Unit> = call { it.deleteHiddenAlias(android.net.Uri.encode(address)); Unit }

    suspend fun apiKeys(): Result<List<ApiKey>> = call { it.keys().keys }
    suspend fun createApiKey(name: String): Result<ApiKey> = call { it.createKey(ApiKeyBody(name)) }
    suspend fun deleteApiKey(id: String): Result<Unit> = call { it.deleteKey(id); Unit }

    suspend fun updateSettings(body: SettingsBody): Result<MeResponse> =
        call { it.updateSettings(body) }.onSuccess { _me.value = it }

    suspend fun pushLatest(): Result<PushLatestResponse> = call { it.pushLatest() }

    val notificationsEnabled: Flow<Boolean> = settings.notificationsEnabled
    suspend fun setNotificationsEnabled(enabled: Boolean) = settings.setNotificationsEnabled(enabled)
    suspend fun isNotificationsEnabled(): Boolean = settings.notificationsEnabled.first()

    suspend fun lookupPublicKey(address: String): Result<String?> = call { it.pubkey(address).publicKey }
    suspend fun fetchPgpFromServer(): Result<Pair<String?, String?>> =
        call { val r = it.pgp(); r.publicKey to r.privateKeyEnc }
    suspend fun enablePgp(publicKey: String, privateKeyEnc: String): Result<Unit> =
        call { it.enablePgp(EnablePgpBody(publicKey, privateKeyEnc)); Unit }
    suspend fun disablePgp(): Result<Unit> = call { it.disablePgp(); Unit }
    suspend fun storeOwnPublicKey(armored: String?) = settings.setPgpPublicKey(armored)

    suspend fun cacheDecryptedSnippet(id: String, snippet: String?) =
        withContext(Dispatchers.IO) { messageDao.setDecryptedSnippet(id, snippet) }

    suspend fun listDomains(): Result<List<Domain>> = call { it.domains().domains }

    suspend fun addByodDomain(domain: String): Result<ByodDomainResponse> =
        call { it.addByodDomain(ByodDomainBody(domain)) }

    suspend fun setupRelay(id: String, relayUrl: String): Result<SetupRelayResponse> =
        call { it.setupRelay(id, SetupRelayBody(relayUrl)) }

    suspend fun relayStatus(id: String): Result<RelayStatusResponse> = call { it.relayStatus(id) }

    suspend fun relayHealth(id: String): Result<RelayHealthResponse> = call { it.relayHealth(id) }

    suspend fun rotateRelay(id: String): Result<RotateRelayResponse> = call { it.rotateRelay(id) }
}
