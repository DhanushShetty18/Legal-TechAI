package com.legaltechai.app.data

import android.content.Context
import com.legaltechai.app.network.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.net.SocketTimeoutException
import java.net.UnknownHostException

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String) : Result<Nothing>()
    data class Offline<T>(val data: T?, val message: String) : Result<T>()
}

class AppRepository(context: Context) {
    private val api = RetrofitClient.apiService
    private val caseDao = AppDatabase.getDatabase(context).caseDao()

    suspend fun checkHealth(): Result<HealthResponse> = safeApiCall { api.checkHealth() }

    suspend fun uploadVideo(videoFile: File): Result<UploadResponse> = withContext(Dispatchers.IO) {
        val requestFile = videoFile.asRequestBody("video/mp4".toMediaTypeOrNull())
        val body = MultipartBody.Part.createFormData("file", videoFile.name, requestFile)
        safeApiCall { api.uploadVideo(body) }
    }

    suspend fun searchCases(query: String, isConnected: Boolean): Result<List<CaseResponse>> = withContext(Dispatchers.IO) {
        if (!isConnected) {
            val cachedCases = caseDao.getRecentCases().map { it.toDomainModel() }
            return@withContext Result.Offline(cachedCases, "Showing last saved results. Connect to refresh.")
        }

        try {
            val response = api.searchCases(query)
            if (response.isSuccessful) {
                response.body()?.let { cases ->
                    // Save to Room DB
                    caseDao.insertCases(cases.map { it.toEntity() })
                    Result.Success(cases)
                } ?: Result.Error("Empty response")
            } else {
                handleErrorResponse(response.code())
            }
        } catch (e: Exception) {
            handleException(e)
        }
    }

    suspend fun detectInconsistencies(
        docAFile: File, typeA: String,
        docBFile: File, typeB: String
    ): Result<InconsistencyResponse> = withContext(Dispatchers.IO) {
        val reqA = docAFile.asRequestBody("application/octet-stream".toMediaTypeOrNull())
        val partA = MultipartBody.Part.createFormData("document_a", docAFile.name, reqA)
        val typeAPart = MultipartBody.Part.createFormData("type_a", typeA)

        val reqB = docBFile.asRequestBody("application/octet-stream".toMediaTypeOrNull())
        val partB = MultipartBody.Part.createFormData("document_b", docBFile.name, reqB)
        val typeBPart = MultipartBody.Part.createFormData("type_b", typeB)

        safeApiCall { api.detectInconsistencies(partA, typeAPart, partB, typeBPart) }
    }

    suspend fun askLegalQuestion(query: String): Result<RagResponse> = safeApiCall {
        api.askLegalQuestion(RagQueryRequest(query))
    }

    private suspend fun <T> safeApiCall(call: suspend () -> retrofit2.Response<T>): Result<T> = withContext(Dispatchers.IO) {
        try {
            val response = call()
            if (response.isSuccessful) {
                response.body()?.let {
                    Result.Success(it)
                } ?: Result.Error("Empty response")
            } else {
                handleErrorResponse(response.code())
            }
        } catch (e: Exception) {
            handleException(e)
        }
    }

    private fun <T> handleErrorResponse(code: Int): Result<T> {
        return when (code) {
            500 -> Result.Error("Server error. Our team has been notified.")
            else -> Result.Error("Error connecting to server. Code: $code")
        }
    }

    private fun <T> handleException(e: Exception): Result<T> {
        return when (e) {
            is UnknownHostException -> Result.Error("No connection")
            is SocketTimeoutException -> Result.Error("Server taking too long. Try again.")
            else -> Result.Error("An unexpected error occurred.")
        }
    }
}
