package com.tracelab.app;

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import androidx.exifinterface.media.ExifInterface;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.Credentials;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

final class ApiClient {
    interface SessionCallback {
        void onSuccess(String shareUrl, String expiresAt);
        void onError(String message);
    }

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final OkHttpClient HTTP = new OkHttpClient.Builder()
            .callTimeout(java.time.Duration.ofSeconds(45))
            .connectTimeout(java.time.Duration.ofSeconds(15))
            .readTimeout(java.time.Duration.ofSeconds(30))
            .build();
    private static final MediaType JPEG = MediaType.parse("image/jpeg");

    private ApiClient() { }

    static void createSession(Context context, String baseUrl, String username, String password,
                              String title, int expiryHours, Uri imageUri, SessionCallback callback) {
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                String normalizedBase = baseUrl.trim().replaceAll("/+$", "");
                byte[] imageBytes = compressImage(appContext.getContentResolver(), imageUri);
                if (imageBytes.length > 3 * 1024 * 1024) {
                    throw new IllegalStateException("The compressed image is still over 3 MB. Choose a smaller image.");
                }

                RequestBody requestBody = new MultipartBody.Builder()
                        .setType(MultipartBody.FORM)
                        .addFormDataPart("title", title)
                        .addFormDataPart("expiryHours", String.valueOf(expiryHours))
                        .addFormDataPart("image", "tracelab-image.jpg",
                                RequestBody.create(JPEG, imageBytes))
                        .build();

                Request request = new Request.Builder()
                        .url(normalizedBase + "/api/sessions")
                        .header("Authorization", Credentials.basic(username, password, StandardCharsets.UTF_8))
                        .post(requestBody)
                        .build();

                try (Response response = HTTP.newCall(request).execute()) {
                    String body = response.body() == null ? "{}" : response.body().string();
                    JSONObject json = new JSONObject(body);
                    if (!response.isSuccessful()) {
                        throw new IllegalStateException(json.optString("error", "Server returned HTTP " + response.code()));
                    }
                    String shareUrl = json.optString("shareUrl", "");
                    String expiresAt = json.optString("expiresAt", "");
                    if (shareUrl.isEmpty()) throw new IllegalStateException("The server response did not include a share URL.");
                    MAIN.post(() -> callback.onSuccess(shareUrl, expiresAt));
                }
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Unable to create the link. Check the server URL and network." : error.getMessage();
                MAIN.post(() -> callback.onError(message));
            }
        });
    }

    private static byte[] compressImage(ContentResolver resolver, Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream stream = resolver.openInputStream(uri)) {
            if (stream == null) throw new IllegalStateException("Android could not open the selected image.");
            BitmapFactory.decodeStream(stream, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw new IllegalStateException("The selected file is not a readable image.");
        }

        int sampleSize = 1;
        while (Math.max(bounds.outWidth / sampleSize, bounds.outHeight / sampleSize) > 1800) {
            sampleSize *= 2;
        }
        BitmapFactory.Options decode = new BitmapFactory.Options();
        decode.inSampleSize = sampleSize;
        Bitmap bitmap;
        try (InputStream stream = resolver.openInputStream(uri)) {
            if (stream == null) throw new IllegalStateException("Android could not read the selected image.");
            bitmap = BitmapFactory.decodeStream(stream, null, decode);
        }
        if (bitmap == null) throw new IllegalStateException("The selected image could not be decoded.");

        Bitmap normalized = bitmap;
        int maxDimension = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (maxDimension > 1600) {
            float scale = 1600f / maxDimension;
            normalized = Bitmap.createScaledBitmap(bitmap,
                    Math.max(1, Math.round(bitmap.getWidth() * scale)),
                    Math.max(1, Math.round(bitmap.getHeight() * scale)), true);
            if (normalized != bitmap) bitmap.recycle();
        }

        // Correct camera orientation before re-encoding. Re-encoding strips the source EXIF metadata.
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try (InputStream exifStream = resolver.openInputStream(uri)) {
            if (exifStream != null) {
                ExifInterface exif = new ExifInterface(exifStream);
                orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            }
        } catch (Exception ignored) { /* A missing EXIF block is normal for screenshots and edited images. */ }
        Matrix orientationMatrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90: orientationMatrix.postRotate(90); break;
            case ExifInterface.ORIENTATION_ROTATE_180: orientationMatrix.postRotate(180); break;
            case ExifInterface.ORIENTATION_ROTATE_270: orientationMatrix.postRotate(270); break;
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: orientationMatrix.setScale(-1, 1); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: orientationMatrix.setScale(1, -1); break;
            case ExifInterface.ORIENTATION_TRANSPOSE: orientationMatrix.setRotate(90); orientationMatrix.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_TRANSVERSE: orientationMatrix.setRotate(270); orientationMatrix.postScale(-1, 1); break;
            default: break;
        }
        if (!orientationMatrix.isIdentity()) {
            Bitmap rotated = Bitmap.createBitmap(normalized, 0, 0, normalized.getWidth(), normalized.getHeight(), orientationMatrix, true);
            if (rotated != normalized) normalized.recycle();
            normalized = rotated;
        }

        try {
            int quality = 84;
            byte[] output;
            do {
                ByteArrayOutputStream stream = new ByteArrayOutputStream();
                normalized.compress(Bitmap.CompressFormat.JPEG, quality, stream);
                output = stream.toByteArray();
                quality -= 7;
            } while (output.length > 2_800_000 && quality >= 56);
            return output;
        } finally {
            normalized.recycle();
        }
    }
}
