package zip.estrogen.mail.util

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import kotlinx.coroutines.launch
import zip.estrogen.mail.MailApp
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.model.SendRequest

class NotificationActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as? MailApp ?: return
        val id = intent.getStringExtra(EXTRA_ID) ?: return
        val action = intent.action ?: return
        val pending = goAsync()
        app.appScope.launch {
            try {
                when (action) {
                    ACTION_ARCHIVE -> app.repository.move(id, Folder.ARCHIVE)
                    ACTION_MARK_READ -> app.repository.setRead(id, true)
                    ACTION_REPLY -> {
                        val text = RemoteInput.getResultsFromIntent(intent)
                            ?.getCharSequence(KEY_REPLY)?.toString()?.trim()
                        val to = intent.getStringExtra(EXTRA_FROM)
                        if (!text.isNullOrBlank() && !to.isNullOrBlank()) {
                            val subject = intent.getStringExtra(EXTRA_SUBJECT).orEmpty()
                            val re = if (subject.startsWith("Re:", ignoreCase = true)) subject else "Re: $subject"
                            app.repository.queueSend(
                                SendRequest(
                                    to = listOf(to),
                                    subject = re.ifBlank { "(no subject)" },
                                    text = text,
                                    inReplyTo = id,
                                    references = listOf(id)
                                ),
                                undoSeconds = 0
                            )
                            app.repository.setRead(id, true)
                        }
                    }
                }
                runCatching { NotificationManagerCompat.from(context).cancel(MailNotifier.NOTIFICATION_ID) }
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION_ARCHIVE = "zip.estrogen.mail.ARCHIVE"
        const val ACTION_MARK_READ = "zip.estrogen.mail.MARK_READ"
        const val ACTION_REPLY = "zip.estrogen.mail.REPLY"
        const val EXTRA_ID = "id"
        const val EXTRA_FROM = "from"
        const val EXTRA_SUBJECT = "subject"
        const val KEY_REPLY = "reply_text"
    }
}
