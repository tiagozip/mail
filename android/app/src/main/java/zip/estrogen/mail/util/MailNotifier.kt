package zip.estrogen.mail.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import zip.estrogen.mail.MainActivity
import zip.estrogen.mail.R

object MailNotifier {

    private const val CHANNEL_ID = "estrogen_mail"
    const val NOTIFICATION_ID = 4201
    private const val PREFS = "estrogen_notify"
    private const val KEY_LAST = "last_signature"

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(CHANNEL_ID, "New mail", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Notifications for new messages"
            }
            manager.createNotificationChannel(channel)
        }
    }

    data class LatestMessage(
        val id: String,
        val threadId: String?,
        val from: String?,
        val sender: String,
        val subject: String,
        val snippet: String
    )

    fun notifyNewMail(context: Context, count: Int, title: String, body: String, latest: LatestMessage? = null) {
        if (count <= 0) return
        val signature = "$count:${latest?.id ?: title}"
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_LAST, null) == signature) return
        prefs.edit().putString(KEY_LAST, signature).apply()

        ensureChannel(context)

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        if (count > 1 || latest == null) {
            builder.setContentTitle("Estrogen Mail")
                .setContentText(if (count > 1) "$count new messages" else body.ifBlank { "New message" })
                .setContentIntent(openAppIntent(context))
        } else {
            val titleText = latest.sender.ifBlank { title.ifBlank { "New message" } }
            val contentText = latest.subject.ifBlank { latest.snippet.ifBlank { body } }
            builder.setContentTitle(titleText)
                .setContentText(contentText)
                .setStyle(NotificationCompat.BigTextStyle().bigText(latest.snippet.ifBlank { contentText }))
                .setContentIntent(openThreadIntent(context, latest))

            if (!latest.from.isNullOrBlank()) {
                builder.addAction(replyAction(context, latest))
            }
            builder.addAction(action(context, NotificationActionReceiver.ACTION_ARCHIVE, "Archive", latest, 1))
            builder.addAction(action(context, NotificationActionReceiver.ACTION_MARK_READ, "Mark read", latest, 2))
        }

        runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build()) }
    }

    private fun openAppIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun openThreadIntent(context: Context, latest: LatestMessage): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("open_thread_id", latest.threadId ?: latest.id)
            putExtra("open_message_id", latest.id)
        }
        return PendingIntent.getActivity(
            context, latest.id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun action(context: Context, actionId: String, label: String, latest: LatestMessage, code: Int): NotificationCompat.Action {
        val intent = Intent(context, NotificationActionReceiver::class.java).apply {
            action = actionId
            putExtra(NotificationActionReceiver.EXTRA_ID, latest.id)
        }
        val pending = PendingIntent.getBroadcast(
            context, latest.id.hashCode() + code, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Action.Builder(0, label, pending).build()
    }

    private fun replyAction(context: Context, latest: LatestMessage): NotificationCompat.Action {
        val remoteInput = RemoteInput.Builder(NotificationActionReceiver.KEY_REPLY)
            .setLabel("Reply to ${latest.sender}")
            .build()
        val intent = Intent(context, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_REPLY
            putExtra(NotificationActionReceiver.EXTRA_ID, latest.id)
            putExtra(NotificationActionReceiver.EXTRA_FROM, latest.from)
            putExtra(NotificationActionReceiver.EXTRA_SUBJECT, latest.subject)
        }
        val pending = PendingIntent.getBroadcast(
            context, latest.id.hashCode() + 3, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        return NotificationCompat.Action.Builder(0, "Reply", pending)
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .build()
    }

    fun clearDedup(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_LAST).apply()
    }
}
