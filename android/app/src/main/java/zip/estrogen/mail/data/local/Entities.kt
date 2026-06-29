package zip.estrogen.mail.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "messages")
data class CachedMessage(
    @PrimaryKey val id: String,
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
    val labelsJson: String,
    val decryptedSnippet: String?,
    val updatedAt: Long
)

@Entity(tableName = "sync_meta")
data class SyncMeta(
    @PrimaryKey val id: Int = 0,
    val cursor: Long = 0
)

@Entity(tableName = "cached_contacts")
data class CachedContact(
    @PrimaryKey val address: String,
    val name: String,
    val avatar: String?
)
