package com.lidar4.androidtechnician

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val title = TextView(this).apply {
            text = "AI Android Technician"
            textSize = 24f
            setPadding(24, 32, 24, 16)
        }
        val status = TextView(this).apply {
            text = "Step 1: Connect this phone to the technician hotspot, then start the diagnostic service."
            textSize = 16f
            setPadding(24, 8, 24, 24)
        }
        val start = Button(this).apply {
            text = "Start authorized diagnostics"
            setOnClickListener {
                status.text = "Diagnostic service foundation is ready. Network discovery/service transport will be added next."
            }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(title)
            addView(status)
            addView(start)
        })
    }
}
