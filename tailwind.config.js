/** Tokens 1:1 aus _redesign/code.html übernommen (das tatsächlich gerenderte Mockup, nicht die
 * z.T. abweichenden Werte aus DESIGN.md's Frontmatter) — Ziel: Markup aus dem Mockup lässt sich
 * unverändert per Copy-Paste übernehmen, ohne Klassennamen oder Werte anzupassen. */
/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				'secondary-fixed-dim': '#d0bcff',
				'surface-container-lowest': '#060e20',
				'primary-fixed': '#e1e0ff',
				primary: '#c0c1ff',
				surface: '#0b1326',
				'surface-dim': '#0b1326',
				'on-error': '#690005',
				'on-primary-container': '#0d0096',
				'outline-variant': '#464554',
				'tertiary-fixed': '#eaddff',
				'on-primary-fixed-variant': '#2f2ebe',
				'surface-container-highest': '#2d3449',
				'surface-variant': '#2d3449',
				'on-tertiary-container': '#36007d',
				'surface-container': '#171f33',
				background: '#0b1326',
				'primary-fixed-dim': '#c0c1ff',
				'on-background': '#dae2fd',
				'on-tertiary': '#3f008e',
				'on-primary': '#1000a9',
				'on-tertiary-fixed-variant': '#5a00c6',
				'surface-tint': '#c0c1ff',
				'secondary-fixed': '#e9ddff',
				'on-secondary-container': '#c4abff',
				'tertiary-fixed-dim': '#d2bbff',
				'on-secondary': '#3c0091',
				'on-primary-fixed': '#07006c',
				'on-secondary-fixed': '#23005c',
				'surface-bright': '#31394d',
				secondary: '#d0bcff',
				'on-secondary-fixed-variant': '#5516be',
				'primary-container': '#8083ff',
				'on-tertiary-fixed': '#25005a',
				'surface-container-high': '#222a3d',
				'inverse-surface': '#dae2fd',
				'on-surface': '#dae2fd',
				'secondary-container': '#571bc1',
				'surface-container-low': '#131b2e',
				'error-container': '#93000a',
				outline: '#908fa0',
				'on-surface-variant': '#c7c4d7',
				error: '#ffb4ab',
				tertiary: '#d2bbff',
				'inverse-on-surface': '#283044',
				'tertiary-container': '#a476ff',
				'on-error-container': '#ffdad6',
				'inverse-primary': '#494bd6'
			},
			borderRadius: {
				DEFAULT: '0.25rem',
				lg: '0.5rem',
				xl: '0.75rem',
				full: '9999px'
			},
			spacing: {
				'space-sm': '0.5rem',
				'gutter-desktop': '1.5rem',
				'space-md': '1rem',
				'space-xs': '0.25rem',
				'margin-tablet': '1.5rem',
				'margin-desktop': '2rem',
				margin: '1rem',
				gutter: '1rem',
				'space-xl': '2rem',
				'space-lg': '1.5rem'
			},
			fontFamily: {
				'label-mono-xs': ['JetBrains Mono'],
				'headline-xl': ['Inter'],
				'label-mono-lg': ['JetBrains Mono'],
				'headline-sm': ['Inter'],
				'body-sm': ['Inter'],
				'headline-xl-mobile': ['Inter'],
				'body-lg': ['Inter'],
				'label-mono-md': ['JetBrains Mono'],
				'label-mono-sm': ['JetBrains Mono'],
				'headline-md': ['Inter'],
				'headline-lg': ['Inter'],
				'body-md': ['Inter']
			},
			fontSize: {
				'label-mono-xs': ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.03em', fontWeight: '400' }],
				'headline-xl': ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.025em', fontWeight: '700' }],
				'label-mono-lg': ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' }],
				'headline-sm': ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' }],
				'body-sm': ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em', fontWeight: '400' }],
				'headline-xl-mobile': ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '700' }],
				'body-lg': ['1rem', { lineHeight: '1.5rem', letterSpacing: '0em', fontWeight: '400' }],
				'label-mono-md': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0em', fontWeight: '500' }],
				'label-mono-sm': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em', fontWeight: '500' }],
				'headline-md': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em', fontWeight: '600' }],
				'headline-lg': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em', fontWeight: '600' }],
				'body-md': ['0.875rem', { lineHeight: '1.375rem', letterSpacing: '0em', fontWeight: '400' }]
			}
		}
	}
};
