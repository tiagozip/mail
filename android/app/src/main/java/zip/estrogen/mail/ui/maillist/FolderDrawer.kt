package zip.estrogen.mail.ui.maillist

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Drafts
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Label
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Report
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.forFolder
import zip.estrogen.mail.data.model.FolderCounts
import zip.estrogen.mail.data.model.Label as MailLabel
import zip.estrogen.mail.data.model.User
import zip.estrogen.mail.ui.common.Avatar

private fun iconFor(folder: Folder): ImageVector = when (folder) {
    Folder.INBOX -> Icons.Rounded.Inbox
    Folder.STARRED -> Icons.Rounded.Star
    Folder.SENT -> Icons.Rounded.Send
    Folder.DRAFTS -> Icons.Rounded.Drafts
    Folder.ARCHIVE -> Icons.Rounded.Archive
    Folder.SPAM -> Icons.Rounded.Report
    Folder.TRASH -> Icons.Rounded.Delete
}

@Composable
fun FolderDrawer(
    user: User?,
    counts: FolderCounts,
    labels: List<MailLabel>,
    currentView: ListView,
    onSelectFolder: (Folder) -> Unit,
    onOpenSnoozed: () -> Unit,
    onOpenLabel: (String, String) -> Unit,
    onOpenSettings: () -> Unit,
    onSignOut: () -> Unit
) {
    val selectedFolder = (currentView as? ListView.FolderView)?.folder
    val selectedLabel = (currentView as? ListView.LabelView)?.id

    ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(
                        url = user?.avatarUrl,
                        seed = user?.address ?: "me",
                        label = user?.displayName ?: user?.username,
                        size = 52.dp
                    )
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(
                            text = user?.displayName ?: user?.username ?: "Estrogen Mail",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        user?.address?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            Folder.entries.forEach { folder ->
                val count = counts.forFolder(folder)
                val badge = when (folder) {
                    Folder.INBOX, Folder.SPAM -> count.unread
                    Folder.STARRED, Folder.DRAFTS -> count.total
                    else -> 0
                }
                NavigationDrawerItem(
                    label = { Text(folder.label) },
                    selected = folder == selectedFolder,
                    onClick = { onSelectFolder(folder) },
                    icon = { Icon(iconFor(folder), contentDescription = null) },
                    badge = { if (badge > 0) Text(badge.toString()) },
                    colors = NavigationDrawerItemDefaults.colors(selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer),
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
                )
            }

            NavigationDrawerItem(
                label = { Text("Snoozed") },
                selected = currentView is ListView.Snoozed,
                onClick = onOpenSnoozed,
                icon = { Icon(Icons.Rounded.Bedtime, contentDescription = null) },
                colors = NavigationDrawerItemDefaults.colors(selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
            )

            if (labels.isNotEmpty()) {
                Spacer(Modifier.size(8.dp))
                Text(
                    "Labels",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 28.dp, top = 4.dp, bottom = 4.dp)
                )
                labels.forEach { label ->
                    val color = runCatching { Color(android.graphics.Color.parseColor(label.color)) }.getOrDefault(MaterialTheme.colorScheme.primary)
                    NavigationDrawerItem(
                        label = { Text(label.name) },
                        selected = label.id == selectedLabel,
                        onClick = { onOpenLabel(label.id, label.name) },
                        icon = {
                            androidx.compose.foundation.layout.Box(
                                modifier = Modifier.size(16.dp).clip(CircleShape).background(color)
                            )
                        },
                        colors = NavigationDrawerItemDefaults.colors(selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(Modifier.size(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            Spacer(Modifier.size(8.dp))

            NavigationDrawerItem(
                label = { Text("Settings") },
                selected = false,
                onClick = onOpenSettings,
                icon = { Icon(Icons.Rounded.Settings, contentDescription = null) },
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            NavigationDrawerItem(
                label = { Text("Sign out") },
                selected = false,
                onClick = onSignOut,
                icon = { Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = null) },
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            Spacer(Modifier.size(16.dp))
        }
    }
}
