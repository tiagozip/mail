package zip.estrogen.mail.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.model.Filter

data class FiltersState(
    val filters: List<Filter> = emptyList(),
    val field: String = "from",
    val matchValue: String = "",
    val action: String = "archive",
    val loading: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null
)

class FiltersViewModel(private val repository: MailRepository) : ViewModel() {

    private val _state = MutableStateFlow(FiltersState())
    val state = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            repository.filters()
                .onSuccess { list -> _state.update { it.copy(filters = list.sortedBy { f -> f.position }, loading = false) } }
                .onFailure { e -> _state.update { it.copy(loading = false, message = e.message ?: "Couldn't load filters") } }
        }
    }

    fun onField(value: String) = _state.update { it.copy(field = value) }
    fun onMatchValue(value: String) = _state.update { it.copy(matchValue = value) }
    fun onAction(value: String) = _state.update { it.copy(action = value) }

    fun addRule() {
        val current = _state.value
        if (current.matchValue.isBlank() || current.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            repository.createFilter(current.field, current.matchValue.trim(), current.action)
                .onSuccess {
                    _state.update { it.copy(busy = false, matchValue = "", message = "Rule added") }
                    load()
                }
                .onFailure { e -> _state.update { it.copy(busy = false, message = e.message ?: "Couldn't add rule") } }
        }
    }

    fun deleteRule(id: String) {
        viewModelScope.launch {
            repository.deleteFilter(id)
                .onSuccess {
                    _state.update { it.copy(message = "Rule removed") }
                    load()
                }
                .onFailure { e -> _state.update { it.copy(message = e.message ?: "Couldn't remove rule") } }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }
}
