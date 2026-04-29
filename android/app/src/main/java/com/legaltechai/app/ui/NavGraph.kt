package com.legaltechai.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.legaltechai.app.ui.screens.*

sealed class Screen(val route: String, val title: String) {
    object Home : Screen("home", "Home")
    object Camera : Screen("camera", "File a Case")
    object Search : Screen("search", "Search Case")
    object Inconsistency : Screen("inconsistency", "Check Inconsistencies")
    object Qa : Screen("qa", "Ask Legal Q&A")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavGraph(
    navController: NavHostController = rememberNavController(),
    viewModel: MainViewModel = viewModel()
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val isConnected by viewModel.isConnected.collectAsState()

    Scaffold(
        topBar = {
            Column {
                if (!isConnected) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.errorContainer
                    ) {
                        Text(
                            text = "You are offline. Some features unavailable.",
                            modifier = Modifier.padding(12.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
                
                if (currentRoute != Screen.Home.route) {
                    TopAppBar(
                        title = { Text(getScreenTitle(currentRoute)) },
                        navigationIcon = {
                            IconButton(onClick = { navController.navigateUp() }) {
                                Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            titleContentColor = MaterialTheme.colorScheme.onPrimary,
                            navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            NavHost(navController = navController, startDestination = Screen.Home.route) {
                composable(Screen.Home.route) {
                    val healthStatus by viewModel.healthStatus.collectAsState()
                    HomeScreen(
                        healthStatus = healthStatus,
                        onNavigateToCamera = { navController.navigate(Screen.Camera.route) },
                        onNavigateToSearch = { navController.navigate(Screen.Search.route) },
                        onNavigateToInconsistency = { navController.navigate(Screen.Inconsistency.route) },
                        onNavigateToQa = { navController.navigate(Screen.Qa.route) }
                    )
                }

                composable(Screen.Camera.route) {
                    val loading by viewModel.uploadLoading.collectAsState()
                    val successId by viewModel.uploadSuccessId.collectAsState()
                    val error by viewModel.uploadError.collectAsState()
                    val offlineVideo by viewModel.offlineVideoToRetry.collectAsState()

                    CameraScreen(
                        uploadLoading = loading,
                        uploadSuccessId = successId,
                        uploadError = error,
                        offlineVideoToRetry = offlineVideo,
                        onUpload = { file -> viewModel.uploadVideo(file) },
                        onRetry = { viewModel.retryUpload() },
                        onClearState = { viewModel.clearUploadState() }
                    )
                }

                composable(Screen.Search.route) {
                    val results by viewModel.searchResults.collectAsState()
                    val loading by viewModel.searchLoading.collectAsState()
                    val error by viewModel.searchError.collectAsState()
                    val offlineMessage by viewModel.offlineCacheMessage.collectAsState()

                    SearchScreen(
                        searchResults = results,
                        isLoading = loading,
                        error = error,
                        offlineMessage = offlineMessage,
                        onSearch = { query -> viewModel.searchCases(query) },
                        onErrorDismiss = { viewModel.clearSearchError() }
                    )
                }

                composable(Screen.Inconsistency.route) {
                    val loading by viewModel.inconsistencyLoading.collectAsState()
                    val result by viewModel.inconsistencyResult.collectAsState()
                    val error by viewModel.inconsistencyError.collectAsState()

                    InconsistencyScreen(
                        loading = loading,
                        result = result,
                        error = error,
                        onScan = { docA, typeA, docB, typeB -> 
                            viewModel.detectInconsistencies(docA, typeA, docB, typeB) 
                        },
                        onErrorDismiss = { viewModel.clearInconsistencyError() }
                    )
                }

                composable(Screen.Qa.route) {
                    val answer by viewModel.qaAnswer.collectAsState()
                    val citations by viewModel.qaCitations.collectAsState()
                    val hallucinations by viewModel.qaHallucinations.collectAsState()
                    val loading by viewModel.qaLoading.collectAsState()
                    val error by viewModel.qaError.collectAsState()

                    QaScreen(
                        answer = answer,
                        citations = citations,
                        hallucinations = hallucinations,
                        isLoading = loading,
                        error = error,
                        onAsk = { query -> viewModel.askQuestion(query) },
                        onErrorDismiss = { viewModel.clearQaError() }
                    )
                }
            }
        }
    }
}

private fun getScreenTitle(route: String?): String {
    return when (route) {
        Screen.Camera.route -> Screen.Camera.title
        Screen.Search.route -> Screen.Search.title
        Screen.Inconsistency.route -> Screen.Inconsistency.title
        Screen.Qa.route -> Screen.Qa.title
        else -> "Legal-TechAI"
    }
}
