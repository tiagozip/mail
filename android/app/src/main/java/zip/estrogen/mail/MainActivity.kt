package zip.estrogen.mail

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.Appearance
import zip.estrogen.mail.data.AuthState
import zip.estrogen.mail.nav.AppNavHost
import zip.estrogen.mail.ui.compose.ComposePrefill
import zip.estrogen.mail.ui.theme.DarkMode
import zip.estrogen.mail.ui.theme.EstrogenMailTheme
import zip.estrogen.mail.util.ComposeIntent

class MainActivity : FragmentActivity() {

    private var pendingComposeRequested by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as MailApp
        consumeAuthIntent(intent)
        consumeComposeIntent(intent)
        setContent {
            val appearance by app.repository.appearance.collectAsStateWithLifecycle(initialValue = Appearance())
            val systemDark = isSystemInDarkTheme()
            val dark = when (appearance.darkMode) {
                DarkMode.SYSTEM -> systemDark
                DarkMode.LIGHT -> false
                DarkMode.DARK -> true
            }
            EstrogenMailTheme(
                darkTheme = dark,
                dynamicColor = appearance.dynamicColor,
                amoled = appearance.amoled,
                palette = appearance.palette
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    Root(app, pendingComposeRequested) { pendingComposeRequested = false }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeAuthIntent(intent)
        consumeComposeIntent(intent)
    }

    private fun consumeComposeIntent(intent: Intent?) {
        val prefill = ComposeIntent.parse(intent) ?: return
        ComposePrefill.pending = prefill
        pendingComposeRequested = true
    }

    private fun consumeAuthIntent(intent: Intent?) {
        val data = intent?.data ?: return
        val isCustomScheme = data.scheme == "zip.estrogen.mail" && data.host == "auth"
        val isAppLink = data.scheme == "https" &&
            data.host == "mail.estrogen.delivery" &&
            data.path?.startsWith("/app/auth") == true
        if (!isCustomScheme && !isAppLink) return
        val code = data.getQueryParameter("code") ?: return
        (application as MailApp).completeNativeLogin(code)
    }
}

@Composable
private fun Root(
    app: MailApp,
    composeRequested: Boolean,
    onComposeConsumed: () -> Unit
) {
    val authState by app.repository.authState.collectAsStateWithLifecycle(initialValue = AuthState.Resolving)

    when (authState) {
        AuthState.Resolving -> Box(modifier = Modifier.fillMaxSize())
        AuthState.SignedIn -> AppNavHost(
            hasCredentials = true,
            composeRequested = composeRequested,
            onComposeConsumed = onComposeConsumed
        )
        AuthState.SignedOut -> AppNavHost(
            hasCredentials = false,
            composeRequested = false,
            onComposeConsumed = onComposeConsumed
        )
    }
}
