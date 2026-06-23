import { createContext, useContext, useState, useCallback } from 'react'
import ErrorToast from '../components/ErrorToast'

const ErrorContext = createContext({})

export function ErrorProvider({ children }) {
  const [errorMessage, setErrorMessage] = useState('')

  const showError = useCallback((message) => {
    setErrorMessage(message)
  }, [])

  const clearError = useCallback(() => {
    setErrorMessage('')
  }, [])

  return (
    <ErrorContext.Provider value={{ showError }}>
      {children}
      <ErrorToast message={errorMessage} onClose={clearError} />
    </ErrorContext.Provider>
  )
}

export const useError = () => useContext(ErrorContext)