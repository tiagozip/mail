package zip.estrogen.mail.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import zip.estrogen.mail.MailApp
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.ui.compose.ComposeViewModel
import zip.estrogen.mail.ui.encryption.EncryptionViewModel
import zip.estrogen.mail.ui.maillist.MailListViewModel
import zip.estrogen.mail.ui.scheduled.ScheduledViewModel
import zip.estrogen.mail.ui.settings.AliasesViewModel
import zip.estrogen.mail.ui.settings.AppearanceViewModel
import zip.estrogen.mail.ui.settings.FiltersViewModel
import zip.estrogen.mail.ui.settings.KeysViewModel
import zip.estrogen.mail.ui.settings.LabelsViewModel
import zip.estrogen.mail.ui.settings.NotificationsViewModel
import zip.estrogen.mail.ui.settings.ProfileViewModel
import zip.estrogen.mail.ui.settings.SettingsViewModel
import zip.estrogen.mail.ui.setup.SetupViewModel
import zip.estrogen.mail.ui.thread.ThreadViewModel

class AppViewModelFactory(private val repository: MailRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        return when {
            modelClass.isAssignableFrom(SetupViewModel::class.java) -> SetupViewModel(repository)
            modelClass.isAssignableFrom(MailListViewModel::class.java) -> MailListViewModel(repository)
            modelClass.isAssignableFrom(ThreadViewModel::class.java) -> ThreadViewModel(repository)
            modelClass.isAssignableFrom(ComposeViewModel::class.java) -> ComposeViewModel(repository)
            modelClass.isAssignableFrom(SettingsViewModel::class.java) -> SettingsViewModel(repository)
            modelClass.isAssignableFrom(EncryptionViewModel::class.java) -> EncryptionViewModel(repository)
            modelClass.isAssignableFrom(AppearanceViewModel::class.java) -> AppearanceViewModel(repository)
            modelClass.isAssignableFrom(ProfileViewModel::class.java) -> ProfileViewModel(repository)
            modelClass.isAssignableFrom(AliasesViewModel::class.java) -> AliasesViewModel(repository)
            modelClass.isAssignableFrom(FiltersViewModel::class.java) -> FiltersViewModel(repository)
            modelClass.isAssignableFrom(LabelsViewModel::class.java) -> LabelsViewModel(repository)
            modelClass.isAssignableFrom(KeysViewModel::class.java) -> KeysViewModel(repository)
            modelClass.isAssignableFrom(NotificationsViewModel::class.java) -> NotificationsViewModel(repository)
            modelClass.isAssignableFrom(ScheduledViewModel::class.java) -> ScheduledViewModel(repository)
            else -> throw IllegalArgumentException("Unknown ViewModel ${modelClass.name}")
        } as T
    }
}

@Composable
inline fun <reified VM : ViewModel> appViewModel(): VM {
    val app = LocalContext.current.applicationContext as MailApp
    return viewModel(factory = AppViewModelFactory(app.repository))
}
