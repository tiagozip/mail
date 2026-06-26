package zip.estrogen.mail.ui.compose

data class ComposePrefillData(
    val to: String = "",
    val cc: String = "",
    val subject: String = "",
    val body: String = "",
    val inReplyTo: String? = null,
    val references: List<String> = emptyList()
)

object ComposePrefill {
    var pending: ComposePrefillData? = null
}
