package zip.estrogen.mail.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.MarkEmailRead
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.SwipeLeft
import androidx.compose.material.icons.rounded.SwipeRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.SwipeAction
import zip.estrogen.mail.data.SwipeConfig
import zip.estrogen.mail.ui.appViewModel

class SwipeActionsViewModel(private val repository: MailRepository) : ViewModel() {
    val config = repository.swipeConfig.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SwipeConfig())

    fun setRight(action: SwipeAction) {
        viewModelScope.launch { repository.setSwipe(action, config.value.left) }
    }

    fun setLeft(action: SwipeAction) {
        viewModelScope.launch { repository.setSwipe(config.value.right, action) }
    }
}

fun SwipeAction.icon(): ImageVector = when (this) {
    SwipeAction.ARCHIVE -> Icons.Rounded.Archive
    SwipeAction.TRASH -> Icons.Rounded.Delete
    SwipeAction.READ -> Icons.Rounded.MarkEmailRead
    SwipeAction.STAR -> Icons.Rounded.Star
    SwipeAction.SNOOZE -> Icons.Rounded.Bedtime
    SwipeAction.NONE -> Icons.Rounded.Block
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeActionsScreen(onBack: () -> Unit) {
    val viewModel = appViewModel<SwipeActionsViewModel>()
    val config by viewModel.config.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Swipe actions", fontWeight = FontWeight.SemiBold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, titleContentColor = MaterialTheme.colorScheme.onSurface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            DirectionCard(
                title = "Swipe right",
                headerIcon = Icons.Rounded.SwipeRight,
                selected = config.right,
                onSelect = viewModel::setRight
            )
            Spacer(Modifier.size(16.dp))
            DirectionCard(
                title = "Swipe left",
                headerIcon = Icons.Rounded.SwipeLeft,
                selected = config.left,
                onSelect = viewModel::setLeft
            )
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun DirectionCard(title: String, headerIcon: ImageVector, selected: SwipeAction, onSelect: (SwipeAction) -> Unit) {
    Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        shape = MaterialTheme.shapes.large
    ) {
        Column {
            SwipeAction.entries.forEach { action ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(selected = action == selected, onClick = { onSelect(action) })
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(action.icon(), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(16.dp))
                    Text(action.label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                    RadioButton(selected = action == selected, onClick = { onSelect(action) })
                }
            }
        }
    }
}
