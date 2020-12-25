const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Appointment schema
 */
const PrivateNoteSchema = new Schema({
    provider_id: {
        type: String,
        required: true,
    },

    client_id: {
        type: String,
        required: true,
    },

    notes: {
        type: String,
        required: true,
    },

    updated_date: {
        type: Date,
        required: true,
    },

    deleted_date: {
        type: Date,
        required: false,
    }
});

module.exports = PrivateNotes = mongoose.model("privateNotes", PrivateNoteSchema);
