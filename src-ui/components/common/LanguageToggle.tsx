import { useLocale } from '../../lib/i18n.js';

export function LanguageToggle() {
  const { locale, toggleLocale } = useLocale();
  return (
    <button
      onClick={toggleLocale}
      class="btn btn-ghost"
      style="height:36px;padding:0 10px;justify-content:center;flex-shrink:0;font-size:13px;font-weight:600;letter-spacing:0.5px"
      title={locale === 'zh' ? 'Switch to English' : '切换到中文'}
      aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}
