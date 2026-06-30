package zip.estrogen.mail.nav

import android.net.Uri
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import zip.estrogen.mail.MailApp
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
import zip.estrogen.mail.ui.settings.SwipeActionsScreen
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
    const val SWIPE = "swipe"

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
    val repository = (LocalContext.current.applicationContext as MailApp).repository
    val pending by repository.pendingSend.collectAsStateWithLifecycle()
    val outboxSnackbar = remember { SnackbarHostState() }

    LaunchedEffect(composeRequested, hasCredentials) {
        if (composeRequested && hasCredentials) {
            runCatching { navController.navigate(Routes.COMPOSE) }
            onComposeConsumed()
        }
    }
    LaunchedEffect(Unit) {
        repository.sendStatus.collect { outboxSnackbar.showSnackbar(it) }
    }

    Box(modifier = Modifier.fillMaxSize()) {
    NavHost(
        navController = navController,
        startDestination = start,
        enterTransition = { slideInHorizontally(tween(280)) { it / 4 } + fadeIn(tween(280)) },
        exitTransition = { slideOutHorizontally(tween(280)) { -it / 8 } + fadeOut(tween(220)) },
        popEnterTransition = { slideInHorizontally(tween(280)) { -it / 8 } + fadeIn(tween(280)) },
        popExitTransition = { slideOutHorizontally(tween(280)) { it / 4 } + fadeOut(tween(220)) }
    ) {

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
                onOpenSwipe = { navController.navigate(Routes.SWIPE) },
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
        composable(Routes.SWIPE) { SwipeActionsScreen(onBack = { navController.popBackStack() }) }
    }

        pending?.let { p ->
            OutboxBar(
                secondsLeft = p.secondsLeft,
                scheduled = p.scheduled,
                onUndo = { repository.undoPendingSend() },
                modifier = Modifier.align(Alignment.BottomCenter)
            )
        }
        SnackbarHost(outboxSnackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
private fun OutboxBar(secondsLeft: Int, scheduled: Boolean, onUndo: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.inverseSurface,
        shape = MaterialTheme.shapes.large,
        modifier = modifier.fillMaxWidth().padding(16.dp)
    ) {
        Row(modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = if (scheduled) "Scheduling…" else "Sending in ${secondsLeft}s",
                color = MaterialTheme.colorScheme.inverseOnSurface,
                modifier = Modifier.weight(1f).padding(vertical = 8.dp)
            )
            TextButton(onClick = onUndo) {
                Text("Undo", color = MaterialTheme.colorScheme.inversePrimary, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
