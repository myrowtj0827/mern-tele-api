const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * RequestClient schema
 */
const RequestClientSchema = new Schema({
    client_name: {
        type: String,
        required: true,
    },
    client_email: {
        type: String,
        required: true,
    },
    provider_id: {
        type: String,
        required: true,
    },
    provider_name: {
        type: String,
        required: true,
    },
    provider_email: {
        type: String,
        required: true,
    },
    msg: {
        type: String,
        required: false,
    },
    accept_state: {
        type: String,
        required: false,
    },
    request_date: {
        type: String,
        required: true,
    },
    //in the case of the existed client
    contact: {
        type: Boolean,
        required: false,
    }
});

module.exports = RequestClient = mongoose.model("request-clients", RequestClientSchema);
