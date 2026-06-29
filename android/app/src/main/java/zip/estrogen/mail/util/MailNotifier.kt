package zip.estrogen.mail.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import zip.estrogen.mail.MainActivity
import zip.estrogen.mail.R

object MailNotifier {

    private const val CHANNEL_ID = "estrogen_mail"
    private const val NOTIFICATION_ID = 4201
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

    fun notifyNewMail(context: Context, count: Int, title: String, body: String) {
        if (count <= 0) return
        val signature = "$count:$title"
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_LAST, null) == signature) return
        prefs.edit().putString(KEY_LAST, signature).apply()

        ensureChannel(context)
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pending = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val text = if (count > 1) "$count new messages" else body.ifBlank { "New message" }
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(if (count > 1) "Estrogen Mail" else title.ifBlank { "New message" })
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
    }

    fun clearDedup(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_LAST).apply()
    }
}
