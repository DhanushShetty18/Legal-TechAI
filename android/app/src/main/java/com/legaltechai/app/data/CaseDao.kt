package com.legaltechai.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface CaseDao {
    @Query("SELECT * FROM cases ORDER BY insertedAt DESC LIMIT 10")
    suspend fun getRecentCases(): List<CaseEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCases(cases: List<CaseEntity>)

    // We keep it simple: insert cases on search. The user requested keeping the latest 10 strictly by insertion order.
    // To strictly keep only 10, we could delete older ones, but the user said "Never clear automatically",
    // just "keep latest 10 strictly by insertion order" which means display the latest 10.
    // So the GET query handles limiting to 10.
}
