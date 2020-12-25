const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Articles schema
 */
const ArticleSchema = new Schema({
    category_id: {
        type: String,
        required: true,
    },

    user_id: {
        type: String,
        required: false,
    },

    title: {
        type: String,
        required: true,
    },

    content: {
        type: String,
        required: true,
    },

    writtenDate: {
        type: String,
        required: true,
    },

    likes: {
        type: Number,
        defaultValue: 0,
        required: false,
    },

    likers: {
        type: Object,
        required: false,
    },

    dislikes: {
        type: Number,
        defaultValue: 0,
        required: false,
    },
    dislikers: {
        type: Object,
        required: false,
    },

    readers: {
        type: Number,
        defaultValue: 0,
        required: false,
    },
    reader_cookie: {
        type: Object,
        required: false,
    },

    deleted_date: {
        type: String,
        required: false,
    },

});

module.exports = Articles = mongoose.model("articles", ArticleSchema);
