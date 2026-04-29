package com.legaltechai.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.legaltechai.app.network.CaseResponse

@Entity(tableName = "cases")
data class CaseEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val caseId: String,
    val title: String,
    val status: String,
    val createdAt: String,
    val insertedAt: Long = System.currentTimeMillis() // To track insertion order
)

fun CaseEntity.toDomainModel() = CaseResponse(
    caseId = caseId,
    title = title,
    status = status,
    createdAt = createdAt
)

fun CaseResponse.toEntity() = CaseEntity(
    caseId = caseId,
    title = title,
    status = status,
    createdAt = createdAt
)
