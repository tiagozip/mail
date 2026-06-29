package zip.estrogen.mail.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {

    @Query("SELECT * FROM messages WHERE folder = :folder AND (snoozeUntil IS NULL OR snoozeUntil < :now OR :folder != 'inbox') ORDER BY date DESC LIMIT :limit")
    fun observeFolder(folder: String, now: Long, limit: Int = 200): Flow<List<CachedMessage>>

    @Query("SELECT * FROM messages WHERE isStarred = 1 ORDER BY date DESC LIMIT :limit")
    fun observeStarred(limit: Int = 200): Flow<List<CachedMessage>>

    @Query("SELECT * FROM messages WHERE snoozeUntil IS NOT NULL AND snoozeUntil > :now ORDER BY snoozeUntil ASC")
    fun observeSnoozed(now: Long): Flow<List<CachedMessage>>

    @Query("SELECT * FROM messages WHERE labelsJson LIKE '%' || :labelToken || '%' ORDER BY date DESC LIMIT :limit")
    fun observeLabel(labelToken: String, limit: Int = 200): Flow<List<CachedMessage>>

    @Query("SELECT * FROM messages WHERE (subject LIKE '%' || :q || '%' OR snippet LIKE '%' || :q || '%' OR fromName LIKE '%' || :q || '%' OR fromAddress LIKE '%' || :q || '%') ORDER BY date DESC LIMIT :limit")
    fun search(q: String, limit: Int = 100): Flow<List<CachedMessage>>

    @Query("SELECT * FROM messages WHERE id = :id")
    suspend fun byId(id: String): CachedMessage?

    @Query("SELECT * FROM messages WHERE threadId = :threadId ORDER BY date ASC")
    suspend fun byThread(threadId: String): List<CachedMessage>

    @Query("SELECT decryptedSnippet FROM messages WHERE id = :id")
    suspend fun decryptedSnippet(id: String): String?

    @Upsert
    suspend fun upsertAll(items: List<CachedMessage>)

    @Upsert
    suspend fun upsert(item: CachedMessage)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM messages WHERE folder = :folder")
    suspend fun clearFolder(folder: String)

    @Query("UPDATE messages SET isRead = :read WHERE id = :id")
    suspend fun setRead(id: String, read: Boolean)

    @Query("UPDATE messages SET isStarred = :star WHERE id = :id")
    suspend fun setStar(id: String, star: Boolean)

    @Query("UPDATE messages SET folder = :folder WHERE id = :id")
    suspend fun setFolder(id: String, folder: String)

    @Query("UPDATE messages SET snoozeUntil = :until WHERE id = :id")
    suspend fun setSnooze(id: String, until: Long?)

    @Query("UPDATE messages SET decryptedSnippet = :snippet WHERE id = :id")
    suspend fun setDecryptedSnippet(id: String, snippet: String?)

    @Query("DELETE FROM messages")
    suspend fun clearAll()
}

@Dao
interface SyncMetaDao {
    @Query("SELECT cursor FROM sync_meta WHERE id = 0")
    suspend fun cursor(): Long?

    @Upsert
    suspend fun set(meta: SyncMeta)

    @Query("DELETE FROM sync_meta")
    suspend fun clear()
}

@Dao
interface ContactDao {
    @Query("SELECT * FROM cached_contacts WHERE name LIKE '%' || :q || '%' OR address LIKE '%' || :q || '%' ORDER BY name LIMIT 8")
    suspend fun search(q: String): List<CachedContact>

    @Upsert
    suspend fun upsertAll(items: List<CachedContact>)

    @Query("DELETE FROM cached_contacts")
    suspend fun clear()
}
