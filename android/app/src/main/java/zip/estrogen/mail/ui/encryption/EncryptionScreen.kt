package zip.estrogen.mail.ui.encryption

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.GppGood
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.Download
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.pgp.PgpStatus
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.BackButton
import zip.estrogen.mail.ui.common.TonalIconBadge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EncryptionScreen(onBack: () -> Unit) {
    val viewModel = appViewModel<EncryptionViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val snackbar = remember { SnackbarHostState() }
    val clipboard = LocalClipboardManager.current

    LaunchedEffect(Unit) { viewModel.start(context) }
    LaunchedEffect(state.message) {
        state.message?.let { snackbar.showSnackbar(it); viewModel.consumeMessage() }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Encryption", fontWeight = FontWeight.SemiBold) },
                navigationIcon = { BackButton(onBack) },
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
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StatusHero(state.status, state.fingerprint, state.pgpEnabledOnServer)
            when (state.status) {
                PgpStatus.ABSENT -> AbsentContent(state, viewModel)
                PgpStatus.LOCKED -> LockedContent(state, viewModel, activity)
                PgpStatus.UNLOCKED -> UnlockedContent(state, viewModel, activity) {
                    viewModel.exportPrivateKey()?.let { clipboard.setText(AnnotatedString(it)) }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun StatusHero(status: PgpStatus, fingerprint: String?, enabledOnServer: Boolean) {
    val on = status == PgpStatus.UNLOCKED
    val heroContainer = when (status) {
        PgpStatus.UNLOCKED -> MaterialTheme.colorScheme.primaryContainer
        else -> MaterialTheme.colorScheme.surfaceContainerLow
    }
    val onHero = when (status) {
        PgpStatus.UNLOCKED -> MaterialTheme.colorScheme.onPrimaryContainer
        else -> MaterialTheme.colorScheme.onSurface
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.extraLarge)
            .background(heroContainer)
            .padding(24.dp)
    ) {
        TonalIconBadge(
            icon = when (status) {
                PgpStatus.UNLOCKED -> Icons.Rounded.GppGood
                PgpStatus.LOCKED -> Icons.Rounded.Lock
                PgpStatus.ABSENT -> Icons.Rounded.LockOpen
            },
            container = if (on) MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.16f) else MaterialTheme.colorScheme.secondaryContainer,
            tint = if (on) onHero else MaterialTheme.colorScheme.onSecondaryContainer,
            size = 56.dp,
            shape = CircleShape
        )
        Spacer(Modifier.size(16.dp))
        Text(
            when (status) {
                PgpStatus.UNLOCKED -> "End-to-end encryption is on"
                PgpStatus.LOCKED -> "Encryption is locked"
                PgpStatus.ABSENT -> "Encryption is off"
            },
            style = MaterialTheme.typography.headlineSmall,
            color = onHero
        )
        Spacer(Modifier.size(4.dp))
        Text(
            when (status) {
                PgpStatus.UNLOCKED -> "Mail is decrypted on this device only."
                PgpStatus.LOCKED -> "Unlock to read encrypted mail."
                PgpStatus.ABSENT -> "Set up a key to send and read encrypted mail."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = onHero.copy(alpha = 0.82f)
        )
        if (!fingerprint.isNullOrBlank()) {
            Spacer(Modifier.size(18.dp))
            Text("KEY FINGERPRINT", style = MaterialTheme.typography.labelMedium, color = onHero.copy(alpha = 0.7f))
            Spacer(Modifier.size(4.dp))
            Text(
                fingerprint.chunked(4).joinToString(" "),
                style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                color = onHero
            )
        }
        if (enabledOnServer) {
            Spacer(Modifier.size(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.GppGood, contentDescription = null, tint = onHero, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Public key published", style = MaterialTheme.typography.bodySmall, color = onHero.copy(alpha = 0.82f))
            }
        }
    }
}

@Composable
private fun AbsentContent(state: EncryptionState, viewModel: EncryptionViewModel) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Set up encryption", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            Button(onClick = { viewModel.setMode(EncMode.GENERATE) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightField(), shape = MaterialTheme.shapes.large) {
                Icon(Icons.Rounded.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Generate a new key")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = viewModel::fetchFromServer, enabled = !state.busy, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.large) {
                    Icon(Icons.Rounded.CloudDownload, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("From server")
                }
                OutlinedButton(onClick = { viewModel.setMode(EncMode.IMPORT) }, enabled = !state.busy, modifier = Modifier.weight(1f), shape = MaterialTheme.shapes.large) {
                    Text("Paste key")
                }
            }
        }
    }

    AnimatedVisibility(visible = state.mode == EncMode.GENERATE) {
        SectionCard {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Choose a passphrase", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text("This protects your private key. You'll need it to read encrypted mail on a new device.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                PassField(state.passphrase, viewModel::onPassphrase, "Passphrase", !state.busy)
                PassField(state.confirm, viewModel::onConfirm, "Confirm passphrase", !state.busy)
                RememberRow(state, viewModel)
                ErrorText(state.error)
                Button(onClick = viewModel::generate, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightField(), shape = MaterialTheme.shapes.large) {
                    BusyLabel(state.busy, "Generate and enable")
                }
            }
        }
    }

    AnimatedVisibility(visible = state.mode == EncMode.IMPORT || state.mode == EncMode.UNLOCK) {
        SectionCard {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (state.mode == EncMode.UNLOCK) "Unlock your synced key" else "Import a private key", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                if (state.mode == EncMode.IMPORT) {
                    OutlinedTextField(
                        value = state.importKey,
                        onValueChange = viewModel::onImportKey,
                        label = { Text("Armored private key") },
                        placeholder = { Text("-----BEGIN PGP PRIVATE KEY BLOCK-----") },
                        minLines = 4,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                PassField(state.passphrase, viewModel::onPassphrase, "Passphrase", !state.busy)
                RememberRow(state, viewModel)
                ErrorText(state.error)
                Button(onClick = viewModel::importAndUnlock, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightField(), shape = MaterialTheme.shapes.large) {
                    BusyLabel(state.busy, "Import and unlock")
                }
            }
        }
    }
}

@Composable
private fun LockedContent(state: EncryptionState, viewModel: EncryptionViewModel, activity: FragmentActivity?) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (state.biometricAvailable && state.hasRemembered) {
                FilledTonalButton(onClick = { activity?.let(viewModel::unlockWithBiometric) }, modifier = Modifier.fillMaxWidth().heightField(), shape = MaterialTheme.shapes.large) {
                    Icon(Icons.Rounded.Fingerprint, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Unlock with biometrics")
                }
                Text("or enter your passphrase", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            PassField(state.passphrase, viewModel::onPassphrase, "Passphrase", !state.busy)
            RememberRow(state, viewModel)
            ErrorText(state.error)
            Button(onClick = viewModel::unlock, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightField(), shape = MaterialTheme.shapes.large) {
                BusyLabel(state.busy, "Unlock")
            }
            TextButton(onClick = viewModel::removeFromDevice, modifier = Modifier.fillMaxWidth()) {
                Text("Remove key from this device")
            }
        }
    }
}

@Composable
private fun UnlockedContent(
    state: EncryptionState,
    viewModel: EncryptionViewModel,
    activity: FragmentActivity?,
    onBackup: () -> Unit
) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Unlock with biometrics", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        if (state.biometricAvailable) "Require fingerprint or device PIN to unlock" else "No biometrics enrolled on this device",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = state.requireBiometric,
                    onCheckedChange = { activity?.let { a -> viewModel.setRequireBiometric(a, it) } },
                    enabled = state.biometricAvailable && state.hasRemembered
                )
            }
        }
    }

    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Back up your key", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text("Copy your encrypted private key somewhere safe. Without it and your passphrase, encrypted mail can't be recovered.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = onBackup, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large) {
                Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Copy private key")
            }
        }
    }

    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = viewModel::lock, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large) {
                Icon(Icons.Rounded.Lock, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Lock now")
            }
            OutlinedButton(
                onClick = viewModel::disable,
                enabled = !state.busy,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Disable encryption")
            }
        }
    }
}

@Composable
private fun PassField(value: String, onValue: (String) -> Unit, label: String, enabled: Boolean) {
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        label = { Text(label) },
        singleLine = true,
        enabled = enabled,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun RememberRow(state: EncryptionState, viewModel: EncryptionViewModel) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = state.rememberPassphrase, onCheckedChange = viewModel::setRemember)
        Text("Remember on this device", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ErrorText(error: String?) {
    if (error != null) {
        Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun BusyLabel(busy: Boolean, label: String) {
    if (busy) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
    } else {
        Text(label)
    }
}

@Composable
private fun SectionCard(content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.extraLarge
    ) { content() }
}

private fun Modifier.heightField(): Modifier = this.then(Modifier.height(54.dp))
