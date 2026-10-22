package com.masiyatunda.milkyway;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.UUID;

// Lets the web layer read the installed APK version (for update prompts) and hand over the
// Firebase client config so push notifications work without rebuilding the APK. It also receives
// photos, videos and text shared to MilkyWay from the system share sheet (see AndroidManifest.xml).
@CapacitorPlugin(name = "MilkyWayNative")
public class MilkyWayNativePlugin extends Plugin {
    static final long MAX_SHARED_BYTES = 100L * 1024 * 1024;
    static final int MAX_SHARED_FILES = 10;
    static final int MAX_CHUNK = 1024 * 1024;

    // The latest share, kept until the web layer clears it. Files are copied into the app cache because
    // the read permission on the sender's content:// URIs ends with the activity.
    private volatile JSObject pendingShare;

    @Override
    public void load() {
        receiveShare(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        receiveShare(intent);
    }

    private void receiveShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        // Clear the action so a reload or rotation does not deliver the same share twice.
        intent.setAction(Intent.ACTION_MAIN);
        ArrayList<Uri> uris = sharedUris(intent, action);
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        new Thread(() -> {
            JSObject share = new JSObject();
            share.put("shareId", UUID.randomUUID().toString());
            JSArray items = new JSArray();
            int skipped = 0;
            File dir = shareDir(true);
            for (Uri uri : uris) {
                JSObject item = items.length() < MAX_SHARED_FILES ? copyShared(uri, dir) : null;
                if (item == null) skipped++;
                else items.put(item);
            }
            share.put("items", items);
            share.put("skipped", skipped);
            if (text != null) share.put("text", text);
            if (subject != null) share.put("subject", subject);
            pendingShare = share;
            notifyListeners("shareReceived", share, true);
        }).start();
    }

    private static ArrayList<Uri> sharedUris(Intent intent, String action) {
        ArrayList<Uri> uris = new ArrayList<>();
        try {
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) uris.addAll(list);
            } else {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) uris.add(uri);
            }
        } catch (Exception ignored) {}
        ClipData clip = intent.getClipData();
        if (uris.isEmpty() && clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) uris.add(uri);
            }
        }
        return uris;
    }

    // Copies one shared photo/video into the cache. Only content:// URIs are accepted so another app
    // cannot point MilkyWay at its own private files.
    private JSObject copyShared(Uri uri, File dir) {
        if (!ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) return null;
        ContentResolver resolver = getContext().getContentResolver();
        String type = resolver.getType(uri);
        if (type == null || !(type.startsWith("image/") || type.startsWith("video/"))) return null;
        String name = "shared";
        long declared = -1;
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn);
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) declared = cursor.getLong(sizeColumn);
            }
        } catch (Exception ignored) {}
        if (declared > MAX_SHARED_BYTES) return null;
        String id = UUID.randomUUID().toString();
        File target = new File(dir, id);
        long size = 0;
        try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(target)) {
            if (in == null) return null;
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                size += read;
                if (size > MAX_SHARED_BYTES) throw new Exception("Too large");
                out.write(buffer, 0, read);
            }
        } catch (Exception e) {
            target.delete();
            return null;
        }
        JSObject item = new JSObject();
        item.put("id", id);
        item.put("name", name.replaceAll("[\\\\/]", "_"));
        item.put("mimeType", type);
        item.put("size", size);
        return item;
    }

    private File shareDir(boolean reset) {
        File dir = new File(getContext().getCacheDir(), "shared-media");
        if (reset) deleteFiles(dir);
        dir.mkdirs();
        return dir;
    }

    private static void deleteFiles(File dir) {
        File[] files = dir.listFiles();
        if (files != null) for (File file : files) file.delete();
    }

    // Returns the pending share ({ items: [{ id, name, mimeType, size }], text, subject, skipped }) or {}.
    @PluginMethod
    public void getSharedMedia(PluginCall call) {
        call.resolve(pendingShare != null ? pendingShare : new JSObject());
    }

    // Reads part of a shared file as base64 so the web layer can rebuild it as a File, even for videos.
    @PluginMethod
    public void readSharedFile(PluginCall call) {
        String id = call.getString("id", "");
        long offset = Math.max(0, call.getLong("offset", 0L));
        int length = Math.max(1, Math.min(MAX_CHUNK, call.getInt("length", MAX_CHUNK)));
        if (!id.matches("[0-9a-f-]{36}")) {
            call.reject("Unknown shared file.");
            return;
        }
        File file = new File(shareDir(false), id);
        if (!file.isFile()) {
            call.reject("Shared file is no longer available.");
            return;
        }
        try (RandomAccessFile in = new RandomAccessFile(file, "r")) {
            long total = in.length();
            int count = (int) Math.max(0, Math.min(length, total - offset));
            byte[] bytes = new byte[count];
            in.seek(offset);
            in.readFully(bytes);
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            result.put("size", total);
            result.put("done", offset + count >= total);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read the shared file.");
        }
    }

    @PluginMethod
    public void clearSharedMedia(PluginCall call) {
        pendingShare = null;
        deleteFiles(shareDir(false));
        call.resolve();
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            result.put("versionCode", code);
            result.put("versionName", info.versionName);
        } catch (Exception e) {
            result.put("versionCode", 0);
        }
        result.put("firebaseReady", MilkyWayApp.firebaseReady(context));
        call.resolve(result);
    }

    @PluginMethod
    public void configureFirebase(PluginCall call) {
        Context context = getContext();
        if (MilkyWayApp.firebaseReady(context)) {
            call.resolve(ready(true));
            return;
        }
        String appId = call.getString("appId", "");
        String apiKey = call.getString("apiKey", "");
        String projectId = call.getString("projectId", "");
        String senderId = call.getString("senderId", "");
        if (appId.isEmpty() || apiKey.isEmpty() || projectId.isEmpty() || senderId.isEmpty()) {
            call.reject("Incomplete Firebase config.");
            return;
        }
        context.getSharedPreferences(MilkyWayApp.PREFS, Context.MODE_PRIVATE).edit()
            .putString("appId", appId).putString("apiKey", apiKey)
            .putString("projectId", projectId).putString("senderId", senderId).apply();
        call.resolve(ready(MilkyWayApp.initFirebase(context)));
    }

    // APK downloads must go to the system browser/download manager; the WebView cannot install them.
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://")) {
            call.reject("Only https links can be opened.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No app can open this link.");
        }
    }

    private JSObject ready(boolean value) {
        JSObject result = new JSObject();
        result.put("firebaseReady", value);
        return result;
    }
}
