import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

export default function TeamActivity() {
  const { isCeo } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [person, setPerson] = useState('all')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)

  useEffect(() => {
    if (isCeo) {
      fetchLogs()
    }
  }, [isCeo])

  // The database only returns the actions of this company's owner and team
  const fetchLogs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('activity_logs')
      .select('id, user_name, user_email, action, details, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    setLogs(data || [])
    setLoading(false)
  }

  const people = [...new Set(logs.map((log) => log.user_name).filter(Boolean))]

  const filtered = logs.filter((log) => {
    const text = search.toLowerCase()
    const matchesSearch =
      log.user_name?.toLowerCase().includes(text) ||
      log.action?.toLowerCase().includes(text) ||
      log.details?.toLowerCase().includes(text)
    const matchesPerson = person === 'all' || log.user_name === person
    const matchesFilter = filter === 'all' || log.action?.toLowerCase().includes(filter)
    const logDate = new Date(log.created_at)
    const matchesFrom = dateFrom ? logDate >= new Date(dateFrom) : true
    const matchesTo = dateTo ? logDate <= new Date(dateTo + 'T23:59:59') : true
    return matchesSearch && matchesPerson && matchesFilter && matchesFrom && matchesTo
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
    })

  if (!isCeo) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-gray-400">Only the company owner can see the team activity.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Team Activity</h1>
          <p className="text-gray-400 text-sm mt-1">See who did what in your company</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by person, action or details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface-elevated border border-surface-border text-white px-4 py-2 rounded-lg text-sm flex-1 focus:outline-none focus:border-primary"
          />
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className="bg-surface-elevated border border-surface-border text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">Everyone</option>
            {people.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface-elevated border border-surface-border text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface-elevated border border-surface-border text-white px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            {['all', 'delete', 'edit', 'add'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  filter === f ? 'bg-primary text-white' : 'bg-surface-elevated text-gray-400 hover:text-white'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Activity table */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading activity...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No activity found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Person</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Action</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Details</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Date & Time (Rwanda)</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-t border-surface-border hover:bg-surface transition">
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
                        {log.details && log.details.length > 80 ? log.details.slice(0, 80) + '...' : (log.details || '—')}
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs">{formatDate(log.created_at)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-3 py-1 bg-surface hover:bg-surface-border text-white rounded-lg text-xs transition"
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

        <p className="text-gray-500 text-xs">Showing the latest 500 actions.</p>

      </div>

      {/* Details of one action */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl max-h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-bold text-white">Action Details</h2>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Person</span>
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
                <span className="text-gray-400 text-sm block mb-1">Details</span>
                <p className="text-white text-sm bg-surface rounded-lg p-3 whitespace-pre-wrap break-words">
                  {selectedLog.details || '—'}
                </p>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Date & Time (Rwanda)</span>
                <span className="text-white text-sm">{formatDate(selectedLog.created_at)}</span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-full py-2 bg-surface text-gray-300 rounded-lg hover:bg-surface-border transition mt-2"
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
