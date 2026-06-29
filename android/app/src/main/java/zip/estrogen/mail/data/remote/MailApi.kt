package zip.estrogen.mail.data.remote

import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming
import zip.estrogen.mail.data.model.Address
import zip.estrogen.mail.data.model.AliasDomainsResponse
import zip.estrogen.mail.data.model.AliasesResponse
import zip.estrogen.mail.data.model.ApiKey
import zip.estrogen.mail.data.model.ApiKeyBody
import zip.estrogen.mail.data.model.ApiKeysResponse
import zip.estrogen.mail.data.model.AttachmentUploadResponse
import zip.estrogen.mail.data.model.AvatarResponse
import zip.estrogen.mail.data.model.BulkBody
import zip.estrogen.mail.data.model.ByodDomainBody
import zip.estrogen.mail.data.model.ByodDomainResponse
import zip.estrogen.mail.data.model.ContactsResponse
import zip.estrogen.mail.data.model.DomainsResponse
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
import zip.estrogen.mail.data.model.ThreadsBulkBody
import zip.estrogen.mail.data.model.ThreadsBulkResponse
import zip.estrogen.mail.data.model.Filter
import zip.estrogen.mail.data.model.FilterBody
import zip.estrogen.mail.data.model.FiltersResponse
import zip.estrogen.mail.data.model.FoldersResponse
import zip.estrogen.mail.data.model.HiddenAlias
import zip.estrogen.mail.data.model.HiddenAliasesResponse
import zip.estrogen.mail.data.model.Label
import zip.estrogen.mail.data.model.LabelBody
import zip.estrogen.mail.data.model.LabelsBody
import zip.estrogen.mail.data.model.LabelsResponse
import zip.estrogen.mail.data.model.MeResponse
import zip.estrogen.mail.data.model.MessagesResponse
import zip.estrogen.mail.data.model.MoveBody
import zip.estrogen.mail.data.model.OkResponse
import zip.estrogen.mail.data.model.PatchHiddenAliasBody
import zip.estrogen.mail.data.model.PgpResponse
import zip.estrogen.mail.data.model.PrimaryAliasBody
import zip.estrogen.mail.data.model.PubkeyResponse
import zip.estrogen.mail.data.model.PushLatestResponse
import zip.estrogen.mail.data.model.ReadBody
import zip.estrogen.mail.data.model.ScheduledSendsResponse
import zip.estrogen.mail.data.model.SendRequest
import zip.estrogen.mail.data.model.SendResponse
import zip.estrogen.mail.data.model.SettingsBody
import zip.estrogen.mail.data.model.SingleMessageResponse
import zip.estrogen.mail.data.model.SnoozeBody
import zip.estrogen.mail.data.model.StarBody
import zip.estrogen.mail.data.model.SyncResponse
import zip.estrogen.mail.data.model.ThreadResponse

interface MailApi {

    @GET("api/me")
    suspend fun me(): MeResponse

    @GET("api/folders")
    suspend fun folders(): FoldersResponse

    @GET("api/sync")
    suspend fun sync(@Query("since") since: Long, @Query("limit") limit: Int = 200): SyncResponse

    @GET("api/messages")
    suspend fun messages(
        @Query("folder") folder: String? = null,
        @Query("q") q: String? = null,
        @Query("label") label: String? = null,
        @Query("starred") starred: String? = null,
        @Query("limit") limit: Int = 50,
        @Query("cursor") cursor: String? = null
    ): MessagesResponse

    @GET("api/threads/{threadId}")
    suspend fun thread(@Path("threadId") threadId: String): ThreadResponse

    @GET("api/messages/{id}")
    suspend fun message(
        @Path("id") id: String,
        @Query("images") images: String? = null
    ): SingleMessageResponse

    @DELETE("api/messages/{id}")
    suspend fun deleteMessage(@Path("id") id: String): OkResponse

    @POST("api/messages/{id}/read")
    suspend fun setRead(@Path("id") id: String, @Body body: ReadBody): OkResponse

    @POST("api/messages/{id}/star")
    suspend fun setStar(@Path("id") id: String, @Body body: StarBody): OkResponse

    @POST("api/messages/{id}/move")
    suspend fun move(@Path("id") id: String, @Body body: MoveBody): OkResponse

    @POST("api/messages/{id}/snooze")
    suspend fun snooze(@Path("id") id: String, @Body body: SnoozeBody): OkResponse

    @POST("api/messages/{id}/labels")
    suspend fun messageLabels(@Path("id") id: String, @Body body: LabelsBody): OkResponse

    @POST("api/messages/bulk")
    suspend fun bulk(@Body body: BulkBody): OkResponse

    @POST("api/send")
    suspend fun send(@Body body: SendRequest): SendResponse

    @POST("api/drafts")
    suspend fun createDraft(@Body body: DraftBody): DraftResponse

    @PUT("api/drafts/{id}")
    suspend fun updateDraft(@Path("id") id: String, @Body body: DraftBody): DraftResponse

    @GET("api/scheduled-sends")
    suspend fun scheduledSends(): ScheduledSendsResponse

    @DELETE("api/scheduled-sends/{id}")
    suspend fun deleteScheduledSend(@Path("id") id: String): OkResponse

    @Multipart
    @POST("api/attachments")
    suspend fun uploadAttachment(@Part file: MultipartBody.Part): AttachmentUploadResponse

    @Streaming
    @GET("api/attachments/{id}")
    suspend fun downloadAttachment(@Path("id") id: String): ResponseBody

    @DELETE("api/attachments/{id}")
    suspend fun deleteAttachment(@Path("id") id: String): OkResponse

    @Multipart
    @POST("api/avatar")
    suspend fun uploadAvatar(@Part file: MultipartBody.Part): AvatarResponse

    @DELETE("api/avatar")
    suspend fun deleteAvatar(): OkResponse

    @GET("api/contacts")
    suspend fun contacts(@Query("q") q: String? = null): ContactsResponse

    @GET("api/labels")
    suspend fun labels(): LabelsResponse

    @POST("api/labels")
    suspend fun createLabel(@Body body: LabelBody): Label

    @PUT("api/labels/{id}")
    suspend fun updateLabel(@Path("id") id: String, @Body body: LabelBody): Label

    @DELETE("api/labels/{id}")
    suspend fun deleteLabel(@Path("id") id: String): OkResponse

    @GET("api/filters")
    suspend fun filters(): FiltersResponse

    @POST("api/filters")
    suspend fun createFilter(@Body body: FilterBody): Filter

    @DELETE("api/filters/{id}")
    suspend fun deleteFilter(@Path("id") id: String): OkResponse

    @GET("api/aliases")
    suspend fun aliases(): AliasesResponse

    @POST("api/aliases")
    suspend fun createAlias(@Body body: CreateAliasBody): Address

    @DELETE("api/aliases/{address}")
    suspend fun deleteAlias(@Path("address", encoded = true) address: String): OkResponse

    @POST("api/aliases/primary")
    suspend fun setPrimaryAlias(@Body body: PrimaryAliasBody): OkResponse

    @GET("api/alias-domains")
    suspend fun aliasDomains(): AliasDomainsResponse

    @GET("api/hidden-aliases")
    suspend fun hiddenAliases(): HiddenAliasesResponse

    @POST("api/hidden-aliases")
    suspend fun createHiddenAlias(@Body body: CreateHiddenAliasBody): HiddenAlias

    @PATCH("api/hidden-aliases/{address}")
    suspend fun patchHiddenAlias(
        @Path("address", encoded = true) address: String,
        @Body body: PatchHiddenAliasBody
    ): OkResponse

    @DELETE("api/hidden-aliases/{address}")
    suspend fun deleteHiddenAlias(@Path("address", encoded = true) address: String): OkResponse

    @GET("api/keys")
    suspend fun keys(): ApiKeysResponse

    @POST("api/keys")
    suspend fun createKey(@Body body: ApiKeyBody): ApiKey

    @DELETE("api/keys/{id}")
    suspend fun deleteKey(@Path("id") id: String): OkResponse

    @PUT("api/settings")
    suspend fun updateSettings(@Body body: SettingsBody): MeResponse

    @GET("api/push/latest")
    suspend fun pushLatest(): PushLatestResponse

    @GET("api/pgp")
    suspend fun pgp(): PgpResponse

    @POST("api/pgp/enable")
    suspend fun enablePgp(@Body body: EnablePgpBody): OkResponse

    @DELETE("api/pgp")
    suspend fun disablePgp(): OkResponse

    @GET("api/pgp/pubkey")
    suspend fun pubkey(@Query("address") address: String): PubkeyResponse

    @POST("api/threads/bulk")
    suspend fun threadsBulk(@Body body: ThreadsBulkBody): ThreadsBulkResponse

    @GET("api/domains")
    suspend fun domains(): DomainsResponse

    @POST("api/domains/byod")
    suspend fun addByodDomain(@Body body: ByodDomainBody): ByodDomainResponse

    @POST("api/domains/{id}/relay")
    suspend fun setupRelay(@Path("id") id: String, @Body body: SetupRelayBody): SetupRelayResponse

    @GET("api/domains/{id}/relay-status")
    suspend fun relayStatus(@Path("id") id: String): RelayStatusResponse

    @POST("api/domains/{id}/relay-health")
    suspend fun relayHealth(@Path("id") id: String): RelayHealthResponse

    @POST("api/domains/{id}/relay/rotate")
    suspend fun rotateRelay(@Path("id") id: String): RotateRelayResponse
}
