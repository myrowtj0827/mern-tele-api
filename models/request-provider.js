const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * RequestProvider schema
 */
const RequestProviderSchema = new Schema({
    name: {
        type: String,
        required: true,
    },

    email: {
        type: String,
        required: true,
    },

    practice_name: {
        type: String,
        required: false,
    },

    password: {
        type: String,
        required: false,
    },

    loggedIn_state: {
        type: String,
        required: true,
    },

    main_provider_id: {
        type: String
    },//main account only
});

module.exports = RequestProvider = mongoose.model("request-providers", RequestProviderSchema);
