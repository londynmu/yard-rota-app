import { CapacitorConfig } from '@capacitor/cli';

// Store releases ship Flutter only (apps/yard_rota_flutter).
// Native Capacitor android/ios trees live under archive/capacitor-native/.
// Keep @capacitor/* npm packages — web still uses camera / status-bar / core.
const config: CapacitorConfig = {
	appId: 'com.yard.rota',
	appName: 'Yard Rota',
	webDir: 'dist',
	server: {
		androidScheme: 'https',
	},
	plugins: {
		StatusBar: {
			style: 'DEFAULT',
			backgroundColor: '#FFFFFF',
			overlaysWebView: false,
		},
		NavigationBar: {
			backgroundColor: '#FFFFFF',
		},
	},
};

export default config;


