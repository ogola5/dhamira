# JWT Token Expiration & Auto-Logout Documentation

## Overview

This document describes how JWT token expiration is handled in the backend and provides implementation guidelines for the frontend to automatically log users out when their tokens expire.

---

## Backend Implementation

### Enhanced JWT Error Handling

The authentication middleware now provides specific error codes for different JWT failures:

#### Error Codes

| Error Code | HTTP Status | Message | Description |
|------------|-------------|---------|-------------|
| `TOKEN_EXPIRED` | 401 | "Token expired, please login again" | JWT has exceeded its expiration time |
| `TOKEN_INVALID` | 401 | "Invalid token, please login again" | JWT signature is invalid or malformed |
| `TOKEN_NOT_ACTIVE` | 401 | "Token not active yet" | JWT `nbf` (not before) time hasn't been reached |
| `undefined` | 401 | "Not authorized, no token" | No token provided in request |
| `undefined` | 401 | "Not authorized, user not found" | Token valid but user doesn't exist |

#### Error Response Format

When a JWT error occurs, the API returns:

```json
{
  "message": "Token expired, please login again",
  "code": "TOKEN_EXPIRED"
}
```

### Middleware: `authMiddleware.js`

The `protect` middleware now catches and categorizes JWT errors:

```javascript
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // ... user lookup and attachment
  next();
} catch (error) {
  if (error.name === 'TokenExpiredError') {
    res.status(401);
    const err = new Error('Token expired, please login again');
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }
  // ... other error types
}
```

---

## Frontend Implementation Guide

### 1. API Interceptor Setup

Implement a global API interceptor to catch 401 errors and handle automatic logout.

#### Example: Axios Interceptor

```javascript
import axios from 'axios';
import { useRouter } from 'next/navigation'; // or your routing library

// Create axios instance
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const errorCode = error.response?.data?.code;
      
      // Check if it's a token expiration error
      if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'TOKEN_INVALID') {
        // Clear authentication data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Redirect to login
        window.location.href = '/login';
        
        // Optional: Show notification
        // toast.error('Your session has expired. Please login again.');
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
```

#### Example: Fetch API Wrapper

```javascript
// utils/api.js
export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // Handle token expiration
  if (response.status === 401) {
    const data = await response.json();
    
    if (data.code === 'TOKEN_EXPIRED' || data.code === 'TOKEN_INVALID') {
      // Clear authentication
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirect to login
      window.location.href = '/login';
      
      throw new Error(data.message);
    }
  }
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Request failed');
  }
  
  return response.json();
}
```

---

### 2. React Hook for Auto-Logout

Create a custom hook to monitor token expiration:

```javascript
// hooks/useTokenExpiration.js
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';

export function useTokenExpiration() {
  const router = useRouter();
  
  useEffect(() => {
    const checkTokenExpiration = () => {
      const token = localStorage.getItem('token');
      
      if (!token) return;
      
      try {
        const decoded = jwtDecode(token);
        const currentTime = Date.now() / 1000;
        
        // Check if token is expired
        if (decoded.exp < currentTime) {
          // Token expired - logout
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/login');
        }
      } catch (error) {
        // Invalid token - logout
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
      }
    };
    
    // Check immediately
    checkTokenExpiration();
    
    // Check every minute
    const interval = setInterval(checkTokenExpiration, 60000);
    
    return () => clearInterval(interval);
  }, [router]);
}
```

Usage in your app:

```javascript
// app/layout.tsx or _app.tsx
import { useTokenExpiration } from '@/hooks/useTokenExpiration';

export default function RootLayout({ children }) {
  useTokenExpiration(); // Monitor token expiration globally
  
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

---

### 3. Context-Based Authentication

Implement an auth context to centralize logout logic:

```javascript
// context/AuthContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // Logout function
  const logout = (message) => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/login');
    
    if (message) {
      // Show notification (use your toast library)
      console.log(message);
    }
  };
  
  // Check token on mount and set up monitoring
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const currentTime = Date.now() / 1000;
        
        if (decoded.exp < currentTime) {
          // Token expired
          logout('Your session has expired. Please login again.');
        } else {
          // Token valid - load user
          const userData = localStorage.getItem('user');
          if (userData) {
            setUser(JSON.parse(userData));
          }
          
          // Set timeout to logout when token expires
          const timeUntilExpiry = (decoded.exp - currentTime) * 1000;
          const timeoutId = setTimeout(() => {
            logout('Your session has expired. Please login again.');
          }, timeUntilExpiry);
          
          return () => clearTimeout(timeoutId);
        }
      } catch (error) {
        logout('Invalid session. Please login again.');
      }
    }
    
    setLoading(false);
  }, []);
  
  const value = {
    user,
    setUser,
    logout,
    loading,
  };
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
```

---

### 4. Protected Route Component

```javascript
// components/ProtectedRoute.js
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    
    if (!loading && user && requiredRole && user.role !== requiredRole) {
      router.push('/unauthorized');
    }
  }, [user, loading, router, requiredRole]);
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    return null;
  }
  
  return children;
}
```

---

### 5. Login Function with Token Storage

```javascript
// services/authService.js
import api from '@/utils/api';

export async function login(credentials) {
  const response = await api.post('/api/auth/login', credentials);
  
  const { token, user } = response.data;
  
  // Store token and user data
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  
  return { token, user };
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}
```

---

## Token Expiration Times

Current JWT configuration (check your auth controller):

```javascript
// Typically in authController.js
const token = jwt.sign(
  { sub: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '7d' } // ← Adjust this as needed
);
```

**Recommended expiration times:**
- **Short sessions**: 1-4 hours (`1h`, `4h`)
- **Medium sessions**: 1 day (`24h`, `1d`)
- **Long sessions**: 7-30 days (`7d`, `30d`)

---

## Testing Token Expiration

### Manual Testing

1. **Generate expired token** (temporarily modify backend):
```javascript
const token = jwt.sign(payload, secret, { expiresIn: '1s' });
```

2. **Wait 2 seconds** then make API request

3. **Verify**:
   - API returns 401 with `code: 'TOKEN_EXPIRED'`
   - Frontend clears storage
   - User redirected to login

### Automated Testing

```javascript
// __tests__/auth.test.js
import { render, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';

describe('Token Expiration', () => {
  it('should logout when token is expired', async () => {
    // Mock expired token
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    localStorage.setItem('token', expiredToken);
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull();
      expect(window.location.href).toContain('/login');
    });
  });
});
```

---

## Security Best Practices

### 1. Token Storage
- ✅ Use `httpOnly` cookies for maximum security (requires backend changes)
- ⚠️ If using localStorage, be aware of XSS risks
- ❌ Never store tokens in sessionStorage for long-term use

### 2. Token Refresh
Consider implementing refresh tokens for better UX:

```javascript
// Backend endpoint: POST /api/auth/refresh
export async function refreshToken() {
  const response = await api.post('/api/auth/refresh', {
    refreshToken: localStorage.getItem('refreshToken'),
  });
  
  const { token } = response.data;
  localStorage.setItem('token', token);
  
  return token;
}
```

### 3. Secure Token Transmission
- Always use HTTPS in production
- Tokens should never be sent via URL parameters
- Use `Authorization: Bearer <token>` header

---

## Common Issues & Solutions

### Issue: User logged out unexpectedly

**Causes:**
- Token expired naturally
- Clock skew between client/server
- Token was manually deleted

**Solution:**
- Implement refresh tokens
- Sync server/client clocks
- Add activity monitoring to extend sessions

### Issue: Multiple tabs cause conflicts

**Solution:**
Use `storage` event listener to sync logout across tabs:

```javascript
useEffect(() => {
  const handleStorageChange = (e) => {
    if (e.key === 'token' && !e.newValue) {
      // Token was removed - logout this tab too
      router.push('/login');
    }
  };
  
  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
```

### Issue: Token expires during long operations

**Solution:**
- Increase token expiration time
- Implement refresh token rotation
- Show warning before expiration

---

## Summary

### Backend Changes Made
✅ Enhanced JWT error handling with specific error codes  
✅ Added `TOKEN_EXPIRED`, `TOKEN_INVALID`, `TOKEN_NOT_ACTIVE` codes  
✅ Updated error response to include `code` field  

### Frontend Implementation Needed
📋 Add API interceptor to catch 401 errors  
📋 Clear localStorage on token expiration  
📋 Redirect to login page automatically  
📋 Show user-friendly notification  
📋 Optional: Implement token refresh mechanism  

---

**Last Updated**: January 1, 2026  
**Version**: 1.0
