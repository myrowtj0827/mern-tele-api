const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Document Uploading schema
 */
const DocumentSchema = new Schema({
    role: {
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

    path: {
        type: String,
        required: true,
    },

    filename: {
        type: String,
        required: true,
    },

    shared_date: {
        type: Date,
        required: true,
    }
});

module.exports = Document = mongoose.model("document", DocumentSchema);
