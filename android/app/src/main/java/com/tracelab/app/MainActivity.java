package com.tracelab.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.graphics.Color;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;

public class MainActivity extends AppCompatActivity {
    private ActivityResultLauncher<PickVisualMediaRequest> imagePicker;
    private Uri selectedImageUri;
    private EditText apiBaseUrlInput;
    private EditText usernameInput;
    private EditText passwordInput;
    private EditText titleInput;
    private Spinner expirySpinner;
    private ImageView imagePreview;
    private MaterialButton createLinkButton;
    private TextView statusText;
    private TextView shareUrlText;
    private TextView expiryText;
    private MaterialCardView resultCard;
    private String generatedShareUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        View rootScroll = findViewById(R.id.rootScroll);
        ViewCompat.setOnApplyWindowInsetsListener(rootScroll, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            int base = Math.round(20 * getResources().getDisplayMetrics().density);
            view.setPadding(base + bars.left, base + bars.top, base + bars.right, base + bars.bottom);
            return insets;
        });

        apiBaseUrlInput = findViewById(R.id.apiBaseUrl);
        usernameInput = findViewById(R.id.adminUsername);
        passwordInput = findViewById(R.id.adminPassword);
        titleInput = findViewById(R.id.sessionTitle);
        expirySpinner = findViewById(R.id.expirySpinner);
        imagePreview = findViewById(R.id.imagePreview);
        createLinkButton = findViewById(R.id.createLinkButton);
        statusText = findViewById(R.id.statusText);
        shareUrlText = findViewById(R.id.shareUrlText);
        expiryText = findViewById(R.id.expiryText);
        resultCard = findViewById(R.id.resultCard);

        apiBaseUrlInput.setText(BuildConfig.API_BASE_URL);
        ArrayAdapter<CharSequence> expiryAdapter = ArrayAdapter.createFromResource(
                this, R.array.expiry_options, android.R.layout.simple_spinner_item);
        expiryAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        expirySpinner.setAdapter(expiryAdapter);
        expirySpinner.setSelection(1);

        imagePicker = registerForActivityResult(
                new ActivityResultContracts.PickVisualMedia(), uri -> {
                    if (uri != null) {
                        selectedImageUri = uri;
                        imagePreview.setImageURI(uri);
                        imagePreview.setVisibility(View.VISIBLE);
                        createLinkButton.setEnabled(true);
                        statusText.setText("Image selected. Review the server details and create your consent link.");
                        resultCard.setVisibility(View.GONE);
                    }
                });

        findViewById(R.id.selectImageButton).setOnClickListener(view -> openImagePicker());
        createLinkButton.setOnClickListener(view -> createLink());
        findViewById(R.id.copyLinkButton).setOnClickListener(view -> copyLink());
        findViewById(R.id.shareLinkButton).setOnClickListener(view -> shareLink());
    }

    private void openImagePicker() {
        imagePicker.launch(new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
                .build());
    }

    private void createLink() {
        if (selectedImageUri == null) {
            statusText.setText("Choose a photograph first.");
            return;
        }

        String apiBaseUrl = apiBaseUrlInput.getText() == null ? "" : apiBaseUrlInput.getText().toString().trim();
        String username = usernameInput.getText() == null ? "" : usernameInput.getText().toString().trim();
        String password = passwordInput.getText() == null ? "" : passwordInput.getText().toString();
        String title = titleInput.getText() == null ? "TraceLab location demo" : titleInput.getText().toString().trim();

        if (apiBaseUrl.isEmpty() || username.isEmpty() || password.isEmpty()) {
            statusText.setText("Enter the API URL and the administrator username/password configured on your server.");
            return;
        }
        if (!apiBaseUrl.startsWith("https://") && !apiBaseUrl.startsWith("http://")) {
            statusText.setText("The API URL must begin with https:// (or http:// for local development). ");
            return;
        }
        if (title.isEmpty()) title = "TraceLab location demo";

        int[] expiryHours = new int[]{1, 24, 72, 168};
        int expiry = expiryHours[Math.max(0, Math.min(expirySpinner.getSelectedItemPosition(), expiryHours.length - 1))];
        createLinkButton.setEnabled(false);
        statusText.setText("Preparing image and creating a secure, expiring link…");
        resultCard.setVisibility(View.GONE);

        ApiClient.createSession(getApplicationContext(), apiBaseUrl, username, password,
                title, expiry, selectedImageUri, new ApiClient.SessionCallback() {
                    @Override
                    public void onSuccess(String shareUrl, String expiresAt) {
                        generatedShareUrl = shareUrl;
                        shareUrlText.setText(shareUrl);
                        expiryText.setText("This link expires " + formatDate(expiresAt) + ".");
                        resultCard.setVisibility(View.VISIBLE);
                        statusText.setText("Done. The recipient will see the selected image and an explicit location-sharing request.");
                        createLinkButton.setEnabled(true);
                    }

                    @Override
                    public void onError(String message) {
                        statusText.setText(message);
                        createLinkButton.setEnabled(true);
                    }
                });
    }

    private String formatDate(String isoDate) {
        try {
            // Keep the server's ISO timestamp readable without depending on device locale parsing quirks.
            return isoDate.replace('T', ' ').replace("Z", " UTC");
        } catch (Exception ignored) {
            return isoDate;
        }
    }

    private void copyLink() {
        if (generatedShareUrl == null) return;
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("TraceLab consent link", generatedShareUrl));
            Toast.makeText(this, "Link copied", Toast.LENGTH_SHORT).show();
        }
    }

    private void shareLink() {
        if (generatedShareUrl == null) return;
        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_SUBJECT, "TraceLab location-sharing demonstration");
        sendIntent.putExtra(Intent.EXTRA_TEXT,
                "This is a TraceLab security-awareness demonstration. The page explains the location request and asks for your permission before sharing anything:\n\n"
                        + generatedShareUrl);
        startActivity(Intent.createChooser(sendIntent, "Share TraceLab demo link"));
    }
}
