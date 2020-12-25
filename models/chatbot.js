const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Categories schema
 */
const ChatbotSchema = new Schema({
    answer: {
        type: String,
        required: true,
    },

    origin_question: {
        type: String,
        required: true,
    },

    question: {
        type: Array,
        required: true,
    },

    add_date: {
        type: Date,
        required: false,
    },

    delete_date: {
        type: Date,
        required: false,
    },
});

module.exports = Chatbot = mongoose.model("chatbot", ChatbotSchema);