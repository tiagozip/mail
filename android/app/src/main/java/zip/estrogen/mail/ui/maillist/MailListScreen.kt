package zip.estrogen.mail.ui.maillist

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.MarkEmailRead
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.Folder
import zip.estrogen.mail.data.SwipeAction
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.settings.icon
import zip.estrogen.mail.ui.common.Avatar
import zip.estrogen.mail.ui.common.MailListSkeleton
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MailListScreen(
    onOpenThread: (threadId: String, messageId: String) -> Unit,
    onCompose: () -> Unit,
    onOpenSettings: () -> Unit,
    onSignedOut: () -> Unit
) {
    val viewModel = appViewModel<MailListViewModel>()
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val items by viewModel.items.collectAsStateWithLifecycle()
    val view by viewModel.view.collectAsStateWithLifecycle()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val snackbarHost = remember { SnackbarHostState() }
    var showSnooze by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.start() }
    LaunchedEffect(ui.signedOut) { if (ui.signedOut) onSignedOut() }
    LaunchedEffect(ui.snackbar) {
        ui.snackbar?.let { snackbarHost.showSnackbar(it); viewModel.consumeSnackbar() }
    }

    val shouldLoadMore by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= items.size - 5 && ui.nextCursor != null
        }
    }
    LaunchedEffect(shouldLoadMore) { if (shouldLoadMore) viewModel.loadMore() }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = !drawerState.isOpen && !ui.selecting,
        drawerContent = {
            FolderDrawer(
                user = ui.user,
                counts = ui.counts,
                labels = ui.labels,
                currentView = view,
                onSelectFolder = { scope.launch { drawerState.close() }; viewModel.selectFolder(it) },
                onOpenSnoozed = { scope.launch { drawerState.close() }; viewModel.openSnoozed() },
                onOpenLabel = { id, name -> scope.launch { drawerState.close() }; viewModel.openLabel(id, name) },
                onOpenSettings = { scope.launch { drawerState.close() }; onOpenSettings() },
                onSignOut = { scope.launch { drawerState.close() }; viewModel.signOut() }
            )
        }
    ) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbarHost) },
            topBar = {
                when {
                    ui.selecting -> SelectionBar(
                        count = ui.selected.size,
                        onClose = viewModel::clearSelection,
                        onArchive = { viewModel.selectionAction("move", "archive") },
                        onDelete = { viewModel.selectionAction("move", "trash") },
                        onRead = { viewModel.selectionAction("read", "true") },
                        onStar = { viewModel.selectionAction("star", "true") },
                        onSnooze = { showSnooze = true }
                    )
                    ui.searchActive -> SearchBar(
                        query = ui.query,
                        onQuery = viewModel::setQuery,
                        onClose = viewModel::closeSearch
                    )
                    else -> GmailSearchBar(
                        user = ui.user,
                        onMenu = { scope.launch { drawerState.open() } },
                        onSearch = viewModel::openSearch,
                        onAccount = onOpenSettings
                    )
                }
            },
            floatingActionButton = {
                if (!ui.selecting && !ui.searchActive) {
                    ExtendedFloatingActionButton(
                        text = { Text("Compose") },
                        icon = { Icon(Icons.Rounded.Edit, contentDescription = null) },
                        onClick = onCompose,
                        expanded = !listState.canScrollBackward
                    )
                }
            }
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = ui.refreshing,
                onRefresh = { viewModel.refresh() },
                modifier = Modifier.fillMaxSize().padding(padding)
            ) {
                when {
                    ui.loading && items.isEmpty() -> MailListSkeleton()
                    items.isEmpty() && ui.error != null -> CenteredMessage(ui.error ?: "", isError = true)
                    items.isEmpty() && ui.searchActive -> CenteredMessage("No results", icon = Icons.Rounded.Search)
                    items.isEmpty() -> CenteredMessage("Inbox zero", subtitle = "You're all caught up.")
                    else -> LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 96.dp)
                    ) {
                        item(key = "__header") {
                            Text(
                                text = view.title,
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .animateItem()
                                    .padding(start = 24.dp, end = 24.dp, top = 4.dp, bottom = 8.dp)
                            )
                        }
                        itemsIndexed(items, key = { _, it -> it.id }) { index, item ->
                            val selected = item.id in ui.selected
                            val big = 22.dp
                            val small = 6.dp
                            val shape = RoundedCornerShape(
                                topStart = if (index == 0) big else small,
                                topEnd = if (index == 0) big else small,
                                bottomStart = if (index == items.lastIndex) big else small,
                                bottomEnd = if (index == items.lastIndex) big else small
                            )
                            Box(
                                modifier = Modifier
                                    .animateItem()
                                    .padding(horizontal = 12.dp, vertical = 1.dp)
                                    .clip(shape)
                            ) {
                                SwipeRow(
                                    selecting = ui.selecting,
                                    rightAction = ui.swipe.right,
                                    leftAction = ui.swipe.left,
                                    onSwipe = { action -> viewModel.performSwipe(item, action) }
                                ) {
                                    Surface(
                                        color = if (selected) MaterialTheme.colorScheme.secondaryContainer
                                        else MaterialTheme.colorScheme.surfaceContainerLow
                                    ) {
                                        MailRowInteractive(
                                            item = item,
                                            selected = selected,
                                            onTap = {
                                                if (ui.selecting) viewModel.toggleSelect(item.id)
                                                else {
                                                    viewModel.markRead(item.id)
                                                    onOpenThread(item.threadId ?: item.id, item.id)
                                                }
                                            },
                                            onLongPress = { viewModel.toggleSelect(item.id) },
                                            onToggleStar = { viewModel.toggleStar(item) }
                                        )
                                    }
                                }
                            }
                        }
                        if (ui.loadingMore) item { CenteredSpinner(small = true) }
                    }
                }
            }
        }
    }

    if (showSnooze) {
        SnoozeSheet(
            onPick = { until -> viewModel.snoozeSelected(until); showSnooze = false },
            onDismiss = { showSnooze = false }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MailRowInteractive(
    item: MailItem,
    selected: Boolean,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    onToggleStar: () -> Unit
) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier = Modifier.combinedClickable(
            onClick = onTap,
            onLongClick = {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                onLongPress()
            }
        )
    ) {
        MailRow(item = item, selected = selected, onClick = onTap, onToggleStar = onToggleStar)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeRow(
    selecting: Boolean,
    rightAction: SwipeAction,
    leftAction: SwipeAction,
    onSwipe: (SwipeAction) -> Unit,
    content: @Composable () -> Unit
) {
    if (selecting || (rightAction == SwipeAction.NONE && leftAction == SwipeAction.NONE)) {
        content()
        return
    }
    val haptics = LocalHapticFeedback.current
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            val action = when (value) {
                SwipeToDismissBoxValue.StartToEnd -> rightAction
                SwipeToDismissBoxValue.EndToStart -> leftAction
                SwipeToDismissBoxValue.Settled -> SwipeAction.NONE
            }
            if (action == SwipeAction.NONE) return@rememberSwipeToDismissBoxState false
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            onSwipe(action)
            action == SwipeAction.ARCHIVE || action == SwipeAction.TRASH || action == SwipeAction.SNOOZE
        },
        positionalThreshold = { it * 0.45f }
    )
    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = { SwipeBackground(dismissState.targetValue, rightAction, leftAction) },
        content = { content() }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeBackground(target: SwipeToDismissBoxValue, rightAction: SwipeAction, leftAction: SwipeAction) {
    val action = when (target) {
        SwipeToDismissBoxValue.StartToEnd -> rightAction
        SwipeToDismissBoxValue.EndToStart -> leftAction
        SwipeToDismissBoxValue.Settled -> SwipeAction.NONE
    }
    val color = when (action) {
        SwipeAction.ARCHIVE -> MaterialTheme.colorScheme.tertiaryContainer
        SwipeAction.TRASH -> MaterialTheme.colorScheme.errorContainer
        SwipeAction.NONE -> MaterialTheme.colorScheme.surfaceContainer
        else -> MaterialTheme.colorScheme.primaryContainer
    }
    val onColor = when (action) {
        SwipeAction.ARCHIVE -> MaterialTheme.colorScheme.onTertiaryContainer
        SwipeAction.TRASH -> MaterialTheme.colorScheme.onErrorContainer
        SwipeAction.NONE -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> MaterialTheme.colorScheme.onPrimaryContainer
    }
    Box(
        modifier = Modifier.fillMaxSize().background(color).padding(horizontal = 28.dp),
        contentAlignment = if (target == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd
    ) {
        if (action != SwipeAction.NONE) {
            Icon(action.icon(), contentDescription = null, tint = onColor, modifier = Modifier.size(26.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GmailSearchBar(
    user: zip.estrogen.mail.data.model.User?,
    onMenu: () -> Unit,
    onSearch: () -> Unit,
    onAccount: () -> Unit
) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Box(modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp)) {
            Surface(
                onClick = onSearch,
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxSize().padding(start = 4.dp, end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onMenu) {
                        Icon(Icons.Rounded.Menu, contentDescription = "Folders", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(
                        text = "Search in mail",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = onAccount) {
                        Avatar(url = user?.avatarUrl, seed = user?.address ?: "me", label = user?.displayName ?: user?.username, size = 32.dp)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SearchBar(query: String, onQuery: (String) -> Unit, onClose: () -> Unit) {
    TopAppBar(
        title = {
            TextField(
                value = query,
                onValueChange = onQuery,
                placeholder = { Text("Search mail") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    focusedIndicatorColor = MaterialTheme.colorScheme.surface,
                    unfocusedIndicatorColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        navigationIcon = {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Close search") }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectionBar(
    count: Int,
    onClose: () -> Unit,
    onArchive: () -> Unit,
    onDelete: () -> Unit,
    onRead: () -> Unit,
    onStar: () -> Unit,
    onSnooze: () -> Unit
) {
    TopAppBar(
        title = { Text("$count selected", fontWeight = FontWeight.SemiBold) },
        navigationIcon = {
            IconButton(onClick = onClose) { Icon(Icons.Rounded.Close, contentDescription = "Clear") }
        },
        actions = {
            IconButton(onClick = onStar) { Icon(Icons.Rounded.Star, contentDescription = "Star") }
            IconButton(onClick = onRead) { Icon(Icons.Rounded.MarkEmailRead, contentDescription = "Mark read") }
            IconButton(onClick = onSnooze) { Icon(Icons.Rounded.Bedtime, contentDescription = "Snooze") }
            IconButton(onClick = onArchive) { Icon(Icons.Rounded.Archive, contentDescription = "Archive") }
            IconButton(onClick = onDelete) { Icon(Icons.Rounded.Delete, contentDescription = "Delete") }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            titleContentColor = MaterialTheme.colorScheme.onSecondaryContainer
        )
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SnoozeSheet(onPick: (Long?) -> Unit, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState()
    val now = System.currentTimeMillis()
    val options = listOf(
        "Later today" to now + TimeUnit.HOURS.toMillis(3),
        "This evening" to now + TimeUnit.HOURS.toMillis(6),
        "Tomorrow" to now + TimeUnit.DAYS.toMillis(1),
        "This weekend" to now + TimeUnit.DAYS.toMillis(2),
        "Next week" to now + TimeUnit.DAYS.toMillis(7)
    )
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 32.dp)) {
            Text("Snooze until", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(20.dp))
            options.forEach { (label, ts) ->
                Text(
                    label,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPick(ts) }
                        .padding(horizontal = 24.dp, vertical = 14.dp)
                )
            }
        }
    }
}

@Composable
private fun CenteredSpinner(small: Boolean = false) {
    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(
            modifier = Modifier.size(if (small) 24.dp else 36.dp),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 3.dp
        )
    }
}

@Composable
private fun CenteredMessage(
    text: String,
    subtitle: String? = null,
    isError: Boolean = false,
    icon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Rounded.Inbox
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(if (isError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceContainerHighest),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = if (isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.size(16.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
        )
        if (subtitle != null) {
            Spacer(Modifier.size(4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
