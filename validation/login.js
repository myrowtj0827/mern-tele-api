const Validator = require("validator");
const isEmpty = require("is-empty");

module.exports = function validateLoginInput(data){
	let msg = {};

	// Convert empty fields to an empty string so we can use validator functions
	data.email = !isEmpty(data.email) ? data.email : "";
	data.password = !isEmpty(data.password) ? data.password : "";

	// Email checks
	if(Validator.isEmpty(data.email)){
		msg.msg_login_email = "Email field is required";
	}
	else if(!Validator.isEmail(data.email)){
		msg.msg_login_email = "Email is invalid";
	}

	// Password checks
	if(Validator.isEmpty(data.password)){
		msg.msg_login_password = "Password field is required";
	}

	return {
		msg: msg,
		isValid: isEmpty(msg)
	};
};
