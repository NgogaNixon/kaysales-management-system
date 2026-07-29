import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

const UPLOAD_FIELDS = [
  { key: 'logo_url', label: 'Company Logo', hint: 'Shown at the top of every receipt, quotation, and credit statement.' },
  { key: 'signature_url', label: 'E-Signature', hint: 'Appears bottom-left on printed documents.' },
  { key: 'stamp_url', label: 'Company Stamp', hint: 'Appears bottom-right on printed documents.' },
]

export default function AccountSettings() {
  const { profile, refetchProfile } = useAuth()
  const [companyName, setCompanyName] = useState(profile?.company_name || '')
  const [companyPhone, setCompanyPhone] = useState(profile?.company_phone || '')
  const [companyLocation, setCompanyLocation] = useState(profile?.company_location || '')
  const [companyTin, setCompanyTin] = useState(profile?.company_tin || '')
  const [images, setImages] = useState({
    logo_url: profile?.logo_url || '',
    signature_url: profile?.signature_url || '',
    stamp_url: profile?.stamp_url || '',
  })
  const [uploading, setUploading] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleUpload = async (fieldKey, file) => {
    if (!file) return
    setError('')
    setUploading({ ...uploading, [fieldKey]: true })

    const ext = file.name.split('.').pop()
    const path = `${profile.id}/${fieldKey}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('company-assets')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(`Failed to upload ${fieldKey.replace('_url', '')}: ${uploadError.message}`)
      setUploading({ ...uploading, [fieldKey]: false })
      return
    }

    const { data: urlData } = supabase.storage
      .from('company-assets')
      .getPublicUrl(path)

    // Cache-bust so a re-upload of the same filename shows immediately
    const bustedUrl = `${urlData.publicUrl}?t=${Date.now()}`

    setImages({ ...images, [fieldKey]: bustedUrl })
    setUploading({ ...uploading, [fieldKey]: false })
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess(false)

    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        company_name: companyName,
        company_phone: companyPhone,
        company_location: companyLocation,
        company_tin: companyTin,
        logo_url: images.logo_url,
        signature_url: images.signature_url,
        stamp_url: images.stamp_url,
      })
      .eq('id', profile.id)

    if (saveError) {
      setError('Failed to save: ' + saveError.message)
      setSaving(false)
      return
    }

    if (refetchProfile) await refetchProfile()
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-2xl">

        <div>
          <h1 className="text-2xl font-bold text-white">🏢 Account Settings</h1>
          <p className="text-gray-400 text-sm mt-1">
            This information appears on every receipt, quotation, and credit statement you print or download.
          </p>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-300 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-900 border border-green-700 text-green-300 p-3 rounded-lg text-sm">
            ✅ Saved successfully.
          </div>
        )}

        {/* Company Details */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-white font-bold text-sm">Company Details</h2>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              placeholder="Company Name"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Phone Number</label>
            <input
              type="text"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g 07.........."
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Location / Address</label>
            <input
              type="text"
              value={companyLocation}
              onChange={(e) => setCompanyLocation(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              placeholder=""
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">TIN / Business Registration Number</label>
            <input
              type="text"
              value={companyTin}
              onChange={(e) => setCompanyTin(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g. 123456789"
            />
          </div>
        </div>

        {/* Logo / Signature / Stamp */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-6">
          <h2 className="text-white font-bold text-sm">Logo, Signature & Stamp</h2>
          {UPLOAD_FIELDS.map((field) => (
            <div key={field.key} className="flex items-start gap-4">
              <div className="w-20 h-20 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                {images[field.key] ? (
                  <img src={images[field.key]} alt={field.label} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-600 text-xs text-center px-1">No image</span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{field.label}</p>
                <p className="text-gray-500 text-xs mb-2">{field.hint}</p>
                <label className="inline-block px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs cursor-pointer transition">
                  {uploading[field.key] ? 'Uploading...' : images[field.key] ? 'Replace Image' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUpload(field.key, e.target.files[0])}
                    disabled={uploading[field.key]}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Account Settings'}
        </button>

      </div>
    </Layout>
  )
}
