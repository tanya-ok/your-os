import { useEffect, useId, useRef, useState } from 'react';

export const LIGHTHOUSE_CAMERA = Object.freeze({
  label: 'Loredo, Somo and Santander, Cantabria',
  watch: 'https://www.youtube.com/watch?v=bV_ltoX7Jy8',
  embed: 'https://www.youtube-nocookie.com/embed/bV_ltoX7Jy8?rel=0',
});

export default function Lighthouse({
  locale = 'en',
  staticScene = false,
  reducedMotion = false,
  motionDisabled = false,
}) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const uid = useId().replaceAll(':', '');
  const [lit, setLit] = useState(false);
  const [sound, setSound] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef(null);
  const audioBusy = useRef(false);
  const stopped = staticScene || reducedMotion || motionDisabled || systemReduced;
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSystemReduced(query.matches);
    const update = (event) => setSystemReduced(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(
    () => () => {
      if (audio.current) audio.current.close().catch(() => {});
    },
    []
  );
  const toggleSound = async () => {
    if (audioBusy.current) return;
    audioBusy.current = true;
    try {
      setError('');
      if (audio.current) {
        await audio.current.close().catch(() => {});
        audio.current = null;
        setSound(false);
        return;
      }
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) {
        setError(
          l(
            'Ocean sound is unavailable in this browser.',
            'Звук океана недоступен в этом браузере.'
          )
        );
        return;
      }
      let context;
      try {
        context = new Audio();
        const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
        const channel = buffer.getChannelData(0);
        let brown = 0;
        for (let index = 0; index < channel.length; index += 1) {
          brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
          channel[index] = brown * 3;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        const gain = context.createGain();
        gain.gain.value = 0.12;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);
        source.start();
        audio.current = context;
        await context.resume();
        setSound(true);
      } catch {
        if (context) await context.close().catch(() => {});
        audio.current = null;
        setSound(false);
        setError(l('Could not start ocean sound.', 'Не удалось включить звук океана.'));
      }
    } finally {
      audioBusy.current = false;
    }
  };
  return (
    <section
      className="personal-lighthouse"
      aria-labelledby={`${uid}-title`}
      data-static={stopped}
      data-lit={lit}
    >
      <header>
        <div>
          <span className="demo-eyebrow">
            {l('A VIEW TO RETURN TO', 'ВИД, К КОТОРОМУ МОЖНО ВЕРНУТЬСЯ')}
          </span>
          <h2 id={`${uid}-title`}>{l('Lighthouse', 'Маяк')}</h2>
        </div>
        <p>{l('The sea does not have a backlog.', 'У моря нет бэклога.')}</p>
      </header>
      <div
        className="personal-lighthouse-view"
        role="img"
        aria-label={l(
          'A lighthouse on a rocky coast, with a calm blue sea.',
          'Маяк на скалистом берегу у спокойного голубого моря.'
        )}
      >
        <svg viewBox="0 0 900 270" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-sky`} x2="0" y2="1">
              <stop stopColor="#b6dbe4" />
              <stop offset="1" stopColor="#f5f1dc" />
            </linearGradient>
            <linearGradient id={`${uid}-sea`} x2="0" y2="1">
              <stop stopColor="#7fbcc5" />
              <stop offset="1" stopColor="#407e92" />
            </linearGradient>
            <linearGradient id={`${uid}-beam`}>
              <stop stopColor="#fff1bd" stopOpacity=".7" />
              <stop offset="1" stopColor="#fff4cb" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="900" height="270" fill={`url(#${uid}-sky)`} />
          <circle cx="710" cy="59" r="25" fill="#fff8d8" opacity=".85" />
          <path
            d="M0 159Q120 138 250 157T500 155T750 150T1000 159V270H0Z"
            fill={`url(#${uid}-sea)`}
          />
          <g className="personal-lighthouse-wave personal-lighthouse-wave-far">
            <path
              d="M-140 186Q-70 171 0 186T140 186T280 186T420 186T560 186T700 186T840 186T980 186T1120 186"
              fill="none"
              stroke="#d2e9e4"
              strokeWidth="2"
              opacity=".5"
            />
          </g>
          <path
            d="M0 236L70 214L132 228L182 202L221 208L258 191L309 213L356 222L388 270H0Z"
            fill="#6d8281"
          />
          <path d="M0 252L103 236L177 244L253 220L326 244L340 270H0Z" fill="#435f64" />
          {lit && (
            <g className="personal-lighthouse-beam">
              <path d="M259 91L885 20V158Z" fill={`url(#${uid}-beam)`} />
              <path d="M248 91L0 38V146Z" fill={`url(#${uid}-beam)`} opacity=".55" />
            </g>
          )}
          <g>
            <path d="M231 201L239 102H268L279 201Z" fill="#f3eee0" />
            <path d="M235 146H273L276 170H233Z" fill="#b57868" />
            <path d="M239 102H268V111H239Z" fill="#a86050" />
            <rect x="237" y="80" width="33" height="23" rx="2" fill="#385d66" />
            <rect x="242" y="84" width="23" height="14" rx="1" fill={lit ? '#ffe8a3' : '#a5c6c8'} />
            <path d="M233 80L253 64L274 80Z" fill="#3a555b" />
            <path d="M228 202H284V209H228Z" fill="#e0dfd2" />
            <path d="M249 185Q255 178 261 185V202H249Z" fill="#49636b" />
            <path d="M246 123H254V136H246Z" fill="#617b80" />
            <path d="M252 161H260V174H252Z" fill="#617b80" />
            <path d="M230 104H277" stroke="#4b676e" strokeWidth="3" />
          </g>
          <g className="personal-lighthouse-wave personal-lighthouse-wave-near">
            <path
              d="M-140 245Q-70 231 0 245T140 245T280 245T420 245T560 245T700 245T840 245T980 245T1120 245V290H-140Z"
              fill="#548e9b"
              opacity=".75"
            />
            <path
              d="M-140 245Q-70 231 0 245T140 245T280 245T420 245T560 245T700 245T840 245T980 245T1120 245"
              fill="none"
              stroke="#c3dfda"
              strokeWidth="2"
              opacity=".55"
            />
          </g>
        </svg>
      </div>
      <div className="personal-lighthouse-controls">
        <button type="button" aria-pressed={lit} onClick={() => setLit((value) => !value)}>
          {lit ? l('Turn light off', 'Погасить свет') : l('Light the lighthouse', 'Зажечь маяк')}
        </button>
        <button type="button" aria-pressed={sound} onClick={toggleSound}>
          {sound
            ? l('Turn ocean sound off', 'Выключить шум океана')
            : l('Ocean sound', 'Шум океана')}
        </button>
        <button
          type="button"
          aria-expanded={cameraOpen}
          aria-controls={`${uid}-camera`}
          onClick={() => setCameraOpen((value) => !value)}
        >
          {cameraOpen
            ? l('Close live camera', 'Закрыть прямой эфир')
            : l('Open live camera', 'Открыть прямой эфир')}{' '}
          ↗
        </button>
      </div>
      {cameraOpen && (
        <div className="personal-lighthouse-camera" id={`${uid}-camera`}>
          <p>
            {LIGHTHOUSE_CAMERA.label} ·{' '}
            {l(
              'YouTube loads only after you open this panel.',
              'YouTube загружается только после открытия этой панели.'
            )}
          </p>
          <iframe
            src={LIGHTHOUSE_CAMERA.embed}
            title={l(
              `Live camera: ${LIGHTHOUSE_CAMERA.label}`,
              `Прямой эфир: ${LIGHTHOUSE_CAMERA.label}`
            )}
            allow="encrypted-media; picture-in-picture; fullscreen"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <a href={LIGHTHOUSE_CAMERA.watch} target="_blank" rel="noreferrer">
            {l('Open the camera on YouTube', 'Открыть камеру на YouTube')} ↗
          </a>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="personal-lighthouse-note">
        {l(
          'Sound starts only by choice. Live-camera availability depends on the stream owner.',
          'Звук включается только по вашему выбору. Доступность прямого эфира зависит от владельца трансляции.'
        )}
        {stopped && ` ${l('Decorative motion is paused.', 'Декоративное движение остановлено.')}`}
      </p>
    </section>
  );
}
