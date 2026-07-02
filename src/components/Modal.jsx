export default function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 80px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition text-xl">✕</button>
        </div>
        {/* Content - scrollable */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
