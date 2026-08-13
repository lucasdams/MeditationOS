import { useT } from '../i18n'

export default function BreathingInfo() {
  const { t } = useT()
  return (
    <details className="breathe-info">
      <summary>{t('practice.breathingInfo.summary')}</summary>

      <h2>{t('practice.breathingInfo.whatHeading')}</h2>
      <p>
        {t('practice.breathingInfo.whatBody.pre')}{' '}
        <strong>{t('practice.breathingInfo.whatBody.emph')}</strong>{' '}
        {t('practice.breathingInfo.whatBody.post')}
      </p>

      <h2>{t('practice.breathingInfo.ratioHeading')}</h2>
      <p>
        {t('practice.breathingInfo.ratioBody.pre')}{' '}
        <strong>{t('practice.breathingInfo.ratioBody.emph')}</strong>
        {t('practice.breathingInfo.ratioBody.mid')} <em>{t('practice.breathingInfo.ratioBody.emph2')}</em>{' '}
        {t('practice.breathingInfo.ratioBody.post')}
      </p>

      <h2>{t('practice.breathingInfo.benefitsHeading')}</h2>
      <ul>
        <li>{t('practice.breathingInfo.benefit1')}</li>
        <li>{t('practice.breathingInfo.benefit2')}</li>
        <li>{t('practice.breathingInfo.benefit3')}</li>
        <li>{t('practice.breathingInfo.benefit4')}</li>
      </ul>

      <h2>{t('practice.breathingInfo.howHeading')}</h2>
      <ol>
        <li>{t('practice.breathingInfo.how1')}</li>
        <li>{t('practice.breathingInfo.how2')}</li>
        <li>{t('practice.breathingInfo.how3')}</li>
        <li>{t('practice.breathingInfo.how4')}</li>
        <li>{t('practice.breathingInfo.how5')}</li>
      </ol>

      <p className="muted">
        {t('practice.breathingInfo.disclaimer')}
      </p>
    </details>
  )
}
