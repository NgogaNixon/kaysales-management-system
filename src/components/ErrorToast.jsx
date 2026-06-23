import { useEffect } from 'react'

export default function ErrorToast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-sm px-4">
      <div className="bg-red-900 border border-red-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <p className="text-white text-sm font-medium">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="text-red-400 hover:text-white transition text-lg flex-shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="h-1 bg-red-800">
          <div className="h-1 bg-red-500 animate-[shrink_5s_linear_forwards]" />
        </div>
      </div>
    </div>
  )
}