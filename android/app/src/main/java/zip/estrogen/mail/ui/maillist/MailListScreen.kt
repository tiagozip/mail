package zip.estrogen.mail.ui.maillist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.model.User
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.common.Avatar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MailListScreen(
    onOpenThread: (threadId: String, messageId: String) -> Unit,
    onCompose: () -> Unit,
    onSignedOut: () -> Unit
) {
    val viewModel = appViewModel<MailListViewModel>()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) { viewModel.start() }

    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }

    val shouldLoadMore by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= state.messages.size - 5 && state.nextCursor != null
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMore()
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            FolderDrawer(
                user = state.user,
                counts = state.counts,
                selected = state.folder,
                onSelect = { folder ->
                    scope.launch { drawerState.close() }
                    viewModel.selectFolder(folder)
                },
                onSignOut = {
                    scope.launch { drawerState.close() }
                    viewModel.signOut()
                }
            )
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            text = state.folder.label,
                            fontWeight = FontWeight.Bold
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Rounded.Menu, contentDescription = "Folders")
                        }
                    },
                    actions = {
                        AccountAction(user = state.user) {
                            scope.launch { drawerState.open() }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface
                    )
                )
            },
            floatingActionButton = {
                ExtendedFloatingActionButton(
                    text = { Text("Compose") },
                    icon = { Icon(Icons.Rounded.Edit, contentDescription = null) },
                    onClick = onCompose,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                )
            }
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                when {
                    state.loading && state.messages.isEmpty() -> CenteredSpinner()
                    state.error != null && state.messages.isEmpty() ->
                        CenteredMessage(state.error!!, isError = true)
                    state.messages.isEmpty() ->
                        CenteredMessage("No messages in ${state.folder.label}.")
                    else -> LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 96.dp)
                    ) {
                        items(state.messages, key = { it.id }) { message ->
                            MailRow(
                                message = message,
                                onClick = {
                                    viewModel.markReadLocally(message.id)
                                    onOpenThread(message.threadId ?: message.id, message.id)
                                },
                                onToggleStar = { viewModel.toggleStar(message) }
                            )
                            HorizontalDivider(
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                thickness = 0.6.dp
                            )
                        }
                        if (state.loadingMore) {
                            item { CenteredSpinner(small = true) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AccountAction(user: User?, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Avatar(
            url = user?.avatarUrl,
            seed = user?.address ?: "me",
            label = user?.displayName ?: user?.username,
            size = 32.dp
        )
    }
}

@Composable
private fun CenteredSpinner(small: Boolean = false) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(if (small) 24.dp else 36.dp),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 3.dp
        )
    }
}

@Composable
private fun CenteredMessage(text: String, isError: Boolean = false) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Rounded.Inbox,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = text,
            modifier = Modifier.padding(top = 12.dp),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = if (isError) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
