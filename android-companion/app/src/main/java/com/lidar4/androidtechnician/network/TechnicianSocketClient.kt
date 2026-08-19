package com.lidar4.androidtechnician.network

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.TimeUnit

class TechnicianSocketClient(
    private val onMessage: (String) -> Unit = {}
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()
    private var webSocket: WebSocket? = null

    fun connect(host: String, port: Int = 5000) {
        val request = Request.Builder().url("ws://$host:$port/ws/companion").build()
        webSocket?.cancel()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                Log.d(TAG, "Connected to technician host")
                sendEvent("status", "companion_connected")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                onMessage(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "Disconnected: $code $reason")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                Log.e(TAG, "Connection error", t)
            }
        })
    }

    fun sendEvent(type: String, message: String) {
        val escaped = message.replace("\\", "\\\\").replace("\"", "\\\"")
        webSocket?.send("{\"type\":\"$type\",\"message\":\"$escaped\",\"timestamp\":${System.currentTimeMillis()}}")
    }

    fun sendJson(json: String) {
        webSocket?.send(json)
    }

    fun sendFrame(bytes: ByteArray) {
        webSocket?.send(ByteString.of(*bytes))
    }

    fun disconnect() {
        webSocket?.close(1000, "connection stopped")
        webSocket = null
    }

    companion object {
        private const val TAG = "TechnicianSocket"
    }
}
