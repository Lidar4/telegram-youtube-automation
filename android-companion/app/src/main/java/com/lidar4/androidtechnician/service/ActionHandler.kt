package com.lidar4.androidtechnician.service

import android.content.Context
import android.content.Intent
import android.provider.Settings
import org.json.JSONObject

class ActionHandler(private val context: Context) {

    fun executeAction(actionJson: JSONObject): Pair<String, String> {
        val actionId = actionJson.optString("id", "unknown")

        return try {
            when (actionId) {
                "open_network_settings" -> {
                    val intent = Intent(Settings.ACTION_WIRELESS_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    Pair("requires_user_action", "Opened network settings for user verification.")
                }
                "open_display_settings" -> {
                    val intent = Intent(Settings.ACTION_DISPLAY_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    Pair("requires_user_action", "Opened display settings for user verification.")
                }
                "clear_app_cache_prompt" -> {
                    val intent = Intent(Settings.ACTION_APPLICATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    Pair("requires_user_action", "Opened application settings for user-managed cache clearing.")
                }
                "destructive_factory_reset_request" -> {
                    val intent = Intent(Settings.ACTION_PRIVACY_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    Pair("requires_user_action", "Factory reset requires explicit physical confirmation in Android settings.")
                }
                else -> Pair("failed", "Unsupported or unrecognized action ID: $actionId")
            }
        } catch (e: Exception) {
            Pair("failed", e.localizedMessage ?: "Execution exception")
        }
    }
}
