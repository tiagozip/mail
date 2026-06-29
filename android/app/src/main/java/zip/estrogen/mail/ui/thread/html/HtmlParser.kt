package zip.estrogen.mail.ui.thread.html

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode

sealed interface HtmlBlock {
    data class Paragraph(val text: AnnotatedString) : HtmlBlock
    data class Heading(val level: Int, val text: AnnotatedString) : HtmlBlock
    data class ListItems(val ordered: Boolean, val items: List<AnnotatedString>) : HtmlBlock
    data class Quote(val children: List<HtmlBlock>) : HtmlBlock
    data class Code(val text: String) : HtmlBlock
    data class Image(val src: String, val alt: String, val remote: Boolean) : HtmlBlock
    data object Rule : HtmlBlock
    data class Table(val rows: List<List<AnnotatedString>>) : HtmlBlock
}

data class ParsedHtml(
    val blocks: List<HtmlBlock>,
    val hasRemoteImages: Boolean,
    val trackersBlocked: Int
)

private data class InlineStyle(
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false,
    val strike: Boolean = false,
    val code: Boolean = false
)

object HtmlParser {

    private val blockTags = setOf(
        "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol",
        "blockquote", "pre", "table", "hr", "img", "section", "article",
        "header", "footer", "figure", "figcaption", "main", "aside"
    )

    fun parse(html: String, linkColor: Color): ParsedHtml {
        val doc = Jsoup.parse(html)
        doc.select("script, style, head, meta, link, title, noscript, iframe, object, embed, svg, form, input, button").remove()

        var trackers = 0
        for (img in doc.select("img").toList()) {
            val w = img.attr("width").toIntOrNull()
            val h = img.attr("height").toIntOrNull()
            val src = img.attr("src").lowercase()
            val isTracker = (w != null && w <= 2) || (h != null && h <= 2) ||
                src.contains("track") || src.contains("pixel") || src.contains("/open") ||
                src.contains("beacon") || src.contains("/wf/open")
            if (isTracker) {
                img.remove()
                trackers++
            }
        }
        val hasRemote = doc.select("img").any { it.attr("src").startsWith("http") }

        val blocks = mutableListOf<HtmlBlock>()
        parseInto(doc.body(), blocks, linkColor)
        val cleaned = blocks.ifEmpty {
            listOf(HtmlBlock.Paragraph(AnnotatedString(doc.body().text())))
        }
        return ParsedHtml(cleaned, hasRemote, trackers)
    }

    private fun parseInto(element: Element, out: MutableList<HtmlBlock>, linkColor: Color) {
        val pending = mutableListOf<Node>()
        fun flush() {
            if (pending.isEmpty()) return
            val anno = buildAnnotatedString { pending.forEach { appendNode(it, InlineStyle(), linkColor) } }
            if (anno.text.isNotBlank()) out.add(HtmlBlock.Paragraph(anno))
            pending.clear()
        }
        for (node in element.childNodes()) {
            if (node is Element && node.tagName().lowercase() in blockTags) {
                flush()
                handleBlock(node, out, linkColor)
            } else {
                pending.add(node)
            }
        }
        flush()
    }

    private fun handleBlock(el: Element, out: MutableList<HtmlBlock>, linkColor: Color) {
        when (el.tagName().lowercase()) {
            "h1", "h2", "h3", "h4", "h5", "h6" -> out.add(
                HtmlBlock.Heading(
                    el.tagName()[1].digitToInt(),
                    buildAnnotatedString { el.childNodes().forEach { appendNode(it, InlineStyle(bold = true), linkColor) } }
                )
            )
            "ul", "ol" -> {
                val items = el.children().filter { it.tagName().equals("li", true) }.map { li ->
                    buildAnnotatedString { li.childNodes().forEach { appendNode(it, InlineStyle(), linkColor) } }
                }
                if (items.isNotEmpty()) out.add(HtmlBlock.ListItems(el.tagName().equals("ol", true), items))
            }
            "blockquote" -> {
                val inner = mutableListOf<HtmlBlock>()
                parseInto(el, inner, linkColor)
                if (inner.isNotEmpty()) out.add(HtmlBlock.Quote(inner))
            }
            "pre" -> {
                val text = el.wholeText().trimEnd('\n')
                if (text.isNotBlank()) out.add(HtmlBlock.Code(text))
            }
            "hr" -> out.add(HtmlBlock.Rule)
            "table" -> {
                val rows = el.select("tr").map { tr ->
                    tr.select("td, th").map { cell ->
                        buildAnnotatedString { cell.childNodes().forEach { appendNode(it, InlineStyle(), linkColor) } }
                    }
                }.filter { it.isNotEmpty() }
                if (rows.isNotEmpty()) out.add(HtmlBlock.Table(rows))
            }
            "img" -> {
                val src = el.attr("abs:src").ifBlank { el.attr("src") }
                if (src.isNotBlank()) out.add(HtmlBlock.Image(src, el.attr("alt"), src.startsWith("http")))
            }
            else -> parseInto(el, out, linkColor)
        }
    }

    private fun AnnotatedString.Builder.appendNode(node: Node, style: InlineStyle, linkColor: Color) {
        when (node) {
            is TextNode -> {
                val text = node.text()
                if (text.isNotEmpty()) withInline(style) { append(text) }
            }
            is Element -> {
                when (node.tagName().lowercase()) {
                    "br" -> append("\n")
                    "b", "strong" -> node.childNodes().forEach { appendNode(it, style.copy(bold = true), linkColor) }
                    "i", "em", "cite" -> node.childNodes().forEach { appendNode(it, style.copy(italic = true), linkColor) }
                    "u", "ins" -> node.childNodes().forEach { appendNode(it, style.copy(underline = true), linkColor) }
                    "s", "strike", "del" -> node.childNodes().forEach { appendNode(it, style.copy(strike = true), linkColor) }
                    "code", "tt", "kbd", "samp" -> node.childNodes().forEach { appendNode(it, style.copy(code = true), linkColor) }
                    "a" -> {
                        val href = node.attr("abs:href").ifBlank { node.attr("href") }
                        if (href.startsWith("http") || href.startsWith("mailto")) {
                            val start = length
                            node.childNodes().forEach { appendNode(it, style, linkColor) }
                            addLink(
                                LinkAnnotation.Url(
                                    href,
                                    TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline))
                                ),
                                start,
                                length
                            )
                        } else {
                            node.childNodes().forEach { appendNode(it, style, linkColor) }
                        }
                    }
                    else -> node.childNodes().forEach { appendNode(it, style, linkColor) }
                }
            }
        }
    }

    private inline fun AnnotatedString.Builder.withInline(style: InlineStyle, block: AnnotatedString.Builder.() -> Unit) {
        val decoration = when {
            style.underline && style.strike -> TextDecoration.combine(listOf(TextDecoration.Underline, TextDecoration.LineThrough))
            style.underline -> TextDecoration.Underline
            style.strike -> TextDecoration.LineThrough
            else -> null
        }
        withStyle(
            SpanStyle(
                fontWeight = if (style.bold) FontWeight.Bold else null,
                fontStyle = if (style.italic) FontStyle.Italic else null,
                textDecoration = decoration,
                fontFamily = if (style.code) FontFamily.Monospace else null
            )
        ) { block() }
    }
}
