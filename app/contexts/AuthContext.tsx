"use client";

import {User,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut,
    signInWithPopup,
    sendPasswordResetEmail,
    onAuthStateChanged
} from 'firebase/auth';
import React,{useEffect, useContext,createContext,useState } from 'react';
import { auth } from '@/lib/fireBaseConfig';


interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined> (undefined);

export function useAuth(){
    const context = useContext(AuthContext);
    if(context===undefined){
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export function AuthProvider({children}: {children: React.ReactNode}){
    const [loading,setLoading] = useState(true);
    const [currentUser,setCurrentUser] = useState<User |null>(null);

    const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

    const register = async (email: string, password: string, displayName?: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && result.user) {
      await updateProfile(result.user, { displayName });
    }
  };

    const logout = async () => {
    await signOut(auth);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

    const value : AuthContextType = {
         currentUser,
         loading,
         login,
         register,
         logout,
         loginWithGoogle,
         resetPassword
    }
    return <AuthContext.Provider value={value}> 
                {!loading && children}
            </AuthContext.Provider>
}
