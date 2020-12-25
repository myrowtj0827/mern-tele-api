const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Provider schema
 */
const UserSchema = new Schema({
	main_provider_id: {
		type: String,
	}, //added account only

	role: {
		type: Object,
		required: true,
	},

	name: {
		type: String,
		required: true,
	},

	email: {
		type: String,
		required: true,
	},

	gender: {
		type: String,
		required: false,
	},

	age: {
		type: Number,
		required: false,
	},

	password: {
		type: String,
		required: true,
	},

	loggedIn_state: {
		type: String,
		required: true,
	},

	first_login: {
		type: Number,
		default: 0,
	},

	deleted_date: {
		type: String,
		required: false,
	},
	provider_ids: [{
		type: String,
	}],
	client_ids: [{
		type: String,
	}],

	/**
	 * User Info
	 */
	request_id: {
		type: String,
		required: false,
	}, // Client only

	provider_id: {
		type: String,
		required: false,
	}, // Client only

	practice_name: {
		type: String,
		required: false,
	}, // Provider only

	bgPhoto: {
		type: String,
		required: false,
	}, // profile background image // Provider only

	bgRoom: {
		type: String,
		required: false,
	}, // Waiting Room background image // Provider only

	bgMusic: {
		type: String,
		required: false,
	}, // Waiting Room background music // Provider only

	about: {
		type: String,
		required: false,
	}, // Provider only

	license_info: {
		type: String,
		required: false,
	}, // Provider only

	cost: {
		type: Number,
		required: false,
	}, // Provider only

	expertise: {
		type: Object,
		default: [],
	}, // Provider only

	category: {
		type: Object,
		default: [],
	}, // Provider only

	photo: {
		type: String,
		required: false,
	}, // profile image

	updated_date: {
		type: String,
		required: false,
	},
	registered_date: {
		type: String,
		required: false,
	},
	phone: {
		type: Number,
		required: false,
	},

	address1: {
		type: String,
		required: false,
	},

	address2: {
		type: String,
		required: false,
	},

	city: {
		type: String,
		required: false,
	},

	state_province: {
		type: String,
		required: false,
	},

	zip_code: {
		type: String,
		required: false,
	},

	country: {
		type: String,
		required: false,
	},

	stripe_customer_id: {
		type: String,
	},
	stripe_subscription_id: {
		type: String,
	},
	stripe_account_id: {
		type: String,
	},

	plan_string: {
		type: String,
	},

	/**
	 * Drag List
	 */
	provider_drags: [{
		type: Object,
		default: false,
	}],

	client_drags: [{
		type: Object,
		default: false,
	}],

	/**
	 * Settings
	 */
	allow_requests: {
		type: Boolean,
		required: false,
	},
	reminders: {
		type: Boolean,
		required: false,
	},
	reminders_value: {
		type: Number,
		required: false,
	},

	repeat_reminders: {
		type: Array,
		required: false,
	},

	appointment_type: {
		type: Array,
		required: false,
	}
});
module.exports = Users = mongoose.model("users", UserSchema);
