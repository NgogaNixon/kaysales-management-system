import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }

  const filtered = logs.filter(log => {
    const matchesSearch = log.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      log.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      log.action?.toLowerCase().includes(search.toLowerCase()) ||
      log.ip_address?.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || log.action?.toLowerCase().includes(filter)
    const logDate = new Date(log.created_at)
    const matchesFrom = dateFrom ? logDate >= new Date(dateFrom) : true
    const matchesTo = dateTo ? logDate <= new Date(dateTo + 'T23:59:59') : true
    return matchesSearch && matchesFilter && matchesFrom && matchesTo
  })

  const getActionColor = (action) => {
    if (action?.includes('delete') || action?.includes('Delete')) return 'bg-red-900 text-red-300'
    if (action?.includes('edit') || action?.includes('Edit') || action?.includes('update') || action?.includes('Update')) return 'bg-yellow-900 text-yellow-300'
    if (action?.includes('add') || action?.includes('Add') || action?.includes('create') || action?.includes('Create')) return 'bg-green-900 text-green-300'
    return 'bg-blue-900 text-blue-300'
  }

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile') return '📱'
    if (deviceType === 'Tablet') return '📟'
    return '💻'
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">📋 Activity Log</h1>
          <p className="text-gray-400 text-sm mt-1">Track all user actions across the system</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Actions', value: logs.length, icon: '📋' },
            { label: 'Deletions', value: logs.filter(l => l.action?.toLowerCase().includes('delete')).length, icon: '🗑️' },
            { label: 'Edits', value: logs.filter(l => l.action?.toLowerCase().includes('edit') || l.action?.toLowerCase().includes('update')).length, icon: '✏️' },
            { label: 'Today', value: logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length, icon: '📅' },
          ].map((stat, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <span className="text-2xl">{stat.icon}</span>
              <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
              <p className="text-gray-400 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by user, action or IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm flex-1 focus:outline-none focus:border-blue-500"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            {['all', 'delete', 'edit', 'add'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading activity logs...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No activity logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">User</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Action</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Details</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Device</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">IP Address</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date & Time</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">More</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4">
                        <p className="text-white font-medium">{log.user_name}</p>
                        <p className="text-gray-500 text-xs">{log.user_email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-300 max-w-xs truncate">{log.details || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <span>{getDeviceIcon(log.device_type)}</span>
                          <div>
                            <p className="text-gray-300 text-xs">{log.device_type || '—'}</p>
                            <p className="text-gray-500 text-xs">{log.os || log.browser || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-blue-400 text-xs font-mono">{log.ip_address || '—'}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Activity Details</h2>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">

              <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                <h3 className="text-gray-400 text-xs uppercase tracking-wider">User Info</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Name</span>
                  <span className="text-white font-medium">{selectedLog.user_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Email</span>
                  <span className="text-white">{selectedLog.user_email}</span>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                <h3 className="text-gray-400 text-xs uppercase tracking-wider">Action</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Type</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(selectedLog.action)}`}>
                    {selectedLog.action}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Details</span>
                  <span className="text-white text-right max-w-xs">{selectedLog.details || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Date & Time</span>
                  <span className="text-white">{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                <h3 className="text-gray-400 text-xs uppercase tracking-wider">Device & Location</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">IP Address</span>
                  <span className="text-blue-400 font-mono">{selectedLog.ip_address || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Device Type</span>
                  <span className="text-white">{getDeviceIcon(selectedLog.device_type)} {selectedLog.device_type || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">OS</span>
                  <span className="text-white">{selectedLog.os || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Browser</span>
                  <span className="text-white">{selectedLog.browser || '—'}</span>
                </div>
                <div className="text-sm">
                  <p className="text-gray-400 mb-1">Full User Agent</p>
                  <p className="text-gray-500 text-xs break-all bg-gray-900 p-2 rounded">{selectedLog.device || '—'}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="w-full py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}