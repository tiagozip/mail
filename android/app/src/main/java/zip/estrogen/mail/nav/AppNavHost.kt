package zip.estrogen.mail.nav

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import zip.estrogen.mail.ui.compose.ComposeScreen
import zip.estrogen.mail.ui.compose.ComposePrefill
import zip.estrogen.mail.ui.maillist.MailListScreen
import zip.estrogen.mail.ui.settings.SettingsScreen
import zip.estrogen.mail.ui.setup.SetupScreen
import zip.estrogen.mail.ui.thread.ThreadScreen

object Routes {
    const val SETUP = "setup"
    const val MAIL_LIST = "maillist"
    const val THREAD = "thread/{threadId}/{messageId}"
    const val COMPOSE = "compose"
    const val SETTINGS = "settings"

    fun thread(threadId: String, messageId: String) =
        "thread/${Uri.encode(threadId)}/${Uri.encode(messageId)}"
}

@Composable
fun AppNavHost(hasCredentials: Boolean) {
    val navController = rememberNavController()
    val start = if (hasCredentials) Routes.MAIL_LIST else Routes.SETUP

    NavHost(navController = navController, startDestination = start) {

        composable(Routes.SETUP) {
            SetupScreen(
                onConfigured = {
                    navController.navigate(Routes.MAIL_LIST) {
                        popUpTo(Routes.SETUP) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.MAIL_LIST) {
            MailListScreen(
                onOpenThread = { threadId, messageId ->
                    navController.navigate(Routes.thread(threadId, messageId))
                },
                onCompose = {
                    ComposePrefill.pending = null
                    navController.navigate(Routes.COMPOSE)
                },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onSignedOut = {
                    navController.navigate(Routes.SETUP) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = Routes.THREAD,
            arguments = listOf(
                navArgument("threadId") { type = NavType.StringType },
                navArgument("messageId") { type = NavType.StringType }
            )
        ) { entry ->
            val threadId = entry.arguments?.getString("threadId").orEmpty()
            val messageId = entry.arguments?.getString("messageId").orEmpty()
            ThreadScreen(
                threadId = threadId,
                seedMessageId = messageId,
                onBack = { navController.popBackStack() },
                onReply = { prefill ->
                    ComposePrefill.pending = prefill
                    navController.navigate(Routes.COMPOSE)
                }
            )
        }

        composable(Routes.COMPOSE) {
            ComposeScreen(
                onBack = { navController.popBackStack() },
                onSent = { navController.popBackStack() }
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onSignedOut = {
                    navController.navigate(Routes.SETUP) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
