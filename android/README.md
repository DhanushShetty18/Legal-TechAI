# Legal-TechAI Android Application

This is the Android mobile application for the Legal-TechAI platform, designed to serve district court clerks, lawyers, and citizens in Indian cities.

## Architecture & Tech Stack
- **UI:** Jetpack Compose + Material 3
- **Architecture:** MVVM (Model-View-ViewModel) + Repository Pattern
- **Networking:** Retrofit2 + OkHttp3
- **Local Database:** Room Database
- **Asynchronous:** Kotlin Coroutines & StateFlow
- **Camera:** CameraX

## Features
1. **Dashboard:** Status bar showing health of the API backend.
2. **File a Case (CameraX):** Record a video complaint directly from the app. Uploads securely to the backend. Saves locally if offline with manual retry.
3. **Search Case:** Search cases by ID or query. Caches the latest 10 results strictly by insertion order using Room.
4. **Check Inconsistencies:** Select two PDF/TXT files (up to 10MB) to scan for factual, logical, and temporal inconsistencies under BNS/BNSS/BSA.
5. **Ask Legal Q&A:** A dedicated Q&A portal with quick-chips for common questions, citation highlighting, and hallucination flagging.

## Build and Run
1. Open this `android` folder in **Android Studio Hedgehog** (or later).
2. Wait for Gradle sync to complete.
3. Click **Run** (`Shift + F10`) or use terminal `./gradlew assembleDebug`.
4. Ensure you have an emulator running API 26 or higher, or deploy to a physical device.

## Note on Offline Capabilities
The app implements a `ConnectivityObserver`. When offline:
- A persistent banner will appear at the top.
- The `Search Case` feature will show the cached recent results from Room.
- The `File a Case` feature will allow recording and saving the video, with a button to upload when the connection returns.
