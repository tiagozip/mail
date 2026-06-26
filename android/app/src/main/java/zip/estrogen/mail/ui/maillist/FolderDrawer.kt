package zip.estrogen.mail.ui.maillist

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Drafts
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Report
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.forFolder
import zip.estrogen.mail.data.model.FolderCounts
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
    selected: Folder,
    onSelect: (Folder) -> Unit,
    onSignOut: () -> Unit
) {
    ModalDrawerSheet(
        drawerContainerColor = MaterialTheme.colorScheme.surface
    ) {
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
                    if (user?.address != null) {
                        Text(
                            text = user.address,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
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
                selected = folder == selected,
                onClick = { onSelect(folder) },
                icon = { Icon(iconFor(folder), contentDescription = null) },
                badge = { if (badge > 0) Text(badge.toString()) },
                colors = NavigationDrawerItemDefaults.colors(
                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer
                ),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
            )
        }

        Spacer(Modifier.size(8.dp))

        NavigationDrawerItem(
            label = { Text("Sign out") },
            selected = false,
            onClick = onSignOut,
            icon = { Icon(Icons.Rounded.Logout, contentDescription = null) },
            modifier = Modifier.padding(horizontal = 12.dp)
        )
    }
}
