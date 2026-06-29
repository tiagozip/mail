package zip.estrogen.mail.ui.settings

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.Appearance
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.ui.theme.AppPalette
import zip.estrogen.mail.ui.theme.DarkMode

class AppearanceViewModel(private val repository: MailRepository) : ViewModel() {

    val dynamicSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    val appearance = repository.appearance.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), Appearance()
    )

    fun setPalette(palette: AppPalette) = viewModelScope.launch { repository.setPalette(palette) }
    fun setDynamicColor(enabled: Boolean) = viewModelScope.launch { repository.setDynamicColor(enabled) }
    fun setDarkMode(mode: DarkMode) = viewModelScope.launch { repository.setDarkMode(mode) }
    fun setAmoled(enabled: Boolean) = viewModelScope.launch { repository.setAmoled(enabled) }
}
