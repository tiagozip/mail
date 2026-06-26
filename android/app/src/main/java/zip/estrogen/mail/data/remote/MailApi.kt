package zip.estrogen.mail.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import zip.estrogen.mail.data.model.FoldersResponse
import zip.estrogen.mail.data.model.MeResponse
import zip.estrogen.mail.data.model.MessagesResponse
import zip.estrogen.mail.data.model.MoveBody
import zip.estrogen.mail.data.model.ReadBody
import zip.estrogen.mail.data.model.SendRequest
import zip.estrogen.mail.data.model.SendResponse
import zip.estrogen.mail.data.model.SingleMessageResponse
import zip.estrogen.mail.data.model.StarBody
import zip.estrogen.mail.data.model.ThreadResponse

interface MailApi {

    @GET("api/me")
    suspend fun me(): MeResponse

    @GET("api/folders")
    suspend fun folders(): FoldersResponse

    @GET("api/messages")
    suspend fun messages(
        @Query("folder") folder: String,
        @Query("limit") limit: Int = 50,
        @Query("cursor") cursor: String? = null
    ): MessagesResponse

    @GET("api/threads/{threadId}")
    suspend fun thread(@Path("threadId") threadId: String): ThreadResponse

    @GET("api/messages/{id}")
    suspend fun message(@Path("id") id: String): SingleMessageResponse

    @POST("api/messages/{id}/read")
    suspend fun setRead(@Path("id") id: String, @Body body: ReadBody)

    @POST("api/messages/{id}/star")
    suspend fun setStar(@Path("id") id: String, @Body body: StarBody)

    @POST("api/messages/{id}/move")
    suspend fun move(@Path("id") id: String, @Body body: MoveBody)

    @POST("api/send")
    suspend fun send(@Body body: SendRequest): SendResponse
}
