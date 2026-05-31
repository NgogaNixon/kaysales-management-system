import { createContext, useContext, useState } from 'react'
import { translations } from '../lang/translations'

const LanguageContext = createContext({})

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    localStorage.getItem('kaysales_lang') || 'en'
  )

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'fr' : 'en'
    setLanguage(newLang)
    localStorage.setItem('kaysales_lang', newLang)
  }

  const t = (key) => {
    return translations[language][key] || translations['en'][key] || key
  }

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)