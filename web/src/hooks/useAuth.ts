import { useState, useEffect, useCallback } from 'react'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null
  })

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/check', {
        credentials: 'include'
      })
      setState({
        isAuthenticated: response.ok,
        isLoading: false,
        error: null
      })
    } catch {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: null
      })
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = async (password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      })

      if (response.ok) {
        setState({ isAuthenticated: true, isLoading: false, error: null })
        return true
      } else {
        const data = await response.json()
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: data.error || 'Login failed'
        })
        return false
      }
    } catch (err) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: 'Connection error'
      })
      return false
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    })
    setState({ isAuthenticated: false, isLoading: false, error: null })
  }

  return {
    ...state,
    login,
    logout
  }
}
