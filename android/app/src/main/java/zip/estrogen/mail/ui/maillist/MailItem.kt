package zip.estrogen.mail.ui.maillist

import zip.estrogen.mail.data.local.CachedMessage
import zip.estrogen.mail.data.local.labels
import zip.estrogen.mail.data.model.Label

data class MailItem(
    val id: String,
    val threadId: String?,
    val folder: String,
    val fromName: String?,
    val fromAddress: String?,
    val fromAvatar: String?,
    val subject: String?,
    val snippet: String?,
    val date: Long,
    val isRead: Boolean,
    val isStarred: Boolean,
    val isDraft: Boolean,
    val hasAttachments: Boolean,
    val pgp: Boolean,
    val authStatus: String,
    val snoozeUntil: Long?,
    val labels: List<Label>,
    val decryptedPreview: String?,
    val threadCount: Int = 1
) {
    val senderLabel: String
        get() = fromName?.takeIf { it.isNotBlank() }
            ?: fromAddress?.takeIf { it.isNotBlank() }
            ?: "Unknown"

    val isSpoofed: Boolean get() = authStatus == "fail"

    val preview: String
        get() = when {
            pgp && decryptedPreview != null -> stripHtml(decryptedPreview)
            pgp -> ""
            else -> snippet?.takeIf { it.isNotBlank() }?.let(::stripHtml) ?: ""
        }
}

private val tagRegex = Regex("<[^>]*>")
private val wsRegex = Regex("\\s+")

fun stripHtml(text: String): String = text
    .replace(tagRegex, " ")
    .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'").replace("&quot;", "\"")
    .replace(wsRegex, " ")
    .trim()

fun CachedMessage.toItem(decryptedPreview: String?): MailItem = MailItem(
    id = id,
    threadId = threadId,
    folder = folder,
    fromName = fromName,
    fromAddress = fromAddress,
    fromAvatar = fromAvatar,
    subject = subject,
    snippet = snippet,
    date = date,
    isRead = isRead,
    isStarred = isStarred,
    isDraft = isDraft,
    hasAttachments = hasAttachments,
    pgp = pgp,
    authStatus = authStatus,
    snoozeUntil = snoozeUntil,
    labels = labels(),
    decryptedPreview = decryptedPreview
)
