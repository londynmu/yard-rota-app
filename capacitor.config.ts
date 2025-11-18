import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.yard.rota',
	appName: 'Yard Rota',
	webDir: 'dist',
	server: {
		androidScheme: 'https',
	},
	plugins: {
		StatusBar: {
			style: 'LIGHT',
			backgroundColor: '#FFFFFF',
			overlaysWebView: false,
		},
		NavigationBar: {
			backgroundColor: '#FFFFFF',
		},
	},
};

export default config;


