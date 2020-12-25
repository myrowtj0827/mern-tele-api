const Validator = require("validator");
const isEmpty = require("is-empty");

module.exports = function validateRegisterInput(data){
	let msg = {};

	// Convert empty fields to an empty string so we can use validator functions
	data.full_name = !isEmpty(data.full_name) ? data.full_name : "";
	data.user_name = !isEmpty(data.user_name) ? data.user_name : "";
	data.email = !isEmpty(data.email) ? data.email : "";
	data.password = !isEmpty(data.password) ? data.password : "";
	data.password2 = !isEmpty(data.password2) ? data.password2 : "";
	data.role = !isEmpty(data.role) ? data.role : "";


	if(Validator.isEmpty(data.full_name)){
		msg.msg_reg_username = "Full name field is required";
	}
	if(Validator.isEmpty(data.user_name)){
		msg.msg_reg_username = "User name field is required";
	}
	if(Validator.isEmpty(data.role)){
		msg.msg_reg_username = "Role field is required";
	}
	if(Validator.isEmpty(data.email)){
		msg.msg_reg_email = "Email field is required";
	} else if(!Validator.isEmail(data.email)){
		msg.msg_reg_email = "Email is invalid";
	}
	if(Validator.isEmpty(data.password)){
		msg.msg_reg_password = "Password field is required";
	}
	if(Validator.isEmpty(data.password2)){
		msg.msg_reg_password2 = "Confirm password field is required";
	}
	if(!Validator.isLength(data.password, {min: 6, max: 30})){
		msg.msg_reg_password = "Password must be at least 6 characters";
	}
	if(!Validator.equals(data.password, data.password2)){
		msg.msg_reg_password = "Passwords do not match. Please try again.";
	}

	return {
		msg: msg,
		isValid: isEmpty(msg),
	};
};
