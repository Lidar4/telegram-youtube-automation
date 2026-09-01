package com.lidar4.androidtechnician.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.lifecycle.LifecycleService
import com.lidar4.androidtechnician.diagnostics.DiagnosticCollector
import com.lidar4.androidtechnician.network.TechnicianSocketClient
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class ScreenShareService : LifecycleService() {
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var socketClient: TechnicianSocketClient? = null
    private var lastFrameAt = 0L
    private val actionHandler by lazy { ActionHandler(this) }

    companion object {
        const val ACTION_START = "com.lidar4.androidtechnician.action.START"
        const val ACTION_STOP = "com.lidar4.androidtechnician.action.STOP"
        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"
        const val EXTRA_HOST = "extra_host"
        const val EXTRA_PORT = "extra_port"
        private const val CHANNEL_ID = "screen_share"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_START -> {
                startForegroundNotification()
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                val data = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_RESULT_DATA)
                }
                val host = intent.getStringExtra(EXTRA_HOST)
                if (host != null && data != null) {
                    startProjection(resultCode, data, host, intent.getIntExtra(EXTRA_PORT, 5000))
                } else {
                    stopSelf()
                }
            }
            ACTION_STOP -> {
                stopScreenStreaming()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun startForegroundNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notification: Notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("AI Android Technician")
            .setContentText("Screen sharing is active")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(1, notification)
        }
    }

    private fun startProjection(resultCode: Int, data: Intent, host: String, port: Int) {
        // Safely clean up any existing projection/display/reader resources before starting
        cleanupResources()

        socketClient?.disconnect()
        socketClient = TechnicianSocketClient { text -> handleHostMessage(text) }
        socketClient?.connect(host, port)
        socketClient?.sendEvent("status", "screen_sharing_started")

        // Send a handshake event with device identification details immediately
        try {
            val handshake = JSONObject()
                .put("type", "handshake")
                .put("device_id", "${Build.MANUFACTURER}_${Build.MODEL}_${Build.ID}".replace(" ", "_"))
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("android_version", Build.VERSION.RELEASE)
                .put("sdk", Build.VERSION.SDK_INT)
            socketClient?.sendJson(handshake.toString())
        } catch (e: Exception) {}

        val projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, data)
        mediaProjection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopScreenStreaming()
                stopSelf()
            }
        }, null)
        setupVirtualDisplay()
    }

    private fun cleanupResources() {
        try {
            virtualDisplay?.release()
        } catch (e: Exception) {}
        virtualDisplay = null

        try {
            imageReader?.close()
        } catch (e: Exception) {}
        imageReader = null

        try {
            mediaProjection?.stop()
        } catch (e: Exception) {}
        mediaProjection = null
    }

    private fun handleHostMessage(text: String) {
        try {
            val message = JSONObject(text)
            when (message.optString("type")) {
                "pairing_challenge" -> handlePairingChallenge(message)
                "diagnostic_request" -> handleDiagnosticRequest(message)
                "repair_request" -> handleRepairRequest(message)
            }
        } catch (e: Exception) {
            socketClient?.sendEvent("error", "host_message_error: ${e.message ?: "unknown"}")
        }
    }

    private fun handlePairingChallenge(message: JSONObject) {
        val pin = message.optString("pin")
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            android.widget.Toast.makeText(
                this@ScreenShareService,
                "Pairing Request PIN: $pin\nEnter this code in your Master Dashboard to authorize connection.",
                android.widget.Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun handleDiagnosticRequest(message: JSONObject) {
        val requestId = message.optString("request_id")
        val problem = message.optString("problem")
        if (requestId.isBlank()) {
            socketClient?.sendEvent("error", "diagnostic_request_missing_id")
            return
        }
        try {
            socketClient?.sendEvent("status", "diagnostic_started")
            val report = DiagnosticCollector(this).collect(requestId, problem)
            socketClient?.sendJson(report)
            socketClient?.sendEvent("status", "diagnostic_completed")
        } catch (e: Exception) {
            socketClient?.sendEvent("error", "diagnostic_request_error: ${e.message ?: "unknown"}")
        }
    }

    private fun handleRepairRequest(message: JSONObject) {
        val approvalId = message.optString("approval_id")
        val actions = message.optJSONArray("actions")
        if (approvalId.isBlank() || actions == null) {
            socketClient?.sendEvent("repair_result", "invalid_repair_request")
            return
        }

        socketClient?.sendEvent("status", "repair_started:$approvalId")
        var overallStatus = "success"
        var overallMessage = "Approved repair actions processed."

        for (i in 0 until actions.length()) {
            val action = actions.optJSONObject(i) ?: continue
            val (status, messageText) = actionHandler.executeAction(action)
            socketClient?.sendJson(
                JSONObject()
                    .put("type", "repair_result")
                    .put("approval_id", approvalId)
                    .put("action_id", action.optString("id", "unknown"))
                    .put("status", status)
                    .put("message", messageText)
                    .toString()
            )
            if (status == "failed") {
                overallStatus = "failed"
                overallMessage = messageText
                break
            }
            if (status == "requires_user_action") {
                overallStatus = "requires_user_action"
                overallMessage = messageText
            }
        }

        socketClient?.sendJson(
            JSONObject()
                .put("type", "repair_result")
                .put("approval_id", approvalId)
                .put("status", overallStatus)
                .put("message", overallMessage)
                .put("completed", overallStatus == "success")
                .toString()
        )
        socketClient?.sendEvent("status", "repair_finished:$approvalId:$overallStatus")
    }

    private fun setupVirtualDisplay() {
        val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        val width = 720
        val height = (width.toLong() * metrics.heightPixels / metrics.widthPixels).toInt().coerceAtLeast(1)

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "AIAndroidTechnician",
            width,
            height,
            metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface,
            null,
            null
        )

        imageReader?.setOnImageAvailableListener({ reader ->
            val image = try {
                reader.acquireLatestImage()
            } catch (e: Exception) {
                null
            } ?: return@setOnImageAvailableListener

            val now = System.currentTimeMillis()
            if (now - lastFrameAt < 150L) {
                image.close() // Always close immediately to drain the ImageReader queue and prevent freeze
                return@setOnImageAvailableListener
            }
            try {
                val plane = image.planes[0]
                val bitmapWidth = width + (plane.rowStride - plane.pixelStride * width) / plane.pixelStride
                val bitmap = Bitmap.createBitmap(bitmapWidth, height, Bitmap.Config.ARGB_8888)
                bitmap.copyPixelsFromBuffer(plane.buffer)
                val output = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 55, output)
                socketClient?.sendFrame(output.toByteArray())
                bitmap.recycle()
                lastFrameAt = now
            } catch (t: Throwable) {
                socketClient?.sendEvent("error", t.message ?: "frame_error")
            } finally {
                image.close()
            }
        }, null)
    }

    private fun stopScreenStreaming() {
        socketClient?.sendEvent("status", "screen_sharing_stopped")
        socketClient?.disconnect()
        socketClient = null
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
        mediaProjection?.stop()
        mediaProjection = null
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    override fun onDestroy() {
        stopScreenStreaming()
        super.onDestroy()
    }

    override fun onBind(intent: Intent): IBinder? = super.onBind(intent)
}
