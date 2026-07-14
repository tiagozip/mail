package zip.estrogen.mail.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.FilterAlt
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.SwipeRightAlt
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.pgp.PgpStatus
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.Avatar
import zip.estrogen.mail.ui.common.BackButton
import zip.estrogen.mail.ui.common.NavListRow
import zip.estrogen.mail.ui.common.SectionLabel
import zip.estrogen.mail.ui.common.SettingsCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenEncryption: () -> Unit = {},
    onOpenAppearance: () -> Unit = {},
    onOpenProfile: () -> Unit = {},
    onOpenAliases: () -> Unit = {},
    onOpenFilters: () -> Unit = {},
    onOpenLabels: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    onOpenScheduled: () -> Unit = {},
    onOpenKeys: () -> Unit = {},
    onOpenByod: () -> Unit = {},
    onOpenSwipe: () -> Unit = {},
    onSignedOut: () -> Unit
) {
    val viewModel = appViewModel<SettingsViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior(rememberTopAppBarState())

    LaunchedEffect(state.signedOut) { if (state.signedOut) onSignedOut() }
    LaunchedEffect(state.message) { state.message?.let { snackbarHostState.showSnackbar(it); viewModel.consumeMessage() } }

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            LargeTopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = { BackButton(onBack) },
                scrollBehavior = scrollBehavior,
                colors = TopAppBarDefaults.largeTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp)
        ) {
            ProfileHeader(state, onOpenProfile)

            Spacer(Modifier.size(24.dp))
            SectionLabel("Mail")
            SettingsCard(contentPadding = androidx.compose.foundation.layout.PaddingValues(6.dp)) {
                NavListRow(Icons.Rounded.AlternateEmail, "Addresses & aliases", null, onOpenAliases)
                NavListRow(Icons.Rounded.FilterAlt, "Filters", null, onOpenFilters)
                NavListRow(Icons.AutoMirrored.Rounded.Label, "Labels", null, onOpenLabels)
                NavListRow(Icons.Rounded.Schedule, "Scheduled", null, onOpenScheduled)
            }

            Spacer(Modifier.size(20.dp))
            SectionLabel("App")
            SettingsCard(contentPadding = androidx.compose.foundation.layout.PaddingValues(6.dp)) {
                val pgpOn = state.pgpStatus == PgpStatus.UNLOCKED
                NavListRow(
                    icon = if (pgpOn) Icons.Rounded.LockOpen else Icons.Rounded.Lock,
                    title = "Encryption",
                    subtitle = when (state.pgpStatus) {
                        PgpStatus.UNLOCKED -> "On"
                        PgpStatus.LOCKED -> "Locked"
                        PgpStatus.ABSENT -> "Off"
                    },
                    onClick = onOpenEncryption,
                    badgeContainer = if (pgpOn) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer,
                    badgeTint = if (pgpOn) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSecondaryContainer
                )
                NavListRow(Icons.Rounded.Palette, "Appearance", null, onOpenAppearance)
                NavListRow(Icons.Rounded.SwipeRightAlt, "Swipe actions", null, onOpenSwipe)
                NavListRow(Icons.Rounded.Notifications, "Notifications", null, onOpenNotifications)
                NavListRow(Icons.Rounded.Dns, "Your domain", null, onOpenByod)
                NavListRow(Icons.Rounded.Key, "API keys", null, onOpenKeys)
            }

            Spacer(Modifier.size(20.dp))
            SectionLabel("Account")
            SettingsCard {
                Column(modifier = Modifier.padding(20.dp)) {
                    LabeledValue("Server", state.baseUrl.ifBlank { "not set" })
                    Spacer(Modifier.size(18.dp))
                    OutlinedButton(
                        onClick = viewModel::signOut,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        shape = MaterialTheme.shapes.large,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Sign out")
                    }
                }
            }

            Spacer(Modifier.size(20.dp))
            SettingsCard {
                Column(modifier = Modifier.padding(20.dp)) {
                    LabeledValue("Estrogen Mail", "Version 0.1.0")
                    Spacer(Modifier.size(10.dp))
                    Text(
                        "Your keys and PGP secrets stay on this device. Encrypted mail is decrypted locally and never leaves your phone in the clear.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.size(40.dp))
        }
    }
}

@Composable
private fun ProfileHeader(state: SettingsState, onOpenProfile: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.extraLarge)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .clickable(onClick = onOpenProfile)
            .padding(20.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Avatar(url = state.avatarUrl, seed = state.address ?: "me", label = state.displayName ?: state.address, size = 60.dp)
        Spacer(Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                state.displayName ?: "Your mailbox",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            state.address?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
            }
        }
        Box(
            modifier = Modifier.size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}

@Composable
private fun LabeledValue(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.size(2.dp))
        Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
    }
}
