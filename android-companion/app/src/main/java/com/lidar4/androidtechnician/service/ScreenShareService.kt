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
import com.lidar4.androidtechnician.network.TechnicianSocketClient
import java.io.ByteArrayOutputStream

class ScreenShareService : LifecycleService() {
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var socketClient: TechnicianSocketClient? = null
    private var lastFrameAt = 0L

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
        socketClient?.disconnect()
        socketClient = TechnicianSocketClient()
        socketClient?.connect(host, port)
        socketClient?.sendEvent("status", "screen_sharing_started")

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
            val now = System.currentTimeMillis()
            if (now - lastFrameAt < 150L) return@setOnImageAvailableListener
            val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
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
