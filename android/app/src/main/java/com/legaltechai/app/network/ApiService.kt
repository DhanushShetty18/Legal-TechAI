package com.legaltechai.app.network

import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Query

interface ApiService {
    @GET("health")
    suspend fun checkHealth(): Response<HealthResponse>

    @Multipart
    @POST("ingest/upload")
    suspend fun uploadVideo(
        @Part video: MultipartBody.Part
    ): Response<UploadResponse>

    @GET("cases/")
    suspend fun searchCases(
        @Query("query") query: String
    ): Response<List<CaseResponse>>

    @Multipart
    @POST("inconsistency/detect-inconsistencies")
    suspend fun detectInconsistencies(
        @Part documentA: MultipartBody.Part,
        @Part typeA: MultipartBody.Part,
        @Part documentB: MultipartBody.Part,
        @Part typeB: MultipartBody.Part
    ): Response<InconsistencyResponse>

    @POST("rag/query")
    suspend fun askLegalQuestion(
        @Body request: RagQueryRequest
    ): Response<RagResponse>
}
