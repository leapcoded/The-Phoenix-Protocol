import { firebaseConfig } from './firebaseConfig.js';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
// Ensure auth persists across hard refreshes and sessions
try {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
} catch (e) {
    console.warn('Failed to set auth persistence', e);
}
const db = firebase.firestore();
const storage = firebase.storage();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;

/**
 * Listens for changes to the authentication state.
 * @param {function} callback - A function to call with the user object when the state changes.
 */
function onAuthStateChanged(callback) {
    auth.onAuthStateChanged(user => {
        currentUser = user;
        callback(user);
    });
}

/**
 * Initiates the Google Sign-In popup flow.
 */
async function signInWithGoogle() {
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (error) {
        console.error("Error during Google sign-in:", error);
    }
}

/**
 * Signs the current user out.
 */
async function signOut() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error("Error during sign-out:", error);
    }
}

/**
 * Saves a page to the 'pages' collection in Firestore.
 * The document ID will be the page name.
 * @param {string} pageName - The name of the page to save.
 * @param {object} pageData - The data object for the page.
 */
async function savePage(pageName, pageData) {
    if (!currentUser) {
        console.error("Cannot save page: no user is signed in.");
        return;
    }
    try {
        // Use the user's UID to create a user-specific collection of pages
        const userPagesCollection = db.collection('users').doc(currentUser.uid).collection('pages');
        await userPagesCollection.doc(pageName).set(pageData, { merge: true });
    } catch (error) {
        console.error("Error saving page to Firestore:", error);
    }
}

/**
 * Deletes a page from the 'pages' collection in Firestore.
 * @param {string} pageName - The name of the page to delete.
 */
async function deletePage(pageName) {
    if (!currentUser) {
        console.error("Cannot delete page: no user is signed in.");
        return;
    }
    try {
        const userPagesCollection = db.collection('users').doc(currentUser.uid).collection('pages');
        await userPagesCollection.doc(pageName).delete();
    } catch (error) {
        console.error("Error deleting page from Firestore:", error);
    }
}

let unsubscribe = null;

/**
 * Listens for real-time updates to the pages collection.
 * @param {function} callback - A function to call with the pages object when data changes.
 * @returns {function} An unsubscribe function to detach the listener.
 */
function onPagesUpdate(callback) {
    if (unsubscribe) {
        unsubscribe();
    }

    if (!currentUser) {
        callback({});
        return () => {};
    }

    const userPagesCollection = db.collection('users').doc(currentUser.uid).collection('pages');
    unsubscribe = userPagesCollection.onSnapshot(snapshot => {
        const pages = {};
        snapshot.forEach(doc => {
            pages[doc.id] = doc.data();
        });
        callback(pages);
    }, error => {
        console.error("Error listening to page updates:", error);
        callback({});
    });

    return unsubscribe;
}

/**
 * Uploads a file to Firebase Storage.
 * @param {File} file - The file to upload.
 * @param {string} path - The path in storage to upload to (e.g., 'character-galleries').
 * @param {function} onProgress - Optional callback for upload progress.
 * @returns {Promise<string>} The download URL of the uploaded file.
 */
async function uploadFile(file, path = 'uploads', onProgress) {
    if (!currentUser) {
        throw new Error("Cannot upload file: no user is signed in.");
    }
    const storageRef = storage.ref();
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `users/${currentUser.uid}/${path}/${fileName}`;
    const fileRef = storageRef.child(filePath);

    return new Promise((resolve, reject) => {
        const uploadTask = fileRef.put(file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (onProgress) {
                    onProgress(progress);
                }
            },
            (error) => {
                console.error("Error uploading file:", error);
                reject(error);
            },
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    resolve(downloadURL);
                });
            }
        );
    });
}

async function deleteFile(url) {
  if (!url) return;
  try {
    const storageRef = storage.refFromURL(url);
    await storageRef.delete();
  } catch (error) {
    if (error.code !== 'storage/object-not-found') {
      console.error("Error deleting file from storage:", error);
    }
  }
}

export {
  auth,
  db,
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
  savePage,
  deletePage,
  onPagesUpdate,
  uploadFile,
  deleteFile,
};
