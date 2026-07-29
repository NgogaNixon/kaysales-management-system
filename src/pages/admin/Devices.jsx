import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Layout from '../../components/Layout'

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [actionCounts, setActionCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => {
    fetchDevices()
  }, [])

  const fetchDevices = async () => {
    setLoading(true)
    const { data: devicesData } = await supabase
      .from('devices')
      .select('*')
      .order('last_seen', { ascending: false })

    const { data: logsData } = await supabase
      .from('activity_logs')
      .select('device_id')

    const counts = {}
    ;(logsData || []).forEach(log => {
      if (log.device_id) counts[log.device_id] = (counts[log.device_id] || 0) + 1
    })

    setDevices(devicesData || [])
    setActionCounts(counts)
    setLoading(false)
  }

  const startEdit = (device) => {
    setEditingId(device.id)
    setEditLabel(device.label)
  }

  const saveLabel = async (device) => {
    if (!editLabel.trim()) return
    await supabase.from('devices').update({ label: editLabel.trim() }).eq('id', device.id)
    setEditingId(null)
    fetchDevices()
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      timeZone: 'Africa/Kigali',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">📱 Devices</h1>
          <p className="text-gray-400 text-sm mt-1">
            Every physical device that has ever logged an action, even under a shared login. Rename any of them once you know whose it is — the new name applies to all of that device's past activity too.
          </p>
        </div>

        {/* Devices Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400">Loading devices...</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No devices recorded yet — they'll appear here as soon as someone takes an action.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Device</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Actions Logged</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">First Seen</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium">Last Seen</th>
                    <th className="text-left text-gray-400 px-6 py-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id} className="border-t border-gray-800 hover:bg-gray-800 transition">
                      <td className="px-6 py-4">
                        {editingId === device.id ? (
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveLabel(device)}
                            autoFocus
                            className="bg-gray-800 border border-blue-500 text-white px-2 py-1 rounded text-sm focus:outline-none"
                          />
                        ) : (
                          <span className="text-white font-medium">{device.label}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-300">{actionCounts[device.device_id] || 0}</td>
                      <td className="px-6 py-4 text-gray-400 text-xs">{formatDate(device.first_seen)}</td>
                      <td className="px-6 py-4 text-gray-400 text-xs">{formatDate(device.last_seen)}</td>
                      <td className="px-6 py-4">
                        {editingId === device.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveLabel(device)}
                              className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(device)}
                            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition"
                          >
                            Rename
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </Layout>
  )
}
