package zip.estrogen.mail.nav

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import zip.estrogen.mail.ui.auth.AuthScreen
import zip.estrogen.mail.ui.compose.ComposeScreen
import zip.estrogen.mail.ui.encryption.EncryptionScreen
import zip.estrogen.mail.ui.compose.ComposePrefill
import zip.estrogen.mail.ui.maillist.MailListScreen
import zip.estrogen.mail.ui.byod.ByodScreen
import zip.estrogen.mail.ui.scheduled.ScheduledScreen
import zip.estrogen.mail.ui.settings.AliasesScreen
import zip.estrogen.mail.ui.settings.AppearanceScreen
import zip.estrogen.mail.ui.settings.FiltersScreen
import zip.estrogen.mail.ui.settings.KeysScreen
import zip.estrogen.mail.ui.settings.LabelsScreen
import zip.estrogen.mail.ui.settings.NotificationsScreen
import zip.estrogen.mail.ui.settings.ProfileScreen
import zip.estrogen.mail.ui.settings.SettingsScreen
import zip.estrogen.mail.ui.thread.ThreadScreen

object Routes {
    const val SETUP = "setup"
    const val MAIL_LIST = "maillist"
    const val THREAD = "thread/{threadId}/{messageId}"
    const val COMPOSE = "compose"
    const val SETTINGS = "settings"
    const val ENCRYPTION = "encryption"
    const val APPEARANCE = "appearance"
    const val PROFILE = "profile"
    const val ALIASES = "aliases"
    const val FILTERS = "filters"
    const val LABELS = "labels"
    const val NOTIFICATIONS = "notifications"
    const val SCHEDULED = "scheduled"
    const val KEYS = "keys"
    const val BYOD = "byod"

    fun thread(threadId: String, messageId: String) =
        "thread/${Uri.encode(threadId)}/${Uri.encode(messageId)}"
}

@Composable
fun AppNavHost(
    hasCredentials: Boolean,
    composeRequested: Boolean = false,
    onComposeConsumed: () -> Unit = {}
) {
    val navController = rememberNavController()
    val start = if (hasCredentials) Routes.MAIL_LIST else Routes.SETUP

    LaunchedEffect(composeRequested, hasCredentials) {
        if (composeRequested && hasCredentials) {
            runCatching { navController.navigate(Routes.COMPOSE) }
            onComposeConsumed()
        }
    }

    NavHost(navController = navController, startDestination = start) {

        composable(Routes.SETUP) {
            AuthScreen(
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
                onOpenEncryption = { navController.navigate(Routes.ENCRYPTION) },
                onOpenAppearance = { navController.navigate(Routes.APPEARANCE) },
                onOpenProfile = { navController.navigate(Routes.PROFILE) },
                onOpenAliases = { navController.navigate(Routes.ALIASES) },
                onOpenFilters = { navController.navigate(Routes.FILTERS) },
                onOpenLabels = { navController.navigate(Routes.LABELS) },
                onOpenNotifications = { navController.navigate(Routes.NOTIFICATIONS) },
                onOpenScheduled = { navController.navigate(Routes.SCHEDULED) },
                onOpenKeys = { navController.navigate(Routes.KEYS) },
                onOpenByod = { navController.navigate(Routes.BYOD) },
                onSignedOut = {
                    navController.navigate(Routes.SETUP) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.ENCRYPTION) {
            EncryptionScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.APPEARANCE) {
            AppearanceScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.PROFILE) { ProfileScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.ALIASES) { AliasesScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.FILTERS) { FiltersScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.LABELS) { LabelsScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.NOTIFICATIONS) { NotificationsScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.SCHEDULED) { ScheduledScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.KEYS) { KeysScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.BYOD) { ByodScreen(onBack = { navController.popBackStack() }) }
    }
}
