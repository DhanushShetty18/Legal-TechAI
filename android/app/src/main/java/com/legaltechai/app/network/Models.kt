package com.legaltechai.app.network

import com.google.gson.annotations.SerializedName

data class HealthResponse(
    val status: String
)

data class CaseResponse(
    @SerializedName("case_id") val caseId: String,
    val title: String,
    val status: String,
    @SerializedName("created_at") val createdAt: String
)

data class UploadResponse(
    @SerializedName("case_id") val caseId: String,
    val message: String
)

data class InconsistencyResponse(
    val summary: String,
    val contradictions: List<Contradiction>
)

data class Contradiction(
    val type: String, // FACTUAL, TEMPORAL, LOGICAL, PHYSICAL_IMPOSSIBILITY
    @SerializedName("quote_a") val quoteA: String,
    @SerializedName("quote_b") val quoteB: String,
    val explanation: String,
    @SerializedName("impossibility_reason") val impossibilityReason: String?,
    val severity: String // HIGH, MEDIUM, LOW, PHYSICAL_IMPOSSIBILITY
)

data class RagQueryRequest(
    val query: String
)

data class RagResponse(
    val answer: String,
    val citations: List<String>,
    @SerializedName("hallucination_flags") val hallucinationFlags: List<String>
)
