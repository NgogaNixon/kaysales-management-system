import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

const UPLOAD_FIELDS = [
  { key: 'logo_url', label: 'Company Logo', hint: 'Shown at the top of every receipt, quotation, and credit statement.' },
  { key: 'signature_url', label: 'E-Signature', hint: 'Appears bottom-left on printed documents.' },
  { key: 'stamp_url', label: 'Company Stamp', hint: 'Appears bottom-right on printed documents.' },
]

// These fields get a Remove button
const REMOVABLE_FIELDS = ['logo_url', 'signature_url', 'stamp_url']

// Gets the file path inside the "company-assets" bucket from a public URL
const getStoragePath = (url) => {
  if (!url) return null
  const marker = '/company-assets/'
  const index = url.indexOf(marker)
  if (index === -1) return null
  return url.substring(index + marker.length).split('?')[0]
}

export default function AccountSettings() {
  const { profile, refetchProfile } = useAuth()
  const [companyName, setCompanyName] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyLocation, setCompanyLocation] = useState('')
  const [companyTin, setCompanyTin] = useState('')
  const [images, setImages] = useState({
    logo_url: '',
    signature_url: '',
    stamp_url: '',
  })
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Always load the latest saved settings straight from the database,
  // so coming back to this page shows what is really saved.
  useEffect(() => {
    if (!profile?.id) return

    const loadFresh = async () => {
      const { data, error: loadError } = await supabase
        .from('profiles')
        .select('company_name, company_phone, company_location, company_tin, logo_url, signature_url, stamp_url')
        .eq('id', profile.id)
        .single()

      if (loadError) {
        setError('Could not load your account settings: ' + loadError.message)
        return
      }

      if (data) {
        setCompanyName(data.company_name || '')
        setCompanyPhone(data.company_phone || '')
        setCompanyLocation(data.company_location || '')
        setCompanyTin(data.company_tin || '')
        setImages({
          logo_url: data.logo_url || '',
          signature_url: data.signature_url || '',
          stamp_url: data.stamp_url || '',
        })
      }
      setLoaded(true)
    }

    loadFresh()
  }, [profile?.id])

  // Makes the rest of the app (receipts, quotations, credit statements)
  // use the newest settings. If the app cannot refresh by itself,
  // the page is reloaded so every PDF picks up the change.
  const refreshApp = async () => {
    if (refetchProfile) {
      await refetchProfile()
    } else {
      window.location.reload()
    }
  }

  // Saves one image field to the profile right away.
  // Returns an error message, or null when it worked.
  const saveImageToProfile = async (fieldKey, url) => {
    const { data, error: saveError } = await supabase
      .from('profiles')
      .update({ [fieldKey]: url })
      .eq('id', profile.id)
      .select('id')

    if (saveError) return saveError.message
    if (!data || data.length === 0) return 'Nothing was saved. The database did not allow the update.'
    return null
  }

  const handleUpload = async (fieldKey, file) => {
    if (!file) return
    setError('')
    setSuccess('')
    setUploading((prev) => ({ ...prev, [fieldKey]: true }))

    const ext = file.name.split('.').pop()
    const path = `${profile.id}/${fieldKey}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('company-assets')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(`Failed to upload ${fieldKey.replace('_url', '')}: ${uploadError.message}`)
      setUploading((prev) => ({ ...prev, [fieldKey]: false }))
      return
    }

    const { data: urlData } = supabase.storage
      .from('company-assets')
      .getPublicUrl(path)

    // Cache-bust so a re-upload of the same filename shows immediately
    const bustedUrl = `${urlData.publicUrl}?t=${Date.now()}`

    // Save to the profile straight away
    const saveProblem = await saveImageToProfile(fieldKey, bustedUrl)
    if (saveProblem) {
      setError(`Image uploaded but not saved: ${saveProblem}`)
      setUploading((prev) => ({ ...prev, [fieldKey]: false }))
      return
    }

    setImages((prev) => ({ ...prev, [fieldKey]: bustedUrl }))
    setUploading((prev) => ({ ...prev, [fieldKey]: false }))
    setSuccess('Image saved. It will now appear on all your documents.')
    setTimeout(() => setSuccess(''), 3000)

    await refreshApp()
  }

  // Removes the image from the profile right away, and deletes the file from storage
  const handleRemove = async (fieldKey) => {
    setError('')
    setSuccess('')
    setUploading((prev) => ({ ...prev, [fieldKey]: true }))

    const oldPath = getStoragePath(images[fieldKey])

    const saveProblem = await saveImageToProfile(fieldKey, '')
    if (saveProblem) {
      setError(`Could not remove the image: ${saveProblem}`)
      setUploading((prev) => ({ ...prev, [fieldKey]: false }))
      return
    }

    // Delete the old file too (if this fails it is not a problem)
    if (oldPath) {
      await supabase.storage.from('company-assets').remove([oldPath])
    }

    setImages((prev) => ({ ...prev, [fieldKey]: '' }))
    setUploading((prev) => ({ ...prev, [fieldKey]: false }))
    setSuccess('Image removed. It will no longer appear on your documents.')
    setTimeout(() => setSuccess(''), 3000)

    await refreshApp()
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    const { data, error: saveError } = await supabase
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
      .select('id')

    if (saveError) {
      setError('Failed to save: ' + saveError.message)
      setSaving(false)
      return
    }

    if (!data || data.length === 0) {
      setError('Nothing was saved. The database did not allow the update.')
      setSaving(false)
      return
    }

    setSaving(false)
    setSuccess('Saved successfully.')
    setTimeout(() => setSuccess(''), 3000)

    await refreshApp()
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
            ✅ {success}
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
                <div className="flex items-center gap-2">
                  <label className="inline-block px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs cursor-pointer transition">
                    {uploading[field.key] ? 'Please wait...' : images[field.key] ? 'Replace Image' : 'Upload Image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleUpload(field.key, e.target.files[0])
                        e.target.value = ''
                      }}
                      disabled={uploading[field.key] || !loaded}
                    />
                  </label>

                  {REMOVABLE_FIELDS.includes(field.key) && images[field.key] && (
                    <button
                      type="button"
                      onClick={() => handleRemove(field.key)}
                      disabled={uploading[field.key]}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-200 rounded-lg text-xs transition disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !loaded}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Account Settings'}
        </button>

      </div>
    </Layout>
  )
}
