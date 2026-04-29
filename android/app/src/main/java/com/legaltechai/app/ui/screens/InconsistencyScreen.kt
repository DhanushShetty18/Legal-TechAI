package com.legaltechai.app.ui.screens

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.legaltechai.app.network.Contradiction
import com.legaltechai.app.network.InconsistencyResponse
import java.io.File
import java.io.FileOutputStream

val DocTypes = listOf("FIR", "Witness Statement", "Charge Sheet", "Court Order")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InconsistencyScreen(
    loading: Boolean,
    result: InconsistencyResponse?,
    error: String?,
    onScan: (File, String, File, String) -> Unit,
    onErrorDismiss: () -> Unit
) {
    val context = LocalContext.current

    var docAUri by remember { mutableStateOf<Uri?>(null) }
    var docAName by remember { mutableStateOf<String?>(null) }
    var typeA by remember { mutableStateOf(DocTypes[0]) }

    var docBUri by remember { mutableStateOf<Uri?>(null) }
    var docBName by remember { mutableStateOf<String?>(null) }
    var typeB by remember { mutableStateOf(DocTypes[1]) }

    val launcherA = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            val name = getFileName(context, it)
            if (checkFileSize(context, it)) {
                docAUri = it
                docAName = name
            } else {
                Toast.makeText(context, "File exceeds 10MB limit", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val launcherB = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            val name = getFileName(context, it)
            if (checkFileSize(context, it)) {
                docBUri = it
                docBName = name
            } else {
                Toast.makeText(context, "File exceeds 10MB limit", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Analysing documents...", style = MaterialTheme.typography.bodyLarge)
                }
            }
        } else if (result != null) {
            // Results View
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium
            ) {
                Text(
                    text = "${result.contradictions.size} contradictions found",
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = result.summary, style = MaterialTheme.typography.bodyMedium)
            Spacer(modifier = Modifier.height(16.dp))
            
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(result.contradictions) { contradiction ->
                    ContradictionCard(contradiction)
                }
            }
        } else {
            // Input View
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                DocumentPickerColumn(
                    modifier = Modifier.weight(1f),
                    title = "Document A",
                    selectedName = docAName,
                    selectedType = typeA,
                    onTypeChange = { typeA = it },
                    onPickClick = { launcherA.launch("*/*") } // We filter in intent normally, but GetContent takes one mime. Let's use */* and validate
                )
                DocumentPickerColumn(
                    modifier = Modifier.weight(1f),
                    title = "Document B",
                    selectedName = docBName,
                    selectedType = typeB,
                    onTypeChange = { typeB = it },
                    onPickClick = { launcherB.launch("*/*") }
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            if (error != null) {
                Text(text = error, color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.height(8.dp))
            }

            Button(
                onClick = {
                    if (docAUri != null && docBUri != null) {
                        val fileA = uriToFile(context, docAUri!!, "docA")
                        val fileB = uriToFile(context, docBUri!!, "docB")
                        if (fileA != null && fileB != null) {
                            onScan(fileA, typeA, fileB, typeB)
                        } else {
                            Toast.makeText(context, "Error processing files", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        Toast.makeText(context, "Please select both documents", Toast.LENGTH_SHORT).show()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = docAUri != null && docBUri != null
            ) {
                Text("Scan for Contradictions")
            }
        }
    }
}

@Composable
fun DocumentPickerColumn(
    modifier: Modifier = Modifier,
    title: String,
    selectedName: String?,
    selectedType: String,
    onTypeChange: (String) -> Unit,
    onPickClick: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Column(modifier = modifier) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(8.dp))
        
        OutlinedButton(onClick = onPickClick, modifier = Modifier.fillMaxWidth()) {
            Text(selectedName ?: "Select PDF/TXT")
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text(selectedType)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DocTypes.forEach { type ->
                    DropdownMenuItem(
                        text = { Text(type) },
                        onClick = {
                            onTypeChange(type)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun ContradictionCard(contradiction: Contradiction) {
    val cardColor = when (contradiction.severity) {
        "HIGH" -> Color(0xFFC41E3A).copy(alpha = 0.2f) // RED
        "MEDIUM" -> Color(0xFFFFD700).copy(alpha = 0.2f) // YELLOW
        "LOW" -> Color(0xFF4CAF50).copy(alpha = 0.2f) // GREEN
        "PHYSICAL_IMPOSSIBILITY" -> Color(0xFFFF8C00).copy(alpha = 0.2f) // ORANGE
        else -> MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = cardColor)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = "Type: ${contradiction.type}", fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = "Quote A: \"${contradiction.quoteA}\"", style = MaterialTheme.typography.bodySmall)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = "Quote B: \"${contradiction.quoteB}\"", style = MaterialTheme.typography.bodySmall)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = "Explanation: ${contradiction.explanation}", style = MaterialTheme.typography.bodyMedium)
            if (contradiction.impossibilityReason != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = "Reason: ${contradiction.impossibilityReason}", style = MaterialTheme.typography.bodyMedium, color = Color.Red)
            }
        }
    }
}

private fun getFileName(context: Context, uri: Uri): String {
    var result: String? = null
    if (uri.scheme == "content") {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index != -1) {
                    result = cursor.getString(index)
                }
            }
        }
    }
    return result ?: uri.path?.let { File(it).name } ?: "unknown_file"
}

private fun checkFileSize(context: Context, uri: Uri): Boolean {
    var size = 0L
    context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val index = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (index != -1) {
                size = cursor.getLong(index)
            }
        }
    }
    return size <= 10 * 1024 * 1024 // 10MB
}

private fun uriToFile(context: Context, uri: Uri, prefix: String): File? {
    val file = File(context.cacheDir, "${prefix}_${System.currentTimeMillis()}")
    return try {
        context.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(file).use { output ->
                input.copyTo(output)
            }
        }
        file
    } catch (e: Exception) {
        null
    }
}
