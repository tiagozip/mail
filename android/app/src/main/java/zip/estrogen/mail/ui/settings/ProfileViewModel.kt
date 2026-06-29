package zip.estrogen.mail.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MultipartBody
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.SettingsBody

data class ProfileState(
    val displayName: String = "",
    val signature: String = "",
    val avatarUrl: String? = null,
    val address: String? = null,
    val storageUsed: Long = 0,
    val busy: Boolean = false,
    val message: String? = null
)

class ProfileViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(ProfileState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.loadMe().onSuccess { applyUser() }
        }
    }

    private fun applyUser() {
        val user = repository.me.value?.user ?: return
        _state.update {
            it.copy(
                displayName = user.displayName ?: "",
                signature = user.signature,
                avatarUrl = user.avatarUrl,
                address = user.address,
                storageUsed = user.storageUsed
            )
        }
    }

    fun onDisplayName(v: String) = _state.update { it.copy(displayName = v) }
    fun onSignature(v: String) = _state.update { it.copy(signature = v) }
    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun save() {
        val s = _state.value
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            repository.updateSettings(SettingsBody(displayName = s.displayName, signature = s.signature)).fold(
                onSuccess = {
                    applyUser()
                    _state.update { it.copy(busy = false, message = "Profile saved") }
                },
                onFailure = {
                    _state.update { it.copy(busy = false, message = "Could not save profile") }
                }
            )
        }
    }

    fun uploadAvatar(part: MultipartBody.Part) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            repository.uploadAvatar(part).fold(
                onSuccess = {
                    repository.loadMe().onSuccess { applyUser() }
                    _state.update { it.copy(busy = false, message = "Photo updated") }
                },
                onFailure = {
                    _state.update { it.copy(busy = false, message = "Could not upload photo") }
                }
            )
        }
    }

    fun removeAvatar() {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            repository.deleteAvatar().fold(
                onSuccess = {
                    repository.loadMe().onSuccess { applyUser() }
                    _state.update { it.copy(busy = false, message = "Photo removed") }
                },
                onFailure = {
                    _state.update { it.copy(busy = false, message = "Could not remove photo") }
                }
            )
        }
    }
}
