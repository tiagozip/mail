package zip.estrogen.mail.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import zip.estrogen.mail.data.model.Label
import zip.estrogen.mail.data.model.MessageSummary
import zip.estrogen.mail.data.remote.ApiFactory

@Database(
    entities = [CachedMessage::class, SyncMeta::class, CachedContact::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun messageDao(): MessageDao
    abstract fun syncMetaDao(): SyncMetaDao
    abstract fun contactDao(): ContactDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "estrogen_mail.db"
            ).fallbackToDestructiveMigration(true).build().also { instance = it }
        }
    }
}

fun MessageSummary.toEntity(folderFallback: String, existingDecrypted: String? = null): CachedMessage =
    CachedMessage(
        id = id,
        threadId = threadId,
        folder = folder ?: folderFallback,
        fromName = from.name,
        fromAddress = from.address,
        fromAvatar = from.avatar,
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
        labelsJson = ApiFactory.json.encodeToString(labels),
        decryptedSnippet = existingDecrypted,
        updatedAt = System.currentTimeMillis()
    )

fun CachedMessage.labels(): List<Label> =
    runCatching { ApiFactory.json.decodeFromString<List<Label>>(labelsJson) }.getOrDefault(emptyList())
