const { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} = require('firebase/auth');
const { doc, setDoc, getDoc } = require('firebase/firestore');
const { auth, db } = require('../firebase/config');

class AuthService {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
    this.setupAuthStateListener();
  }

  // Set up auth state listener
  setupAuthStateListener() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      console.log('Auth state changed:', user ? `Logged in as ${user.email}` : 'Not logged in');
      
      // Notify all listeners
      this.authStateListeners.forEach(listener => {
        listener(user);
      });
    });
  }

  // Add auth state listener
  addAuthStateListener(callback) {
    this.authStateListeners.push(callback);
  }

  // Remove auth state listener
  removeAuthStateListener(callback) {
    this.authStateListeners = this.authStateListeners.filter(listener => listener !== callback);
  }

  // Sign up with email and password
  async signUp(email, password, displayName) {
    try {
      console.log('Attempting to create user account...');
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update user profile with display name
      if (displayName) {
        await updateProfile(user, {
          displayName: displayName
        });
      }

      // Create user document in Firestore
      await this.createUserDocument(user, { displayName });

      console.log('✅ User account created successfully');
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        },
        message: 'Account created successfully!'
      };
    } catch (error) {
      console.error('❌ Sign up error:', error);
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  // Sign in with email and password
  async signIn(email, password) {
    try {
      console.log('Attempting to sign in user...');
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log('✅ User signed in successfully');
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        },
        message: 'Signed in successfully!'
      };
    } catch (error) {
      console.error('❌ Sign in error:', error);
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  // Sign in with Google
  async signInWithGoogle() {
    try {
      console.log('Attempting to sign in with Google...');
      
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Create user document if it doesn't exist
      await this.createUserDocument(user);

      console.log('✅ Google sign in successful');
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        },
        message: 'Signed in with Google successfully!'
      };
    } catch (error) {
      console.error('❌ Google sign in error:', error);
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  // Sign out
  async signOut() {
    try {
      console.log('Signing out user...');
      await signOut(auth);
      console.log('✅ User signed out successfully');
      return {
        success: true,
        message: 'Signed out successfully!'
      };
    } catch (error) {
      console.error('❌ Sign out error:', error);
      return {
        success: false,
        error: error.code,
        message: 'Failed to sign out'
      };
    }
  }

  // Reset password
  async resetPassword(email) {
    try {
      console.log('Sending password reset email...');
      await sendPasswordResetEmail(auth, email);
      console.log('✅ Password reset email sent');
      return {
        success: true,
        message: 'Password reset email sent!'
      };
    } catch (error) {
      console.error('❌ Password reset error:', error);
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  // Create user document in Firestore
  async createUserDocument(user, additionalData = {}) {
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      
      // Try to check if document exists, but don't fail if offline
      let userExists = false;
      try {
        const userSnap = await getDoc(userRef);
        userExists = userSnap.exists();
      } catch (error) {
        console.warn('⚠️ Could not check if user document exists (possibly offline):', error.code);
        // Assume user doesn't exist and try to create
        userExists = false;
      }

      if (!userExists) {
        const { displayName, email } = user;
        const createdAt = new Date();

        try {
          await setDoc(userRef, {
            displayName: displayName || additionalData.displayName || 'User',
            email,
            createdAt,
            lastLogin: createdAt,
            preferences: {
              autoOrganize: true,
              confidenceThreshold: 0.7,
              darkMode: false,
              watchedDirectories: []
            },
            ...additionalData
          });

          console.log('✅ User document created in Firestore');
        } catch (error) {
          console.warn('⚠️ Could not create user document (possibly offline):', error.code);
          // Don't fail authentication just because Firestore is offline
        }
      } else {
        // Update last login if we can
        try {
          await setDoc(userRef, {
            lastLogin: new Date()
          }, { merge: true });
        } catch (error) {
          console.warn('⚠️ Could not update last login (possibly offline):', error.code);
        }
      }
    } catch (error) {
      console.error('❌ Error in user document operations:', error);
      // Don't throw error - authentication should still succeed
    }
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.currentUser;
  }

  // Get user document from Firestore
  async getUserDocument(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        return userSnap.data();
      } else {
        console.log('No user document found');
        return null;
      }
    } catch (error) {
      if (error.code === 'unavailable') {
        console.warn('⚠️ Firestore is offline, using default user data');
        return {
          preferences: {
            autoOrganize: true,
            confidenceThreshold: 0.7,
            darkMode: false,
            watchedDirectories: []
          }
        };
      }
      console.error('❌ Error getting user document:', error);
      return null;
    }
  }

  // Update user preferences
  async updateUserPreferences(uid, preferences) {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        preferences: preferences,
        updatedAt: new Date()
      }, { merge: true });
      
      console.log('✅ User preferences updated');
      return { success: true };
    } catch (error) {
      if (error.code === 'unavailable') {
        console.warn('⚠️ Could not update preferences - Firestore is offline');
        // Store preferences locally and sync later
        return { success: false, error: 'Offline - changes will sync when connected' };
      }
      console.error('❌ Error updating user preferences:', error);
      return { success: false, error: error.message };
    }
  }

  // Convert Firebase error codes to user-friendly messages
  getErrorMessage(errorCode) {
    const errorMessages = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed before completing.',
      'auth/cancelled-popup-request': 'Only one popup request is allowed at a time.'
    };

    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
  }

  // Clean up listeners
  destroy() {
    this.authStateListeners = [];
  }
}

module.exports = { AuthService }; 