module.exports = {
	TRIAL_PERIOD: 1, // free trial period
	PENDING_EXPIRATION: 172800000, // 48 hours in milliseconds
	VERIFY_EXPIRATION: 172800000, // 48 hours in milliseconds
	PASSWORD_LENGTH: 20, // length of generated password

	/**
	 * MongoDB URL from system environment variable "MONGO_URL".
	 */
	// MONGO_URL: process.env.MONGO_URL,
	MONGO_URL: "mongodb://127.0.0.1:27017/therapist",

	/**
	 * Secret key for JWT
	 */
	SECRET_KEY: "SOCIAL_INVESTME",

	// SIM_API_URL: "/api/",
	// FRONT_URL: 'http://teletherapist.ml',
	// CLIENT_URL: 'https://client.teletherapist.ml',
	// PROVIDER_URL: 'https://provider.teletherapist.ml',

	SIM_API_URL: "http://127.0.0.1:7000/",
	FRONT_URL: 'http://localhost:3000',
	CLIENT_URL: 'http://localhost:3001',
	PROVIDER_URL: 'http://localhost:3002',

	// MAIL_SG_API: process.env.MAIL_KEY,
	MAIL_SG_API: "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",
	MAIL_SENDER: 'support@teletherapist.ga',

	// Contact Us Email
	MAIL_SUPPORT: 'support@teletherapist.ga',

	//Testing
	MAIL_CONFIG: {
		host: 'smtp.ethereal.email',
		port: 587,
		auth: {
			user: 'elyse.hilll30@ethereal.email',
			pass: 'DU7Nb9eR6BpjRH5UC3'
		}
	},

	// SMS - Twilio Info
	SMS_CONFIG: {
		accountSid: 'ACa2e2e74a9e8cdd22f9a6203fabf5e6de',
		authToken: '617cb00f481451bdbb3eff562dc872cc',
		phone: '+15134346062',
	},

	// Booking Duration Us Email
	MAIL_DURATION: 'support@teletherapist.ga',

	STRIPE_SK: 'sk_test_51HYzu8Il7iWn5tibqORfUvMLU28ISONaP6B4SIEhBGY6FQXAlERVn18kyagav8zcj6KNwaQ7Z7bod5wq3lLv0wiv00M4wfpJLQ',
};
