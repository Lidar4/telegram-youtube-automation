package com.lidar4.androidtechnician.diagnostics

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.StatFs
import org.json.JSONObject

class DiagnosticCollector(private val context: Context) {

    fun collect(requestId: String, problem: String): String {
        val report = JSONObject()
            .put("type", "diagnostic_report")
            .put("request_id", requestId)
            .put("problem", problem)
            .put("timestamp", System.currentTimeMillis())
            .put("device", deviceInfo())
            .put("battery", batteryInfo())
            .put("network", networkInfo())
            .put("storage", storageInfo())

        return report.toString()
    }

    private fun deviceInfo(): JSONObject = JSONObject()
        .put("manufacturer", Build.MANUFACTURER)
        .put("model", Build.MODEL)
        .put("android_version", Build.VERSION.RELEASE)
        .put("sdk", Build.VERSION.SDK_INT)

    private fun batteryInfo(): JSONObject {
        val manager = context.getSystemService(BatteryManager::class.java)
        val level = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        return JSONObject().put("level_percent", level)
    }

    private fun networkInfo(): JSONObject {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager?.activeNetwork
        val capabilities = network?.let { manager.getNetworkCapabilities(it) }
        return JSONObject()
            .put("connected", capabilities != null)
            .put("transport_wifi", capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true)
            .put("transport_cellular", capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true)
            .put("validated", capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
    }

    private fun storageInfo(): JSONObject {
        val stat = StatFs(context.filesDir.absolutePath)
        val total = stat.totalBytes
        val available = stat.availableBytes
        return JSONObject()
            .put("total_bytes", total)
            .put("available_bytes", available)
            .put("used_percent", if (total > 0) ((total - available) * 100 / total) else 0)
    }
}
