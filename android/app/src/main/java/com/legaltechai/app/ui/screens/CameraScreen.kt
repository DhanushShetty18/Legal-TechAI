package com.legaltechai.app.ui.screens

import android.Manifest
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale

@Composable
fun CameraScreen(
    uploadLoading: Boolean,
    uploadSuccessId: String?,
    uploadError: String?,
    offlineVideoToRetry: File?,
    onUpload: (File) -> Unit,
    onRetry: () -> Unit,
    onClearState: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasPermissions by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var recordedFile by remember { mutableStateOf<File?>(null) }
    var isRecording by remember { mutableStateOf(false) }
    
    val previewView = remember { PreviewView(context) }
    val videoCapture = remember {
        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.HIGHEST))
            .build()
        VideoCapture.withOutput(recorder)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasPermissions = permissions[Manifest.permission.CAMERA] == true &&
                permissions[Manifest.permission.RECORD_AUDIO] == true
    }

    LaunchedEffect(Unit) {
        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO
            )
        )
    }

    LaunchedEffect(hasPermissions) {
        if (hasPermissions) {
            val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()
                val preview = androidx.camera.core.Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        videoCapture
                    )
                } catch (e: Exception) {
                    Toast.makeText(context, "Camera bind error", Toast.LENGTH_SHORT).show()
                }
            }, ContextCompat.getMainExecutor(context))
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (!hasPermissions) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Camera and Audio permissions are required.")
            }
            return@Column
        }

        if (recordedFile == null && offlineVideoToRetry == null && uploadSuccessId == null) {
            // Camera Preview
            Box(modifier = Modifier.weight(1f)) {
                AndroidView(
                    factory = { previewView },
                    modifier = Modifier.fillMaxSize()
                )
                
                Button(
                    onClick = {
                        if (isRecording) {
                            recording?.stop()
                            isRecording = false
                        } else {
                            val name = SimpleDateFormat("yyyy-MM-dd-HH-mm-ss-SSS", Locale.US)
                                .format(System.currentTimeMillis()) + ".mp4"
                            val file = File(context.cacheDir, name)
                            val outputOptions = FileOutputOptions.Builder(file).build()
                            
                            recording = videoCapture.output
                                .prepareRecording(context, outputOptions)
                                .withAudioEnabled()
                                .start(ContextCompat.getMainExecutor(context)) { event ->
                                    when(event) {
                                        is VideoRecordEvent.Start -> {
                                            isRecording = true
                                        }
                                        is VideoRecordEvent.Finalize -> {
                                            if (!event.hasError()) {
                                                recordedFile = file
                                            } else {
                                                recording?.close()
                                                recording = null
                                                isRecording = false
                                            }
                                        }
                                    }
                                }
                        }
                    },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 32.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isRecording) Color.Red else MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text(if (isRecording) "Stop Recording" else "Record Complaint")
                }
            }
            Text(
                text = "Your filing is cryptographically secured and cannot be tampered with",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            )
        } else {
            // Post-recording / Upload state
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                val fileToShow = recordedFile ?: offlineVideoToRetry
                
                if (uploadSuccessId != null) {
                    Icon(
                        androidx.compose.material.icons.Icons.Default.CheckCircle,
                        contentDescription = "Success",
                        tint = Color.Green,
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Filing Submitted Successfully!", style = MaterialTheme.typography.titleLarge)
                    Text("Case ID: $uploadSuccessId", style = MaterialTheme.typography.bodyLarge)
                    Spacer(modifier = Modifier.height(32.dp))
                    Button(onClick = {
                        recordedFile = null
                        onClearState()
                    }) {
                        Text("Record Another")
                    }
                } else if (uploadLoading) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Uploading securely...", style = MaterialTheme.typography.bodyMedium)
                } else {
                    Text(
                        "Video Ready for Submission",
                        style = MaterialTheme.typography.titleLarge
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Size: ${(fileToShow?.length() ?: 0) / (1024 * 1024)} MB",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    
                    Spacer(modifier = Modifier.height(32.dp))
                    
                    if (uploadError != null) {
                        Text(
                            text = uploadError,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = onRetry) {
                            Text("Retry Upload")
                        }
                    } else {
                        Button(onClick = { fileToShow?.let { onUpload(it) } }) {
                            Text("Submit Filing")
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    TextButton(onClick = {
                        recordedFile = null
                        onClearState()
                    }) {
                        Text("Discard and Rerecord")
                    }
                }
            }
        }
    }
}
