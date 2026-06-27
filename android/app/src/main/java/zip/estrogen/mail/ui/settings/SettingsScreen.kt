package zip.estrogen.mail.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.pgp.PgpStatus
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.Avatar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onSignedOut: () -> Unit
) {
    val viewModel = appViewModel<SettingsViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }
    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            AccountCard(state)
            Spacer(Modifier.size(16.dp))

            SectionTitle("Appearance")
            SettingCard {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Dynamic color", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text(
                            if (state.dynamicSupported) "Match colors to your wallpaper" else "Needs Android 12 or newer",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = state.dynamicColor && state.dynamicSupported,
                        onCheckedChange = { viewModel.setDynamicColor(it) },
                        enabled = state.dynamicSupported
                    )
                }
            }

            Spacer(Modifier.size(16.dp))
            SectionTitle("Encryption")
            PgpCard(state, viewModel)

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
            SectionTitle("About")
            SettingCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    LabeledValue("App", "Estrogen Mail")
                    Spacer(Modifier.size(8.dp))
                    LabeledValue("Version", "0.1.0")
                    Spacer(Modifier.size(8.dp))
                    Text(
                        "Your API key and PGP secrets stay on this device. Encrypted mail is decrypted locally and never leaves your phone in the clear.",
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
private fun AccountCard(state: SettingsState) {
    SettingCard {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(
                url = state.avatarUrl,
                seed = state.address ?: "me",
                label = state.displayName ?: state.address,
                size = 56.dp
            )
            Spacer(Modifier.width(14.dp))
            Column {
                Text(
                    state.displayName ?: "Your mailbox",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (state.address != null) {
                    Text(state.address, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun PgpCard(state: SettingsState, viewModel: SettingsViewModel) {
    SettingCard {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (state.pgpStatus == PgpStatus.UNLOCKED) Icons.Rounded.LockOpen else Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        when (state.pgpStatus) {
                            PgpStatus.UNLOCKED -> "Unlocked"
                            PgpStatus.LOCKED -> "Locked"
                            PgpStatus.ABSENT -> "No key on this device"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        when (state.pgpStatus) {
                            PgpStatus.UNLOCKED -> "You can read and send encrypted mail"
                            PgpStatus.LOCKED -> "Enter your passphrase to use encryption"
                            PgpStatus.ABSENT -> "Import your private key to enable encryption"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.size(12.dp))

            if (state.pgpStatus == PgpStatus.LOCKED) {
                PassphraseField(state, viewModel)
                Spacer(Modifier.size(8.dp))
                FilledTonalButton(onClick = viewModel::unlockExisting, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                    ButtonContent(state.busy, "Unlock")
                }
                Spacer(Modifier.size(8.dp))
                TextButton(onClick = viewModel::forgetKey, modifier = Modifier.fillMaxWidth()) {
                    Text("Remove key from device")
                }
            }

            if (state.pgpStatus == PgpStatus.UNLOCKED) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = viewModel::lock, modifier = Modifier.weight(1f)) {
                        Text("Lock")
                    }
                    OutlinedButton(
                        onClick = viewModel::forgetKey,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Remove")
                    }
                }
            }

            if (state.pgpStatus == PgpStatus.ABSENT) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = viewModel::fetchKeyFromServer, enabled = !state.busy, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Rounded.CloudDownload, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("From server")
                    }
                    FilledTonalButton(onClick = viewModel::toggleImport, modifier = Modifier.weight(1f)) {
                        Text(if (state.importVisible) "Hide" else "Paste key")
                    }
                }
            }

            if (state.importVisible && state.pgpStatus == PgpStatus.ABSENT) {
                Spacer(Modifier.size(12.dp))
                OutlinedTextField(
                    value = state.importKeyText,
                    onValueChange = viewModel::onImportKeyText,
                    label = { Text("Armored private key") },
                    placeholder = { Text("-----BEGIN PGP PRIVATE KEY BLOCK-----") },
                    minLines = 4,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.size(8.dp))
                PassphraseField(state, viewModel)
                Spacer(Modifier.size(8.dp))
                FilledTonalButton(onClick = viewModel::importAndUnlock, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                    ButtonContent(state.busy, "Import and unlock")
                }
            }
        }
    }
}

@Composable
private fun PassphraseField(state: SettingsState, viewModel: SettingsViewModel) {
    OutlinedTextField(
        value = state.passphrase,
        onValueChange = viewModel::onPassphrase,
        label = { Text("Passphrase") },
        singleLine = true,
        enabled = !state.busy,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
        modifier = Modifier.fillMaxWidth()
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = state.rememberPassphrase, onCheckedChange = viewModel::setRememberPassphrase)
        Text("Remember on this device", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ButtonContent(busy: Boolean, label: String) {
    if (busy) {
        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimaryContainer)
    } else {
        Text(label)
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 4.dp, bottom = 8.dp)
    )
}

@Composable
private fun SettingCard(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.large
    ) {
        content()
    }
}

@Composable
private fun LabeledValue(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
    }
}
