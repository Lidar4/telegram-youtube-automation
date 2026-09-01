package com.lidar4.androidtechnician

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.lidar4.androidtechnician.service.ScreenShareService

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var shareButton: Button
    private var discovery: NsdManager.DiscoveryListener? = null
    private var host: String? = null
    private var port = 5000

    private val captureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode != RESULT_OK || result.data == null) {
            status.text = "Screen sharing permission was not granted."
            return@registerForActivityResult
        }
        val targetHost = host
        if (targetHost == null) {
            status.text = "Technician host not found. Connect both phones to the same hotspot."
            return@registerForActivityResult
        }
        val serviceIntent = Intent(this, ScreenShareService::class.java).apply {
            action = ScreenShareService.ACTION_START
            putExtra(ScreenShareService.EXTRA_RESULT_CODE, result.resultCode)
            putExtra(ScreenShareService.EXTRA_RESULT_DATA, result.data)
            putExtra(ScreenShareService.EXTRA_HOST, targetHost)
            putExtra(ScreenShareService.EXTRA_PORT, port)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(serviceIntent)
        else startService(serviceIntent)
        status.text = "Screen sharing active → $targetHost:$port"
        shareButton.isEnabled = false
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val title = TextView(this).apply {
            text = "AI Android Technician"
            textSize = 24f
            setPadding(24, 28, 24, 12)
        }
        status = TextView(this).apply {
            text = "Searching for technician host…"
            textSize = 16f
            setPadding(24, 12, 24, 20)
        }
        shareButton = Button(this).apply {
            text = "Share screen"
            isEnabled = false
        }
        shareButton.setOnClickListener {
            val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            captureLauncher.launch(manager.createScreenCaptureIntent())
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(16, 16, 16, 16)
            addView(title)
            addView(status)
            addView(shareButton)
        })
        discoverTechnician()
    }

    private fun discoverTechnician() {
        val manager = getSystemService(Context.NSD_SERVICE) as NsdManager
        discovery?.let { runCatching { manager.stopServiceDiscovery(it) } }
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) { status.text = "Searching local hotspot…" }
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                status.text = "Local discovery failed ($errorCode)."
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (!serviceInfo.serviceType.contains("_otgtech")) return
                manager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {}
                    override fun onServiceResolved(info: NsdServiceInfo) {
                        host = info.host?.hostAddress
                        port = info.port
                        runOnUiThread {
                            status.text = "Technician found: $host:$port"
                            shareButton.isEnabled = host != null
                        }
                    }
                })
            }
        }
        discovery = listener
        manager.discoverServices("_otgtech._tcp.", NsdManager.PROTOCOL_DNS_SD, listener)
    }

    override fun onDestroy() {
        discovery?.let {
            runCatching { (getSystemService(Context.NSD_SERVICE) as NsdManager).stopServiceDiscovery(it) }
        }
        super.onDestroy()
    }
}
