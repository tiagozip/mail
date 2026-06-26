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
import zip.estrogen.mail.ui.maillist.MailListViewModel
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
            else -> throw IllegalArgumentException("Unknown ViewModel ${modelClass.name}")
        } as T
    }
}

@Composable
inline fun <reified VM : ViewModel> appViewModel(): VM {
    val app = LocalContext.current.applicationContext as MailApp
    return viewModel(factory = AppViewModelFactory(app.repository))
}
