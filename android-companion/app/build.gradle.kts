plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.lidar4.androidtechnician"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lidar4.androidtechnician"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}

kotlin {
    jvmToolchain(17)
}
