package zip.estrogen.mail.ui.byod

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.RocketLaunch
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.model.Domain
import zip.estrogen.mail.ui.appViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ByodScreen(onBack: () -> Unit) {
    val viewModel = appViewModel<ByodViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val clipboard = LocalClipboardManager.current

    LaunchedEffect(state.message) {
        state.message?.let { snackbar.showSnackbar(it); viewModel.consumeMessage() }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (state.wizardOpen) "Bring your own domain" else "Your domains",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { if (state.wizardOpen) viewModel.closeWizard() else onBack() }) {
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
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (state.wizardOpen) {
                Wizard(state, viewModel, clipboard::setText) { openCustomTab(context, it) }
            } else {
                DomainList(state, viewModel)
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun DomainList(state: ByodState, viewModel: ByodViewModel) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "Use your own domain",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                "Deploy a small Cloudflare Worker on a domain in your own account, and mail to it flows into this mailbox.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Button(
                onClick = viewModel::openWizard,
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Add a domain")
            }
        }
    }

    if (state.loading) {
        Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
        }
        return
    }

    val byod = state.domains.filter { it.isByod }
    if (byod.isEmpty()) {
        Text(
            "No bring-your-own domains yet.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 4.dp)
        )
        return
    }
    byod.forEach { DomainCard(it, state, viewModel) }
}

@Composable
private fun DomainCard(domain: Domain, state: ByodState, viewModel: ByodViewModel) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceContainerHighest),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Rounded.Dns,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        domain.domain,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        if (domain.relayUrl.isBlank()) "Not deployed yet" else domain.relayUrl,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill("Receiving", domain.verified)
                StatusPill("Sending", domain.sendVerified)
                StatusPill("Relay", domain.relayOk == true)
            }

            if (!domain.verified || domain.relayUrl.isBlank()) {
                Button(
                    onClick = { viewModel.resume(domain) },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text("Finish setup")
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (domain.relayUrl.isNotBlank()) {
                    OutlinedButton(
                        onClick = { viewModel.checkHealth(domain.id) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Check relay")
                    }
                }
                OutlinedButton(
                    onClick = { viewModel.rotateSecret(domain) },
                    enabled = state.rotatingId != domain.id,
                    modifier = Modifier.weight(1f)
                ) {
                    if (state.rotatingId == domain.id) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Rotate secret")
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusPill(label: String, ok: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHighest)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = if (ok) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun Wizard(
    state: ByodState,
    viewModel: ByodViewModel,
    onCopy: (AnnotatedString) -> Unit,
    onOpenUrl: (String) -> Unit
) {
    StepDots(state.step)
    when (state.step) {
        ByodStep.DOMAIN -> StepDomain(state, viewModel)
        ByodStep.DEPLOY -> StepDeploy(state, viewModel, onCopy, onOpenUrl)
        ByodStep.CONNECT -> StepConnect(state, viewModel)
    }
}

@Composable
private fun StepDots(step: ByodStep) {
    val index = when (step) {
        ByodStep.DOMAIN -> 1
        ByodStep.DEPLOY -> 2
        ByodStep.CONNECT -> 3
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        (1..3).forEach { i ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(4.dp)
                    .clip(MaterialTheme.shapes.small)
                    .background(
                        if (i <= index) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.surfaceContainerHighest
                    )
            )
        }
    }
}

@Composable
private fun StepDomain(state: ByodState, viewModel: ByodViewModel) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Enter your domain", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(
                "Use Estrogen Mail with a domain on your own Cloudflare account using a simple worker.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = state.domainInput,
                onValueChange = viewModel::onDomainInput,
                label = { Text("Domain") },
                placeholder = { Text("example.com") },
                singleLine = true,
                enabled = !state.busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                modifier = Modifier.fillMaxWidth()
            )
            ErrorText(state.error)
            Button(onClick = viewModel::submitDomain, enabled = !state.busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                BusyLabel(state.busy, "Continue")
            }
        }
    }
}

@Composable
private fun StepDeploy(
    state: ByodState,
    viewModel: ByodViewModel,
    onCopy: (AnnotatedString) -> Unit,
    onOpenUrl: (String) -> Unit
) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("1. Install the Worker", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(
                "Don't change anything other than RELAY_CONFIG.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Button(
                onClick = { if (state.deployUrl.isNotBlank()) onOpenUrl(state.deployUrl) },
                enabled = state.deployUrl.isNotBlank() && !state.busy,
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Icon(Icons.Rounded.RocketLaunch, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Deploy to Cloudflare")
            }
        }
    }

    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("2. Use this as RELAY_CONFIG", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(
                "Don't share this with anyone. It's a secret.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (state.busy && state.relayConfig.isBlank()) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
            } else {
                SecretField(state.relayConfig) {
                    onCopy(AnnotatedString(state.relayConfig))
                    viewModel.consumeMessage()
                }
            }
        }
    }

    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("3. Set up Email Routing and Sending", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(
                "In Cloudflare, go to ${state.activeDomain.ifBlank { "your domain" }} → Email and do both:",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "• Email Routing: open Routing rules, enable Catch-all and set the action to Send to a Worker → email-worker, then save.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "• Email Sending: turn it on for this domain. You may need to onboard the domain first.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }

    ErrorText(state.error)
    Button(onClick = viewModel::goToConnect, enabled = !state.busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        Text("Done, continue")
    }
}

@Composable
private fun StepConnect(state: ByodState, viewModel: ByodViewModel) {
    SectionCard {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Connect your Worker", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(
                "Find it in Cloudflare under Workers & Pages → email-worker (the .workers.dev URL near the top).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = state.relayUrlInput,
                onValueChange = viewModel::onRelayUrlInput,
                label = { Text("Worker URL") },
                placeholder = { Text("https://email-worker.your-subdomain.workers.dev") },
                singleLine = true,
                enabled = !state.verifying,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                modifier = Modifier.fillMaxWidth()
            )
            if (state.verifying) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("Verifying… this can take up to a minute.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            ErrorText(state.error)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = viewModel::goToDeploy, enabled = !state.verifying, modifier = Modifier.weight(1f)) {
                    Text("Back")
                }
                Button(onClick = viewModel::connect, enabled = !state.busy && !state.verifying, modifier = Modifier.weight(1f)) {
                    BusyLabel(state.busy || state.verifying, "Connect")
                }
            }
        }
    }
}

@Composable
private fun SecretField(secret: String, onCopy: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp)
    ) {
        Text(
            secret,
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            modifier = Modifier.weight(1f)
        )
        IconButton(onClick = onCopy) {
            Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy", modifier = Modifier.size(18.dp))
        }
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
        shape = MaterialTheme.shapes.large
    ) { content() }
}

private fun openCustomTab(context: Context, url: String) {
    val intent = CustomTabsIntent.Builder()
        .setShowTitle(true)
        .build()
    intent.intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    intent.launchUrl(context, Uri.parse(url))
}
