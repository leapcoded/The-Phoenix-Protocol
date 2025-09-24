// --- SECTION: FIREBASE & APP INITIALIZATION ---
let app, auth, db, storage;
try {
    // This object is populated by the deploy.yml workflow
    const firebaseConfig = {
      apiKey: "%%API_KEY%%",
      authDomain: "%%AUTH_DOMAIN%%",
      projectId: "%%PROJECT_ID%%",
      storageBucket: "%%STORAGE_BUCKET%%",
      messagingSenderId: "%%MESSAGING_SENDER_ID%%",
      appId: "%%APP_ID%%",
      measurementId: "%%MEASUREMENT_ID%%"
    };

    // Check if placeholders were replaced. If not, throw an error.
    if (firebaseConfig.apiKey.startsWith("%%")) {
        throw new Error("Firebase config placeholders not replaced.");
    }

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
} catch (error) {
    console.error("Firebase configuration not found or invalid. App cannot start.", error);
    document.getElementById('app').innerHTML = '<div class="text-center p-8 bg-red-100 text-red-800 rounded-lg"><strong>Error:</strong> Firebase configuration is missing or invalid. The application cannot be loaded.</div>';
}
