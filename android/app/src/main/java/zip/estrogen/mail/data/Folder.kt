package zip.estrogen.mail.data

import zip.estrogen.mail.data.model.FolderCount
import zip.estrogen.mail.data.model.FolderCounts

enum class Folder(val key: String, val label: String) {
    INBOX("inbox", "Inbox"),
    STARRED("starred", "Starred"),
    SENT("sent", "Sent"),
    DRAFTS("drafts", "Drafts"),
    ARCHIVE("archive", "Archive"),
    SPAM("spam", "Spam"),
    TRASH("trash", "Trash");

    companion object {
        fun fromKey(key: String?): Folder = entries.firstOrNull { it.key == key } ?: INBOX
    }
}

fun FolderCounts.forFolder(folder: Folder): FolderCount = when (folder) {
    Folder.INBOX -> inbox
    Folder.STARRED -> starred
    Folder.SENT -> sent
    Folder.DRAFTS -> drafts
    Folder.ARCHIVE -> archive
    Folder.SPAM -> spam
    Folder.TRASH -> trash
}
