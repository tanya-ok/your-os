import { useId } from 'react';

export default function WindowScene({
  phase = 'day',
  staticScene = false,
  label = 'Open ocean, distant mountains and flying seagulls',
}) {
  const id = useId().replace(/:/g, '');
  const night = phase === 'night' || phase === 'twilight';
  const evening = phase === 'sunset' || phase === 'sunrise';
  const skyTop = night ? '#c9d5e3' : evening ? '#dce0e7' : '#dce7ef';
  const skyBottom = evening ? '#eee9e7' : '#eef3f5';
  return (
    <div
      className={`window-scene ocean-scene ${staticScene ? 'scene-static' : ''}`}
      data-animated={!staticScene}
      role="img"
      aria-label={label}
    >
      <svg
        viewBox="0 0 600 320"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="1" stopColor={skyBottom} />
          </linearGradient>
          <linearGradient id={`${id}-ocean`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a5bdcc" />
            <stop offset=".42" stopColor="#8aacc2" />
            <stop offset="1" stopColor="#7398b4" />
          </linearGradient>
          <radialGradient id={`${id}-light`}>
            <stop stopColor="#fbfaf4" stopOpacity=".62" />
            <stop offset="1" stopColor="#fbfaf4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#edf3f6" stopOpacity="0" />
            <stop offset="1" stopColor="#edf3f6" stopOpacity=".6" />
          </linearGradient>
        </defs>
        <path d="M0 0h600v320H0Z" fill={`url(#${id}-sky)`} />
        <ellipse cx="414" cy="95" rx="153" ry="110" fill={`url(#${id}-light)`} />
        {night ? (
          <path d="M440 46a14 14 0 1 1-18 18 18 18 0 0 0 18-18Z" fill="#f8f9f5" opacity=".7" />
        ) : (
          <circle cx="419" cy="85" r="20" fill="#fbfaf4" opacity=".7" />
        )}
        <path
          d="M-30 169 27 139 64 153 115 116 158 137 192 122 245 154 286 139 325 162 381 144 433 163 482 153 530 164 577 153 630 171V202H-30Z"
          fill="#c0cddb"
        />
        <path
          d="M-30 174 19 159 56 168 98 144 136 164 166 153 212 173 254 160 294 175 332 166 378 178 432 165 482 177 527 169 630 184V205H-30Z"
          fill="#a9bbcd"
          opacity=".8"
        />
        <path d="M0 140h600v65H0Z" fill={`url(#${id}-mist)`} />
        <path d="M0 181Q150 178 300 182T600 181V320H0Z" fill={`url(#${id}-ocean)`} />
        <path
          d="M0 181Q150 178 300 182T600 181"
          fill="none"
          stroke="#e8eff3"
          strokeWidth="1"
          opacity=".7"
        />
        <g className="ocean-scene-ripples" fill="none" stroke="#edf4f7" strokeLinecap="round">
          <path
            d="M-20 200q55-3 110 0t100 0m55 0q60-4 125-1m40 0q58-3 145 1m-470 18q53-3 112 0m34 0q74-3 140-1m52 0q65-3 165 0"
            strokeWidth="1"
            opacity=".25"
          />
          <path
            d="M-45 243q65-4 138-1t130 0m48-1q62-3 123 0m35 1q85-5 180-1m-525 26q64-4 122 0m37 0q92-5 185-1m42 1q61-4 129 0"
            strokeWidth="1.1"
            opacity=".2"
          />
          <path d="M-30 299q95-5 170-1t150-1m70 1q104-5 265-1" strokeWidth="1.5" opacity=".2" />
        </g>
        <g
          fill="none"
          stroke="#536c85"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g transform="translate(140 92)">
            <g className="ocean-scene-gull ocean-scene-gull-one">
              <path d="M-12 1Q-5-6 0 0Q5-6 12 1" />
            </g>
          </g>
          <g transform="translate(332 64)">
            <g className="ocean-scene-gull ocean-scene-gull-two">
              <path d="M-9 1Q-4-4 0 0Q4-4 9 1" />
            </g>
          </g>
          <g transform="translate(501 114)">
            <g className="ocean-scene-gull ocean-scene-gull-three">
              <path d="M-8 1Q-3-4 0 0Q3-4 8 1" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
