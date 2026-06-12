import { useEffect, useState } from 'react'

export default function UndoToast({ message, onUndo, onExpire, duration = 5000 }) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    let expired = false
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev <= 0) {
          clearInterval(interval)
          if (!expired) {
            expired = true
            onExpire()
          }
          return 0
        }
        return prev - (100 / (duration / 100))
      })
    }, 100)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm mx-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-white text-sm font-medium">{message}</p>
          <button
            onClick={onUndo}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition flex-shrink-0"
          >
            Undo
          </button>
        </div>
        <div className="h-1 bg-gray-700">
          <div
            className="h-1 bg-blue-500 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}