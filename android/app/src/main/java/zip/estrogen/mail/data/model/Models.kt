package zip.estrogen.mail.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MeResponse(
    val user: User
)

@Serializable
data class User(
    val username: String? = null,
    val address: String? = null,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val pgpEnabled: Boolean = false
)

@Serializable
data class FolderCount(
    val total: Int = 0,
    val unread: Int = 0
)

@Serializable
data class FoldersResponse(
    val counts: FolderCounts = FolderCounts()
)

@Serializable
data class FolderCounts(
    val inbox: FolderCount = FolderCount(),
    val sent: FolderCount = FolderCount(),
    val drafts: FolderCount = FolderCount(),
    val archive: FolderCount = FolderCount(),
    val trash: FolderCount = FolderCount(),
    val spam: FolderCount = FolderCount(),
    val starred: FolderCount = FolderCount()
)

@Serializable
data class Party(
    val address: String? = null,
    val name: String? = null,
    val avatar: String? = null
)

@Serializable
data class MessagesResponse(
    val messages: List<MessageSummary> = emptyList(),
    val nextCursor: String? = null
)

@Serializable
data class MessageSummary(
    val id: String,
    val threadId: String? = null,
    val from: Party = Party(),
    val subject: String? = null,
    val snippet: String? = null,
    val date: Long = 0L,
    val isRead: Boolean = false,
    val isStarred: Boolean = false,
    val hasAttachments: Boolean = false,
    val pgp: Boolean = false
)

@Serializable
data class ThreadResponse(
    val messages: List<FullMessage> = emptyList()
)

@Serializable
data class SingleMessageResponse(
    val message: FullMessage
)

@Serializable
data class FullMessage(
    val id: String,
    val threadId: String? = null,
    val from: Party = Party(),
    val to: List<Party> = emptyList(),
    val cc: List<Party> = emptyList(),
    val subject: String? = null,
    val snippet: String? = null,
    val date: Long = 0L,
    val isRead: Boolean = false,
    val isStarred: Boolean = false,
    val hasAttachments: Boolean = false,
    val pgp: Boolean = false,
    val bodyText: String? = null,
    val bodyHtml: String? = null,
    val hasHtml: Boolean = false,
    val attachments: List<Attachment> = emptyList()
)

@Serializable
data class Attachment(
    val id: String,
    val filename: String? = null,
    val mime: String? = null,
    val size: Long = 0L
)

@Serializable
data class ReadBody(val read: Boolean)

@Serializable
data class StarBody(val star: Boolean)

@Serializable
data class MoveBody(val folder: String)

@Serializable
data class SendRequest(
    val to: List<String>,
    val cc: List<String> = emptyList(),
    val bcc: List<String> = emptyList(),
    val subject: String,
    val text: String,
    val html: String? = null,
    val from: String? = null,
    val inReplyTo: String? = null,
    val references: List<String> = emptyList(),
    val attachmentIds: List<String> = emptyList(),
    val pgp: Boolean = false
)

@Serializable
data class SendResponse(
    val ok: Boolean = false,
    val id: String? = null,
    @SerialName("threadId") val threadId: String? = null
)

@Serializable
data class PgpResponse(
    val enabled: Boolean = false,
    val publicKey: String? = null,
    val privateKeyEnc: String? = null
)

@Serializable
data class PubkeyResponse(
    val publicKey: String? = null
)
