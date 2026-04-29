package com.legaltechai.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.legaltechai.app.data.AppRepository
import com.legaltechai.app.data.Result
import com.legaltechai.app.device.ConnectivityObserver
import com.legaltechai.app.network.CaseResponse
import com.legaltechai.app.network.Contradiction
import com.legaltechai.app.network.InconsistencyResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = AppRepository(application)
    private val connectivityObserver = ConnectivityObserver(application)

    private val _isConnected = MutableStateFlow(true)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _healthStatus = MutableStateFlow("Checking...")
    val healthStatus: StateFlow<String> = _healthStatus.asStateFlow()

    // --- Search State ---
    private val _searchResults = MutableStateFlow<List<CaseResponse>>(emptyList())
    val searchResults: StateFlow<List<CaseResponse>> = _searchResults.asStateFlow()

    private val _searchLoading = MutableStateFlow(false)
    val searchLoading: StateFlow<Boolean> = _searchLoading.asStateFlow()

    private val _searchError = MutableStateFlow<String?>(null)
    val searchError: StateFlow<String?> = _searchError.asStateFlow()
    
    private val _offlineCacheMessage = MutableStateFlow<String?>(null)
    val offlineCacheMessage: StateFlow<String?> = _offlineCacheMessage.asStateFlow()

    // --- Inconsistency State ---
    private val _inconsistencyLoading = MutableStateFlow(false)
    val inconsistencyLoading: StateFlow<Boolean> = _inconsistencyLoading.asStateFlow()

    private val _inconsistencyResult = MutableStateFlow<InconsistencyResponse?>(null)
    val inconsistencyResult: StateFlow<InconsistencyResponse?> = _inconsistencyResult.asStateFlow()

    private val _inconsistencyError = MutableStateFlow<String?>(null)
    val inconsistencyError: StateFlow<String?> = _inconsistencyError.asStateFlow()

    // --- Q&A State ---
    private val _qaLoading = MutableStateFlow(false)
    val qaLoading: StateFlow<Boolean> = _qaLoading.asStateFlow()

    private val _qaAnswer = MutableStateFlow<String?>(null)
    val qaAnswer: StateFlow<String?> = _qaAnswer.asStateFlow()
    
    private val _qaCitations = MutableStateFlow<List<String>>(emptyList())
    val qaCitations: StateFlow<List<String>> = _qaCitations.asStateFlow()

    private val _qaHallucinations = MutableStateFlow<List<String>>(emptyList())
    val qaHallucinations: StateFlow<List<String>> = _qaHallucinations.asStateFlow()

    private val _qaError = MutableStateFlow<String?>(null)
    val qaError: StateFlow<String?> = _qaError.asStateFlow()

    // --- Camera State ---
    private val _uploadLoading = MutableStateFlow(false)
    val uploadLoading: StateFlow<Boolean> = _uploadLoading.asStateFlow()

    private val _uploadSuccessId = MutableStateFlow<String?>(null)
    val uploadSuccessId: StateFlow<String?> = _uploadSuccessId.asStateFlow()

    private val _uploadError = MutableStateFlow<String?>(null)
    val uploadError: StateFlow<String?> = _uploadError.asStateFlow()

    private val _offlineVideoToRetry = MutableStateFlow<File?>(null)
    val offlineVideoToRetry: StateFlow<File?> = _offlineVideoToRetry.asStateFlow()

    init {
        viewModelScope.launch {
            connectivityObserver.isConnected.collect { connected ->
                _isConnected.value = connected
                if (connected) {
                    checkHealth()
                } else {
                    _healthStatus.value = "Offline"
                }
            }
        }
    }

    private fun checkHealth() {
        viewModelScope.launch {
            when (val result = repository.checkHealth()) {
                is Result.Success -> _healthStatus.value = "API: ${result.data.status}"
                is Result.Error -> _healthStatus.value = "API: Error"
                is Result.Offline -> _healthStatus.value = "API: Offline"
            }
        }
    }

    fun searchCases(query: String) {
        if (query.isBlank()) return
        viewModelScope.launch {
            _searchLoading.value = true
            _searchError.value = null
            _offlineCacheMessage.value = null

            when (val result = repository.searchCases(query, _isConnected.value)) {
                is Result.Success -> {
                    _searchResults.value = result.data
                }
                is Result.Error -> {
                    _searchError.value = result.message
                }
                is Result.Offline -> {
                    _searchResults.value = result.data ?: emptyList()
                    _offlineCacheMessage.value = result.message
                }
            }
            _searchLoading.value = false
        }
    }

    fun detectInconsistencies(docA: File, typeA: String, docB: File, typeB: String) {
        viewModelScope.launch {
            _inconsistencyLoading.value = true
            _inconsistencyError.value = null
            _inconsistencyResult.value = null

            when (val result = repository.detectInconsistencies(docA, typeA, docB, typeB)) {
                is Result.Success -> {
                    _inconsistencyResult.value = result.data
                }
                is Result.Error -> {
                    _inconsistencyError.value = result.message
                }
                is Result.Offline -> {
                    _inconsistencyError.value = "No connection. Cannot analyze documents offline."
                }
            }
            _inconsistencyLoading.value = false
        }
    }

    fun askQuestion(query: String) {
        if (query.isBlank()) return
        viewModelScope.launch {
            _qaLoading.value = true
            _qaError.value = null
            _qaAnswer.value = null
            _qaCitations.value = emptyList()
            _qaHallucinations.value = emptyList()

            when (val result = repository.askLegalQuestion(query)) {
                is Result.Success -> {
                    _qaAnswer.value = result.data.answer
                    _qaCitations.value = result.data.citations
                    _qaHallucinations.value = result.data.hallucinationFlags
                }
                is Result.Error -> {
                    _qaError.value = result.message
                }
                is Result.Offline -> {
                    _qaError.value = "No connection. Cannot ask questions offline."
                }
            }
            _qaLoading.value = false
        }
    }

    fun uploadVideo(videoFile: File) {
        viewModelScope.launch {
            _uploadLoading.value = true
            _uploadError.value = null
            _uploadSuccessId.value = null
            _offlineVideoToRetry.value = null

            if (!_isConnected.value) {
                _uploadError.value = "Will upload when connected"
                _offlineVideoToRetry.value = videoFile
                _uploadLoading.value = false
                return@launch
            }

            when (val result = repository.uploadVideo(videoFile)) {
                is Result.Success -> {
                    _uploadSuccessId.value = result.data.caseId
                    // delete file if needed, keeping it simple for now
                }
                is Result.Error -> {
                    _uploadError.value = result.message
                    _offlineVideoToRetry.value = videoFile
                }
                is Result.Offline -> {
                    _uploadError.value = "Will upload when connected"
                    _offlineVideoToRetry.value = videoFile
                }
            }
            _uploadLoading.value = false
        }
    }

    fun retryUpload() {
        val fileToRetry = _offlineVideoToRetry.value
        if (fileToRetry != null) {
            uploadVideo(fileToRetry)
        }
    }

    fun clearUploadState() {
        _uploadSuccessId.value = null
        _uploadError.value = null
    }

    fun clearSearchError() { _searchError.value = null }
    fun clearInconsistencyError() { _inconsistencyError.value = null }
    fun clearQaError() { _qaError.value = null }
}
