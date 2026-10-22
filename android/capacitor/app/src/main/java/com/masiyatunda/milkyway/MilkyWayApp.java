package com.masiyatunda.milkyway;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

// Starts Firebase before any activity or push service runs. When the APK is built without
// google-services.json, it uses the Firebase client config the web layer saved from /api/fcm,
// so pushes also arrive while the app is closed.
public class MilkyWayApp extends Application {
    static final String PREFS = "milkyway_firebase";

    @Override
    public void onCreate() {
        super.onCreate();
        initFirebase(this);
    }

    static boolean firebaseReady(Context context) {
        return !FirebaseApp.getApps(context).isEmpty();
    }

    static boolean initFirebase(Context context) {
        if (firebaseReady(context)) return true;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String appId = prefs.getString("appId", "");
        String apiKey = prefs.getString("apiKey", "");
        String projectId = prefs.getString("projectId", "");
        String senderId = prefs.getString("senderId", "");
        if (appId.isEmpty() || apiKey.isEmpty() || projectId.isEmpty() || senderId.isEmpty()) return false;
        try {
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setApplicationId(appId)
                .setApiKey(apiKey)
                .setProjectId(projectId)
                .setGcmSenderId(senderId)
                .build();
            FirebaseApp.initializeApp(context, options);
            return true;
        } catch (Exception e) {
            return firebaseReady(context);
        }
    }
}
