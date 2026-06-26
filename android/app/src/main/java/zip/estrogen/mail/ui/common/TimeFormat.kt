package zip.estrogen.mail.ui.common

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

fun relativeTime(epochMs: Long, now: Long = System.currentTimeMillis()): String {
    if (epochMs <= 0L) return ""
    val diff = now - epochMs
    if (diff < TimeUnit.MINUTES.toMillis(1)) return "now"
    if (diff < TimeUnit.HOURS.toMillis(1)) {
        val m = TimeUnit.MILLISECONDS.toMinutes(diff)
        return "${m}m"
    }
    if (diff < TimeUnit.DAYS.toMillis(1)) {
        val h = TimeUnit.MILLISECONDS.toHours(diff)
        return "${h}h"
    }
    if (diff < TimeUnit.DAYS.toMillis(7)) {
        val d = TimeUnit.MILLISECONDS.toDays(diff)
        return "${d}d"
    }
    val sameYear = SimpleDateFormat("yyyy", Locale.getDefault())
    val pattern = if (sameYear.format(Date(epochMs)) == sameYear.format(Date(now))) "MMM d" else "MMM d, yyyy"
    return SimpleDateFormat(pattern, Locale.getDefault()).format(Date(epochMs))
}

fun fullTime(epochMs: Long): String {
    if (epochMs <= 0L) return ""
    return SimpleDateFormat("MMM d, yyyy 'at' h:mm a", Locale.getDefault()).format(Date(epochMs))
}
