import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

// Gives the names of the people who record data in this company, by user id.
// Example: names['abc-123'] is 'Jean Claude'
export function useRecorderNames() {
  const { profile, myProfile, organization } = useAuth()
  const [names, setNames] = useState({})

  useEffect(() => {
    if (!profile?.id) return

    const loadNames = async () => {
      const map = {}

      // The company owner and the person who is logged in
      if (profile?.full_name) map[profile.id] = profile.full_name
      if (myProfile?.id && myProfile?.full_name) map[myProfile.id] = myProfile.full_name

      // The team members (staff may not be allowed to read everybody, that is fine)
      if (organization?.id) {
        const { data: members } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', organization.id)

        const ids = (members || []).map((m) => m.user_id)
        if (ids.length > 0) {
          const { data: people } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', ids)
          ;(people || []).forEach((p) => {
            map[p.id] = p.full_name
          })
        }
      }

      setNames(map)
    }

    loadNames()
  }, [profile?.id, profile?.full_name, myProfile?.id, myProfile?.full_name, organization?.id])

  return names
}
