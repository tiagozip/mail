package zip.estrogen.mail.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class MeResponse(
    val user: User? = null,
    val syncCursor: Long = 0
)

@Serializable
data class User(
    val id: String? = null,
    val username: String? = null,
    val address: String? = null,
    val email: String? = null,
    val displayName: String? = null,
    val isAdmin: Boolean = false,
    val signature: String = "",
    val settings: JsonObject? = null,
    val storageUsed: Long = 0,
    val avatarUrl: String? = null,
    val pgpEnabled: Boolean = false,
    val addresses: List<Address> = emptyList()
)

@Serializable
data class Address(
    val address: String,
    val isPrimary: Boolean = false
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
data class Label(
    val id: String,
    val name: String = "",
    val color: String = "#8b7fd6"
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
    val folder: String? = null,
    val from: Party = Party(),
    val to: List<Party> = emptyList(),
    val subject: String? = null,
    val snippet: String? = null,
    val date: Long = 0L,
    val isRead: Boolean = false,
    val isStarred: Boolean = false,
    val isDraft: Boolean = false,
    val hasAttachments: Boolean = false,
    val pgp: Boolean = false,
    val authStatus: String = "none",
    val snoozeUntil: Long? = null,
    val labels: List<Label> = emptyList()
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
data class AuthDetail(
    val spf: String? = null,
    val dkim: String? = null,
    val dmarc: String? = null
)

@Serializable
data class FullMessage(
    val id: String,
    val threadId: String? = null,
    val folder: String? = null,
    val from: Party = Party(),
    val to: List<Party> = emptyList(),
    val cc: List<Party> = emptyList(),
    val bcc: List<Party> = emptyList(),
    val replyTo: String? = null,
    val rfcMessageId: String? = null,
    val inReplyTo: String? = null,
    val references: List<String> = emptyList(),
    val subject: String? = null,
    val snippet: String? = null,
    val date: Long = 0L,
    val isRead: Boolean = false,
    val isStarred: Boolean = false,
    val isDraft: Boolean = false,
    val hasAttachments: Boolean = false,
    val pgp: Boolean = false,
    val authStatus: String = "none",
    val authDetail: AuthDetail? = null,
    val trackersBlocked: Int = 0,
    val snoozeUntil: Long? = null,
    val bodyText: String? = null,
    val bodyHtml: String? = null,
    val hasHtml: Boolean = false,
    val labels: List<Label> = emptyList(),
    val attachments: List<Attachment> = emptyList()
)

@Serializable
data class Attachment(
    val id: String,
    val filename: String? = null,
    val mime: String? = null,
    val size: Long = 0L,
    val pgp: Boolean = false
)

@Serializable
data class SyncResponse(
    val upserts: List<MessageSummary> = emptyList(),
    val deletes: List<String> = emptyList(),
    val cursor: Long = 0,
    val more: Boolean = false
)

@Serializable
data class ReadBody(val read: Boolean)

@Serializable
data class StarBody(val star: Boolean)

@Serializable
data class MoveBody(val folder: String)

@Serializable
data class SnoozeBody(val until: Long?)

@Serializable
data class LabelsBody(
    val add: List<String> = emptyList(),
    val remove: List<String> = emptyList()
)

@Serializable
data class BulkBody(
    val ids: List<String>,
    val action: String,
    val value: String? = null
)

@Serializable
data class OkResponse(val ok: Boolean = false, val count: Int = 0)

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
    val draftId: String? = null,
    val sendAt: Long? = null,
    val pgp: Boolean = false
)

@Serializable
data class SendResponse(
    val ok: Boolean = false,
    val id: String? = null,
    val threadId: String? = null,
    val scheduled: Boolean = false,
    val sendAt: Long? = null
)

@Serializable
data class DraftBody(
    val to: List<String> = emptyList(),
    val cc: List<String> = emptyList(),
    val bcc: List<String> = emptyList(),
    val subject: String = "",
    val text: String = ""
)

@Serializable
data class DraftResponse(val id: String? = null)

@Serializable
data class AttachmentUploadResponse(
    val id: String,
    val filename: String? = null,
    val mime: String? = null,
    val size: Long = 0
)

@Serializable
data class Contact(
    val address: String,
    val name: String = "",
    val avatar: String? = null
)

@Serializable
data class ContactsResponse(val contacts: List<Contact> = emptyList())

@Serializable
data class AliasesResponse(val addresses: List<Address> = emptyList())

@Serializable
data class AliasDomainsResponse(
    val domains: List<String> = emptyList(),
    val builtIn: String = ""
)

@Serializable
data class CreateAliasBody(val localPart: String, val domain: String)

@Serializable
data class PrimaryAliasBody(val address: String)

@Serializable
data class HiddenAlias(
    val address: String,
    val label: String = "",
    val enabled: Boolean = true,
    val recvCount: Int = 0,
    val lastSeen: Long? = null,
    val createdAt: Long = 0
)

@Serializable
data class HiddenAliasesResponse(val aliases: List<HiddenAlias> = emptyList())

@Serializable
data class CreateHiddenAliasBody(val label: String = "", val domain: String? = null)

@Serializable
data class PatchHiddenAliasBody(val enabled: Boolean? = null, val label: String? = null)

@Serializable
data class LabelsResponse(val labels: List<Label> = emptyList())

@Serializable
data class LabelBody(val name: String, val color: String)

@Serializable
data class Filter(
    val id: String,
    val field: String = "from",
    @SerialName("match_value") val matchValue: String = "",
    val action: String = "archive",
    val position: Int = 0
)

@Serializable
data class FiltersResponse(val filters: List<Filter> = emptyList())

@Serializable
data class FilterBody(val field: String, val matchValue: String, val action: String)

@Serializable
data class ScheduledSend(
    val id: String,
    val sendAt: Long = 0,
    val to: List<String> = emptyList(),
    val subject: String = ""
)

@Serializable
data class ScheduledSendsResponse(val sends: List<ScheduledSend> = emptyList())

@Serializable
data class ApiKey(
    val id: String,
    val name: String = "",
    val prefix: String = "",
    @SerialName("created_at") val createdAt: Long = 0,
    @SerialName("last_used") val lastUsed: Long? = null,
    val key: String? = null
)

@Serializable
data class ApiKeysResponse(val keys: List<ApiKey> = emptyList())

@Serializable
data class ApiKeyBody(val name: String)

@Serializable
data class SettingsBody(
    val displayName: String? = null,
    val signature: String? = null,
    val settings: JsonObject? = null
)

@Serializable
data class AvatarResponse(val avatarUrl: String? = null)

@Serializable
data class PushLatestResponse(
    val count: Int = 0,
    val title: String = "",
    val body: String = ""
)

@Serializable
data class EnablePgpBody(
    val publicKey: String,
    val privateKeyEnc: String
)

@Serializable
data class ThreadsBulkBody(val threadIds: List<String>)

@Serializable
data class ThreadsBulkResponse(
    val threads: Map<String, List<FullMessage>> = emptyMap()
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

@Serializable
data class DomainsResponse(
    val domains: List<Domain> = emptyList()
)

@Serializable
data class Domain(
    val id: String = "",
    val domain: String = "",
    val verified: Boolean = false,
    val sendVerified: Boolean = false,
    val public: Boolean = false,
    val publicPending: Boolean = false,
    val builtIn: Boolean = false,
    val isByod: Boolean = false,
    val relayUrl: String = "",
    val relayOk: Boolean? = null,
    val relayCheckedAt: Long? = null,
    val createdAt: Long? = null
)

@Serializable
data class ByodDomainBody(val domain: String)

@Serializable
data class ByodDomainResponse(
    val id: String = "",
    val domain: String = "",
    val relayConfig: String = "",
    val deployUrl: String = "",
    val relayUrl: String = "",
    val verified: Boolean = false
)

@Serializable
data class SetupRelayBody(val relayUrl: String)

@Serializable
data class SetupRelayResponse(
    val ok: Boolean = false,
    val verified: Boolean = false,
    val probing: Boolean = false
)

@Serializable
data class RelayStatusResponse(
    val verified: Boolean = false,
    val sendVerified: Boolean = false
)

@Serializable
data class RelayHealthResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val checkedAt: Long? = null
)

@Serializable
data class RotateRelayResponse(
    val id: String = "",
    val domain: String = "",
    val relayConfig: String = "",
    val deployUrl: String = ""
)
