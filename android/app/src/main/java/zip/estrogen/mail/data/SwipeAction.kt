package zip.estrogen.mail.data

enum class SwipeAction(val key: String, val label: String) {
    NONE("none", "Nothing"),
    ARCHIVE("archive", "Archive"),
    TRASH("trash", "Delete"),
    READ("read", "Toggle read"),
    STAR("star", "Toggle star"),
    SNOOZE("snooze", "Snooze");

    companion object {
        fun from(key: String?): SwipeAction = entries.firstOrNull { it.key == key } ?: NONE
    }
}

data class SwipeConfig(
    val right: SwipeAction = SwipeAction.ARCHIVE,
    val left: SwipeAction = SwipeAction.TRASH
)
