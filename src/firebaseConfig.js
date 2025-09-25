// Firebase config placeholder module.
// The GitHub Actions deploy workflow replaces %%TOKENS%% with real values *at publish time*.
// This module is imported by firebase.js which uses the compat API (`firebase.initializeApp`).

export const firebaseConfig = {
    apiKey: "%%API_KEY%%",
    authDomain: "%%AUTH_DOMAIN%%",
    projectId: "%%PROJECT_ID%%",
    storageBucket: "%%STORAGE_BUCKET%%",
    messagingSenderId: "%%MESSAGING_SENDER_ID%%",
    appId: "%%APP_ID%%",
    measurementId: "%%MEASUREMENT_ID%%"
};

// Optionally expose globally (helps quick debugging in console after deploy)
try { window.firebaseConfig = firebaseConfig; } catch(_) {}

// Provide a runtime warning if placeholders were not replaced (local file-open usage)
if (typeof firebaseConfig.apiKey === 'string' && firebaseConfig.apiKey.startsWith('%%')) {
    console.warn('[firebaseConfig] Placeholder values detected – Firebase will fail until secrets are injected by the deploy workflow.');
}
