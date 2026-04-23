// frontend/src/context/AuthContext.tsx

import React, { ReactNode } from 'react';
import { AuthProvider } from '../hooks/useAuth';

// This file re-exports the AuthProvider from useAuth hook
// for easier imports and to maintain separation of concerns

export { AuthProvider, useAuth } from '../hooks/useAuth';

// Optional: Export additional auth-related types
export type { User, UserPreferences, EmergencyContact } from '../api/client';
