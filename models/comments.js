const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Comments schema
 */
const CommentsSchema = new Schema({
    article_id: {
        type: String,
        required: false,
    },

    name: {
        type:String,
        required: false,
    },

    content: {
        type: String,
        required: false,
    },

    writtenDate: {
        type: String,
        required: false,
    },
});

module.exports = Comments = mongoose.model("comments", CommentsSchema);
