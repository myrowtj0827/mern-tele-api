const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Categories schema
 */
const MessageSchema = new Schema({
    message: {
        type: String,
        required: true,
    },

    messageDate: {
        type: String,
        required: true,
    },

    sender_id: {
        type: String,
        required: true,
    },

    recipient_id: {
        type: String,
        required: true,
    },
});

module.exports = Message = mongoose.model("message", MessageSchema);