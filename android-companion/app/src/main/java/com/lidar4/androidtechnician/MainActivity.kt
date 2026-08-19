package com.lidar4.androidtechnician

import android.app.Activity
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var status: TextView
    private var discovery: NsdManager.DiscoveryListener? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val title = TextView(this).apply {
            text = "AI Android Technician"
            textSize = 24f
            setPadding(24, 32, 24, 16)
        }
        status = TextView(this).apply {
            text = "Connect this phone to the technician hotspot. Looking for the local technician service…"
            textSize = 16f
            setPadding(24, 8, 24, 24)
        }
        val start = Button(this).apply {
            text = "Find technician service"
            setOnClickListener { discoverTechnician() }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(title)
            addView(status)
            addView(start)
        })

        discoverTechnician()
    }

    private fun discoverTechnician() {
        status.text = "Searching this local network for an authorized technician service…"
        val manager = getSystemService(Context.NSD_SERVICE) as NsdManager
        discovery?.let { manager.stopServiceDiscovery(it) }

        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                runOnUiThread { status.text = "Local discovery unavailable. Check that both phones are on the same hotspot." }
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                manager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {}
                    override fun onServiceResolved(info: NsdServiceInfo) {
                        val host = info.host?.hostAddress ?: return
                        val port = info.port
                        runOnUiThread { status.text = "Technician service found at $host:$port. Checking connection…" }
                        thread {
                            val ok = try {
                                val connection = URL("http://$host:$port/api/health").openConnection() as HttpURLConnection
                                connection.connectTimeout = 3000
                                connection.readTimeout = 3000
                                connection.requestMethod = "GET"
                                connection.responseCode in 200..299
                            } catch (_: Exception) { false }
                            runOnUiThread {
                                status.text = if (ok) {
                                    "Connected to the authorized technician service. Diagnostics can now be requested."
                                } else {
                                    "Service was discovered, but the health check failed."
                                }
                            }
                        }
                    }
                })
            }
        }
        discovery = listener
        manager.discoverServices("_otgtech._tcp.", NsdManager.PROTOCOL_DNS_SD, listener)
    }

    override fun onDestroy() {
        super.onDestroy()
        discovery?.let {
            try { (getSystemService(Context.NSD_SERVICE) as NsdManager).stopServiceDiscovery(it) } catch (_: Exception) {}
        }
    }
}
