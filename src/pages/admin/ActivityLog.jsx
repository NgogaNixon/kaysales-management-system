import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [deviceLabels, setDeviceLabels] = useState({})
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

    const { data: devicesData } = await supabase
      .from('devices')
      .select('device_id, label')

    const labels = {}
    ;(devicesData || []).forEach(d => { labels[d.device_id] = d.label })

    setLogs(data || [])
    setDeviceLabels(labels)
    setLoading(false)
  }

  const filtered = logs.filter(log => {
    const matchesSearch = log.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      log.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      log.action?.toLowerCase().includes(search.toLowerCase())
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

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleString('en-GB', {
      timeZone: 'Africa/Kigali',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Log</h1>
          <p className="text-gray-400 text-sm mt-1">Track all user actions across the system</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by user or action..."
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
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Device</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">IP</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date & Time (Rwanda)</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions</th>
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
                      <td className="px-6 py-4 text-gray-300 text-xs">
                        {log.device_id ? (deviceLabels[log.device_id] || log.browser || '—') : (log.browser || '—')}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{log.ip_address || '—'}</td>
                      <td className="px-6 py-4 text-gray-400 text-xs">{formatDate(log.created_at)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition"
                        >
                          View
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

      {/* Log Detail Modal — full, untruncated details for one action */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Action Details</h2>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">User</span>
                <span className="text-white text-sm font-medium">{selectedLog.user_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Email</span>
                <span className="text-white text-sm">{selectedLog.user_email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Action</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(selectedLog.action)}`}>
                  {selectedLog.action}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-sm block mb-1">Full Details</span>
                <p className="text-white text-sm bg-gray-800 rounded-lg p-3 whitespace-pre-wrap break-words">
                  {selectedLog.details || '—'}
                </p>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Device</span>
                <span className="text-white text-sm">
                  {selectedLog.device_id ? (deviceLabels[selectedLog.device_id] || selectedLog.browser || '—') : (selectedLog.browser || '—')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">IP Address</span>
                <span className="text-white text-sm">{selectedLog.ip_address || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Date & Time (Rwanda)</span>
                <span className="text-white text-sm">{formatDate(selectedLog.created_at)}</span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-full py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition mt-2"
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
