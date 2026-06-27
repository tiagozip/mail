package zip.estrogen.mail

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.nav.AppNavHost
import zip.estrogen.mail.ui.theme.EstrogenMailTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as MailApp
        setContent {
            val dynamicColor by app.repository.dynamicColor.collectAsStateWithLifecycle(initialValue = true)
            EstrogenMailTheme(dynamicColor = dynamicColor) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = androidx.compose.material3.MaterialTheme.colorScheme.background
                ) {
                    Root(app)
                }
            }
        }
    }
}

@Composable
private fun Root(app: MailApp) {
    val credentials by app.repository.credentials.collectAsStateWithLifecycle(initialValue = null)
    AppNavHost(hasCredentials = credentials != null)
}
