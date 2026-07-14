package zip.estrogen.mail.ui.maillist

import zip.estrogen.mail.data.local.CachedMessage

data class ParsedSearch(
    val text: String = "",
    val from: String? = null,
    val subject: String? = null,
    val label: String? = null,
    val unread: Boolean? = null,
    val starred: Boolean? = null,
    val hasAttachment: Boolean? = null,
    val encrypted: Boolean? = null
) {
    val hasOperators: Boolean
        get() = from != null || subject != null || label != null ||
            unread != null || starred != null || hasAttachment != null || encrypted != null

    fun matches(m: CachedMessage): Boolean {
        from?.let { f ->
            val hit = m.fromAddress?.contains(f, true) == true || m.fromName?.contains(f, true) == true
            if (!hit) return false
        }
        subject?.let { if (m.subject?.contains(it, true) != true) return false }
        label?.let { if (!m.labelsJson.contains(it, true)) return false }
        if (unread == true && m.isRead) return false
        if (unread == false && !m.isRead) return false
        if (starred != null && m.isStarred != starred) return false
        if (hasAttachment != null && m.hasAttachments != hasAttachment) return false
        if (encrypted != null && m.pgp != encrypted) return false
        return true
    }
}

object SearchQueryParser {
    fun parse(raw: String): ParsedSearch {
        var from: String? = null
        var subject: String? = null
        var label: String? = null
        var unread: Boolean? = null
        var starred: Boolean? = null
        var hasAttachment: Boolean? = null
        var encrypted: Boolean? = null
        val text = StringBuilder()

        for (token in raw.trim().split(Regex("\\s+")).filter { it.isNotBlank() }) {
            val lower = token.lowercase()
            when {
                lower.startsWith("from:") -> from = token.substring(5).trim('"')
                lower.startsWith("subject:") -> subject = token.substring(8).trim('"')
                lower.startsWith("label:") -> label = token.substring(6).trim('"')
                lower == "is:unread" -> unread = true
                lower == "is:read" -> unread = false
                lower == "is:starred" || lower == "is:star" -> starred = true
                lower == "is:encrypted" || lower == "is:pgp" -> encrypted = true
                lower == "has:attachment" || lower == "has:attachments" || lower == "has:file" -> hasAttachment = true
                else -> text.append(token).append(' ')
            }
        }

        return ParsedSearch(
            text = text.toString().trim(),
            from = from,
            subject = subject,
            label = label,
            unread = unread,
            starred = starred,
            hasAttachment = hasAttachment,
            encrypted = encrypted
        )
    }
}
