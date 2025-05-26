// components/ProtectedRoute.tsx
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import AuthModal from './AuthModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { currentUser } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (!currentUser) {
    return (
      <>
        {fallback || (
          <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Authentication Required
              </h2>
              <p className="text-gray-600 mb-6">
                Please sign in to access our AI-powered resume tools and save your analysis history.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Sign In / Sign Up
                </button>
                <div className="text-sm text-gray-500">
                  ✨ Free forever • 🚀 Instant access • 💼 Save your work
                </div>
              </div>
            </div>
          </div>
        )}
        
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </>
    );
  }

  return <>{children}</>;
}