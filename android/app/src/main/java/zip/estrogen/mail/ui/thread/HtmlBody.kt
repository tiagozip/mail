package zip.estrogen.mail.ui.thread

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

private fun documentFor(bodyHtml: String, textColor: String, linkColor: String, dark: Boolean): String {
    val scheme = if (dark) "dark" else "light"
    return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          :root { color-scheme: $scheme; }
          html, body { margin: 0; padding: 0; background: transparent; }
          body {
            color: $textColor;
            font-family: -apple-system, Roboto, sans-serif;
            font-size: 15px;
            line-height: 1.55;
            word-wrap: break-word;
            overflow-wrap: anywhere;
          }
          a { color: $linkColor; }
          img, video, table { max-width: 100% !important; height: auto; }
          pre { white-space: pre-wrap; }
          blockquote {
            margin: 8px 0;
            padding-left: 12px;
            border-left: 3px solid $linkColor;
            opacity: 0.85;
          }
        </style>
        </head>
        <body>$bodyHtml</body>
        </html>
    """.trimIndent()
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HtmlBody(
    html: String,
    textColor: Color,
    linkColor: Color,
    dark: Boolean,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val document = documentFor(
        bodyHtml = html,
        textColor = hex(textColor),
        linkColor = hex(linkColor),
        dark = dark
    )

    val webView = remember(context) {
        WebView(context).apply {
            setBackgroundColor(AndroidColor.TRANSPARENT)
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            settings.javaScriptEnabled = false
            settings.blockNetworkLoads = true
            settings.loadsImagesAutomatically = false
            settings.builtInZoomControls = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean = true
            }
        }
    }

    DisposableEffect(webView) {
        onDispose {
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.removeAllViews()
            webView.destroy()
        }
    }

    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = { webView },
        update = { web ->
            web.loadDataWithBaseURL(null, document, "text/html", "utf-8", null)
        }
    )
}

private fun hex(color: Color): String {
    val argb = color.toArgb()
    return String.format("#%06X", 0xFFFFFF and argb)
}
