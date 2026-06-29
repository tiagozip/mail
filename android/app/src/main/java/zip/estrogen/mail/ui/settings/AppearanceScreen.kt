package zip.estrogen.mail.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.materialkolor.rememberDynamicColorScheme
import zip.estrogen.mail.ui.appViewModel
import zip.estrogen.mail.ui.theme.AppPalette
import zip.estrogen.mail.ui.theme.DarkMode

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AppearanceScreen(onBack: () -> Unit) {
    val viewModel = appViewModel<AppearanceViewModel>()
    val appearance by viewModel.appearance.collectAsStateWithLifecycle()

    androidx.compose.material3.Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Appearance", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface, titleContentColor = MaterialTheme.colorScheme.onSurface)
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
            SectionTitle("Theme")
            Card(
                modifier = Modifier.fillMaxWidth().alpha(if (appearance.dynamicColor) 0.5f else 1f),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                shape = MaterialTheme.shapes.large
            ) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(20.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    AppPalette.entries.forEach { palette ->
                        PaletteSwatch(
                            palette = palette,
                            selected = appearance.palette == palette && !appearance.dynamicColor,
                            enabled = !appearance.dynamicColor,
                            onClick = { viewModel.setPalette(palette) }
                        )
                    }
                }
            }

            SectionTitle("Color")
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                shape = MaterialTheme.shapes.large
            ) {
                Column(modifier = Modifier.padding(4.dp)) {
                    ToggleRow(
                        title = "Dynamic color",
                        subtitle = if (viewModel.dynamicSupported) "Match colors to your wallpaper" else "Needs Android 12 or newer",
                        checked = appearance.dynamicColor && viewModel.dynamicSupported,
                        enabled = viewModel.dynamicSupported,
                        onCheckedChange = viewModel::setDynamicColor
                    )
                    ToggleRow(
                        title = "Pure black (AMOLED)",
                        subtitle = "True black background in dark mode",
                        checked = appearance.amoled,
                        enabled = true,
                        onCheckedChange = viewModel::setAmoled
                    )
                }
            }

            SectionTitle("Dark mode")
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                DarkMode.entries.forEachIndexed { index, mode ->
                    SegmentedButton(
                        selected = appearance.darkMode == mode,
                        onClick = { viewModel.setDarkMode(mode) },
                        shape = SegmentedButtonDefaults.itemShape(index, DarkMode.entries.size)
                    ) { Text(mode.label) }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun PaletteSwatch(palette: AppPalette, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val scheme = rememberDynamicColorScheme(seedColor = palette.seed, isDark = true, isAmoled = false, style = palette.style)
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(60.dp)
                .clip(CircleShape)
                .background(scheme.primaryContainer)
                .border(
                    width = if (selected) 3.dp else 0.dp,
                    color = if (selected) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Transparent,
                    shape = CircleShape
                )
                .clickable(enabled = enabled, onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Box(modifier = Modifier.size(28.dp).clip(CircleShape).background(scheme.primary), contentAlignment = Alignment.Center) {
                if (selected) Icon(Icons.Rounded.Check, contentDescription = null, tint = scheme.onPrimary, modifier = Modifier.size(18.dp))
            }
        }
        Spacer(Modifier.size(6.dp))
        Text(palette.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ToggleRow(title: String, subtitle: String, checked: Boolean, enabled: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 4.dp))
}
