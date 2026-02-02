import { useState, useEffect } from 'react'

interface AuthModalProps {
  provider: string
  message: string
  onClose: () => void
  onComplete: () => void
}

interface NangoConfig {
  publicKey: string
  host: string
}

export function AuthModal({ provider, message, onClose, onComplete }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nangoConfig, setNangoConfig] = useState<NangoConfig | null>(null)

  // Load Nango config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/auth/nango-config', {
          credentials: 'include'
        })
        if (response.ok) {
          const config = await response.json()
          setNangoConfig(config)
        }
      } catch {
        setError('Failed to load OAuth configuration')
      }
    }
    loadConfig()
  }, [])

  const startOAuth = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Get the OAuth URL
      const response = await fetch(`/api/auth/connect/${provider}`, {
        credentials: 'include'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to get OAuth URL')
      }

      const { authUrl } = await response.json()

      // Open popup window
      const width = 500
      const height = 600
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        authUrl,
        'oauth-popup',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups and try again.')
      }

      // Poll for popup close
      const checkPopup = setInterval(async () => {
        if (popup.closed) {
          clearInterval(checkPopup)

          // Check if OAuth completed
          try {
            const completeResponse = await fetch('/api/auth/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ provider })
            })

            if (completeResponse.ok) {
              onComplete()
            } else {
              setError('OAuth may not have completed. Please try again.')
              setIsLoading(false)
            }
          } catch {
            setError('Failed to verify OAuth completion')
            setIsLoading(false)
          }
        }
      }, 500)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth failed')
      setIsLoading(false)
    }
  }

  const providerLabel = provider === 'google-calendar' ? 'Google Calendar' : provider

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Authorization Required</h2>
          <button style={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>

        <div style={styles.content}>
          <div style={styles.icon}>
            {provider === 'google-calendar' && (
              <svg width="48" height="48" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm0 36c-8.82 0-16-7.18-16-16S15.18 8 24 8s16 7.18 16 16-7.18 16-16 16z"/>
                <path fill="#4285F4" d="M24 12v12l8 8"/>
              </svg>
            )}
          </div>

          <p style={styles.message}>{message}</p>

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <button
            style={{
              ...styles.button,
              ...(isLoading ? styles.buttonDisabled : {})
            }}
            onClick={startOAuth}
            disabled={isLoading || !nangoConfig}
          >
            {isLoading ? 'Connecting...' : `Connect ${providerLabel}`}
          </button>

          <p style={styles.hint}>
            A popup window will open for you to authorize access.
          </p>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '400px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #E5E5EA',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#1C1C1E',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#8E8E93',
    cursor: 'pointer',
    padding: '0 4px',
  },
  content: {
    padding: '24px 20px',
    textAlign: 'center' as const,
  },
  icon: {
    marginBottom: '16px',
  },
  message: {
    fontSize: '14px',
    color: '#3C3C43',
    marginBottom: '20px',
    lineHeight: 1.5,
  },
  error: {
    backgroundColor: '#FFE5E5',
    color: '#D32F2F',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  button: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '12px',
  },
  buttonDisabled: {
    backgroundColor: '#C7C7CC',
    cursor: 'not-allowed',
  },
  hint: {
    fontSize: '12px',
    color: '#8E8E93',
    margin: 0,
  },
}
