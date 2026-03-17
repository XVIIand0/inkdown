import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en_US.json'
import zh from '../locales/zh_CN.json'
import zhTW from '../locales/zh_TW.json'

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en
    },
    zh: {
      translation: zh
    },
    'zh-TW': {
      translation: zhTW
    }
  },
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof import('../locales/zh_CN.json')
    }
  }
}
export const getSystemLanguage = () => {
  const systemLang = navigator.language
  if (systemLang.startsWith('zh')) {
    const region = systemLang.toLowerCase()
    if (region === 'zh-tw' || region === 'zh-hk' || region === 'zh-mo') {
      return 'zh-TW'
    }
    return 'zh'
  }
  return 'en'
}
