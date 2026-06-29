package zip.estrogen.mail.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.Label

val labelPalette = listOf("#bf3264", "#5b7cfa", "#4c8c5a", "#e0a458", "#9b5de5", "#2dd4bf")

data class LabelsState(
    val labels: List<Label> = emptyList(),
    val editingId: String? = null,
    val name: String = "",
    val color: String = labelPalette.first(),
    val loading: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null
)

class LabelsViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(LabelsState())
    val state = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            repository.labels()
                .onSuccess { list -> _state.update { it.copy(labels = list, loading = false) } }
                .onFailure { e -> _state.update { it.copy(loading = false, message = e.message ?: "Couldn't load labels") } }
        }
    }

    fun onName(value: String) = _state.update { it.copy(name = value) }
    fun onColor(value: String) = _state.update { it.copy(color = value) }

    fun startEdit(label: Label) {
        _state.update { it.copy(editingId = label.id, name = label.name, color = label.color) }
    }

    fun cancelEdit() {
        _state.update { it.copy(editingId = null, name = "", color = labelPalette.first()) }
    }

    fun save() {
        val current = _state.value
        if (current.name.isBlank() || current.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            val result = current.editingId?.let { id ->
                repository.updateLabel(id, current.name.trim(), current.color)
            } ?: repository.createLabel(current.name.trim(), current.color)
            result
                .onSuccess {
                    _state.update {
                        it.copy(
                            busy = false,
                            editingId = null,
                            name = "",
                            color = labelPalette.first(),
                            message = if (current.editingId != null) "Label saved" else "Label created"
                        )
                    }
                    load()
                }
                .onFailure { e -> _state.update { it.copy(busy = false, message = e.message ?: "Couldn't save label") } }
        }
    }

    fun deleteLabel(id: String) {
        viewModelScope.launch {
            repository.deleteLabel(id)
                .onSuccess {
                    if (_state.value.editingId == id) cancelEdit()
                    _state.update { it.copy(message = "Label removed") }
                    load()
                }
                .onFailure { e -> _state.update { it.copy(message = e.message ?: "Couldn't remove label") } }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }
}
