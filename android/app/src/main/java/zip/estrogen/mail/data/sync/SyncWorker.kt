package zip.estrogen.mail.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import zip.estrogen.mail.MailApp
import zip.estrogen.mail.util.MailNotifier
import java.util.concurrent.TimeUnit

class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? MailApp ?: return Result.success()
        if (!app.repository.isConfigured()) return Result.success()
        val outcome = app.repository.syncDelta()
        if (outcome.isSuccess && app.repository.isNotificationsEnabled()) {
            app.repository.pushLatest().onSuccess { latest ->
                MailNotifier.notifyNewMail(applicationContext, latest.count, latest.title, latest.body)
            }
        }
        return if (outcome.isSuccess) Result.success() else Result.retry()
    }

    companion object {
        private const val NAME = "estrogen_sync"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
                )
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
