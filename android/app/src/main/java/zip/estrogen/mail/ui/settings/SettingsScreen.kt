package zip.estrogen.mail.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.pgp.PgpStatus
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.Avatar

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

    LaunchedEffect(state.signedOut) { if (state.signedOut) onSignedOut() }
    LaunchedEffect(state.message) { state.message?.let { snackbarHostState.showSnackbar(it); viewModel.consumeMessage() } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.SemiBold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, titleContentColor = MaterialTheme.colorScheme.onSurface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenProfile),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                shape = MaterialTheme.shapes.large
            ) {
                Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(url = state.avatarUrl, seed = state.address ?: "me", label = state.displayName ?: state.address, size = 56.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(state.displayName ?: "Your mailbox", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        state.address?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            Spacer(Modifier.size(16.dp))
            SectionTitle("Mail")
            SettingCard {
                Column {
                    NavRow(Icons.Rounded.AlternateEmail, "Addresses & aliases", "Real and burner addresses", onOpenAliases)
                    NavRow(Icons.Rounded.FilterAlt, "Filters", "Rules to sort incoming mail", onOpenFilters)
                    NavRow(Icons.AutoMirrored.Rounded.Label, "Labels", "Organize with colored labels", onOpenLabels)
                    NavRow(Icons.Rounded.Schedule, "Scheduled", "Messages waiting to send", onOpenScheduled, divider = false)
                }
            }

            Spacer(Modifier.size(16.dp))
            SectionTitle("App")
            SettingCard {
                Column {
                    NavRow(
                        icon = if (state.pgpStatus == PgpStatus.UNLOCKED) Icons.Rounded.LockOpen else Icons.Rounded.Lock,
                        title = "Encryption",
                        subtitle = when (state.pgpStatus) {
                            PgpStatus.UNLOCKED -> "On — unlocked on this device"
                            PgpStatus.LOCKED -> "Locked — tap to unlock"
                            PgpStatus.ABSENT -> "Off — tap to set up"
                        },
                        onClick = onOpenEncryption
                    )
                    NavRow(Icons.Rounded.Palette, "Appearance", "Palette, dynamic color, dark mode", onOpenAppearance)
                    NavRow(Icons.Rounded.SwipeRightAlt, "Swipe actions", "What left and right swipes do", onOpenSwipe)
                    NavRow(Icons.Rounded.Notifications, "Notifications", "New mail alerts", onOpenNotifications)
                    NavRow(Icons.Rounded.Dns, "Your domain", "Receive mail on a domain you own", onOpenByod)
                    NavRow(Icons.Rounded.Key, "API keys", "For scripts and integrations", onOpenKeys, divider = false)
                }
            }

            Spacer(Modifier.size(16.dp))
            SectionTitle("Account")
            SettingCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    LabeledValue("Server", state.baseUrl.ifBlank { "not set" })
                    Spacer(Modifier.size(16.dp))
                    OutlinedButton(
                        onClick = viewModel::signOut,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Sign out")
                    }
                }
            }

            Spacer(Modifier.size(16.dp))
            SettingCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    LabeledValue("Estrogen Mail", "Version 0.1.0")
                    Spacer(Modifier.size(8.dp))
                    Text(
                        "Your keys and PGP secrets stay on this device. Encrypted mail is decrypted locally and never leaves your phone in the clear.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.size(32.dp))
        }
    }
}

@Composable
private fun NavRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit, divider: Boolean = true) {
    Row(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (divider) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f), modifier = Modifier.padding(start = 56.dp))
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
}

@Composable
private fun SettingCard(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.large
    ) { content() }
}

@Composable
private fun LabeledValue(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
    }
}
