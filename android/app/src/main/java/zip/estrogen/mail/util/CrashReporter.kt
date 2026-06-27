package zip.estrogen.mail.util

import android.content.Context
import android.util.Log
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object CrashReporter {

    private const val TAG = "EstrogenMail"
    private const val FILE_NAME = "last_crash.txt"

    fun install(context: Context) {
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching {
                val sw = StringWriter()
                throwable.printStackTrace(PrintWriter(sw))
                val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
                val report = "$stamp on ${thread.name}\n$sw"
                Log.e(TAG, "uncaught exception", throwable)
                File(appContext.filesDir, FILE_NAME).writeText(report)
            }
            previous?.uncaughtException(thread, throwable)
        }
    }

    fun lastCrash(context: Context): String? = runCatching {
        val file = File(context.applicationContext.filesDir, FILE_NAME)
        if (file.exists()) file.readText() else null
    }.getOrNull()

    fun clear(context: Context) {
        runCatching { File(context.applicationContext.filesDir, FILE_NAME).delete() }
    }
}
